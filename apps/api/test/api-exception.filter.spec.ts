import { ArgumentsHost, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ApiExceptionFilter } from '../src/common/api-exception.filter'
import { RequestIdService } from '../src/common/request-id.service'

describe('ApiExceptionFilter', () => {
  it('preserves the actionable database migration readiness response', () => {
    const reply = { status: jest.fn().mockReturnThis(), send: jest.fn() }
    const request = {
      headers: { 'x-request-id': 'request-123' },
      method: 'GET',
      url: '/health/ready',
      routeOptions: { url: '/health/ready' },
    }
    const host = {
      switchToHttp: () => ({ getRequest: () => request, getResponse: () => reply }),
    } as unknown as ArgumentsHost
    const filter = new ApiExceptionFilter(new RequestIdService())
    const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation()

    try {
      filter.catch(new ServiceUnavailableException({
        code: 'DATABASE_MIGRATIONS_REQUIRED',
        message: 'Database schema is not current. Run pnpm db:migrate.',
      }), host)

      expect(reply.status).toHaveBeenCalledWith(503)
      expect(reply.send).toHaveBeenCalledWith({
        statusCode: 503,
        message: 'Database schema is not current. Run pnpm db:migrate.',
        requestId: 'request-123',
        code: 'DATABASE_MIGRATIONS_REQUIRED',
      })
    } finally {
      errorLog.mockRestore()
    }
  })
})
