import 'reflect-metadata'
import { Controller, Get } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { Can } from '../src/common/auth/policy'
import { RoutePolicy } from '../src/common/auth/policies'
import { PolicyAuditService } from '../src/common/security/policy-audit.service'
import {
  isCrossOriginWrite,
  normalizeOrigin,
} from '../src/common/security/upstream/cross-origin.util'
import { validateEnvironment } from '../src/configuration'

describe('browser write protection', () => {
  const trusted = new Set(['http://localhost:5173'])
  const request = (headers: Record<string, string | string[] | undefined>) => ({
    method: 'POST',
    headers,
  })

  it('rejects cross-site and sibling-site writes unless the origin is explicitly trusted', () => {
    expect(
      isCrossOriginWrite(
        request({ origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' }),
        trusted,
      ),
    ).toBe(true)
    expect(
      isCrossOriginWrite(
        request({ origin: 'https://sibling.test', 'sec-fetch-site': 'same-site' }),
        trusted,
      ),
    ).toBe(true)
    expect(
      isCrossOriginWrite(
        request({ origin: 'http://localhost:5173', 'sec-fetch-site': 'same-site' }),
        trusted,
      ),
    ).toBe(false)
    expect(isCrossOriginWrite(request({ origin: 'null' }), trusted)).toBe(true)
    expect(
      isCrossOriginWrite(
        request({ origin: ['http://localhost:5173', 'https://evil.test'] }),
        trusted,
      ),
    ).toBe(true)
  })

  it('supports same-origin browsers and non-browser clients, and permits safe reads', () => {
    expect(isCrossOriginWrite(request({ 'sec-fetch-site': 'same-origin' }), trusted)).toBe(false)
    expect(
      isCrossOriginWrite(request({ origin: 'https://api.test', host: 'api.test:443' }), trusted),
    ).toBe(false)
    expect(isCrossOriginWrite(request({}), trusted)).toBe(false)
    expect(
      isCrossOriginWrite({ method: 'GET', headers: { origin: 'https://evil.test' } }, trusted),
    ).toBe(false)
  })

  it('fails startup for invalid or implicit production browser origins', () => {
    expect(() => validateEnvironment({ NODE_ENV: 'production' })).toThrow('CORS_ORIGIN')
    for (const value of [
      '*',
      'https://app.test/path',
      'https://user:pass@app.test',
      'file://app.test',
    ])
      expect(() => validateEnvironment({ CORS_ORIGIN: value })).toThrow('CORS_ORIGIN')
    expect(normalizeOrigin('HTTPS://APP.TEST:443', 'origin')).toBe('https://app.test')
  })
})

describe('route policy inventory', () => {
  @Controller('missing')
  class MissingPolicyController {
    @Get()
    get() {
      return 'closed'
    }
  }

  @Controller('declared')
  class DeclaredPolicyController {
    @Get()
    @Can(RoutePolicy, 'authenticated')
    get() {
      return 'explicit'
    }
  }

  it('rejects a forgotten route declaration before the app starts serving', async () => {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [MissingPolicyController],
      providers: [PolicyAuditService],
    }).compile()
    await expect(module.init()).rejects.toThrow('MissingPolicyController.get')
    await module.close().catch(() => undefined)
  })

  it('accepts an explicitly declared route', async () => {
    const module = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [DeclaredPolicyController],
      providers: [PolicyAuditService],
    }).compile()
    await expect(module.init()).resolves.toBe(module)
    await module.close()
  })
})
