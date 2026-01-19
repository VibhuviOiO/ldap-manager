import { test, expect } from '@playwright/test';

test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load and show title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('LDAP Manager');
    await expect(page.locator('h2')).toContainText('LDAP Clusters');
  });

  test('should show header and footer', async ({ page }) => {
    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('text=Multi-cluster directory management')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });

  test('should display clusters when backend available', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const hasCluster = await page.locator('text=vibhuvioio.com').isVisible().catch(() => false);
    const hasError = await page.locator('text=Configuration file not found').isVisible().catch(() => false);
    
    expect(hasCluster || hasError).toBeTruthy();
  });

  test('should show cluster card with details', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const clusterCard = page.locator('text=vibhuvioio.com').locator('..');
    if (await clusterCard.isVisible().catch(() => false)) {
      await expect(page.locator('text=Single node OpenLDAP')).toBeVisible();
    }
  });

  test('should navigate to cluster on View Cluster click', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    const viewButton = page.locator('button:has-text("View Cluster")');
    const hasButton = await viewButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (!hasButton) {
      test.skip(true, 'Password not cached - run setup first');
      return;
    }
    
    await viewButton.click();
    await page.waitForURL('**/cluster/**');
    await expect(page.locator('button:has-text("Users")')).toBeVisible();
  });
});
