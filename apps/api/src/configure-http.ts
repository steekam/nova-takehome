import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { SwaggerModule } from '@nestjs/swagger'
import helmet from '@fastify/helmet'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { RequestIdService } from './common/request-id.service'
import { ApiExceptionFilter } from './common/api-exception.filter'
import { RequestLoggingInterceptor } from './common/request-logging.interceptor'
import { flattenValidationErrors } from './common/validation-errors'
import { createApiDocument } from './openapi'

export async function configureHttp(app: NestFastifyApplication): Promise<void> {
  app.setGlobalPrefix('api')
  const fastify = app.getHttpAdapter().getInstance()
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
  })
  await app.register(cookie)
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 5 } })
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim()),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'traceparent',
      'tracestate',
      'baggage',
    ],
    exposedHeaders: ['X-Request-Id'],
    credentials: true,
  })

  const requestIds = app.get(RequestIdService)
  fastify.addHook('onRequest', (request, reply, done) => {
    const requestId = requestIds.getOrCreate(request.headers['x-request-id'])
    request.headers['x-request-id'] = requestId
    reply.header('x-request-id', requestId)
    requestIds.run(requestId, done)
  })

  app.useGlobalFilters(app.get(ApiExceptionFilter))
  app.useGlobalInterceptors(app.get(RequestLoggingInterceptor))
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          errors: flattenValidationErrors(errors),
        }),
    }),
  )

  SwaggerModule.setup('docs', app, createApiDocument(app), { useGlobalPrefix: true, ui: false })
}
