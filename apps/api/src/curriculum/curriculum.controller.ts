import { BadRequestException, Body, Controller, Get, Param, Patch, Post } from '@nestjs/common'
import { z } from 'zod'
import { LessonPlanContentSchema, type ApiPrincipal } from '@nova/shared'
import { CurrentUser } from '../common/auth/current-user.decorator'
import { Roles } from '../common/auth/roles.decorator'
import { CurriculumService } from './curriculum.service'

const GenerateSchema = z.object({ targetId: z.string().uuid(), durationMinutes: z.number().int().positive().max(240) }).strict()
const EditSchema = z.object({ content: z.unknown() }).strict()
const ReviewSchema = z.object({ decision: z.enum(['returned', 'published']), comment: z.string().max(2000).optional() }).strict()

@Controller()
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get('outcomes')
  async outcomes() { return { items: await this.curriculum.outcomes() } }

  @Get('sources')
  async sources() { return { items: await this.curriculum.sources() } }

  @Get('lesson-plans')
  async list(@CurrentUser() principal: ApiPrincipal) { return { items: await this.curriculum.list(principal) } }

  @Post('lesson-plans/generate')
  @Roles('teacher')
  async generate(@CurrentUser() principal: ApiPrincipal, @Body() body: unknown) {
    const input = parseRequest(GenerateSchema, body)
    const plan = await this.curriculum.generate(principal, input.targetId, input.durationMinutes)
    return { plan, qa: qaFor(plan.content, await this.curriculum.citationsExist(plan.content), await this.curriculum.citationsAllowed(plan.id, plan.content)) }
  }

  @Get('lesson-plans/:id')
  async get(@Param('id') id: string, @CurrentUser() principal: ApiPrincipal) {
    const plan = await this.curriculum.get(id, principal)
    const [reviews, versions] = await Promise.all([this.curriculum.reviews(id), this.curriculum.versions(id)])
    return { plan, reviews, versions, qa: qaFor(plan.content, await this.curriculum.citationsExist(plan.content), await this.curriculum.citationsAllowed(plan.id, plan.content)) }
  }

  @Patch('lesson-plans/:id')
  @Roles('teacher')
  async edit(@Param('id') id: string, @CurrentUser() principal: ApiPrincipal, @Body() body: unknown) {
    const input = parseRequest(EditSchema, body)
    const plan = await this.curriculum.edit(id, principal, input.content)
    return { plan, qa: qaFor(plan.content, await this.curriculum.citationsExist(plan.content), await this.curriculum.citationsAllowed(plan.id, plan.content)) }
  }

  @Post('lesson-plans/:id/submit')
  @Roles('teacher')
  async submit(@Param('id') id: string, @CurrentUser() principal: ApiPrincipal) {
    const plan = await this.curriculum.submit(id, principal)
    return { plan, qa: qaFor(plan.content, await this.curriculum.citationsExist(plan.content), await this.curriculum.citationsAllowed(plan.id, plan.content)) }
  }

  @Post('lesson-plans/:id/reviews')
  @Roles('curriculum_lead')
  async review(@Param('id') id: string, @CurrentUser() principal: ApiPrincipal, @Body() body: unknown) {
    const input = parseRequest(ReviewSchema, body)
    const { plan, review } = await this.curriculum.review(id, principal, input.decision, input.comment)
    return { plan, review: { ...review, createdAt: review.createdAt.toISOString() } }
  }
}

export function parseRequest<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Correct the listed request fields and try again.',
      errors: result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        constraints: [issue.message],
      })),
    })
  }
  return result.data
}

function qaFor(content: unknown, citationsExist: boolean, citationsAllowed: boolean) {
  const parsed = LessonPlanContentSchema.safeParse(content)
  const structure = parsed.success
  const duration = structure && parsed.data.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0) === parsed.data.durationMinutes
  const hasCitations = structure && parsed.data.sources.length > 0
  const checks = [
    { code: 'lesson-structure', passed: structure, message: structure ? 'Lesson plan has the required structure.' : 'Lesson plan structure is invalid.' },
    { code: 'duration-total', passed: duration, message: duration ? 'Activity times match the lesson duration.' : 'Activity times do not match the lesson duration.' },
    { code: 'citations-present', passed: hasCitations, message: !structure ? 'Fix the lesson plan structure before checking citations.' : hasCitations ? 'Plan cites curriculum sources.' : 'Add at least one curriculum source citation.' },
    { code: 'citations-exist', passed: structure && citationsExist, message: !structure ? 'Fix the lesson plan structure before checking citations.' : citationsExist ? 'Cited curriculum sources exist.' : 'Replace citations that do not match a curriculum source.' },
    { code: 'citations-grounded', passed: structure && citationsAllowed, message: !structure ? 'Fix the lesson plan structure before checking source grounding.' : citationsAllowed ? 'Citations come from the sources supplied for this draft.' : 'Use only the curriculum sources supplied with this draft.' },
  ]
  return { passed: checks.every((check) => check.passed), checks }
}
