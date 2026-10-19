import type { ApiPrincipal } from '@nova/shared'

export type { ApiPrincipal } from '@nova/shared'

declare module 'fastify' {
  interface FastifyRequest {
    user?: ApiPrincipal
  }
}
