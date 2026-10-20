import { z } from 'zod'
import type { SchemaObject } from '@nestjs/swagger'

export function toOpenApiSchema(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject
}
