import type { CurriculumSourceDto } from '@nova/shared'
import { ExternalLink } from 'lucide-react'

export function SourceProvenance({ source }: { source: CurriculumSourceDto }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span
        className={`rounded-full px-2 py-0.5 font-medium ${
          source.synthetic || source.authority === 'synthetic'
            ? 'bg-amber-100 text-amber-950'
            : 'bg-muted text-foreground'
        }`}
      >
        {source.synthetic || source.authority === 'synthetic'
          ? 'Synthetic demo'
          : authorityLabel(source.authority)}
      </span>
      <span>{formatLabel(source.resourceType)}</span>
      <span aria-hidden="true">·</span>
      <span>{roleLabel(source.role)}</span>
      <span aria-hidden="true">·</span>
      <span>Revision {source.revisionNumber}</span>
    </div>
  )
}

export function SourcePassage({ source }: { source: CurriculumSourceDto }) {
  const synthetic = source.synthetic || source.authority === 'synthetic'
  const collapsed = synthetic || source.role !== 'defines_target'

  return (
    <div className="mt-3">
      {collapsed ? (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {synthetic ? 'Show synthetic demo passage' : 'Show supporting passage'}
          </summary>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {source.content}
          </p>
        </details>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {source.content}
        </p>
      )}
      {source.sourceUrl && (
        <a
          href={source.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          Open source document <ExternalLink aria-hidden="true" className="size-3.5" />
        </a>
      )}
    </div>
  )
}

function authorityLabel(authority: CurriculumSourceDto['authority']) {
  return {
    official: 'Official source',
    school: 'School source',
    internal: 'Internal guidance',
    synthetic: 'Synthetic demo',
  }[authority]
}

function roleLabel(role: CurriculumSourceDto['role']) {
  return {
    defines_target: 'Defines outcome',
    teaching_support: 'Teaching support',
    assessment_support: 'Assessment support',
    guidance: 'Lead guidance',
    exemplar: 'Example plan',
  }[role]
}

function formatLabel(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
