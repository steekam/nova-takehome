import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { ModuleRef, Reflector } from '@nestjs/core'
import type { ApiPrincipal } from '@nova/shared'
import { Can, PolicyGuard } from '../src/common/auth/policy'
import { LessonPlanPolicy } from '../src/common/auth/policies'

class ReviewQueueController {
  @Can(LessonPlanPolicy, 'review')
  reviewQueue(): void {}
}

class UnprotectedController {
  list(): void {}
}

function contextFor(
  controller: Function,
  handler: Function,
  user?: ApiPrincipal,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user, headers: {} }) }),
  } as unknown as ExecutionContext
}

describe('policy route guard', () => {
  const moduleRef = {
    get: (PolicyType: new () => object) => new PolicyType(),
  } as ModuleRef
  const guard = new PolicyGuard(new Reflector(), moduleRef)
  const teacher: ApiPrincipal = {
    subject: 'teacher-1',
    roles: ['teacher'],
    permissions: ['lesson_plan:view'],
  }
  const lead: ApiPrincipal = {
    subject: 'lead-1',
    roles: ['curriculum_lead'],
    permissions: ['lesson_plan:view', 'lesson_plan:review'],
  }

  it('rejects routes without an explicit policy', async () => {
    await expect(
      guard.canActivate(contextFor(UnprotectedController, UnprotectedController.prototype.list)),
    ).rejects.toThrow(ForbiddenException)
  })

  it('rejects unauthenticated callers and principals without the required capability', async () => {
    await expect(
      guard.canActivate(
        contextFor(ReviewQueueController, ReviewQueueController.prototype.reviewQueue),
      ),
    ).rejects.toThrow(ForbiddenException)
    await expect(
      guard.canActivate(
        contextFor(ReviewQueueController, ReviewQueueController.prototype.reviewQueue, teacher),
      ),
    ).rejects.toThrow(ForbiddenException)
  })

  it('allows a principal with the required capability', async () => {
    await expect(
      guard.canActivate(
        contextFor(ReviewQueueController, ReviewQueueController.prototype.reviewQueue, lead),
      ),
    ).resolves.toBe(true)
  })
})
