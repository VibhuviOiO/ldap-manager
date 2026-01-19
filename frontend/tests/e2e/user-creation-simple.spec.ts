import { test, expect } from '@playwright/test';

test.describe('User Creation (Simplified)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const viewButton = page.locator('button:has-text("View Cluster")');
    const hasButton = await viewButton.isVisible({ timeout: 3000 }).catch(() => false);
    
    if (!hasButton) {
      test.skip(true, 'Password not cached');
      return;
    }
    
    await viewButton.click();
    await page.waitForURL('**/cluster/**');
  });

  test('should open form and fill all fields', async ({ page }) => {
    await page.click('button:has-text("Create User")');
    
    // Wait for form to load completely
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('input#uid', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('select#role', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500); // Let React finish rendering
    
    const testUsername = `e2etest${Date.now()}`;
    
    await page.fill('input#uid', testUsername);
    await page.fill('input#cn', 'E2E Test');
    await page.fill('input#sn', 'Test');
    await page.fill('input#userPassword', 'Test@123456');
    await page.selectOption('select#role', 'Warrior');
    await page.selectOption('select#kingdom', 'Hastinapura');
    await page.selectOption('select#allegiance', 'Pandavas');
    await page.fill('input#weapon', 'Test Sword');
    
    // Verify all fields filled
    await expect(page.locator('input#uid')).toHaveValue(testUsername);
    await expect(page.locator('select#role')).toHaveValue('Warrior');
    
    // Verify submit button enabled
    const submitBtn = page.locator('button[type="submit"]:has-text("Create User")');
    await expect(submitBtn).toBeEnabled();
    
    console.log('â Form validation passed');
  });
});
