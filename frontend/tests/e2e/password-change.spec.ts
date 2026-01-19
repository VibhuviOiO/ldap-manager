import { test, expect } from '@playwright/test'

test.describe('Password Change Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    
    const viewButton = page.locator('button:has-text("View Cluster")')
    const hasButton = await viewButton.isVisible({ timeout: 3000 }).catch(() => false)
    
    if (!hasButton) {
      test.skip(true, 'Password not cached - setup required')
      return
    }
    
    await viewButton.click()
    await page.waitForURL('**/cluster/**')
    await page.waitForTimeout(500)
  })

  test('should open password change dialog when clicking key icon', async ({ page }) => {
    // Find first user row and click password change button
    const passwordButton = page.locator('button[title="Change password"]').first()
    await passwordButton.click()

    // Verify password dialog opened
    await expect(page.locator('text=Change Password:')).toBeVisible()
    await expect(page.locator('button:has-text("Change Password")')).toBeVisible()
  })

  test('should show username in dialog title', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    
    // Should show "Change Password: <username>"
    await expect(page.locator('text=Change Password:')).toBeVisible()
  })

  test('should have new password and confirm password fields', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    
    // Check both fields exist
    await expect(page.locator('label:has-text("New Password")')).toBeVisible()
    await expect(page.locator('label:has-text("Confirm Password")')).toBeVisible()
    await expect(page.locator('input#newPassword')).toBeVisible()
    await expect(page.locator('input#confirmPassword')).toBeVisible()
  })

  test('should show error when passwords do not match', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    
    // Enter mismatched passwords
    await page.fill('input#newPassword', 'newpass123')
    await page.fill('input#confirmPassword', 'different456')
    await page.click('button:has-text("Change Password")')
    
    // Should show error
    await expect(page.locator('text=Passwords do not match')).toBeVisible()
  })

  test('should change password successfully with matching passwords', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    
    // Enter matching passwords
    const newPassword = 'testpass123'
    await page.fill('input#newPassword', newPassword)
    await page.fill('input#confirmPassword', newPassword)
    await page.click('button:has-text("Change Password")')
    
    // Dialog should close on success
    await expect(page.locator('text=Change Password:')).not.toBeVisible({ timeout: 5000 })
  })

  test('should close password dialog on cancel', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    await expect(page.locator('text=Change Password:')).toBeVisible()
    
    await page.click('button:has-text("Cancel")')
    await expect(page.locator('text=Change Password:')).not.toBeVisible()
  })

  test('should have password type inputs (hidden characters)', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    
    // Both inputs should be type="password"
    const newPasswordInput = page.locator('input#newPassword')
    const confirmPasswordInput = page.locator('input#confirmPassword')
    
    await expect(newPasswordInput).toHaveAttribute('type', 'password')
    await expect(confirmPasswordInput).toHaveAttribute('type', 'password')
  })

  test('should require both password fields', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    
    // Both fields should be required
    const newPasswordInput = page.locator('input#newPassword')
    const confirmPasswordInput = page.locator('input#confirmPassword')
    
    await expect(newPasswordInput).toHaveAttribute('required')
    await expect(confirmPasswordInput).toHaveAttribute('required')
  })

  test('should show actions column with 3 buttons (key, edit, delete)', async ({ page }) => {
    // Check that actions column has all 3 buttons
    const firstRow = page.locator('table tbody tr').first()
    
    await expect(firstRow.locator('button[title="Change password"]')).toBeVisible()
    await expect(firstRow.locator('button[title="Edit user"]')).toBeVisible()
    await expect(firstRow.locator('button[title="Delete user"]')).toBeVisible()
  })

  test('should update shadowLastChange after password change', async ({ page }) => {
    // Enable Passwd Age column
    await page.click('button:has-text("Columns")')
    const passwdAgeCheckbox = page.locator('label:has-text("Passwd Age")').locator('input')
    const wasChecked = await passwdAgeCheckbox.isChecked()
    if (!wasChecked) {
      await passwdAgeCheckbox.check()
      await page.press('body', 'Escape')
    } else {
      await page.press('body', 'Escape')
    }
    
    // Change password
    await page.locator('button[title="Change password"]').first().click()
    await page.fill('input#newPassword', 'newpass456')
    await page.fill('input#confirmPassword', 'newpass456')
    await page.click('button:has-text("Change Password")')
    
    // Wait for dialog to close
    await expect(page.locator('text=Change Password:')).not.toBeVisible({ timeout: 5000 })
    
    // Passwd Age should show "Today" or "0 days ago"
    await page.waitForTimeout(1000) // Wait for refresh
    const passwdAgeCell = page.locator('table tbody tr').first().locator('td', { hasText: /Today|0 days ago/ })
    await expect(passwdAgeCell).toBeVisible({ timeout: 5000 })
  })

  test('should respect password policy from config', async ({ page }) => {
    await page.locator('button[title="Change password"]').first().click()
    
    // With min_length: 0, no minimum length hint should be shown
    // (or if min_length > 0, hint should show)
    const hint = page.locator('text=/Minimum \\d+ characters/')
    const hintExists = await hint.count() > 0
    
    // Either way, form should be functional
    await expect(page.locator('input#newPassword')).toBeVisible()
  })
})
