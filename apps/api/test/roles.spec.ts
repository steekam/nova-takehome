import { permissionsForRoles } from '@nova/shared'

describe('server-side capability matrix', () => {
  it('grants teacher lesson-plan and runtime mode capabilities', () => {
    expect(permissionsForRoles(['teacher'])).toEqual([
      'lesson_plan:view',
      'lesson_plan:create',
      'lesson_plan:edit',
      'lesson_plan:submit',
      'lesson_plan:delete',
      'runtime_llm:manage',
    ])
  })

  it('grants curriculum lead review, draft source, and runtime mode capabilities', () => {
    expect(permissionsForRoles(['curriculum_lead'])).toEqual([
      'lesson_plan:view',
      'lesson_plan:review',
      'curriculum_source:view_draft',
      'curriculum_source:add',
      'curriculum_source:publish',
      'runtime_llm:manage',
    ])
  })
})
