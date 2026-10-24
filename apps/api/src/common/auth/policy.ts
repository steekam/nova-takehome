import { ForbiddenException, Injectable, Logger, SetMetadata, type Type } from '@nestjs/common'
import { ModuleRef, Reflector } from '@nestjs/core'
import type { ApiPrincipal } from '@nova/shared'
import type { ExecutionContext, CanActivate } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'

// Adapted from @nestjs/authorization 0.1.0 (MIT, Kamil Mysliwiec), policy-evaluator.service.ts.
export const POLICY_REQUIREMENTS_KEY = 'authorization:policy-requirements'

export type PolicyMethod = (
  principal: ApiPrincipal | null,
  ...args: never[]
) => boolean | Promise<boolean>
export type PolicyAbility<P> = {
  [K in keyof P]-?: P[K] extends (
    principal: ApiPrincipal | null,
    ...args: never[]
  ) => boolean | Promise<boolean>
    ? K
    : never
}[keyof P] &
  string
export type PolicyArguments<P, A extends keyof P> = P[A] extends (
  principal: ApiPrincipal | null,
  ...args: infer Arguments
) => boolean | Promise<boolean>
  ? Arguments
  : never
export type PolicyRequirement = { policy: Type<object>; ability: string }

export function Policy() {
  return <T extends Function>(target: T) => {
    Injectable()(target)
  }
}

export function Can<P extends object, A extends PolicyAbility<P>>(
  policy: Type<P>,
  ability: A,
): MethodDecorator & ClassDecorator {
  return SetMetadata(POLICY_REQUIREMENTS_KEY, [{ policy, ability }])
}

export async function evaluatePolicy<P extends object>(
  principal: ApiPrincipal | null,
  policy: P,
  ability: string,
  ...args: unknown[]
): Promise<boolean> {
  const method = (policy as Record<string, unknown>)[ability]
  if (typeof method !== 'function')
    throw new Error(`${policy.constructor.name} has no ability '${ability}'`)
  return (
    (await (method as (principal: ApiPrincipal | null, ...args: unknown[]) => unknown).call(
      policy,
      principal,
      ...args,
    )) === true
  )
}

export async function authorize<P extends object, A extends PolicyAbility<P>>(
  principal: ApiPrincipal,
  policy: P,
  ability: A,
  ...args: PolicyArguments<P, A>
) {
  if (!(await evaluatePolicy(principal, policy, ability, ...args))) {
    const logger = new Logger('Authorization')
    logger.warn(
      JSON.stringify({
        actor: principal.subject,
        policy: policy.constructor.name,
        ability,
        requestId: null,
      }),
    )
    throw new ForbiddenException()
  }
}

@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly logger = new Logger('Authorization')
  constructor(
    private readonly reflector: Reflector,
    private readonly moduleRef: ModuleRef,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requirements = this.reflector.getAllAndMerge<PolicyRequirement[]>(
      POLICY_REQUIREMENTS_KEY,
      [context.getClass(), context.getHandler()],
    )
    if (!requirements?.length) throw new ForbiddenException('Route has no authorization policy')
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const principal = request.user ?? null
    for (const requirement of requirements) {
      const policy = this.moduleRef.get(requirement.policy, { strict: false }) as object
      if (!(await evaluatePolicy(principal, policy, requirement.ability))) {
        this.logger.warn(
          JSON.stringify({
            actor: principal?.subject ?? null,
            policy: requirement.policy.name,
            ability: requirement.ability,
            requestId: request.headers['x-request-id'] ?? null,
          }),
        )
        throw new ForbiddenException()
      }
    }
    return true
  }
}
