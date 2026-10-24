/*
 * Adapted from @nestjs/authentication/lib/utils/crypto.util.ts
 * Copyright (c) 2026 Kamil Mysliwiec, MIT license.
 * Upstream: https://github.com/nestjs/authentication/tree/36bf09189b1f95d4d4011a9bcf3d9b291c99e938
 */
import { createHash, randomBytes } from 'node:crypto'

/** 256 random bits, base64url (43 chars). */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/** SHA-256 base64url storage key for a high-entropy bearer secret. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('base64url')
}

/** Pattern of a randomToken(). */
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
