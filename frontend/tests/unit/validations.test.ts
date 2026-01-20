import { describe, it, expect } from 'vitest'
import { passwordSchema, userSchema, connectionSchema } from '@/lib/validations'

describe('validation schemas', () => {
  describe('passwordSchema', () => {
    it('should validate matching passwords with all requirements', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Password123!',
        confirmPassword: 'Password123!'
      })
      expect(result.success).toBe(true)
    })

    it('should reject mismatched passwords', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Password123!',
        confirmPassword: 'Different123!'
      })
      expect(result.success).toBe(false)
    })

    it('should reject short passwords', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Pass1!',
        confirmPassword: 'Pass1!'
      })
      expect(result.success).toBe(false)
    })

    it('should reject passwords without uppercase', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'password123!',
        confirmPassword: 'password123!'
      })
      expect(result.success).toBe(false)
    })

    it('should reject passwords without special character', () => {
      const result = passwordSchema.safeParse({
        newPassword: 'Password123',
        confirmPassword: 'Password123'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('userSchema', () => {
    it('should validate valid user data', () => {
      const result = userSchema.safeParse({
        uid: 'jdoe',
        cn: 'John Doe',
        sn: 'Doe',
        mail: 'jdoe@example.com',
        userPassword: 'Password123!'
      })
      expect(result.success).toBe(true)
    })

    it('should reject missing required fields', () => {
      const result = userSchema.safeParse({
        uid: 'jdoe'
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid email', () => {
      const result = userSchema.safeParse({
        uid: 'jdoe',
        cn: 'John Doe',
        sn: 'Doe',
        mail: 'invalid-email',
        userPassword: 'Password123!'
      })
      expect(result.success).toBe(false)
    })

    it('should reject invalid uid format', () => {
      const result = userSchema.safeParse({
        uid: 'John Doe',
        cn: 'John Doe',
        sn: 'Doe',
        mail: 'jdoe@example.com',
        userPassword: 'Password123!'
      })
      expect(result.success).toBe(false)
    })
  })

  describe('connectionSchema', () => {
    it('should validate valid connection data', () => {
      const result = connectionSchema.safeParse({
        password: 'password123'
      })
      expect(result.success).toBe(true)
    })

    it('should reject empty password', () => {
      const result = connectionSchema.safeParse({
        password: ''
      })
      expect(result.success).toBe(false)
    })
  })
})
