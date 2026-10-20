import { BadRequestException, Body, Controller, Get, Param, Post } from '@nestjs/common'
import { z } from 'zod'
import { CurriculumLibrarySourceInputSchema, type ApiPrincipal } from '@nova/shared'
import { CurrentUser } from '../common/auth/current-user.decorator'
import { Roles } from '../common/auth/roles.decorator'
import { CurriculumLibraryService } from './curriculum-library.service'

@Controller('curriculum/library')
export class CurriculumLibraryController {
  constructor(private readonly library: CurriculumLibraryService) {}

  @Get()
  async catalogue(@CurrentUser() principal: ApiPrincipal) {
    return this.library.catalogue(principal)
  }

  @Get('targets/:targetRevisionId')
  async target(@Param('targetRevisionId') targetRevisionId: string, @CurrentUser() principal: ApiPrincipal) {
    return this.library.target(targetRevisionId, principal)
  }

  @Post('targets/:targetRevisionId/sources')
  @Roles('curriculum_lead')
  async addSource(
    @Param('targetRevisionId') targetRevisionId: string,
    @CurrentUser() principal: ApiPrincipal,
    @Body() body: unknown,
  ) {
    const input = parseRequest(CurriculumLibrarySourceInputSchema, body)
    return this.library.addSource(targetRevisionId, input, principal)
  }

  @Post('source-links/:linkId/publish')
  @Roles('curriculum_lead')
  async publishSource(@Param('linkId') linkId: string, @CurrentUser() principal: ApiPrincipal) {
    return this.library.publishSource(linkId, principal)
  }
}

function parseRequest<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Correct the listed source fields and try again.',
      errors: result.error.issues.map((issue) => ({ field: issue.path.join('.') || 'body', constraints: [issue.message] })),
    })
  }
  return result.data
}
