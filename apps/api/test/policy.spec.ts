import 'reflect-metadata'
import { permissionsForRoles } from '@nova/shared'
import { authorize, evaluatePolicy } from '../src/common/auth/policy'
import { ForbiddenException } from '@nestjs/common'
import {
  CurriculumSourcePolicy,
  LessonPlanPolicy,
  RoutePolicy,
  RuntimeLlmPolicy,
  lessonPlanAvailableActions,
} from '../src/common/auth/policies'
import type { ApiPrincipal } from '@nova/shared'

const principal = (roles: ApiPrincipal['roles']): ApiPrincipal => ({
  subject: 'user-1',
  roles: [...roles],
  permissions: permissionsForRoles(roles),
})

describe('authorization policies', () => {
  it('grants only capabilities in the role matrix', async () => {
    const teacher = principal(['teacher'])
    const lead = principal(['curriculum_lead'])
    const plans = new LessonPlanPolicy()
    const sources = new CurriculumSourcePolicy()
    const runtime = new RuntimeLlmPolicy()

    expect(await evaluatePolicy(teacher, plans, 'create')).toBe(true)
    expect(await evaluatePolicy(teacher, plans, 'review')).toBe(false)
    expect(await evaluatePolicy(teacher, sources, 'add')).toBe(false)
    expect(await evaluatePolicy(teacher, runtime, 'manage')).toBe(true)
    expect(await evaluatePolicy(lead, plans, 'review')).toBe(true)
    expect(await evaluatePolicy(lead, sources, 'viewDraft')).toBe(true)
    expect(await evaluatePolicy(lead, runtime, 'manage')).toBe(true)
    expect(await evaluatePolicy(null, plans, 'view')).toBe(false)
    expect(
      await evaluatePolicy(teacher, plans, 'viewPlan', {
        teacherId: teacher.subject,
        status: 'draft',
      }),
    ).toBe(true)
    expect(
      await evaluatePolicy(teacher, plans, 'viewPlan', {
        teacherId: 'another',
        status: 'submitted',
      }),
    ).toBe(false)
    expect(
      await evaluatePolicy(lead, plans, 'viewPlan', { teacherId: 'another', status: 'submitted' }),
    ).toBe(true)
    expect(
      await evaluatePolicy(lead, plans, 'viewPlan', { teacherId: 'another', status: 'draft' }),
    ).toBe(false)
  })

  it('allows only literal true', async () => {
    class LoosePolicy {
      allow() {
        return 'yes'
      }
    }
    expect(await evaluatePolicy(principal(['teacher']), new LoosePolicy(), 'allow')).toBe(false)
  })

  it('denies direct service authorization calls without the capability', async () => {
    await expect(
      authorize(principal(['teacher']), new LessonPlanPolicy(), 'review'),
    ).rejects.toThrow(ForbiddenException)
  })

  it('projects actor actions from policy permissions and workflow transitions', () => {
    const teacher = principal(['teacher'])
    const lead = principal(['curriculum_lead'])
    const ownDraft = { teacherId: teacher.subject, status: 'draft' as const }
    const ownReturned = { teacherId: teacher.subject, status: 'returned' as const }
    const submitted = { teacherId: 'teacher-2', status: 'submitted' as const }
    const published = { teacherId: 'teacher-2', status: 'published' as const }

    expect(lessonPlanAvailableActions(teacher, ownDraft, false)).toEqual({
      edit: true,
      submit: true,
      delete: true,
      returnForRevision: false,
      publish: false,
      validate: true,
    })
    expect(lessonPlanAvailableActions(teacher, ownDraft, true).delete).toBe(false)
    expect(
      lessonPlanAvailableActions(lead, { teacherId: lead.subject, status: 'draft' }, false).delete,
    ).toBe(false)
    expect(lessonPlanAvailableActions(teacher, ownReturned, false)).toMatchObject({
      edit: true,
      submit: true,
      delete: false,
    })
    expect(lessonPlanAvailableActions(lead, submitted, false)).toMatchObject({
      edit: false,
      submit: false,
      delete: false,
      returnForRevision: true,
      publish: true,
      validate: true,
    })
    expect(lessonPlanAvailableActions(lead, published, false)).toMatchObject({
      returnForRevision: false,
      publish: false,
      validate: true,
    })
  })

  it('allows explicit public metadata without a principal', async () => {
    expect(await evaluatePolicy(null, new RoutePolicy(), 'publicRoute')).toBe(true)
  })
})
