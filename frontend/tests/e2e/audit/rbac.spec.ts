import { test, expect, Page } from '@playwright/test';

/**
 * RBAC assertions for a deployment.
 *
 * The runner (scripts/e2e-auth-matrix.sh) deploys a specific auth mode and
 * tells this spec what to expect:
 *
 *   EXPECTED_ROLE       admin | readwrite | readonly   (from /api/auth/status)
 *   EXPECTED_CAN_WRITE  true | false   (role allows writes AND the cluster is not read-only)
 *   AUDIT_USERNAME/PASSWORD            (for mode: local and mode: ldap)
 *
 * The same file therefore proves RBAC for every auth mode.
 */

const CLUSTER = process.env.AUDIT_CLUSTER || 'vibhuvioio';
const ROLE = (process.env.EXPECTED_ROLE || 'admin').toLowerCase();
const CAN_WRITE = (process.env.EXPECTED_CAN_WRITE ?? String(ROLE !== 'readonly')) === 'true';
const IS_ADMIN = ROLE === 'admin';
const USERNAME = process.env.AUDIT_USERNAME;
const PASSWORD = process.env.AUDIT_PASSWORD;

/**
 * Open the users view and wait until the table is fully configured.
 *
 * The row data and the column configuration arrive in separate requests; the
 * Actions column (and therefore the row buttons) only renders once the columns
 * response lands, so asserting right after the first row appears is racy.
 */
async function openUsers(page: Page) {
  const columns = page
    .waitForResponse((r) => r.url().includes('/api/clusters/columns/'), { timeout: 25_000 })
    .catch(() => null);
  await page.goto(`/cluster/${CLUSTER}?view=users`);
  await page.waitForSelector('table tbody tr');
  await columns;
}

test.describe(`RBAC as ${ROLE}${USERNAME ? ` (${USERNAME})` : ''}`, () => {
  test.beforeEach(async ({ page }) => {
    if (!USERNAME || !PASSWORD) return;
    // modes local/ldap require a session before any page renders content
    const response = await page.request.post('/api/auth/login', {
      data: { username: USERNAME, password: PASSWORD },
    });
    expect(response.status(), 'login must succeed').toBe(200);
  });

  test('API reports the expected role', async ({ request }) => {
    const response = await request.get('/api/auth/status');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.role, 'role resolved for this actor').toBe(ROLE);
  });

  test('write endpoints follow the role', async ({ request }) => {
    const response = await request.post('/api/entries/create', { data: {} });
    // 403 means the role guard refused; anything else means it was allowed
    // through to body validation (which rejects {}).
    if (CAN_WRITE) {
      expect(response.status(), 'role may write').not.toBe(403);
    } else {
      expect(response.status(), 'role must not write').toBe(403);
    }
  });

  test('admin-only endpoints follow the role', async ({ request }) => {
    const response = await request.get('/api/auth/users');
    if (IS_ADMIN) {
      expect(response.status(), 'admin may list local users').toBe(200);
    } else {
      expect(response.status(), 'non-admin must not list users').toBe(403);
    }
  });

  test('users view shows the controls the role allows', async ({ page }) => {
    await openUsers(page);

    const createButton = page.getByRole('button', { name: 'Create new user' });
    const editButtons = page.locator('button[title*="Edit"]');
    const checkboxes = page.locator('input[type="checkbox"][aria-label^="Select uid="]');

    if (CAN_WRITE) {
      await expect(createButton, 'write role sees Create User').toBeVisible();
      await expect(editButtons.first(), 'write role sees row Edit').toBeVisible();
      expect(await editButtons.count()).toBeGreaterThan(0);
      expect(await checkboxes.count(), 'write role sees bulk selection').toBeGreaterThan(0);
    } else {
      await expect(createButton, 'read-only role must not see Create User').toHaveCount(0);
      expect(await editButtons.count(), 'read-only role must not see Edit').toBe(0);
      expect(await checkboxes.count(), 'read-only role must not see selection').toBe(0);
    }
  });

  test('LDIF Apply follows the role', async ({ page }) => {
    await page.goto(`/cluster/${CLUSTER}?view=ldif`);
    const apply = page.getByRole('button', { name: 'Apply' });
    const validate = page.getByRole('button', { name: 'Validate' });

    // Validate is a dry run, so any write role gets it.
    if (CAN_WRITE) {
      await expect(validate, 'write role can validate').toBeVisible();
      expect(await validate.isDisabled()).toBe(false);
    } else {
      expect(await validate.isDisabled(), 'read-only role cannot validate').toBe(true);
    }

    // Applying LDIF can rewrite anything the bind DN reaches, so it is admin
    // only - hidden entirely for everyone else.
    if (IS_ADMIN && CAN_WRITE) {
      await expect(apply, 'admin sees Apply').toBeVisible();
      expect(await apply.isDisabled()).toBe(false);
    } else {
      await expect(apply, 'non-admin must not see Apply').toHaveCount(0);
    }
  });
});
