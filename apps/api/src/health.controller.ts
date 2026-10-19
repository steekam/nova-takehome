import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { ServiceUnavailableException } from '@nestjs/common'
import { DatabaseService } from './database/database.service'

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Check API liveness' })
  getHealth() {
    return { status: 'ok' }
  }

  @Get('ready')
  @ApiOperation({ summary: 'Check API and database readiness' })
  async getReadiness() {
    if (!(await this.database.isReady())) throw new ServiceUnavailableException('Database is unavailable')
    return { status: 'ready' }
  }
}
