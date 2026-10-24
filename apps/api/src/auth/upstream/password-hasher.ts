/*
 * Adapted from @nestjs/authentication/lib/services/password-hasher.service.ts
 * Copyright (c) 2026 Kamil Mysliwiec, MIT license.
 * Upstream: https://github.com/nestjs/authentication/tree/36bf09189b1f95d4d4011a9bcf3d9b291c99e938
 */
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto'

interface Parameters {
  logN: number
  r: number
  p: number
}

const FORMAT =
  /^\$scrypt\$ln=(\d{1,2}),r=(\d{1,3}),p=(\d{1,3})\$([A-Za-z0-9+/]{16,})\$([A-Za-z0-9+/]{16,})$/
const DEFAULTS: Parameters = { logN: 17, r: 8, p: 1 }
const MAX_PASSWORD_BYTES = 4096

function derive(
  password: Buffer,
  salt: Buffer,
  length: number,
  params: Parameters,
): Promise<Buffer> {
  const N = 2 ** params.logN
  const options: ScryptOptions = {
    N,
    r: params.r,
    p: params.p,
    maxmem: 256 * N * params.r + 1024 * 1024,
  }
  return new Promise((resolve, reject) =>
    scryptCallback(password, salt, length, options, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    }),
  )
}

function input(password: string): Buffer {
  if (typeof password !== 'string' || password.length > MAX_PASSWORD_BYTES)
    throw new RangeError('invalid password size')
  const bytes = Buffer.from(password.normalize('NFKC'), 'utf8')
  if (bytes.length === 0 || bytes.length > MAX_PASSWORD_BYTES)
    throw new RangeError('invalid password size')
  return bytes
}

function sane(params: Parameters): boolean {
  return (
    [params.logN, params.r, params.p].every(Number.isInteger) &&
    params.logN >= 10 &&
    params.logN <= 22 &&
    params.r >= 1 &&
    params.r <= 32 &&
    params.p >= 1 &&
    params.p <= 16 &&
    2 ** params.logN * params.r <= 2 ** 23 &&
    2 ** params.logN * params.r * params.p <= 2 ** 24
  )
}

export class UpstreamPasswordHasher {
  constructor(private readonly params: Parameters = DEFAULTS) {
    if (!sane(params)) throw new RangeError('unsupported scrypt parameters')
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16)
    const key = await derive(input(password), salt, 32, this.params)
    const { logN, r, p } = this.params
    return `$scrypt$ln=${logN},r=${r},p=${p}$${base64(salt)}$${base64(key)}`
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    const parsed = parse(encoded)
    if (!parsed) return false
    let bytes: Buffer
    try {
      bytes = input(password)
    } catch {
      return false
    }
    const actual = await derive(bytes, parsed.salt, parsed.hash.length, parsed.params)
    return actual.length === parsed.hash.length && timingSafeEqual(actual, parsed.hash)
  }

  needsRehash(encoded: string): boolean {
    const parsed = parse(encoded)
    return (
      !parsed ||
      parsed.params.logN !== this.params.logN ||
      parsed.params.r !== this.params.r ||
      parsed.params.p !== this.params.p ||
      parsed.hash.length !== 32 ||
      parsed.salt.length < 16
    )
  }
}

function base64(value: Buffer): string {
  return value.toString('base64').replace(/=+$/, '')
}

function parse(encoded: string): { params: Parameters; salt: Buffer; hash: Buffer } | undefined {
  const match = FORMAT.exec(encoded)
  if (!match) return undefined
  const params = { logN: Number(match[1]), r: Number(match[2]), p: Number(match[3]) }
  if (!sane(params)) return undefined
  const salt = Buffer.from(match[4], 'base64')
  const hash = Buffer.from(match[5], 'base64')
  if (salt.length < 16 || salt.length > 64 || hash.length < 16 || hash.length > 64) return undefined
  return { params, salt, hash }
}
