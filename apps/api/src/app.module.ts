import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { DatabaseModule } from './database/database.module'
import { CommonModule } from './common/common.module'
import { TelemetryService } from './telemetry.service'
import { HealthController } from './health.controller'
import { AuthModule } from './auth/auth.module'
import { AuthGuard } from './common/auth/auth.guard'
import { RolesGuard } from './common/auth/roles.guard'
import { PermissionsGuard } from './common/auth/permissions.guard'
import { CurriculumModule } from './curriculum/curriculum.module'
import { validateEnvironment } from './configuration'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    CommonModule,
    AuthModule,
    CurriculumModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    TelemetryService,
  ],
})
export class AppModule {}
