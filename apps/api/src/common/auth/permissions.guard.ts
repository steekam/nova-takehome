import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyRequest } from 'fastify'
import { PERMISSIONS_KEY } from './permissions.decorator'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (permissions === undefined) return true

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const principal = request.user
    if (!principal) throw new UnauthorizedException()
    if (
      permissions.length === 0 ||
      !permissions.every((permission) => principal.permissions.includes(permission))
    ) {
      throw new ForbiddenException()
    }
    return true
  }
}
