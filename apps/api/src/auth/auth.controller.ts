import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger'
import { IsEmail, IsString, MinLength } from 'class-validator'
import { FastifyReply } from 'fastify'
import type { ApiPrincipal } from '@nova/shared'
import { CurrentUser } from '../common/auth/current-user.decorator'
import { Public } from '../common/auth/public.decorator'
import { AuthService } from './auth.service'

class LoginRequest {
  @ApiProperty({ example: 'teacher@example.test' })
  @IsEmail()
  email!: string

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string
}

class PrincipalResponse implements ApiPrincipal {
  @ApiProperty({ format: 'uuid' })
  subject!: string

  @ApiProperty({ enum: ['teacher', 'curriculum_lead'], isArray: true })
  roles!: ApiPrincipal['roles']

  @ApiProperty({ type: [String] })
  permissions!: string[]
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in with an email and password' })
  @ApiOkResponse({ type: LoginResponse })
  async login(
    @Body() body: LoginRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(body.email, body.password)
    if (!result) throw new UnauthorizedException('Invalid email or password')
    reply.setCookie('nova_access', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api',
      maxAge: 60 * 60 * 12,
    })
    return { user: result.user }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out and clear the browser session' })
  @ApiNoContentResponse()
  logout(@Res({ passthrough: true }) reply: FastifyReply): void {
    reply.clearCookie('nova_access', { path: '/api' })
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the authenticated user and permissions' })
  @ApiOkResponse({ type: PrincipalResponse })
  getCurrentUser(@CurrentUser() principal: ApiPrincipal): ApiPrincipal {
    return principal
  }
}
