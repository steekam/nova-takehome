import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { DatabaseModule } from './database/database.module'
import { DatabaseService } from './database/database.service'
import { PostgresThrottlerStorage } from './common/security/postgres-throttler-storage'
import { CommonModule } from './common/common.module'
import { TelemetryService } from './telemetry.service'
import { HealthController } from './health.controller'
import { AuthModule } from './auth/auth.module'
import { AuthGuard } from './common/auth/auth.guard'
import { PolicyGuard } from './common/auth/policy'
import { CurriculumLibraryModule } from './curriculum-library/curriculum-library.module'
import { LessonPlanningModule } from './lesson-planning/lesson-planning.module'
import { validateEnvironment } from './configuration'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnvironment }),
    ThrottlerModule.forRootAsync({
      imports: [DatabaseModule],
      inject: [DatabaseService],
      useFactory: (database: DatabaseService) => ({
        throttlers: [{ ttl: 60_000, limit: 100 }],
        storage: new PostgresThrottlerStorage(database),
      }),
    }),
    DatabaseModule,
    CommonModule,
    AuthModule,
    CurriculumLibraryModule,
    LessonPlanningModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PolicyGuard },
    TelemetryService,
  ],
})
export class AppModule {}
