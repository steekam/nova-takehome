import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

export function createApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Nova Curriculum Hub API')
    .setDescription('API for grounded lesson planning and curriculum review.')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  return SwaggerModule.createDocument(app, config)
}
