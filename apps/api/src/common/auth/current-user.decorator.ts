import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { FastifyRequest } from 'fastify'
import type { ApiPrincipal } from '@nova/shared'

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext): ApiPrincipal | undefined =>
  context.switchToHttp().getRequest<FastifyRequest>().user,
)
