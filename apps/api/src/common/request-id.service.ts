import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'

@Injectable()
export class RequestIdService {
  getOrCreate(header: string | string[] | undefined): string {
    const value = Array.isArray(header) ? header[0] : header
    return value && /^[\w.-]{1,128}$/.test(value) ? value : randomUUID()
  }
}
