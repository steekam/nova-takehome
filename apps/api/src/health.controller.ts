import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger'
import { ServiceUnavailableException } from '@nestjs/common'
import { DatabaseService } from './database/database.service'
import { Public } from './common/auth/public.decorator'

class HealthResponse {
  @ApiProperty({ enum: ['ok'] })
  status!: 'ok'
}

class ReadinessResponse {
  @ApiProperty({ enum: ['ready'] })
  status!: 'ready'
}

@Controller('health')
@ApiTags('health')
@Public()
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Check API liveness' })
  @ApiOkResponse({ type: HealthResponse })
  getHealth() {
    return { status: 'ok' as const }
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check API and database readiness' })
  @ApiOkResponse({ type: ReadinessResponse })
  async getReadiness() {
    if (!(await this.database.isReady())) throw new ServiceUnavailableException('Database is unavailable')
    return { status: 'ready' as const }
  }
}
