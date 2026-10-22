import { Body, Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger'
import {
  CurriculumLibrarySourceInputSchema,
  type ApiPrincipal,
  type CurriculumLibrarySourceInput,
} from '@nova/shared'
import { CurrentUser } from '../common/auth/current-user.decorator'
import { Roles } from '../common/auth/roles.decorator'
import { CurriculumLibraryService } from './curriculum-library.service'
import { StandardSchemaPipe } from '../common/validation/standard-schema.pipe'

@ApiTags('Curriculum library')
@Controller()
export class CurriculumLibraryController {
  constructor(private readonly library: CurriculumLibraryService) {}

  @Get('curriculum/library')
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/CurriculumLibrary' } })
  async catalogue(@CurrentUser() principal: ApiPrincipal) {
    return this.library.catalogue(principal)
  }

  @Get('curriculum/library/designs/:designVersionId')
  @ApiResponse({
    status: 200,
    schema: { $ref: '#/components/schemas/CurriculumLibraryDesign' },
  })
  async design(
    @Param('designVersionId') designVersionId: string,
    @CurrentUser() principal: ApiPrincipal,
  ) {
    return this.library.design(designVersionId, principal)
  }

  @Get('curriculum/library/targets/:targetRevisionId')
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/CurriculumLibraryTarget' } })
  async target(
    @Param('targetRevisionId') targetRevisionId: string,
    @CurrentUser() principal: ApiPrincipal,
  ) {
    return this.library.target(targetRevisionId, principal)
  }

  @Post('curriculum/library/targets/:targetRevisionId/sources')
  @ApiBody({ schema: { $ref: '#/components/schemas/CurriculumSourceInput' } })
  @ApiResponse({ status: 201, schema: { $ref: '#/components/schemas/CurriculumSourceLinkResult' } })
  @ApiResponse({ status: 400, schema: { $ref: '#/components/schemas/ValidationErrorResponse' } })
  @Roles('curriculum_lead')
  async addSource(
    @Param('targetRevisionId') targetRevisionId: string,
    @CurrentUser() principal: ApiPrincipal,
    @Body(
      new StandardSchemaPipe(
        CurriculumLibrarySourceInputSchema,
        'Correct the listed source fields and try again.',
      ),
    )
    input: CurriculumLibrarySourceInput,
  ) {
    return this.library.addSource(targetRevisionId, input, principal)
  }

  @Post('curriculum/library/source-links/:linkId/publish')
  @ApiResponse({ status: 201, schema: { $ref: '#/components/schemas/CurriculumSourceLinkResult' } })
  @Roles('curriculum_lead')
  async publishSource(@Param('linkId') linkId: string, @CurrentUser() principal: ApiPrincipal) {
    return this.library.publishSource(linkId, principal)
  }

  @Get('outcomes')
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/CurriculumOutcomesResponse' } })
  async outcomes() {
    return { items: await this.library.outcomes() }
  }

  @Get('sources')
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/CurriculumSourcesResponse' } })
  async sources(@CurrentUser() principal: ApiPrincipal) {
    return { items: await this.library.allSources(principal) }
  }
}
