import { test, expect, Page } from '@playwright/test';

/**
 * Page-by-page audit of a running deployment.
 *
 * Every view must load, show its expected heading, and make no failing API
 * calls. Screenshots of each view are written to test-results/screenshots/ so a
 * change can be reviewed visually without opening a browser.
 */

const CLUSTER = process.env.AUDIT_CLUSTER || 'vibhuvioio';
const SHOTS = process.env.AUDIT_SHOTS || 'test-results/screenshots';

const VIEWS = [
  { view: 'browse', heading: 'Directory Tree' },
  { view: 'users', heading: 'Users', table: true },
  { view: 'groups', heading: 'Groups', table: true },
  { view: 'ous', heading: 'Organizational Units', table: true },
  { view: 'all', heading: 'All Directory Entries', table: true },
  { view: 'ldif', heading: 'LDIF Editor' },
  { view: 'schema', heading: 'Schema' },
  { view: 'aci', heading: 'Access Control' },
  { view: 'monitoring', heading: null },
  { view: 'activity', heading: null },
] as const;

/** Fail the test on any 5xx, and report 4xx so drift is visible. */
function watchApi(page: Page): string[] {
  const failures: string[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!url.includes('/api/')) return;
    const status = response.status();
    if (status >= 400) {
      failures.push(`${status} ${url.split('/api/')[1]?.split('?')[0]}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message.slice(0, 80)}`));
  return failures;
}

test.describe(`deployment audit (${CLUSTER})`, () => {
  test('dashboard lists clusters and offers Add cluster', async ({ page }) => {
    const failures = watchApi(page);
    await page.goto('/');
    await expect(page.getByText('LDAP Clusters')).toBeVisible();
    await expect(page.getByRole('button', { name: /Add cluster/i })).toBeVisible();
    await expect(page.getByText(CLUSTER).first()).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/dashboard.png`, fullPage: false });
    expect(failures, `API failures: ${failures.join(', ')}`).toEqual([]);
  });

  for (const { view, heading, table } of VIEWS) {
    test(`${view} view loads`, async ({ page }) => {
      const failures = watchApi(page);
      await page.goto(`/cluster/${CLUSTER}?view=${view}`);

      if (heading) {
        await expect(page.getByText(heading, { exact: false }).first()).toBeVisible();
      }
      if (table) {
        await expect(page.locator('table tbody tr').first()).toBeVisible();
      }

      // Nothing should have crashed the React tree.
      await expect(page.getByText(/Something went wrong|Cannot read propert/i)).toHaveCount(0);

      await page.screenshot({ path: `${SHOTS}/${view}.png`, fullPage: false });
      expect(failures, `API failures: ${failures.join(', ')}`).toEqual([]);
    });
  }

  test('LDIF editor exposes Validate and Apply', async ({ page }) => {
    await page.goto(`/cluster/${CLUSTER}?view=ldif`);
    await expect(page.getByRole('button', { name: 'Validate' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Template' })).toBeVisible();
    await expect(page.locator('textarea[aria-label="LDIF content"]')).toBeVisible();
  });

  test('create user sheet renders the configured form', async ({ page }) => {
    // Wait for the column config too: the header (with Create User) renders
    // after it lands, so clicking earlier can race the button into existence.
    const columns = page
      .waitForResponse((r) => r.url().includes('/api/clusters/columns/'), { timeout: 25_000 })
      .catch(() => null);
    await page.goto(`/cluster/${CLUSTER}?view=users`);
    await page.waitForSelector('table tbody tr');
    await columns;

    const createButton = page.getByRole('button', { name: 'Create new user' });
    if ((await createButton.count()) === 0) {
      test.skip(true, 'write access required to open the create form');
    }
    // The sheet opens immediately but its fields come from the form-config
    // request, so wait for that before counting inputs.
    const formConfig = page
      .waitForResponse((r) => r.url().includes('/api/clusters/form/'), { timeout: 25_000 })
      .catch(() => null);
    await createButton.click();

    // Target the sheet by its own label: a bare [role=dialog] also matches the
    // toast region, which has no inputs.
    const sheet = page.locator('[aria-label="Create user form"]');
    await expect(sheet).toBeVisible();
    await formConfig;
    await expect(sheet.locator('input').first()).toBeVisible();
    // At minimum: uid, cn, sn, mail, password.
    expect(await sheet.locator('input').count()).toBeGreaterThanOrEqual(5);
    await page.screenshot({ path: `${SHOTS}/create-user.png` });
  });
});
