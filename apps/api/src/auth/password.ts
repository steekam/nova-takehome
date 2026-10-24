import { scrypt, timingSafeEqual } from 'node:crypto'
import { UpstreamPasswordHasher } from './upstream/password-hasher'

const hasher = new UpstreamPasswordHasher()

function legacyDerive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    }),
  )
}

export function hashPassword(password: string): Promise<string> {
  return hasher.hash(password)
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (encoded.startsWith('$scrypt$')) return hasher.verify(password, encoded)
  const [algorithm, saltHex, hashHex, extra] = encoded.split('$')
  if (
    algorithm !== 'scrypt' ||
    !saltHex ||
    !hashHex ||
    extra !== undefined ||
    !/^(?:[0-9a-f]{2}){16,64}$/i.test(saltHex) ||
    !/^(?:[0-9a-f]{2}){16,128}$/i.test(hashHex)
  )
    return false
  if (password.length > 4096) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await legacyDerive(password, Buffer.from(saltHex, 'hex'))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function needsPasswordRehash(encoded: string): boolean {
  return !encoded.startsWith('$scrypt$') || hasher.needsRehash(encoded)
}
