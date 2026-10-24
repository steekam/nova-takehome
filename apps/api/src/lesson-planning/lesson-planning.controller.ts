import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import {
  EditLessonPlanRequestSchema,
  GenerateLessonPlanRequestSchema,
  LessonPlanContentSchema,
  ReviewLessonPlanRequestSchema,
  ValidateLessonPlanRequestSchema,
  type ApiPrincipal,
} from '@nova/shared'
import { CurrentUser } from '../common/auth/current-user.decorator'
import { Can } from '../common/auth/policy'
import { LessonPlanPolicy } from '../common/auth/policies'
import { StandardSchemaPipe } from '../common/validation/standard-schema.pipe'
import { LessonPlanningService } from './lesson-planning.service'

@ApiTags('Lesson planning')
@Controller()
export class LessonPlanningController {
  constructor(private readonly curriculum: LessonPlanningService) {}

  @Get('lesson-plans')
  @Can(LessonPlanPolicy, 'view')
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/LessonPlanListResponse' } })
  async list(@CurrentUser() principal: ApiPrincipal) {
    return { items: await this.curriculum.list(principal) }
  }

  @Post('lesson-plans/generate')
  @ApiOperation({ summary: 'Generate a grounded lesson plan draft' })
  @ApiBody({ schema: { $ref: '#/components/schemas/GenerateLessonPlanRequest' } })
  @ApiResponse({ status: 201, schema: { $ref: '#/components/schemas/LessonPlanResponse' } })
  @ApiResponse({ status: 400, schema: { $ref: '#/components/schemas/ValidationErrorResponse' } })
  @Can(LessonPlanPolicy, 'create')
  async generate(
    @CurrentUser() principal: ApiPrincipal,
    @Body(new StandardSchemaPipe(GenerateLessonPlanRequestSchema)) input: {
      targetRevisionId: string
      durationMinutes: number
    },
  ) {
    const result = await this.curriculum.generate(
      principal,
      input.targetRevisionId,
      input.durationMinutes,
    )
    const { plan, viewer, rubricQa } = result
    return {
      plan,
      viewer,
      rubricQa,
      qa: buildLessonPlanQa(
        plan.content,
        await this.curriculum.citationsExist(plan.content, plan.targetRevisionId),
        await this.curriculum.citationsAllowed(plan.id, plan.content),
      ),
    }
  }

  @Get('lesson-plans/:id')
  @Can(LessonPlanPolicy, 'view')
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/LessonPlanDetailsResponse' } })
  async get(@Param('id') id: string, @CurrentUser() principal: ApiPrincipal) {
    const { plan, viewer } = await this.curriculum.get(id, principal)
    const [reviews, versions] = await Promise.all([
      this.curriculum.reviews(id, principal),
      this.curriculum.versions(id, principal),
    ])
    return {
      plan,
      viewer,
      reviews,
      versions,
      rubricQa: await this.curriculum.latestRubricQa(id, principal),
      qa: buildLessonPlanQa(
        plan.content,
        await this.curriculum.citationsExist(plan.content, plan.targetRevisionId),
        await this.curriculum.citationsAllowed(plan.id, plan.content),
      ),
    }
  }

