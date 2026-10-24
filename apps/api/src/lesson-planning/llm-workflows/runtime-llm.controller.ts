import { Body, Controller, Get, Put } from '@nestjs/common'
import { ApiBody, ApiResponse, ApiTags } from '@nestjs/swagger'
import { RuntimeLessonPlanProvider } from './runtime-lesson-plan-provider'
import { StandardSchemaPipe } from '../../common/validation/standard-schema.pipe'
import { RuntimeLlmModeRequestSchema, type LlmMockScenario, type LlmMode } from '@nova/shared'
import { Can } from '../../common/auth/policy'
import { RoutePolicy, RuntimeLlmPolicy } from '../../common/auth/policies'

@ApiTags('Runtime configuration')
@Controller('runtime/llm')
export class RuntimeLlmController {
  constructor(private readonly provider: RuntimeLessonPlanProvider) {}

  @Get()
  @Can(RoutePolicy, 'authenticated')
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/RuntimeLlmModeStatus' } })
  getMode() {
    return this.provider.status()
  }

  @Put()
  @Can(RuntimeLlmPolicy, 'manage')
  @ApiBody({ schema: { $ref: '#/components/schemas/RuntimeLlmModeRequest' } })
  @ApiResponse({ status: 200, schema: { $ref: '#/components/schemas/RuntimeLlmModeStatus' } })
  @ApiResponse({ status: 400, schema: { $ref: '#/components/schemas/ApiErrorResponse' } })
  setMode(
    @Body(
      new StandardSchemaPipe(RuntimeLlmModeRequestSchema, {
        message: 'Choose either mock or live mode.',
      }),
    )
    body: { mode: LlmMode; mockScenario?: LlmMockScenario },
  ) {
    return this.provider.setMode(body.mode, body.mockScenario)
  }
}
