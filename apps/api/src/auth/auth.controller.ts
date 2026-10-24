import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger'
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator'
import { FastifyReply } from 'fastify'
import { FastifyRequest } from 'fastify'
import { Throttle } from '@nestjs/throttler'
import type { ApiPrincipal } from '@nova/shared'
import { CurrentUser } from '../common/auth/current-user.decorator'
import { Public } from '../common/auth/public.decorator'
import { AuthService } from './auth.service'
import { Can } from '../common/auth/policy'
import { RoutePolicy } from '../common/auth/policies'

class LoginRequest {
  @ApiProperty({ example: 'teacher@example.test' })
  @IsEmail()
  email!: string

  @ApiProperty({ minLength: 8, maxLength: 4096 })
  @IsString()
  @MinLength(8)
  @MaxLength(4096)
  password!: string
}

class PrincipalResponse implements ApiPrincipal {
  @ApiProperty({ format: 'uuid' })
  subject!: string

  @ApiProperty({ enum: ['teacher', 'curriculum_lead'], isArray: true })
  roles!: ApiPrincipal['roles']

  @ApiProperty({ type: [String] })
  permissions!: ApiPrincipal['permissions']
}

class LoginResponse {
  @ApiProperty({ type: PrincipalResponse })
  user!: PrincipalResponse
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  @Can(RoutePolicy, 'publicRoute')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with an email and password' })
  @ApiOkResponse({ type: LoginResponse })
  async login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const cookieName = authCookieName()
    const result = await this.auth.login(
      body.email,
      body.password,
      reply.request.cookies?.[cookieName],
    )
    if (!result) throw new UnauthorizedException('Invalid email or password')
    clearLegacyAuthCookie(reply)
    setAuthCookie(reply, result.sessionToken, result.maxAgeSeconds)
    return { user: result.user }
  }

  @Post('logout')
  @Public()
  @Can(RoutePolicy, 'publicRoute')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out and clear the browser session' })
  @ApiNoContentResponse()
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(request.cookies?.[authCookieName()])
    clearLegacyAuthCookie(reply)
    reply.clearCookie(authCookieName(), {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  @Post('logout-all')
  @Can(RoutePolicy, 'authenticated')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out all sessions for the current user' })
  @ApiNoContentResponse()
  async logoutAll(
    @CurrentUser() principal: ApiPrincipal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logoutAll(principal.subject)
    clearLegacyAuthCookie(reply)
    reply.clearCookie(authCookieName(), {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    })
  }

  @Post('rotate')
  @Can(RoutePolicy, 'authenticated')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponse })
  async rotate(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const result = await this.auth.rotateSession(request.cookies?.[authCookieName()] ?? '')
    if (!result) throw new UnauthorizedException()
    setAuthCookie(reply, result.sessionToken, result.maxAgeSeconds)
    return { user: result.user }
  }

  @Get('me')
  @Can(RoutePolicy, 'authenticated')
  @ApiCookieAuth('cookie')
  @ApiOperation({ summary: 'Get the authenticated user and permissions' })
  @ApiOkResponse({ type: PrincipalResponse })
  getCurrentUser(@CurrentUser() principal: ApiPrincipal): ApiPrincipal {
    return principal
  }
}

function authCookieName(): string {
  return process.env.NODE_ENV === 'production' ? '__Host-nova_access' : 'nova_access'
}

function setAuthCookie(reply: FastifyReply, token: string, maxAgeSeconds: number): void {
  reply.setCookie(authCookieName(), token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds,
  })
}

function clearLegacyAuthCookie(reply: FastifyReply): void {
  reply.clearCookie('nova_access', { path: '/api', secure: process.env.NODE_ENV === 'production' })
}
