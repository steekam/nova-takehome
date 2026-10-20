import { z } from 'zod'

export const ValidationIssueSchema = z.object({
  field: z.string(),
  constraints: z.array(z.string()),
}).strict()

export const ValidationErrorResponseSchema = z.object({
  statusCode: z.number().int().positive(),
  code: z.literal('VALIDATION_ERROR'),
  message: z.union([z.string(), z.array(z.string())]),
  requestId: z.string(),
  errors: z.array(ValidationIssueSchema),
}).strict()

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int().positive(),
  code: z.string(),
  message: z.union([z.string(), z.array(z.string())]),
  requestId: z.string(),
  errors: z.array(ValidationIssueSchema).optional(),
}).strict()

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>
