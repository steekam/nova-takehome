import { Test } from '@nestjs/testing'
import { DatabaseService } from '../src/database/database.service'
import { HealthController } from '../src/health.controller'

describe('HealthController', () => {
  const readiness = jest.fn()
  let controller: HealthController

  beforeEach(async () => {
    readiness.mockReset()
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DatabaseService, useValue: { readiness } }],
    }).compile()
    controller = module.get(HealthController)
  })

  it('reports ready only when required tables exist', async () => {
    readiness.mockResolvedValue({ status: 'ready' })

    await expect(controller.getReadiness()).resolves.toEqual({ status: 'ready' })
  })

  it('identifies an unapplied schema migration', async () => {
    readiness.mockResolvedValue({ status: 'migrations-required' })

    await expect(controller.getReadiness()).rejects.toMatchObject({
      status: 503,
      response: {
        code: 'DATABASE_MIGRATIONS_REQUIRED',
        message: 'Database schema is not current. Run pnpm db:migrate.',
      },
    })
  })

  it('identifies a database connection failure', async () => {
    readiness.mockResolvedValue({ status: 'database-unavailable' })

    await expect(controller.getReadiness()).rejects.toMatchObject({
      status: 503,
      response: { code: 'DATABASE_UNAVAILABLE' },
    })
  })
})
