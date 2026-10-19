import { SetMetadata } from '@nestjs/common'
import type { UserRole } from '@nova/shared'

export const ROLES_KEY = 'authorization:roles'

export function Roles(...roles: UserRole[]) {
  if (roles.length === 0) throw new Error('@Roles requires at least one role')
  return SetMetadata(ROLES_KEY, roles)
}
