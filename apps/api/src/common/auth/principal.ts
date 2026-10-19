export interface ApiPrincipal {
  subject: string
  roles: string[]
  permissions: string[]
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: ApiPrincipal
  }
}
