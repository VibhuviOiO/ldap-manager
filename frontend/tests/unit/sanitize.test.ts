import { describe, it, expect } from 'vitest'
import { sanitizeInput, sanitizeObject } from '@/lib/sanitize'

describe('sanitize utilities', () => {
  describe('sanitizeInput', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeInput('<script>alert("xss")</script>')).toBe('')
      expect(sanitizeInput('<b>bold</b>')).toBe('bold')
      expect(sanitizeInput('normal text')).toBe('normal text')
    })

    it('should handle empty strings', () => {
      expect(sanitizeInput('')).toBe('')
    })

    it('should preserve safe text', () => {
      expect(sanitizeInput('user@example.com')).toBe('user@example.com')
      expect(sanitizeInput('John Doe')).toBe('John Doe')
    })
  })

  describe('sanitizeObject', () => {
    it('should sanitize string values', () => {
      const input = { name: '<script>xss</script>', email: 'test@test.com' }
      const result = sanitizeObject(input)
      expect(result.name).toBe('')
      expect(result.email).toBe('test@test.com')
    })

    it('should sanitize array values', () => {
      const input = { tags: ['<b>tag1</b>', 'tag2', '<script>xss</script>'] }
      const result = sanitizeObject(input)
      expect(result.tags).toEqual(['tag1', 'tag2', ''])
    })

    it('should preserve non-string values', () => {
      const input = { count: 42, active: true, data: null }
      const result = sanitizeObject(input)
      expect(result.count).toBe(42)
      expect(result.active).toBe(true)
      expect(result.data).toBe(null)
    })

    it('should handle nested objects', () => {
      const input = { user: { name: '<b>John</b>', age: 30 } }
      const result = sanitizeObject(input)
      expect(result.user).toEqual({ name: '<b>John</b>', age: 30 })
    })
  })
})
