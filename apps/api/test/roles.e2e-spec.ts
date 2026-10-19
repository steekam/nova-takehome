import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { ApiPrincipal } from '@nova/shared'
import { Roles } from '../src/common/auth/roles.decorator'
import { RolesGuard } from '../src/common/auth/roles.guard'

class ReviewQueueController {
  @Roles('curriculum_lead')
  reviewQueue(): void {}
}

function contextFor(user?: ApiPrincipal): ExecutionContext {
  return {
    getHandler: () => ReviewQueueController.prototype.reviewQueue,
    getClass: () => ReviewQueueController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
}

describe('server-side role checks', () => {
  const guard = new RolesGuard(new Reflector())

  it('rejects requests without an authenticated principal', () => {
    expect(() => guard.canActivate(contextFor())).toThrow(UnauthorizedException)
  })

  it('rejects teachers from the curriculum lead review queue', () => {
    const teacher: ApiPrincipal = { subject: 'teacher-1', roles: ['teacher'], permissions: ['lesson_plan:write'] }
    expect(() => guard.canActivate(contextFor(teacher))).toThrow(ForbiddenException)
  })

  it('allows curriculum leads to access the review queue', () => {
    const lead: ApiPrincipal = { subject: 'lead-1', roles: ['curriculum_lead'], permissions: ['lesson_plan:review'] }
    expect(guard.canActivate(contextFor(lead))).toBe(true)
  })
})
