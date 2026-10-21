import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common'

type StandardIssue = {
  message: string
  path?: readonly (PropertyKey | { key: PropertyKey })[]
}

type StandardSchema<T> = {
  '~standard': {
    validate(value: unknown): StandardResult<T> | Promise<StandardResult<T>>
  }
}

type StandardResult<T> =
  | { value: T; issues?: undefined }
  | { issues: readonly StandardIssue[]; value?: undefined }

@Injectable()
export class StandardSchemaPipe<T> implements PipeTransform<unknown, Promise<T>> {
  constructor(
    private readonly schema: StandardSchema<T>,
    private readonly message = 'Correct the listed request fields and try again.',
  ) {}

  async transform(value: unknown): Promise<T> {
    const result = await this.schema['~standard'].validate(value)
    if (result.issues) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: this.message,
        errors: result.issues.map((issue) => ({
          field:
            issue.path
              ?.map((part) => (typeof part === 'object' ? part.key : part))
              .map(String)
              .join('.') || 'body',
          constraints: [issue.message],
        })),
      })
    }
    return result.value
  }
}
