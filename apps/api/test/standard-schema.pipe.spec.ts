import 'reflect-metadata'
import { ConflictException, HttpStatus } from '@nestjs/common'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { Test } from '@nestjs/testing'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { CurriculumLibrarySourceInput } from '@nova/shared'
import { z } from 'zod'
import { ApiExceptionFilter } from '../src/common/api-exception.filter'
import { RequestIdService } from '../src/common/request-id.service'
import { StandardSchemaPipe } from '../src/common/validation/standard-schema.pipe'
import { CurriculumLibraryController } from '../src/curriculum-library/curriculum-library.controller'
import { CurriculumLibraryService } from '../src/curriculum-library/curriculum-library.service'

describe('StandardSchemaPipe', () => {
  it('returns transformed synchronous output by default', async () => {
    const pipe = new StandardSchemaPipe(z.string().transform(Number))

    await expect(pipe.transform('42')).resolves.toBe(42)
  })

  it('supports asynchronous schema validation and output transforms', async () => {
    const schema = z
      .string()
      .refine(async (value) => value.startsWith('lesson-'))
      .transform(async (value) => value.toUpperCase())

    await expect(new StandardSchemaPipe(schema).transform('lesson-plan')).resolves.toBe(
      'LESSON-PLAN',
    )
  })

  it('can validate while returning the original input', async () => {
    const schema = z.string().transform((value) => value.length)

    await expect(
      new StandardSchemaPipe(schema, { transform: false }).transform('lesson'),
    ).resolves.toBe('lesson')
  })

  it('forwards standard schema validation options', async () => {
    const options: StandardSchemaV1.Options = { libraryOptions: { mode: 'strict' } }
    let receivedOptions: StandardSchemaV1.Options | undefined
    const schema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value, validateOptions) => {
          receivedOptions = validateOptions
          return { value: String(value) }
        },
      },
    }

    await new StandardSchemaPipe(schema, { validateOptions: options }).transform(42)

    expect(receivedOptions).toBe(options)
  })

  it('flattens nested array paths into field-level validation issues', async () => {
    const pipe = new StandardSchemaPipe(
      z.object({ items: z.array(z.object({ label: z.string().min(2) })) }),
    )

    await expect(pipe.transform({ items: [{ label: '' }] })).rejects.toMatchObject({
      response: {
        code: 'VALIDATION_ERROR',
        errors: [{ field: 'items.0.label', constraints: [expect.any(String)] }],
      },
    })
  })

  it('uses the body field when a schema issue has no path', async () => {
    const schema: StandardSchemaV1<unknown, unknown> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => ({ issues: [{ message: 'Invalid body' }] }),
      },
    }

    await expect(new StandardSchemaPipe(schema).transform({})).rejects.toMatchObject({
      response: { errors: [{ field: 'body', constraints: ['Invalid body'] }] },
    })
  })

  it('removes prototype-sensitive keys before schema validation', async () => {
    const input: unknown = JSON.parse('{"name":"plan","nested":{"__proto__":{"polluted":true}}}')
    let validatedValue: unknown
    const schema: StandardSchemaV1<unknown, unknown> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) => {
          validatedValue = value
          return { value }
        },
      },
    }

    await new StandardSchemaPipe(schema).transform(input)

    expect(validatedValue).toEqual({ name: 'plan', nested: {} })
  })

  it('skips custom decorator metadata by default and can opt in', async () => {
    const validate = jest.fn((): StandardSchemaV1.Result<string> => ({
      issues: [{ message: 'Invalid value' }],
    }))
    const schema: StandardSchemaV1<unknown, string> = {
      '~standard': { version: 1, vendor: 'test', validate },
    }
    const metadata = { type: 'custom', data: undefined, metatype: undefined } as const

    await expect(new StandardSchemaPipe(schema).transform('value', metadata)).resolves.toBe('value')
    expect(validate).not.toHaveBeenCalled()

    await expect(
      new StandardSchemaPipe(schema, { validateCustomDecorators: true }).transform(
        'value',
        metadata,
      ),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } })
    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('uses the configured HTTP status and custom exception factory', async () => {
    const schema = z.string().min(2)
    const pipe = new StandardSchemaPipe(schema, {
      errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
    })

    await expect(pipe.transform('')).rejects.toMatchObject({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      response: { code: 'VALIDATION_ERROR' },
    })

    const exception = new ConflictException('Rejected by custom factory')
    const customPipe = new StandardSchemaPipe(schema, {
      exceptionFactory: () => exception,
    })
    await expect(customPipe.transform('')).rejects.toBe(exception)
  })
})

describe('CurriculumLibraryController source validation', () => {
  let app: NestFastifyApplication
  const addSource = jest.fn(
    async (targetRevisionId: string, input: CurriculumLibrarySourceInput) => ({
      targetRevisionId,
      input,
    }),
  )

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CurriculumLibraryController],
      providers: [{ provide: CurriculumLibraryService, useValue: { addSource } }, RequestIdService],
    }).compile()
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ logger: false }),
    )
    app.setGlobalPrefix('api')
    app.useGlobalFilters(new ApiExceptionFilter(new RequestIdService()))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => addSource.mockClear())

  it('transforms a valid source request before calling the real controller method', async () => {
    const targetRevisionId = '00000000-0000-4000-8000-000000000001'
    const response = await app.inject({
      method: 'POST',
      url: `/api/curriculum/library/targets/${targetRevisionId}/sources`,
      payload: {
        title: '  Curriculum excerpt  ',
        resourceType: 'curriculum_design',
        authority: 'official',
        editionLabel: ' April 2024 ',
        sourceUrl: 'https://example.test/curriculum',
        locator: ' Page 3 ',
        content: '  Official curriculum content for the learning target.  ',
        role: 'defines_target',
      },
    })

    expect(response.statusCode).toBe(HttpStatus.CREATED)
    expect(response.json()).toMatchObject({
      targetRevisionId,
      input: {
        title: 'Curriculum excerpt',
        editionLabel: 'April 2024',
        locator: 'Page 3',
        content: 'Official curriculum content for the learning target.',
      },
    })
    expect(addSource).toHaveBeenCalledTimes(1)
  })

  it('keeps the source endpoint field-error contract and route-specific message', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/curriculum/library/targets/00000000-0000-4000-8000-000000000001/sources',
      payload: {
        title: ' ',
        resourceType: 'curriculum_design',
        authority: 'official',
        content: 'Short',
        role: 'defines_target',
      },
    })

    expect(response.statusCode).toBe(HttpStatus.BAD_REQUEST)
    expect(response.json()).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Correct the listed source fields and try again.',
      errors: expect.arrayContaining([
        { field: 'title', constraints: [expect.any(String)] },
        { field: 'content', constraints: [expect.any(String)] },
        { field: 'sourceUrl', constraints: [expect.any(String)] },
        { field: 'editionLabel', constraints: [expect.any(String)] },
        { field: 'locator', constraints: [expect.any(String)] },
      ]),
    })
    expect(addSource).not.toHaveBeenCalled()
  })
})
