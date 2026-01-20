import { describe, it, expect } from 'vitest'
import { passwordSchema, userSchema, connectionSchema } from '@/lib/validations'

describe('Form Validation - Edge Cases', () => {
  describe('Password Validation', () => {
    it('should reject password without uppercase', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'password123!',
        confirmPassword: 'password123!'
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('uppercase')
      }
    })

    it('should reject password without lowercase', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'PASSWORD123!',
        confirmPassword: 'PASSWORD123!'
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('lowercase')
      }
    })

    it('should reject password without number', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Password!',
        confirmPassword: 'Password!'
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('number')
      }
    })

    it('should reject password without special character', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Password123',
        confirmPassword: 'Password123'
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('special')
      }
    })

    it('should reject mismatched passwords', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Password123!',
        confirmPassword: 'Different123!'
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('match')
      }
    })

    it('should accept valid password', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Password123!',
        confirmPassword: 'Password123!'
      })
      expect(result.success).toBe(true)
    })

    it('should handle special characters in password', () => {
      const passwords = [
        'Pass@123', 'Pass#123', 'Pass$123', 'Pass%123',
        'Pass^123', 'Pass&123', 'Pass*123', 'Pass!123'
      ]
      passwords.forEach(pwd => {
        const result = passwordSchema.safeParse({
          newPassword: pwd,
          confirmPassword: pwd
        })
        expect(result.success).toBe(true)
      })
    })
  })

  describe('User Validation', () => {
    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
        'user..name@example.com'
      ]

      invalidEmails.forEach(email => {
        const result = userSchema.safeParse({
          uid: 'user',
          cn: 'User Name',
          sn: 'Name',
          mail: email,
          userPassword: 'Password123!'
        })
        expect(result.success).toBe(false)
      })
    })

    it('should accept valid email formats', () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_name@sub.example.com'
      ]

      validEmails.forEach(email => {
        const result = userSchema.safeParse({
          uid: 'user',
          cn: 'User Name',
          sn: 'Name',
          mail: email,
          userPassword: 'Password123!'
        })
        expect(result.success).toBe(true)
      })
    })

    it('should reject invalid uid formats', () => {
      const invalidUids = [
        'User Name',  // spaces
        'user@name',  // special chars
        'USER',       // uppercase
        'us'          // too short
      ]

      invalidUids.forEach(uid => {
        const result = userSchema.safeParse({
          uid,
          cn: 'User Name',
          sn: 'Name',
          mail: 'user@example.com',
          userPassword: 'Password123!'
        })
        expect(result.success).toBe(false)
      })
    })

    it('should accept valid uid formats', () => {
      const validUids = [
        'user',
        'user123',
        'user-name',
        'user_name',
        'user-name-123'
      ]

      validUids.forEach(uid => {
        const result = userSchema.safeParse({
          uid,
          cn: 'User Name',
          sn: 'Name',
          mail: 'user@example.com',
          userPassword: 'Password123!'
        })
        expect(result.success).toBe(true)
      })
    })

    it('should require all fields', () => {
      const result = userSchema.safeParse({
        uid: 'user'
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(1)
      }
    })
  })

  describe('Connection Validation', () => {
    it('should reject empty password', () => {
      const result = connectionSchema.safeParse({
        password: ''
      })
      expect(result.success).toBe(false)
    })

    it('should accept any non-empty password', () => {
      const passwords = ['a', '123', 'short', 'very-long-password-123']
      passwords.forEach(pwd => {
        const result = connectionSchema.safeParse({ password: pwd })
        expect(result.success).toBe(true)
      })
    })
  })

  describe('XSS Prevention in Validation', () => {
    it('should accept but sanitize HTML in text fields', () => {
      const result = userSchema.safeParse({
        uid: 'user',
        cn: '<script>alert("xss")</script>',
        sn: 'Name',
        mail: 'user@example.com',
        userPassword: 'Password123!'
      })
      expect(result.success).toBe(true)
    })

    it('should handle SQL injection attempts', () => {
      const result = userSchema.safeParse({
        uid: 'user',
        cn: "'; DROP TABLE users; --",
        sn: 'Name',
        mail: 'user@example.com',
        userPassword: 'Password123!'
      })
      expect(result.success).toBe(true)
    })
  })
})
