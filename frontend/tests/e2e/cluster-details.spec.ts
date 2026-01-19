import { test, expect } from '@playwright/test';

test.describe('Cluster Details Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const viewButton = page.locator('button:has-text("View Cluster")');
    const hasButton = await viewButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (!hasButton) {
      test.skip(true, 'Password not cached - setup required');
      return;
    }
    
    await viewButton.click();
    await page.waitForURL('**/cluster/**');
  });

  test('should show cluster name and navigation tabs', async ({ page }) => {
    await expect(page.locator('h2')).toContainText('vibhuvioio.com');
    await expect(page.locator('button:has-text("Users")')).toBeVisible();
    await expect(page.locator('button:has-text("Groups")')).toBeVisible();
    await expect(page.locator('button:has-text("Organizational Units")')).toBeVisible();
    await expect(page.locator('button:has-text("All Entries")')).toBeVisible();
    await expect(page.locator('button:has-text("Monitoring")')).toBeVisible();
    await expect(page.locator('button:has-text("Activity Log")')).toBeVisible();
  });

  test('should show search box', async ({ page }) => {
    await expect(page.locator('input[placeholder="Search..."]')).toBeVisible();
  });

  test('should show Create User button when not readonly', async ({ page }) => {
    const createButton = page.locator('button:has-text("Create User")');
    await expect(createButton).toBeVisible();
  });

  test('should show Columns settings button', async ({ page }) => {
    await expect(page.locator('button:has-text("Columns")')).toBeVisible();
  });

  test('should display users table', async ({ page }) => {
    await page.waitForTimeout(1000);
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th:has-text("Username")')).toBeVisible();
  });

  test('should switch between tabs', async ({ page }) => {
    await page.click('button:has-text("Groups")');
    await page.waitForTimeout(500);
    await expect(page.locator('th:has-text("Group Name")')).toBeVisible();
    
    await page.click('button:has-text("Users")');
    await page.waitForTimeout(500);
    await expect(page.locator('th:has-text("Username")')).toBeVisible();
  });

  test('should show back button', async ({ page }) => {
    const backButton = page.locator('button').first();
    await expect(backButton).toBeVisible();
  });
});
