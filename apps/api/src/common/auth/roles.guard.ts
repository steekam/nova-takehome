import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyRequest } from 'fastify'
import type { UserRole } from '@nova/shared'
import { ROLES_KEY } from './roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (roles === undefined) return true

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const principal = request.user
    if (!principal) throw new UnauthorizedException()
    if (!roles.some((role) => principal.roles.includes(role))) throw new ForbiddenException()
    return true
  }
}
