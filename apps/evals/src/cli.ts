import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { runApiEvaluation } from './api-eval.js'
import {
  apiReportsToDatasetItems,
  datasetItemsToJsonl,
  syncLangfuseDataset,
} from './dataset-tools.js'

function option(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name)
  return index < 0
    ? fallback
    : (args[index + 1] ??
        (() => {
          throw new Error(`${name} requires a value.`)
        })())
}

async function exportDataset(args: string[]): Promise<void> {
  const reportDirectory = path.resolve(process.env.NOVA_EVAL_REPORTS_DIR ?? '.cache/evals/runs')
  const reports = []
  for (const filename of (
    await readdir(reportDirectory).catch((error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
      throw error
    })
  ).filter((name) => name.endsWith('.json'))) {
    const report: unknown = JSON.parse(await readFile(path.join(reportDirectory, filename), 'utf8'))
    if (
      typeof report === 'object' &&
      report !== null &&
      'schemaVersion' in report &&
      report.schemaVersion === 'api-evaluation-v1'
    )
      reports.push(report)
  }
  const datasetName = option(args, '--name', 'nova-lesson-plan-api-evaluation-v1')
  const items = apiReportsToDatasetItems(reports, datasetName)
  const outputPath = path.resolve(
    option(args, '--out', `.cache/evals/datasets/${datasetName}.jsonl`),
  )
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, datasetItemsToJsonl(items))
  process.stdout.write(`Exported ${items.length} API evaluation run(s) to ${outputPath}\n`)
  if (args.includes('--sync')) {
    const synced = await syncLangfuseDataset(items, {
      datasetName,
      description: 'API-backed lesson plan generation and validation runs',
    })
    process.stdout.write(
      `Synced ${synced.syncedItemIds.length} item(s) to Langfuse dataset ${synced.datasetName}\n`,
    )
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((argument) => argument !== '--')
  const [command = 'help', ...options] = args
  if (command === 'help' || command === '--help' || command === '-h') {
    process.stdout.write(
      'Usage: pnpm evals -- eval-api [API selection options] | dataset export [--name NAME] [--out PATH] [--sync]\n',
    )
    return
  }
  if (command === 'eval-api') return runApiEvaluation(options)
  if (command === 'dataset' && options[0] === 'export') return exportDataset(options.slice(1))
  throw new Error(
    'Usage: pnpm evals -- eval-api | dataset export [--name NAME] [--out PATH] [--sync]',
  )
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Evaluation failed.'}\n`)
  process.exitCode = 1
})
