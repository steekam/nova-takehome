import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const words = readFileSync(resolve(import.meta.dirname, 'passphrase-words.txt'), 'utf8')
  .split(/\r?\n/)
  .filter((word) => word && !word.startsWith('#'))

export function generatePassphrase() {
  const selected = new Set()
  while (selected.size < 3) selected.add(words[randomInt(words.length)])
  return `${[...selected].join('-')}-${randomInt(10)}`
}
