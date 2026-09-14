// Accounts admin: validation and shapes shared by the page and the server.
import { z } from 'zod'
import { ASSIGNABLE_ROLES, type AssignableRole } from './auth/role-info.ts'

const rolesField = z.array(z.enum(ASSIGNABLE_ROLES)).max(ASSIGNABLE_ROLES.length)

export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(120),
  email: z.email('Enter a valid email address').max(200),
  roles: rolesField,
  // Email them a link to choose a password.
  sendPasswordLink: z.boolean(),
})

export const accountRolesSchema = z.object({ roles: rolesField })

export const accountBlockSchema = z.object({
  reason: z.string().trim().max(300).optional(),
})

export interface AccountView {
  id: string
  name: string
  email: string
  roles: AssignableRole[]
  blocked: boolean
  blockReason: string | null
  person: { id: string, firstName: string, lastName: string } | null
  createdAt: string
  lastSignInAt: string | null
}
