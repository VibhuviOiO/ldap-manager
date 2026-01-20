import DOMPurify from 'dompurify'

export function sanitizeInput(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [] })
}

export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = {} as T
  for (const key in obj) {
    const value = obj[key]
    if (typeof value === 'string') {
      sanitized[key] = sanitizeInput(value) as any
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((v: any) => typeof v === 'string' ? sanitizeInput(v) : v) as any
    } else {
      sanitized[key] = value
    }
  }
  return sanitized
}
