import { z } from 'zod'

export const passwordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
})

export const userSchema = z.object({
  uid: z.string().min(3, 'Username must be at least 3 characters').regex(/^[a-z0-9_-]+$/, 'Username can only contain lowercase letters, numbers, hyphens and underscores'),
  cn: z.string().min(1, 'Full name is required'),
  sn: z.string().min(1, 'Last name is required'),
  mail: z.string().email('Invalid email address'),
  userPassword: z.string().min(8, 'Password must be at least 8 characters')
})

export const connectionSchema = z.object({
  password: z.string().min(1, 'Password is required')
})

export type PasswordFormData = z.infer<typeof passwordSchema>
export type UserFormData = z.infer<typeof userSchema>
export type ConnectionFormData = z.infer<typeof connectionSchema>
