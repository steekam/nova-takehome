import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { FastifyRequest } from 'fastify'
import { AuthService } from '../../auth/auth.service'
import { IS_PUBLIC_KEY } from './public.decorator'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) return true

    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const cookieName = process.env.NODE_ENV === 'production' ? '__Host-nova_access' : 'nova_access'
    const token = request.cookies?.[cookieName]
    const principal = token ? await this.auth.authenticate(token) : undefined
    if (!principal) throw new UnauthorizedException()

    request.user = principal
    return true
  }
}
