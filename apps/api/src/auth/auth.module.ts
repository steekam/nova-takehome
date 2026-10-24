import { Module } from '@nestjs/common'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { DrizzleSessionStore, SESSION_STORE } from './session-store'

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    DrizzleSessionStore,
    { provide: SESSION_STORE, useExisting: DrizzleSessionStore },
  ],
  exports: [AuthService],
})
export class AuthModule {}
