import { createRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, BookOpen, CheckCircle2, CircleAlert, ExternalLink, Layers3 } from 'lucide-react'
import type { CurriculumLibraryOfferingDto, CurriculumLibraryTargetDto, CurriculumSourceDto } from '@nova/shared'
import { AppShell } from '../components/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { apiRequest } from '../lib/api-request'
import { requireUser } from '../lib/route-auth'
import { route as rootRoute } from './root'

type Catalogue = { offerings: CurriculumLibraryOfferingDto[] }

function LibraryLayout() {
  const user = libraryRoute.useRouteContext()
  const pathname = useRouterState({ select: state => state.location.pathname })
  return <AppShell role={user.roles[0]}>{pathname === '/library' ? <LibraryIndexPage /> : <Outlet />}</AppShell>
}

function LibraryTargetLayout() {
  const { targetRevisionId } = libraryTargetRoute.useParams()
  return <LibraryTargetPage key={targetRevisionId} targetRevisionId={targetRevisionId} />
}

function useCatalogue() {
  return useQuery({ queryKey: ['curriculum-library'], queryFn: () => apiRequest<Catalogue>('/api/curriculum/library') })
}

function LibraryIndexPage() {
  const catalogue = useCatalogue()
  const offerings = catalogue.data?.offerings ?? []
  const targets = offerings.flatMap(offering => offering.designs.flatMap(design => design.targets.map(target => ({ offering, design, target }))))
  const readyCount = targets.filter(item => item.target.generationReady).length

  return <div className="mx-auto max-w-6xl space-y-7">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-primary/15 pb-6">
      <div><p className="text-sm font-medium text-primary">Curriculum catalogue</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Curriculum Library</h1><p className="mt-2 max-w-2xl text-muted-foreground">Browse the structured curriculum and its approved supporting sources.</p></div>
      <div className="flex gap-2 text-sm"><span className="rounded-lg border bg-card px-3 py-2"><strong className="tabular-nums">{catalogue.isLoading || catalogue.isError ? '—' : offerings.length}</strong> offerings</span><span className="rounded-lg border bg-card px-3 py-2"><strong className="tabular-nums">{catalogue.isLoading || catalogue.isError ? '—' : readyCount}</strong> ready targets</span></div>
    </header>
    {catalogue.error && <ErrorNotice message={`The curriculum catalogue could not be loaded: ${catalogue.error.message}`} />}
    {catalogue.isLoading ? <div role="status" className="h-48 animate-pulse rounded-xl border bg-card" /> : <div className="space-y-5">{offerings.map(offering => <Card key={offering.id}>
      <CardHeader className="border-b bg-muted/20"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{offering.framework} · {offering.programme}</p><CardTitle className="mt-1 text-lg">{offering.level} {offering.subject}</CardTitle></div><span className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">{offering.externalCode ?? 'No external code'}</span></div></CardHeader>
      <CardContent className="space-y-5 pt-5">{offering.designs.map(design => <section key={design.id} className="space-y-3">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{design.editionLabel}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs">Revision {design.revisionNumber}</span><span className={`rounded-full px-2.5 py-1 text-xs ${design.status === 'published' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{label(design.status)}</span><span className="text-xs text-muted-foreground">{design.origin === 'official_import' ? 'Official curriculum' : 'Demo catalogue'}</span></div>
        {design.targets.length ? <div className="divide-y rounded-lg border">{design.targets.map(target => <Link key={target.id} to="/library/targets/$targetRevisionId" params={{ targetRevisionId: target.id }} className="flex flex-col gap-3 p-4 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-xs text-muted-foreground">{target.path.join(' / ')}{target.locator ? ` · ${target.locator}` : ''}</p><p className="mt-1 font-medium">{target.title}</p><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{target.statement}</p></div><div className="flex shrink-0 flex-wrap items-center gap-2"><Readiness ready={target.generationReady} /><span className="rounded-md border bg-background px-2.5 py-1.5 text-xs text-muted-foreground">{target.sourceCount} sources</span></div>
        </Link>)}</div> : <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No learning targets in this design version yet.</p>}
      </section>)}</CardContent>
    </Card>)}{!offerings.length && !catalogue.error && <p className="rounded-xl border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">The catalogue has no offerings yet.</p>}</div>}
  </div>
}

