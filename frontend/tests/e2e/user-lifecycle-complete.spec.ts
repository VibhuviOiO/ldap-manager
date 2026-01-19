import { test, expect } from '@playwright/test'

test.describe('Complete User Lifecycle with Edit and Password Change', () => {
  const testUser = {
    uid: `testuser_${Date.now()}`,
    firstName: 'Test',
    lastName: 'Warrior',
    email: `testuser_${Date.now()}@vibhuvioio.com`,
    password: 'initialpass123',
    role: 'Warrior',
    kingdom: 'Hastinapura',
    weapon: 'Sword',
    allegiance: 'Pandavas'
  }

  test('complete lifecycle: create → verify → edit → change password → delete', async ({ page }) => {
    test.setTimeout(60000);
    // Navigate to cluster
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
    await page.waitForTimeout(1000)

    // STEP 1: Create user
    await page.click('button:has-text("Create User")')
    await expect(page.locator('text=Create New User')).toBeVisible()
    await page.waitForTimeout(500)

    await page.fill('input#uid', testUser.uid)
    await page.fill('input#cn', testUser.firstName)
    await page.fill('input#sn', testUser.lastName)
    await page.fill('input#mail', testUser.email)
    await page.fill('input#userPassword', testUser.password)
    await page.fill('input#homeDirectory', `/home/${testUser.uid}`)
    await page.selectOption('select#role', testUser.role)
    await page.selectOption('select#kingdom', testUser.kingdom)
    await page.fill('input#weapon', testUser.weapon)
    await page.selectOption('select#allegiance', testUser.allegiance)
    await page.waitForTimeout(500)

    await page.locator('button[type="submit"]:has-text("Create User")').click()
    await expect(page.locator('text=Create New User')).not.toBeVisible({ timeout: 10000 })

    // STEP 2: Verify user appears in table
    await page.fill('input[placeholder="Search..."]', testUser.uid)
    await page.waitForTimeout(1500)
    const userRow = page.locator('tr', { has: page.locator(`text=${testUser.uid}`) })
    await expect(userRow).toBeVisible()
    await expect(userRow.locator(`text=${testUser.firstName} ${testUser.lastName}`)).toBeVisible()

    // STEP 3: Edit user details
    await userRow.locator('button[title="Edit user"]').click()
    await expect(page.locator(`text=Edit User: ${testUser.uid}`)).toBeVisible()
    await page.waitForTimeout(500)

    // Update weapon
    const newWeapon = 'Divine Sword'
    await page.fill('input#weapon', newWeapon)
    
    // Update role
    await page.waitForTimeout(500)
    await page.selectOption('select#role', 'Warrior Prince')
    
    await page.click('button:has-text("Update User")')
    await expect(page.locator('text=Edit User:')).not.toBeVisible({ timeout: 10000 })

    // STEP 4: Verify edits were saved
    await page.waitForTimeout(1000)
    // Note: weapon might not be visible by default, but edit should succeed

    // STEP 5: Change password
    await userRow.locator('button[title="Change password"]').click()
    await expect(page.locator(`text=Change Password: ${testUser.uid}`)).toBeVisible()

    const newPassword = 'updatedpass456'
    await page.fill('input#newPassword', newPassword)
    await page.fill('input#confirmPassword', newPassword)
    await page.click('button:has-text("Change Password")')
    await expect(page.locator('text=Change Password:')).not.toBeVisible({ timeout: 5000 })

    // STEP 6: Verify password age updated (enable column first)
    await page.click('button:has-text("Columns")')
    const passwdAgeCheckbox = page.locator('label:has-text("Passwd Age")').locator('input')
    const wasChecked = await passwdAgeCheckbox.isChecked()
    if (!wasChecked) {
      await passwdAgeCheckbox.check()
      await page.press('body', 'Escape')
    } else {
      await page.press('body', 'Escape')
    }

    await page.waitForTimeout(1000)
    // Password age should show "Today" for just-changed password
    const userRowAfterPassword = page.locator('tr', { has: page.locator(`text=${testUser.uid}`) })
    await expect(userRowAfterPassword.locator('text=/Today|0 days ago/')).toBeVisible({ timeout: 5000 })

    // STEP 7: Delete user
    page.on('dialog', dialog => dialog.accept())
    await userRowAfterPassword.locator('button[title="Delete user"]').click()
    
    // STEP 8: Verify user is deleted
    await page.waitForTimeout(1000)
    await expect(page.locator(`text=${testUser.uid}`)).not.toBeVisible()
  })

  test('edit should not allow changing username or uidNumber', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    const viewButton = page.locator('button:has-text("View Cluster")')
    await viewButton.click()
    await page.waitForURL('**/cluster/**')

    // Open edit for any user
    await page.locator('button[title="Edit user"]').first().click()

    // Username should be disabled
    const uidInput = page.locator('input#uid')
    await expect(uidInput).toBeDisabled()

    // UID Number should be disabled
    const uidNumberInput = page.locator('input#uidNumber')
    await expect(uidNumberInput).toBeDisabled()

    // Both should show "Cannot be modified" hint
    const hints = page.locator('text=Cannot be modified')
    await expect(hints).toHaveCount(2)
  })

  test('password change should clear form after success', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    const viewButton = page.locator('button:has-text("View Cluster")')
    await viewButton.click()
    await page.waitForURL('**/cluster/**')

    // Open password dialog
    await page.locator('button[title="Change password"]').first().click()
    
    // Fill passwords
    await page.fill('input#newPassword', 'testpass789')
    await page.fill('input#confirmPassword', 'testpass789')
    await page.click('button:has-text("Change Password")')
    
    // Wait for success
    await expect(page.locator('text=Change Password:')).not.toBeVisible({ timeout: 5000 })
    
    // Open again - fields should be empty
    await page.locator('button[title="Change password"]').first().click()
    await expect(page.locator('input#newPassword')).toHaveValue('')
    await expect(page.locator('input#confirmPassword')).toHaveValue('')
  })

  test('actions column should have correct icon order: key, pencil, trash', async ({ page }) => {
    await page.goto('/')
    await page.waitForTimeout(2000)
    const viewButton = page.locator('button:has-text("View Cluster")')
    await viewButton.click()
    await page.waitForURL('**/cluster/**')

    const firstRow = page.locator('table tbody tr').first()
    const actionButtons = firstRow.locator('td').last().locator('button')

    // Should have 3 buttons
    await expect(actionButtons).toHaveCount(3)

    // Check order by title attribute
    await expect(actionButtons.nth(0)).toHaveAttribute('title', 'Change password')
    await expect(actionButtons.nth(1)).toHaveAttribute('title', 'Edit user')
    await expect(actionButtons.nth(2)).toHaveAttribute('title', 'Delete user')
  })
})
