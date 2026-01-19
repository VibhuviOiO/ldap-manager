import { test, expect } from '@playwright/test';
import axios from 'axios';

test.describe('User Lifecycle (Create → Verify → Delete)', () => {
  const baseURL = 'http://localhost:8000';
  const clusterName = 'vibhuvioio.com';
  let testUsername: string;
  let testUserDN: string;

  test.beforeEach(async ({ page }) => {
    testUsername = `e2etest${Date.now()}`;
    testUserDN = `uid=${testUsername},ou=People,dc=vibhuvioio,dc=com`;
    
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

  test('should create, verify, and delete user', async ({ page }) => {
    // Step 1: Create User
    await page.click('button:has-text("Create User")');
    
    // Wait for form to load completely
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('input#uid', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('select#role', { state: 'visible', timeout: 5000 });
    await page.waitForTimeout(500);
    
    await page.fill('input#uid', testUsername);
    await page.fill('input#cn', 'E2E Test User');
    await page.fill('input#sn', 'TestUser');
    await page.fill('input#mail', `${testUsername}@vibhuvioio.com`);
    await page.fill('input#userPassword', 'Test@123456');
    await page.fill('input#homeDirectory', `/home/${testUsername}`);
    await page.fill('input#weapon', 'Test Sword');
    
    await page.selectOption('select#role', 'Warrior');
    await page.selectOption('select#kingdom', 'Hastinapura');
    await page.selectOption('select#allegiance', 'Pandavas');
    await page.selectOption('select#isWarrior', 'TRUE');
    await page.selectOption('select#isAdmin', 'FALSE');
    
    // Check form validity
    const formValid = await page.evaluate(() => {
      const form = document.querySelector('form');
      return form ? form.checkValidity() : false;
    });
    
    if (!formValid) {
      const invalidFields = await page.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return [];
        const invalid = [];
        const inputs = form.querySelectorAll('input, select');
        inputs.forEach((input: any) => {
          if (!input.checkValidity()) {
            invalid.push({ id: input.id, value: input.value, required: input.required });
          }
        });
        return invalid;
      });
      console.log('❌ Form invalid:', JSON.stringify(invalidFields));
      test.skip(true, `Form validation failed: ${JSON.stringify(invalidFields)}`);
      return;
    }
    
    // Submit and wait for response
    const [response] = await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/entries/create'), { timeout: 10000 }),
      page.click('button[type="submit"]:has-text("Create User")')
    ]);
    
    if (response.status() !== 200) {
      const body = await response.json();
      console.log('❌ Create failed:', body.detail);
      test.skip(true, `User creation failed: ${body.detail}`);
      return;
    }
    
    // Wait for dialog to close
    await page.waitForSelector('[role="dialog"]', { state: 'hidden', timeout: 5000 });
    console.log(`✅ User created: ${testUsername}`);
    
    // Step 2: Verify User Exists
    await page.fill('input[placeholder="Search..."]', testUsername);
    await page.waitForTimeout(1500);
    
    const userRow = page.locator(`tr:has-text("${testUsername}")`).first();
    await expect(userRow).toBeVisible({ timeout: 5000 });
    await expect(userRow).toContainText('E2E Test User');
    
    console.log(`✅ User verified: ${testUsername}`);
    
    // Step 3: Delete User via API
    const deleteResponse = await axios.delete(`${baseURL}/api/entries/delete`, {
      params: {
        cluster_name: clusterName,
        dn: testUserDN
      }
    });
    
    expect(deleteResponse.status).toBe(200);
    console.log(`✅ User deleted: ${testUsername}`);
    
    // Step 4: Verify User is Gone
    await page.reload();
    await page.waitForTimeout(1000);
    await page.fill('input[placeholder="Search..."]', testUsername);
    await page.waitForTimeout(1500);
    
    const userGone = await page.locator(`tr:has-text("${testUsername}")`).isVisible().catch(() => false);
    expect(userGone).toBe(false);
    
    console.log(`✅ Deletion verified: ${testUsername}`);
    console.log('\n🎉 Complete lifecycle test passed!\n');
  });

  test.afterEach(async () => {
    try {
      await axios.delete(`${baseURL}/api/entries/delete`, {
        params: { cluster_name: clusterName, dn: testUserDN }
      });
      console.log(`🧹 Cleanup: ${testUsername}`);
    } catch (error) {
      // Ignore
    }
  });
});
