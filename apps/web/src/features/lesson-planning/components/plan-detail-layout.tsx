import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { BookOpen, ClipboardCheck, History, MessageSquare, X } from 'lucide-react'
import { Button } from '../../../components/ui/button'
import { PlanReviewHistory, PlanVersionHistory } from '../../../components/plan-history'
import { SourcePassage, SourceProvenance } from '../../../components/source-evidence'
import { QualityChecks } from '../../../components/quality-checks'
import { RubricQaPanel } from '../../../components/rubric-qa-panel'
import type { CurriculumSource } from '../../curriculum-library/api'
import type { LessonPlanDetails } from '../api'

type InspectorSection = 'sources' | 'quality' | 'versions' | 'revisions'

const statusLabel: Record<LessonPlanDetails['plan']['status'], string> = {
  draft: 'Draft',
  submitted: 'In review',
  returned: 'Returned',
  published: 'Published',
}

function markerDescription(section: InspectorSection, marker: string) {
  if (marker === '!') return 'needs attention'
  const noun = section === 'sources' ? 'citation' : section === 'versions' ? 'version' : 'revision'
  return `${marker} ${noun}${marker === '1' ? '' : 's'}`
}

export function PlanDetailLayout({
  detail,
  sources,
  sourcesLoading,
  sourcesError,
  backLink,
  headerNote,
  headerSupplement,
  headerAction,
  children,
}: {
  detail: LessonPlanDetails
  sources: CurriculumSource[]
  sourcesLoading: boolean
  sourcesError?: string
  backLink: ReactNode
  headerNote?: ReactNode
  headerSupplement?: ReactNode
  headerAction?: ReactNode
  children: ReactNode
}) {
  const { plan } = detail
  const [activePanel, setActivePanel] = useState<InspectorSection | null>(null)
  const lastActionRef = useRef<HTMLButtonElement>(null)
  const panelCloseRef = useRef<HTMLButtonElement>(null)
  const previousPanelRef = useRef<InspectorSection | null>(null)
  const panelId = `plan-detail-panel-${plan.id}`
  const panelActions = [
    {
      id: 'sources' as const,
      label: 'Sources',
      icon: BookOpen,
      marker: plan.content.sources.length > 0 ? String(plan.content.sources.length) : undefined,
    },
    {
      id: 'quality' as const,
      label: 'Quality',
      icon: ClipboardCheck,
      marker:
        detail.qa?.passed === false ||
        detail.qa?.checks.some((check) => check.status === 'warning') ||
        (detail.rubricQa?.status !== undefined && detail.rubricQa.status !== 'completed')
          ? '!'
          : undefined,
    },
    {
      id: 'versions' as const,
      label: 'Versions',
      icon: History,
      marker: detail.versions.length > 0 ? String(detail.versions.length) : undefined,
    },
    {
      id: 'revisions' as const,
      label: 'Revisions',
      icon: MessageSquare,
      marker: detail.reviews.length > 0 ? String(detail.reviews.length) : undefined,
    },
  ]
  const panelTitles: Record<InspectorSection, string> = {
    sources: 'Sources',
    quality: 'Quality',
    versions: 'Versions',
    revisions: 'Revisions',
  }

  useEffect(() => {
    if (!activePanel) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActivePanel(null)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [activePanel])

  useEffect(() => {
    if (activePanel && !previousPanelRef.current) panelCloseRef.current?.focus()
    if (!activePanel && previousPanelRef.current) lastActionRef.current?.focus()
    previousPanelRef.current = activePanel
  }, [activePanel])

  return (
    <div
      className={`space-y-5 transition-[padding] duration-200 ${activePanel ? 'xl:pr-[30rem]' : 'xl:pr-12'}`}
    >
      <header className="flex flex-col justify-between gap-3 border-b border-primary/15 pb-4 sm:flex-row sm:items-center">
        <div>
          {backLink}
          <h1 className="text-2xl font-semibold tracking-tight">{plan.content.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {headerNote ? <>{headerNote} · </> : null}
            {plan.content.subject} · {plan.content.grade} · {plan.content.durationMinutes} minutes
          </p>
          {headerSupplement}
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <span className="order-1 rounded-full bg-muted px-3 py-1.5 text-sm font-medium">
            {statusLabel[plan.status]}
          </span>
          <div
            role="group"
            aria-label="Lesson plan details"
            className="order-3 grid w-full grid-cols-4 gap-1 sm:order-2 sm:flex sm:w-auto"
          >
            {panelActions.map(({ id, label, icon: Icon, marker }) => (
              <Button
                key={id}
                type="button"
                variant={activePanel === id ? 'secondary' : 'ghost'}
                size="icon"
                className="relative h-14 w-full flex-col gap-1 px-1 py-1 text-xs leading-none sm:size-11 sm:flex-row sm:gap-0 sm:px-0 sm:py-0"
                aria-label={`${label}${marker ? `, ${markerDescription(id, marker)}` : ''}`}
                aria-expanded={activePanel === id}
                aria-controls={panelId}
                title={label}
                onClick={(event) => {
                  lastActionRef.current = event.currentTarget
                  setActivePanel((current) => (current === id ? null : id))
                }}
              >
                <span className="relative inline-flex">
                  <Icon aria-hidden="true" className="size-5" />
                  {marker && (
                    <span
                      aria-hidden="true"
                      className={`absolute -top-1.5 -right-1.5 z-10 flex min-h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] leading-none font-semibold ring-2 ring-background ${marker === '!' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground'}`}
                    >
                      {marker}
                    </span>
                  )}
                </span>
                <span className="sm:sr-only">{label}</span>
              </Button>
            ))}
          </div>
          {headerAction && <div className="order-2 ml-auto sm:order-3 sm:ml-0">{headerAction}</div>}
        </div>
      </header>
      <aside
        hidden={!activePanel}
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={`${panelId}-title`}
        className="fixed inset-x-0 top-40 bottom-0 z-40 flex min-h-0 flex-col border bg-card text-card-foreground shadow-xl md:top-[9.5rem] md:right-0 md:left-auto md:w-[min(26rem,calc(100vw-20rem))] xl:top-16"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3">
          <h2 id={`${panelId}-title`} className="text-base font-semibold">
            {activePanel ? panelTitles[activePanel] : 'Plan details'}
          </h2>
          <Button
            ref={panelCloseRef}
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close details panel"
            onClick={() => setActivePanel(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          {activePanel === 'sources' && (
            <PlanSources
              detail={detail}
              sources={sources}
              sourcesLoading={sourcesLoading}
              sourcesError={sourcesError}
            />
          )}
          {activePanel === 'quality' && (
            <div className="space-y-4">
              {detail.qa ? (
                <QualityChecks qa={detail.qa} />
              ) : (
                <p className="text-sm text-muted-foreground">No quality checks are available.</p>
              )}
              {detail.viewer.availableActions.validate && (
                <RubricQaPanel
                  planId={plan.id}
                  versionId={plan.versionId}
                  validation={detail.rubricQa}
                />
              )}
            </div>
          )}
          {activePanel === 'versions' && (
            <PlanVersionHistory versions={detail.versions} currentVersion={plan.version} />
          )}
          {activePanel === 'revisions' && <PlanReviewHistory reviews={detail.reviews} />}
        </div>
      </aside>
      {children}
    </div>
  )
}

export function PlanSources({
  detail,
  sources,
  sourcesLoading,
  sourcesError,
}: {
  detail: LessonPlanDetails
  sources: CurriculumSource[]
  sourcesLoading: boolean
  sourcesError?: string
}) {
  const references = detail.plan.content.sources.map((source) => ({
    source,
    match: sources.find(
      (item) => item.documentId === source.documentId && item.chunkId === source.chunkId,
    ),
  }))

  return (
    <section className="space-y-4" aria-label="Curriculum sources">
      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Curriculum sources</h3>
        {sourcesError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Source details could not be loaded: {sourcesError}
          </p>
        ) : (
          sourcesLoading && (
            <p role="status" className="mt-3 text-sm text-muted-foreground">
              Loading source details…
            </p>
          )
        )}
        {!sourcesLoading && !sourcesError && references.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No source references were attached.</p>
        )}
        {!sourcesLoading && !sourcesError && (
          <div className="mt-3 space-y-4">
            {references.map(({ source, match }) => (
              <article
                key={`${source.documentId}-${source.chunkId}`}
                className="border-t pt-3 first:border-0 first:pt-0"
              >
                <h4 className="font-medium">{match?.title ?? 'Curriculum source'}</h4>
                {match && (
                  <>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {match.subject} · {match.grade}
                    </p>
                    <SourceProvenance source={match} />
                  </>
                )}
                {match ? (
                  <SourcePassage source={match} />
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Source details are unavailable. The citation remains attached to this plan.
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
