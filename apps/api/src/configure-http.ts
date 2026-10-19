import { NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import { RequestIdService } from './common/request-id.service'
import { ApiExceptionFilter } from './common/api-exception.filter'
import { RequestLoggingInterceptor } from './common/request-logging.interceptor'

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
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024, files: 5 } })
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim()),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  })

  const requestIds = app.get(RequestIdService)
  fastify.addHook('onRequest', (request, reply, done) => {
    const requestId = requestIds.getOrCreate(request.headers['x-request-id'])
    request.headers['x-request-id'] = requestId
    reply.header('x-request-id', requestId)
    done()
  })

  app.useGlobalFilters(app.get(ApiExceptionFilter))
  app.useGlobalInterceptors(app.get(RequestLoggingInterceptor))
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }))

  const swagger = new DocumentBuilder()
    .setTitle('Nova Curriculum Hub API')
    .setDescription('API for grounded lesson planning and curriculum review.')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger), { useGlobalPrefix: true })
}