  @Delete('lesson-plans/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an unreviewed draft from the teacher workspace' })
  @ApiResponse({ status: 204, description: 'Lesson plan removed from the workspace.' })
  @ApiResponse({ status: 409, description: 'Plan is reviewed, in review, returned, or published.' })
  @Can(LessonPlanPolicy, 'delete')
  async delete(@Param('id') id: string, @CurrentUser() principal: ApiPrincipal) {
    await this.curriculum.delete(id, principal)
  }

  @Post('lesson-plans/:id/validate')
  @Can(LessonPlanPolicy, 'view')
  @ApiOperation({ summary: 'Run advisory rubric QA against an immutable lesson plan version' })
  @ApiBody({ schema: { $ref: '#/components/schemas/ValidateLessonPlanRequest' } })
  @ApiResponse({ status: 201, schema: { $ref: '#/components/schemas/LessonPlanRubricQaResponse' } })
  async validate(
    @Param('id') id: string,
    @CurrentUser() principal: ApiPrincipal,
    @Body(new StandardSchemaPipe(ValidateLessonPlanRequestSchema)) input: { versionId: string },
  ) {
    return this.curriculum.validateVersion(id, input.versionId, principal)
  }

  @Patch('lesson-plans/:id')
  @ApiBody({ schema: { $ref: '#/components/schemas/EditLessonPlanRequest' } })
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/LessonPlanResponse' } })
  @ApiResponse({ status: 400, schema: { $ref: '#/components/schemas/ValidationErrorResponse' } })
  @Can(LessonPlanPolicy, 'edit')
  async edit(
    @Param('id') id: string,
    @CurrentUser() principal: ApiPrincipal,
    @Body(new StandardSchemaPipe(EditLessonPlanRequestSchema)) input: { content: unknown },
  ) {
    const { plan, viewer } = await this.curriculum.edit(id, principal, input.content)
    return {
      plan,
      viewer,
      qa: buildLessonPlanQa(
        plan.content,
        await this.curriculum.citationsExist(plan.content, plan.targetRevisionId),
        await this.curriculum.citationsAllowed(plan.id, plan.content),
      ),
    }
  }

  @Post('lesson-plans/:id/submit')
  @ApiResponse({ status: 201, schema: { $ref: '#/components/schemas/LessonPlanResponse' } })
  @Can(LessonPlanPolicy, 'submit')
  async submit(@Param('id') id: string, @CurrentUser() principal: ApiPrincipal) {
    const { plan, viewer } = await this.curriculum.submit(id, principal)
    return {
      plan,
      viewer,
      qa: buildLessonPlanQa(
        plan.content,
        await this.curriculum.citationsExist(plan.content, plan.targetRevisionId),
        await this.curriculum.citationsAllowed(plan.id, plan.content),
      ),
    }
  }

  @Post('lesson-plans/:id/reviews')
  @ApiBody({ schema: { $ref: '#/components/schemas/ReviewLessonPlanRequest' } })
  @ApiResponse({ status: 201, schema: { $ref: '#/components/schemas/LessonPlanReviewResponse' } })
  @ApiResponse({ status: 400, schema: { $ref: '#/components/schemas/ValidationErrorResponse' } })
  @Can(LessonPlanPolicy, 'review')
  async review(
    @Param('id') id: string,
    @CurrentUser() principal: ApiPrincipal,
    @Body(new StandardSchemaPipe(ReviewLessonPlanRequestSchema)) input: {
      decision: 'returned' | 'published'
      comment?: string
    },
  ) {
    const { plan, viewer, review } = await this.curriculum.review(
      id,
      principal,
      input.decision,
      input.comment,
    )
    return { plan, viewer, review: { ...review, createdAt: review.createdAt.toISOString() } }
  }
}

export function buildLessonPlanQa(
  content: unknown,
  citationsExist: boolean,
  citationsAllowed: boolean,
) {
  const parsed = LessonPlanContentSchema.safeParse(content)
  const structure = parsed.success
  const duration =
    structure &&
    parsed.data.activities.reduce((sum, activity) => sum + activity.durationMinutes, 0) ===
      parsed.data.durationMinutes
  const hasCitations = structure && parsed.data.sources.length > 0
  const checks = [
    {
      code: 'lesson-structure',
      passed: structure,
      message: structure
        ? 'Lesson plan has the required structure.'
        : 'Lesson plan structure is invalid.',
    },
    {
      code: 'duration-total',
      passed: duration,
      message: duration
        ? 'Activity times match the lesson duration.'
        : 'Activity times do not match the lesson duration.',
    },
    {
      code: 'citations-present',
      passed: hasCitations,
      message: !structure
        ? 'Fix the lesson plan structure before checking citations.'
        : hasCitations
          ? 'Plan cites curriculum sources.'
          : 'Add at least one curriculum source citation.',
    },
    {
      code: 'official-target-citation',
      passed: structure && citationsExist,
      message: !structure
        ? 'Fix the lesson plan structure before checking citations.'
        : citationsExist
          ? 'Source IDs exist for this target and include the official excerpt that defines the selected outcome.'
          : 'Use source IDs for this target and cite the official excerpt that defines it.',
    },
    {
      code: 'citation-source-membership',
      passed: structure && citationsAllowed,
      message: !structure
        ? 'Fix the lesson plan structure before checking citation provenance.'
        : citationsAllowed
          ? 'Every citation ID belongs to the source set retrieved for this draft. This check does not assess whether each claim is supported by the cited text.'
          : 'Use only the curriculum chunks retrieved for this draft.',
    },
  ]
  return { passed: checks.every((check) => check.passed), checks }
}
