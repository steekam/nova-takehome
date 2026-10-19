import { SetMetadata } from '@nestjs/common'

export const PERMISSIONS_KEY = 'authorization:permissions'

export function Permissions(...permissions: string[]) {
  if (permissions.length === 0) throw new Error('@Permissions requires at least one permission')
  return SetMetadata(PERMISSIONS_KEY, permissions)
}
