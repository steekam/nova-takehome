import {
  HttpException,
  HttpStatus,
  Injectable,
  type ArgumentMetadata,
  type PipeTransform,
} from '@nestjs/common'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ValidationIssue } from '../validation-errors'

export interface StandardSchemaPipeOptions {
  transform?: boolean
  validateCustomDecorators?: boolean
  validateOptions?: StandardSchemaV1.Options
  errorHttpStatusCode?: number
  exceptionFactory?: (issues: readonly StandardSchemaV1.Issue[]) => unknown
  message?: string
}

/** Mirrors Nest v12.0.4 (899dbe3) while keeping Nest 11 parameter-level schema binding. */
@Injectable()
export class StandardSchemaPipe<Schema extends StandardSchemaV1> implements PipeTransform<
  StandardSchemaV1.InferInput<Schema>,
  Promise<StandardSchemaV1.InferInput<Schema> | StandardSchemaV1.InferOutput<Schema>>
> {
  private readonly options: Required<
    Pick<
      StandardSchemaPipeOptions,
      'transform' | 'validateCustomDecorators' | 'errorHttpStatusCode' | 'message'
    >
  > &
    Pick<StandardSchemaPipeOptions, 'validateOptions' | 'exceptionFactory'>

  constructor(
    private readonly schema: Schema,
    options: StandardSchemaPipeOptions = {},
  ) {
    this.options = {
      transform: true,
      validateCustomDecorators: false,
      errorHttpStatusCode: HttpStatus.BAD_REQUEST,
      message: 'Correct the listed request fields and try again.',
      ...options,
    }
  }

  async transform(
    value: StandardSchemaV1.InferInput<Schema>,
    metadata?: ArgumentMetadata,
  ): Promise<StandardSchemaV1.InferInput<Schema> | StandardSchemaV1.InferOutput<Schema>> {
    if (metadata?.type === 'custom' && !this.options.validateCustomDecorators) return value

    const result = await this.schema['~standard'].validate(
      stripProtoKeys(value),
      this.options.validateOptions,
    )
    if (result.issues) {
      throw (
        this.options.exceptionFactory?.(result.issues) ??
        new HttpException(
          {
            code: 'VALIDATION_ERROR',
            message: this.options.message,
            errors: toValidationIssues(result.issues),
          },
          this.options.errorHttpStatusCode,
        )
      )
    }

    return this.options.transform ? result.value : value
  }
}

function stripProtoKeys(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value

  for (const key of Object.keys(value)) {
    if (key === '__proto__') {
      Reflect.deleteProperty(value, key)
      continue
    }

    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor && 'value' in descriptor) stripProtoKeys(descriptor.value)
  }

  return value
}

function toValidationIssues(issues: readonly StandardSchemaV1.Issue[]): ValidationIssue[] {
  return issues.map((issue) => ({
    field:
      issue.path?.map((part) => String(typeof part === 'object' ? part.key : part)).join('.') ||
      'body',
    constraints: [issue.message],
  }))
}
