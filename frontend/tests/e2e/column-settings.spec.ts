import { test, expect } from '@playwright/test';

test.describe('Column Settings', () => {
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

  test('should open column settings panel', async ({ page }) => {
    await page.click('button:has-text("Columns")');
    const sheet = page.locator('[role="dialog"]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Column Visibility');
  });

  test('should show all available columns with checkboxes', async ({ page }) => {
    await page.click('button:has-text("Columns")');
    
    await expect(page.locator('label:has-text("Username")')).toBeVisible();
    await expect(page.locator('label:has-text("Full Name")')).toBeVisible();
    await expect(page.locator('label:has-text("Email")')).toBeVisible();
    await expect(page.locator('label:has-text("Role")')).toBeVisible();
    await expect(page.locator('label:has-text("Kingdom")')).toBeVisible();
    await expect(page.locator('label:has-text("UID")')).toBeVisible();
  });

  test('should toggle column visibility', async ({ page }) => {
    await page.click('button:has-text("Columns")');
    
    const uidCheckbox = page.locator('label:has-text("UID") input');
    await uidCheckbox.check();
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    await expect(page.locator('th:has-text("UID")')).toBeVisible();
  });

  test('should persist column preferences', async ({ page }) => {
    await page.click('button:has-text("Columns")');
    
    const weaponCheckbox = page.locator('label:has-text("Weapon") input');
    await weaponCheckbox.check();
    await page.keyboard.press('Escape');
    
    await page.reload();
    await page.waitForTimeout(1000);
    
    await expect(page.locator('th:has-text("Weapon")')).toBeVisible();
  });
});
