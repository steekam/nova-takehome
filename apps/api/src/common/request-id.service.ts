import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'

@Injectable()
export class RequestIdService {
  private readonly requestContext = new AsyncLocalStorage<string>()

  getOrCreate(header: string | string[] | undefined): string {
    const value = Array.isArray(header) ? header[0] : header
    return value && /^[\w.-]{1,128}$/.test(value) ? value : randomUUID()
  }

  run<T>(requestId: string, callback: () => T): T {
    return this.requestContext.run(requestId, callback)
  }

  current(): string | undefined {
    return this.requestContext.getStore()
  }
}
