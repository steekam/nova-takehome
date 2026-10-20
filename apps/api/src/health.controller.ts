import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger'
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
  @ApiResponse({ status: 503, description: 'Database is unavailable or migrations are required.' })
  async getReadiness() {
    const readiness = await this.database.readiness()
    if (readiness.status === 'database-unavailable') {
      throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Database is unavailable.' })
    }
    if (readiness.status === 'migrations-required') {
      throw new ServiceUnavailableException({ code: 'DATABASE_MIGRATIONS_REQUIRED', message: 'Database schema is not current. Run pnpm db:migrate.' })
    }
    return { status: readiness.status }
  }
}