function LibraryTargetPage({ targetRevisionId }: { targetRevisionId: string }) {
  const catalogue = useCatalogue()
  const selectedFromCatalogue = catalogue.data?.offerings.flatMap(offering => offering.designs.flatMap(design => design.targets)).find(target => target.id === targetRevisionId)
  const targetQuery = useQuery({ queryKey: ['curriculum-library-target', targetRevisionId], queryFn: () => apiRequest<CurriculumLibraryTargetDto>(`/api/curriculum/library/targets/${targetRevisionId}`), enabled: !selectedFromCatalogue })
  const target = selectedFromCatalogue ?? targetQuery.data
  const groupedSources = target?.sources.reduce((groups, source) => {
    if (!source.linkId) return groups
    const existing = groups.get(source.linkId)
    if (existing) existing.push(source)
    else groups.set(source.linkId, [source])
    return groups
  }, new Map<string, CurriculumSourceDto[]>())

  if (!target && (catalogue.isLoading || targetQuery.isLoading)) return <div className="mx-auto h-40 max-w-5xl animate-pulse rounded-xl border bg-card" role="status" />
  if (!target) return <div className="mx-auto max-w-4xl space-y-4"><Link to="/library" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" /> Curriculum Library</Link><ErrorNotice message={`This curriculum target could not be loaded: ${targetQuery.error?.message ?? catalogue.error?.message ?? 'Target not found.'}`} /></div>

  return <div className="mx-auto max-w-5xl space-y-6">
    <Link to="/library" className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Curriculum Library</Link>
    <header className="space-y-3 border-b border-primary/15 pb-6"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{target.framework}</span><span aria-hidden="true">/</span><span>{target.programme}</span><span aria-hidden="true">/</span><span>{target.level}</span><span aria-hidden="true">/</span><span>{target.subject}</span><span className="rounded-full bg-muted px-2.5 py-1">{target.editionLabel}</span></div><h1 className="text-3xl font-semibold tracking-tight">{target.title}</h1><p className="max-w-3xl leading-7 text-muted-foreground">{target.statement}</p><div className="flex flex-wrap items-center gap-2"><Readiness ready={target.generationReady} /><span className="rounded-full border bg-card px-3 py-1 text-xs">{target.kind.replaceAll('_', ' ')}</span>{target.locator && <span className="rounded-full border bg-card px-3 py-1 text-xs">{target.locator}</span>}</div></header>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Layers3 className="size-4 text-primary" /> Curriculum hierarchy</CardTitle></CardHeader><CardContent><ol className="space-y-3">{target.path.map((part, index) => <li key={`${part}-${index}`} className="flex gap-3 text-sm"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{index + 1}</span><span className={index === target.path.length - 1 ? 'font-medium' : 'text-muted-foreground'}>{part}</span></li>)}</ol></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><BookOpen className="size-4 text-primary" /> Linked sources <span className="font-normal text-muted-foreground">({groupedSources?.size ?? 0})</span></CardTitle></CardHeader><CardContent className="space-y-4">
          {catalogue.error && <ErrorNotice message={`The curriculum catalogue could not be loaded: ${catalogue.error.message}`} />}
          {groupedSources?.size ? <div className="space-y-3">{[...groupedSources.entries()].map(([linkId, chunks]) => <SourceCard key={linkId} chunks={chunks} />)}</div> : <div className="rounded-lg border border-dashed p-5 text-sm"><p className="font-medium">No sources are linked to this target.</p><p className="mt-1 text-muted-foreground">Generation stays disabled until the official curriculum excerpt has been imported, reviewed, and published.</p></div>}
        </CardContent></Card>
      </div>
      <aside className="space-y-4"><Card><CardHeader><CardTitle className="text-base">Target details</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><DetailRow label="Framework" value={target.framework} /><DetailRow label="Programme" value={target.programme} /><DetailRow label="Level" value={target.level} /><DetailRow label="Subject" value={target.subject} /><DetailRow label="Edition" value={target.editionLabel} /><DetailRow label="Target type" value={target.kind.replaceAll('_', ' ')} /></CardContent></Card><div className={`rounded-xl border p-4 ${target.generationReady ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}><div className="flex gap-2">{target.generationReady ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" /> : <CircleAlert className="mt-0.5 size-4 text-amber-700" />}<div><h2 className="font-semibold">{target.generationReady ? 'Ready for generation' : 'Sources needed'}</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{target.generationReady ? 'Published target and supporting sources can ground a lesson plan.' : 'This catalogue entry is visible for planning. Source updates happen through the full import and review process.'}</p></div></div></div></aside>
    </div>
  </div>
}

function SourceCard({ chunks }: { chunks: CurriculumSourceDto[] }) {
  const source = chunks[0]
  return <article className="rounded-lg border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{source.title}</h3><span className={`rounded-full px-2 py-0.5 text-xs ${source.status === 'draft' ? 'bg-amber-100 text-amber-900' : source.status === 'retired' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-900'}`}>{label(source.status)}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs">Revision {source.revisionNumber}</span>{source.synthetic && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">Synthetic</span>}</div><p className="mt-1 text-xs text-muted-foreground">{source.resourceType.replaceAll('_', ' ')} · {source.authority} · {source.role.replaceAll('_', ' ')}{source.editionLabel ? ` · ${source.editionLabel}` : ''}{source.locator ? ` · ${source.locator}` : ''}</p></div>{source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open reference <ExternalLink className="size-3" /></a>}</div><div className="mt-3 space-y-3">{chunks.map((chunk, index) => <p key={chunk.chunkId} className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{chunks.length > 1 && <span className="mb-1 block text-xs font-medium text-foreground">Excerpt {index + 1}</span>}{chunk.content}</p>)}</div></article>
}

function Readiness({ ready }: { ready: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${ready ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{ready ? 'Ready for generation' : 'Sources needed'}</span>
}
function label(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase()) }
function DetailRow({ label: name, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 border-b pb-2 last:border-0 last:pb-0"><span className="text-muted-foreground">{name}</span><span className="text-right font-medium capitalize">{value}</span></div> }
function ErrorNotice({ message }: { message: string }) { return <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</p> }

const libraryRoute = createRoute({ getParentRoute: () => rootRoute, path: '/library', beforeLoad: async ({ location }) => {
  const user = await requireUser(location.href)
  if (!user.roles.some(role => role === 'teacher' || role === 'curriculum_lead')) throw redirect({ to: '/login', search: { redirect: location.href } })
  return user
}, component: LibraryLayout })
const libraryTargetRoute = createRoute({ getParentRoute: () => libraryRoute, path: 'targets/$targetRevisionId', component: LibraryTargetLayout })
export const route = libraryRoute.addChildren([libraryTargetRoute])
