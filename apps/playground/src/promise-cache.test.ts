import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cachedPromise } from './promise-cache.js'

test('async cache shares a concurrent load and reuses the resolved value', async () => {
  const cache = new Map<string, Promise<number>>()
  let loads = 0
  let resolveLoad!: (value: number) => void
  const load = () => {
    loads += 1
    return new Promise<number>((resolve) => { resolveLoad = resolve })
  }

  const first = cachedPromise(cache, 'model', load)
  const second = cachedPromise(cache, 'model', load)
  assert.equal(first.cached, false)
  assert.equal(second.cached, true)
  assert.equal(loads, 1)
  resolveLoad(42)
  assert.deepEqual(await Promise.all([first.promise, second.promise]), [42, 42])
  assert.equal(cachedPromise(cache, 'model', load).cached, true)
})

test('async cache evicts a rejected load so the next call can retry', async () => {
  const cache = new Map<string, Promise<number>>()
  await assert.rejects(cachedPromise(cache, 'model', async () => { throw new Error('load failed') }).promise)
  const retry = cachedPromise(cache, 'model', async () => 42)
  assert.equal(retry.cached, false)
  assert.equal(await retry.promise, 42)
})
