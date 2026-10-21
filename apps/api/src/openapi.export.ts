import 'varlock/auto-load'
import 'reflect-metadata'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { configureHttp } from './configure-http'
import { createApiDocument } from './openapi'

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
  await configureHttp(app)
  await writeFile(
    resolve(__dirname, '../../openapi.json'),
    `${JSON.stringify(createApiDocument(app), null, 2)}\n`,
  )
  await app.close()
}

void exportOpenApi()
