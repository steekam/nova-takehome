import { SetMetadata } from '@nestjs/common'

export const ROLES_KEY = 'authorization:roles'

export function Roles(...roles: string[]) {
  if (roles.length === 0) throw new Error('@Roles requires at least one role')
  return SetMetadata(ROLES_KEY, roles)
}
