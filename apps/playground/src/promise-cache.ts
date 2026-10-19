export function cachedPromise<T>(cache: Map<string, Promise<T>>, key: string, load: () => Promise<T>): { promise: Promise<T>; cached: boolean } {
  const existing = cache.get(key)
  if (existing) return { promise: existing, cached: true }

  let promise: Promise<T>
  promise = load().catch((error: unknown) => {
    if (cache.get(key) === promise) cache.delete(key)
    throw error
  })
  cache.set(key, promise)
  return { promise, cached: false }
}
