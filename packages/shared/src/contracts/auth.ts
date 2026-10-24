import { z } from 'zod'

export const userRoles = ['teacher', 'curriculum_lead'] as const
export const UserRoleSchema = z.enum(userRoles)

export type UserRole = z.infer<typeof UserRoleSchema>

export const permissions = [
  'lesson_plan:view',
  'lesson_plan:create',
  'lesson_plan:edit',
  'lesson_plan:submit',
  'lesson_plan:delete',
  'lesson_plan:review',
  'curriculum_source:view_draft',
  'curriculum_source:add',
  'curriculum_source:publish',
  'runtime_llm:manage',
] as const
export const PermissionSchema = z.enum(permissions)
export type Permission = z.infer<typeof PermissionSchema>

export const rolePermissions: Record<UserRole, readonly Permission[]> = {
  teacher: [
    'lesson_plan:view',
    'lesson_plan:create',
    'lesson_plan:edit',
    'lesson_plan:submit',
    'lesson_plan:delete',
    'runtime_llm:manage',
  ],
  curriculum_lead: [
    'lesson_plan:view',
    'lesson_plan:review',
    'curriculum_source:view_draft',
    'curriculum_source:add',
    'curriculum_source:publish',
    'runtime_llm:manage',
  ],
}

export function permissionsForRoles(roles: readonly UserRole[]): Permission[] {
  return [...new Set(roles.flatMap((role) => rolePermissions[role]))]
}

export interface ApiPrincipal {
  subject: string
  roles: UserRole[]
  permissions: Permission[]
}

export const ApiPrincipalSchema = z.object({
  subject: z.string(),
  roles: z.array(UserRoleSchema),
  permissions: z.array(PermissionSchema),
})
