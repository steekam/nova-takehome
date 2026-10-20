import { BadRequestException, Body, Controller, Get, Put } from '@nestjs/common'
import { z } from 'zod'
import { RuntimeLessonPlanProvider } from './runtime-lesson-plan-provider'

const updateSchema = z.object({ mode: z.enum(['mock', 'live']) }).strict()

@Controller('runtime/llm')
export class RuntimeLlmController {
  constructor(private readonly provider: RuntimeLessonPlanProvider) {}

  @Get()
  getMode() {
    return this.provider.status()
  }

  @Put()
  setMode(@Body() body: unknown) {
    const result = updateSchema.safeParse(body)
    if (!result.success) throw new BadRequestException('Choose either mock or live mode.')
    return this.provider.setMode(result.data.mode)
  }
}
