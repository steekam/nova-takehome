import { readdir, readFile } from 'node:fs/promises'
import { basename, relative, resolve } from 'node:path'
import { parseMarkdownSource } from './source-ingestion'

async function main() {
  const directory = resolve(
    process.argv[2] ?? resolve(process.cwd(), '../../corpus/grade-8-integrated-science'),
  )
  const files = await markdownFiles(directory)
  const sources = await Promise.all(
    files.map(async (path) => {
      try {
        const parsed = parseMarkdownSource(await readFile(path, 'utf8'))
        const kinds = new Map<string, number>()
        for (const chunk of parsed.chunks) {
          const kind = chunk.metadata.kind ?? 'unknown'
          kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
        }
        return {
          path: relative(directory, path),
          sourceKey: parsed.sourceKey,
          title: parsed.title,
          resourceType: parsed.resourceType,
          chunkerVersion: parsed.chunkerVersion,
          chunks: parsed.chunks.length,
          unlocatedChunks: parsed.chunks.filter((chunk) => !chunk.locator).length,
          outcomeCodes: [
            ...new Set(parsed.chunks.flatMap((chunk) => chunk.metadata.outcomeCodes ?? [])),
          ],
          kinds: Object.fromEntries(kinds),
        }
      } catch (error) {
        throw new Error(
          `${relative(directory, path)}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }),
  )
  const keys = sources.map((source) => source.sourceKey)
  const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index)
  if (duplicates.length)
    throw new Error(`Duplicate corpus_id values: ${[...new Set(duplicates)].join(', ')}`)
  process.stdout.write(
    `${JSON.stringify({ directory: basename(directory), documents: sources }, null, 2)}\n`,
  )
}

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name)
      return entry.isDirectory()
        ? markdownFiles(path)
        : Promise.resolve(entry.isFile() && entry.name.endsWith('.md') ? [path] : [])
    }),
  )
  return paths.flat().sort()
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
