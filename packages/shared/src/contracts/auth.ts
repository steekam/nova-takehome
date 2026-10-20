import { z } from 'zod'

export const userRoles = ['teacher', 'curriculum_lead'] as const
export const UserRoleSchema = z.enum(userRoles)

export type UserRole = z.infer<typeof UserRoleSchema>

export interface ApiPrincipal {
  subject: string
  roles: UserRole[]
  permissions: string[]
}
