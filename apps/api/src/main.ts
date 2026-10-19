import 'varlock/auto-load'
import './instrumentation'
import 'reflect-metadata'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { NestFactory } from '@nestjs/core'
import { Logger } from '@nestjs/common'
import { AppModule } from './app.module'
import { configureHttp } from './configure-http'

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  )
  app.enableShutdownHooks()
  await configureHttp(app)
  await app.listen(process.env.PORT ?? 3001)
  Logger.log(`API listening on ${await app.getUrl()}`, 'Bootstrap')
}

void bootstrap()
