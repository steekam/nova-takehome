import { useEffect, useMemo } from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type {
  ApiPrincipal,
  CurriculumLibraryBrowseOfferingDto,
  CurriculumLibraryOfferingDto,
  CurriculumLibraryDesignSummaryDto,
  CurriculumDesignNodeDto,
  CurriculumLibraryTargetDto,
  CurriculumLevelKind,
  CurriculumNodeKind,
} from '@nova/shared'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Layers3,
} from 'lucide-react'
import { AppShell } from '../../components/app-shell'
import { SourcePassage, SourceProvenance } from '../../components/source-evidence'
import { buttonVariants } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import {
  curriculumLibraryKeys,
  getCurriculumCatalogue,
  getCurriculumDesign,
  getCurriculumTarget,
  type CurriculumSourceDto,
} from './api'

const EMPTY_OFFERINGS: CurriculumLibraryBrowseOfferingDto[] = []

export function LibraryPage({
  user,
  search,
  onSearchChange,
}: {
  user: ApiPrincipal
  search: LibrarySearch
  onSearchChange: LibrarySearchChange
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <AppShell permissions={user.permissions}>
      {pathname === '/library' ? (
        <LibraryIndexPage search={search} onSearchChange={onSearchChange} />
      ) : (
        <Outlet />
      )}
    </AppShell>
  )
}

export type LibrarySearch = {
  open?: string
  offering?: string
  edition?: string
  content?: string
}

export type LibrarySearchChange = (search: LibrarySearch, options?: { replace?: boolean }) => void

type LibraryTreeItem = {
  id: string
  kind: 'framework' | 'programme' | 'level' | 'subject'
  label: string
  type: string
  code: string | null
  detail: string
  ancestors: string[]
  offering?: CurriculumLibraryBrowseOfferingDto
  children: LibraryTreeItem[]
}

function LibraryIndexPage({
  search,
  onSearchChange,
}: {
  search: LibrarySearch
  onSearchChange: LibrarySearchChange
}) {
  const catalogue = useCatalogue()
  const offerings = catalogue.data?.offerings ?? EMPTY_OFFERINGS
  const tree = useMemo(() => buildLibraryTree(offerings), [offerings])
  const activeSearch = useMemo(
    () => normalizeLibrarySearch(search, offerings, tree),
    [offerings, search, tree],
  )

  useEffect(() => {
    if (catalogue.data && !sameLibrarySearch(search, activeSearch))
      onSearchChange(activeSearch, { replace: true })
  }, [activeSearch, catalogue.data, onSearchChange, search])

  const activeOffering = offerings.find((offering) => offering.id === activeSearch.offering)
  const activeEdition = activeOffering
    ? selectedDesign(activeOffering.designs, activeSearch.edition ?? null)
    : undefined
  const designQuery = useQuery({
    queryKey: curriculumLibraryKeys.design(activeEdition?.id ?? 'none'),
    queryFn: () => getCurriculumDesign(activeEdition!.id),
    enabled: Boolean(activeEdition),
  })
  const activeDesign = designQuery.data?.designs[0]

  if (catalogue.isLoading)
    return (
      <div
        role="status"
        className="mx-auto h-48 max-w-7xl animate-pulse rounded-xl border bg-card"
      />
    )

  const editionsCount = offerings.reduce((count, offering) => count + offering.designs.length, 0)

  function activateItem(item: LibraryTreeItem) {
    const expanded = isTreeItemExpanded(item, activeSearch)
    const open = new Set(parseSearchList(activeSearch.open))

    if (item.kind === 'subject') {
      item.ancestors.forEach((id) => open.add(id))
      const nextSearch: LibrarySearch = { open: serializeSearchList(open) }
      if (activeSearch.offering !== item.id) {
        const edition = selectedDesign(item.offering!.designs, null)
        nextSearch.offering = item.id
        nextSearch.edition = edition?.id
      }
      onSearchChange(nextSearch)
      return
    }

    if (expanded) open.delete(item.id)
    else open.add(item.id)
    onSearchChange({ open: serializeSearchList(open) })
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-primary/15 pb-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Curriculum Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Expand a curriculum to browse programmes, grades, and subjects.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {offerings.length} subject offerings <span aria-hidden="true">·</span> {editionsCount}{' '}
          editions
        </p>
      </header>

      {catalogue.error && (
        <ErrorNotice
          message={'The curriculum catalogue could not be loaded: ' + catalogue.error.message}
        />
      )}

      <div
        className={
          activeOffering
            ? 'grid items-start gap-6 lg:grid-cols-[minmax(260px,0.34fr)_minmax(0,0.66fr)]'
            : 'grid items-start gap-6'
        }
      >
        <section aria-labelledby="curriculum-tree-heading" className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="curriculum-tree-heading" className="text-base font-semibold">
              {activeOffering ? 'Current selection' : 'Curriculum structure'}
            </h2>
            {!activeOffering && (
              <span className="text-xs text-muted-foreground">
                {tree.length} {tree.length === 1 ? 'curriculum' : 'curricula'}
              </span>
            )}
          </div>
          {tree.length > 0 && activeOffering ? (
            <>
              <details className="group rounded-lg border bg-card lg:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">Browse another subject</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {activeOffering.framework} / {activeOffering.programme} /{' '}
                      {levelLabel(activeOffering)} / {activeOffering.subject}
                    </span>
                  </span>
                  <ChevronDown
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
                  />
                </summary>
                <div className="border-t p-2">
                  <LibraryTree items={tree} search={activeSearch} onActivate={activateItem} />
                </div>
              </details>
              <div className="hidden rounded-lg border bg-card p-2 lg:block">
                <LibraryTree items={tree} search={activeSearch} onActivate={activateItem} />
              </div>
            </>
          ) : tree.length ? (
            <div className="rounded-lg border bg-card p-2">
              <LibraryTree items={tree} search={activeSearch} onActivate={activateItem} />
            </div>
          ) : (
            !catalogue.error && (
              <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No curriculum offerings are available yet.
              </p>
            )
          )}
        </section>

        {activeOffering ? (
          <section className="min-w-0 space-y-4" aria-labelledby="offering-heading">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-muted-foreground">
                  {activeOffering.framework} <span aria-hidden="true">/</span>{' '}
                  {activeOffering.programme} <span aria-hidden="true">/</span>{' '}
                  {levelLabel(activeOffering)}
                </p>
                <h2 id="offering-heading" className="mt-1 text-2xl font-semibold">
                  {activeOffering.subject}
                  {activeOffering.subjectCode && (
                    <span className="ml-2 text-base font-normal text-muted-foreground">
                      {activeOffering.subjectCode}
                    </span>
                  )}
                </h2>
              </div>
              {activeEdition && activeOffering.designs.length > 1 && (
                <label className="grid gap-1 text-sm font-medium" htmlFor="edition-select">
                  Edition
                  <select
                    id="edition-select"
                    className="h-10 min-w-60 rounded-md border bg-background px-3 font-normal"
                    value={activeEdition.id}
                    onChange={(event) =>
                      onSearchChange({
                        ...activeSearch,
                        edition: event.target.value,
                        content: undefined,
                      })
                    }
                  >
                    {activeOffering.designs.map((design) => (
                      <option key={design.id} value={design.id}>
                        {design.editionLabel} · Rev {design.revisionNumber} · {label(design.status)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {activeEdition && designQuery.isLoading ? (
              <div role="status" className="h-48 animate-pulse rounded-lg border bg-card" />
            ) : designQuery.error ? (
              <ErrorNotice
                message={
                  'This curriculum edition could not be loaded: ' + designQuery.error.message
                }
              />
            ) : activeDesign ? (
              <>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-y py-2 text-sm">
                  <span className="font-medium">{activeDesign.editionLabel}</span>
                  <span className="text-muted-foreground">
                    Revision {activeDesign.revisionNumber}
                  </span>
                  <span className="text-muted-foreground">{label(activeDesign.status)}</span>
                  <span className="ml-auto text-muted-foreground">
                    {activeDesign.targets.length} outcomes ·{' '}
                    {activeDesign.targets.filter((target) => target.generationReady).length} ready
                  </span>
                </div>
                <CurriculumContentTable
                  key={activeDesign.id}
                  design={activeDesign}
                  search={activeSearch}
                  onSearchChange={onSearchChange}
                />
              </>
            ) : (
              <p className="border-y border-dashed py-8 text-center text-sm text-muted-foreground">
                No curriculum editions are available for this subject yet.
              </p>
            )}
          </section>
        ) : (
          <p className="self-center px-4 py-12 text-center text-sm text-muted-foreground lg:px-8">
            Select a subject to inspect its editions and learning content.
          </p>
        )}
      </div>
    </div>
  )
}

function LibraryTree({
  items,
  search,
  onActivate,
}: {
  items: LibraryTreeItem[]
  search: LibrarySearch
  onActivate: (item: LibraryTreeItem) => void
}) {
  return (
    <ul aria-label="Curriculum hierarchy" className="space-y-1">
      {items.map((item) => {
        const expanded = isTreeItemExpanded(item, search)
        const selected = item.kind === 'subject' && search.offering === item.id
        return (
          <li key={item.kind + item.id}>
            <button
              type="button"
              aria-expanded={item.children.length ? expanded : undefined}
              aria-current={selected ? 'page' : undefined}
              className={
                'flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
                (selected
                  ? 'bg-primary/10 text-primary'
                  : expanded
                    ? 'bg-muted/40 text-foreground'
                    : 'text-foreground')
              }
              onClick={() => onActivate(item)}
            >
              {item.children.length ? (
                <ChevronRight
                  aria-hidden="true"
                  className={
                    'size-4 shrink-0 text-muted-foreground transition-transform duration-150 ' +
                    (expanded ? 'rotate-90' : '')
                  }
                />
              ) : (
                <BookOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block font-medium leading-5">{item.label}</span>
                {item.code && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    {item.code}
                  </span>
                )}
              </span>
              {item.type && (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {item.type}
                </span>
              )}
              <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {item.detail}
              </span>
            </button>
            {expanded && item.children.length > 0 && (
              <ul className="ml-4 mt-1 space-y-1 border-l border-primary/15 pl-2">
                {item.children.map((child) => (
                  <LibraryTreeNode
                    key={child.kind + child.id}
                    item={child}
                    search={search}
                    onActivate={onActivate}
                  />
                ))}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function LibraryTreeNode({
  item,
  search,
  onActivate,
}: {
  item: LibraryTreeItem
  search: LibrarySearch
  onActivate: (item: LibraryTreeItem) => void
}) {
  const expanded = isTreeItemExpanded(item, search)
  const selected = item.kind === 'subject' && search.offering === item.id
  return (
    <li>
      <button
        type="button"
        aria-expanded={item.children.length ? expanded : undefined}
        aria-current={selected ? 'page' : undefined}
        className={
          'flex w-full min-w-0 items-center gap-2 rounded-md px-3 py-2 text-left transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
          (selected
            ? 'bg-primary/10 text-primary'
            : expanded
              ? 'bg-muted/40 text-foreground'
              : 'text-foreground')
        }
        onClick={() => onActivate(item)}
      >
        {item.children.length ? (
          <ChevronRight
            aria-hidden="true"
            className={
              'size-4 shrink-0 text-muted-foreground transition-transform duration-150 ' +
              (expanded ? 'rotate-90' : '')
            }
          />
        ) : (
          <BookOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium leading-5">{item.label}</span>
          {item.code && (
            <span className="block text-xs font-normal text-muted-foreground">{item.code}</span>
          )}
        </span>
        {item.type && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {item.type}
          </span>
        )}
        <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {item.detail}
        </span>
      </button>
      {expanded && item.children.length > 0 && (
        <ul className="ml-4 mt-1 space-y-1 border-l border-primary/15 pl-2">
          {item.children.map((child) => (
            <LibraryTreeNode
              key={child.kind + child.id}
              item={child}
              search={search}
              onActivate={onActivate}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

function useCatalogue() {
  return useQuery({ queryKey: curriculumLibraryKeys.catalogue, queryFn: getCurriculumCatalogue })
}

function buildLibraryTree(offerings: CurriculumLibraryBrowseOfferingDto[]): LibraryTreeItem[] {
  const frameworks = uniqueBy(offerings, (offering) => offering.frameworkId)
  return frameworks.map((framework) => {
    const frameworkOfferings = offerings.filter(
      (offering) => offering.frameworkId === framework.frameworkId,
    )
    const programmes = uniqueBy(frameworkOfferings, (offering) => offering.programmeId).map(
      (programme) => {
        const programmeOfferings = frameworkOfferings.filter(
          (offering) => offering.programmeId === programme.programmeId,
        )
        const levels = uniqueBy(programmeOfferings, (offering) => offering.levelId ?? 'all').map(
          (level) => {
            const levelOfferings = programmeOfferings.filter((offering) =>
              level.levelId === null
                ? offering.levelId === null
                : offering.levelId === level.levelId,
            )
            const subjects = levelOfferings.map((offering) => {
              const outcomeCount = offering.designs.reduce(
                (count, design) => count + design.targetCount,
                0,
              )
              const readyCount = offering.designs.reduce(
                (count, design) => count + design.generationReadyCount,
                0,
              )
              return {
                id: offering.id,
                kind: 'subject' as const,
                label: offering.subject,
                type: 'Subject',
                code: offering.externalCode ?? offering.subjectCode,
                detail:
                  offering.designs.length +
                  (offering.designs.length === 1 ? ' edition · ' : ' editions · ') +
                  readyCount +
                  '/' +
                  outcomeCount +
                  ' ready',
                ancestors: [
                  offering.frameworkId,
                  offering.programmeId,
                  offering.levelId ?? 'all-' + offering.programmeId,
                ],
                offering,
                children: [],
              }
            })
            const levelNodeId = level.levelId ?? 'all-' + programme.programmeId
            return {
              id: levelNodeId,
              kind: 'level' as const,
              label: level.levelId === null ? 'Across all levels' : level.level,
              type:
                level.levelKind === 'grade' && /^grade\b/i.test(level.level)
                  ? ''
                  : levelKindLabel(level.levelKind),
              code: level.levelCode,
              detail:
                quantity(
                  countDistinct(levelOfferings, (offering) => offering.subjectId),
                  'subject',
                ) +
                ' · ' +
                quantity(
                  levelOfferings.reduce((count, offering) => count + offering.designs.length, 0),
                  'edition',
                ),
              ancestors: [programme.frameworkId, programme.programmeId],
              children: subjects,
            }
          },
        )
        return {
          id: programme.programmeId,
          kind: 'programme' as const,
          label: programme.programme,
          type: 'Programme',
          code: programme.programmeCode,
          detail:
            quantity(
              countDistinct(programmeOfferings, (offering) => offering.levelId ?? 'all'),
              'level',
            ) +
            ' · ' +
            quantity(
              countDistinct(programmeOfferings, (offering) => offering.subjectId),
              'subject',
            ),
          ancestors: [programme.frameworkId],
          children: levels,
        }
      },
    )
    return {
      id: framework.frameworkId,
      kind: 'framework' as const,
      label: framework.framework,
      type: 'Curriculum',
      code: framework.frameworkCode,
      detail:
        quantity(
          countDistinct(frameworkOfferings, (offering) => offering.programmeId),
          'programme',
        ) +
        ' · ' +
        quantity(
          countDistinct(frameworkOfferings, (offering) => offering.subjectId),
          'subject',
        ),
      ancestors: [],
      children: programmes,
    }
  })
}

function normalizeLibrarySearch(
  search: LibrarySearch,
  offerings: CurriculumLibraryBrowseOfferingDto[],
  tree: LibraryTreeItem[],
): LibrarySearch {
  const branchIds = new Set<string>()
  collectBranchIds(tree, branchIds)
  const open = new Set(parseSearchList(search.open).filter((id) => branchIds.has(id)))
  const selectedOffering = offerings.find((offering) => offering.id === search.offering)
  if (selectedOffering) {
    const edition = selectedDesign(selectedOffering.designs, search.edition ?? null)
    open.add(selectedOffering.frameworkId)
    open.add(selectedOffering.programmeId)
    open.add(selectedOffering.levelId ?? 'all-' + selectedOffering.programmeId)
    return {
      open: serializeSearchList(open),
      offering: selectedOffering.id,
      edition: edition?.id,
      content: search.edition === edition?.id ? search.content : undefined,
    }
  }
  return { open: serializeSearchList(open) }
}

function collectBranchIds(items: LibraryTreeItem[], branchIds: Set<string>) {
  for (const item of items) {
    if (item.children.length) branchIds.add(item.id)
    collectBranchIds(item.children, branchIds)
  }
}

function parseSearchList(value: string | undefined) {
  return value?.split(',').filter(Boolean) ?? []
}

function serializeSearchList(values: Set<string>) {
  return [...values].sort().join(',') || undefined
}

function sameLibrarySearch(left: LibrarySearch, right: LibrarySearch) {
  return (
    left.open === right.open &&
    left.offering === right.offering &&
    left.edition === right.edition &&
    left.content === right.content
  )
}

function isTreeItemExpanded(item: LibraryTreeItem, search: LibrarySearch) {
  return item.children.length > 0 && parseSearchList(search.open).includes(item.id)
}

function levelLabel(offering: CurriculumLibraryBrowseOfferingDto) {
  return offering.level
}

function quantity(count: number, singular: string) {
  return count + ' ' + singular + (count === 1 ? '' : 's')
}

function levelKindLabel(kind: CurriculumLevelKind | null) {
  if (!kind) return 'Cross-level'
  return { grade: 'Grade', stage: 'Stage', year: 'Year', qualification: 'Qualification' }[kind]
}

function selectedDesign(designs: CurriculumLibraryDesignSummaryDto[], selectedId: string | null) {
  const selected = designs.find((design) => design.id === selectedId)
  if (selected) return selected
  return [...designs].sort((a, b) => {
    const publishedDifference = Number(b.status === 'published') - Number(a.status === 'published')
    if (publishedDifference) return publishedDifference
    const publicationDifference =
      new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime()
    if (publicationDifference) return publicationDifference
    const editionOrder = b.editionLabel.localeCompare(a.editionLabel, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
    if (editionOrder) return editionOrder
    return b.revisionNumber - a.revisionNumber
  })[0]
}

function uniqueBy(
  items: CurriculumLibraryBrowseOfferingDto[],
  getKey: (item: CurriculumLibraryBrowseOfferingDto) => string,
) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = getKey(item)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function countDistinct(
  items: CurriculumLibraryBrowseOfferingDto[],
  key: (item: CurriculumLibraryBrowseOfferingDto) => string,
) {
  return new Set(items.map(key)).size
}

type CurriculumTreeBranch = CurriculumDesignNodeDto & {
  children: Map<string, CurriculumTreeBranch>
  targets: CurriculumLibraryTargetDto[]
}

type ContentRow =
  | {
      type: 'node'
      branch: CurriculumTreeBranch
      depth: number
      outcomeCount: number
      readyCount: number
      hasChildren: boolean
    }
  | { type: 'target'; target: CurriculumLibraryTargetDto; depth: number }

function buildContentRows(
  design: CurriculumLibraryOfferingDto['designs'][number],
  expanded: Set<string>,
): ContentRow[] {
  const branches = new Map<string, CurriculumTreeBranch>(
    design.nodes.map((node) => [node.id, { ...node, children: new Map(), targets: [] }]),
  )
  const roots: CurriculumTreeBranch[] = []
  for (const branch of branches.values()) {
    const parent = branch.parentNodeId ? branches.get(branch.parentNodeId) : undefined
    if (parent) parent.children.set(branch.id, branch)
    else roots.push(branch)
  }
  const unplacedTargets: CurriculumLibraryTargetDto[] = []
  for (const target of design.targets) {
    const branch = branches.get(target.hierarchy.at(-1)?.id ?? '')
    if (branch) branch.targets.push(target)
    else unplacedTargets.push(target)
  }
  const rows: ContentRow[] = []
  function visit(branch: CurriculumTreeBranch, depth: number) {
    const descendants = countTargets(branch)
    const hasChildren = branch.children.size > 0 || branch.targets.length > 0
    rows.push({
      type: 'node',
      branch,
      depth,
      outcomeCount: descendants.total,
      readyCount: descendants.ready,
      hasChildren,
    })
    if (!expanded.has(branch.id)) return
    for (const child of sortBranches(branch.children.values())) visit(child, depth + 1)
    for (const target of sortTargets(branch.targets))
      rows.push({ type: 'target', target, depth: depth + 1 })
  }
  for (const root of sortBranches(roots)) visit(root, 0)
  for (const target of sortTargets(unplacedTargets)) rows.push({ type: 'target', target, depth: 0 })
  return rows
}

function countTargets(branch: CurriculumTreeBranch): { total: number; ready: number } {
  const nested = [...branch.children.values()].map(countTargets)
  return {
    total: branch.targets.length + nested.reduce((count, item) => count + item.total, 0),
    ready:
      branch.targets.filter((target) => target.generationReady).length +
      nested.reduce((count, item) => count + item.ready, 0),
  }
}

function CurriculumContentTable({
  design,
  search,
  onSearchChange,
}: {
  design: CurriculumLibraryOfferingDto['designs'][number]
  search: LibrarySearch
  onSearchChange: LibrarySearchChange
}) {
  const expanded = new Set(search.content?.split(',').filter(Boolean) ?? [])
  const rows = buildContentRows(design, expanded)
  function toggle(id: string) {
    const next = new Set(expanded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    const content = [...next].sort().join(',')
    onSearchChange({ ...search, content: content || undefined })
  }

  if (!rows.length)
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        This edition has no structured content yet.
      </p>
    )

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[600px] text-left text-sm">
        <caption className="sr-only">{design.editionLabel} curriculum content hierarchy</caption>
        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3">
              Curriculum content
            </th>
            <th scope="col" className="hidden px-4 py-3 xl:table-cell">
              Type
            </th>
            <th scope="col" className="hidden px-4 py-3 xl:table-cell">
              Code / locator
            </th>
            <th scope="col" className="px-4 py-3">
              Outcomes
            </th>
            <th scope="col" className="hidden px-4 py-3 xl:table-cell">
              Evidence
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) =>
            row.type === 'node' ? (
              <tr key={row.branch.id}>
                <th scope="row" className="px-4 py-3 font-medium">
                  <>
                    <div
                      className="flex items-center gap-2"
                      style={{ paddingInlineStart: row.depth * 1.25 + 'rem' }}
                    >
                      {row.hasChildren ? (
                        <button
                          type="button"
                          aria-label={
                            (expanded.has(row.branch.id) ? 'Collapse ' : 'Expand ') +
                            row.branch.label
                          }
                          aria-expanded={expanded.has(row.branch.id)}
                          className="rounded p-1 hover:bg-muted"
                          onClick={() => toggle(row.branch.id)}
                        >
                          <ChevronRight
                            aria-hidden="true"
                            className={
                              'size-4 transition-transform ' +
                              (expanded.has(row.branch.id) ? 'rotate-90' : '')
                            }
                          />
                        </button>
                      ) : (
                        <span aria-hidden="true" className="size-6 shrink-0" />
                      )}
                      {row.branch.label}
                    </div>
                    <div
                      className="mt-1 pl-8 text-xs text-muted-foreground xl:hidden"
                      style={{ paddingInlineStart: row.depth * 1.25 + 'rem' }}
                    >
                      {nodeKindLabel(row.branch.kind)}
                      {row.branch.code ? ' · ' + row.branch.code : ''}
                    </div>
                  </>
                </th>
                <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {nodeKindLabel(row.branch.kind)}
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {row.branch.code ?? '—'}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {row.outcomeCount}{' '}
                  <span className="text-muted-foreground">· {row.readyCount} ready</span>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  Curriculum structure
                </td>
              </tr>
            ) : (
              <tr key={row.target.id} className="bg-primary/[0.025]">
                <th scope="row" className="px-4 py-3 font-medium">
                  <div
                    className="pl-8"
                    style={{ paddingInlineStart: (row.depth + 1) * 1.25 + 'rem' }}
                  >
                    <Link
                      to="/library/targets/$targetRevisionId"
                      params={{ targetRevisionId: row.target.id }}
                      search={search}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      {row.target.title}
                    </Link>
                    <span className="mt-1 block text-xs text-muted-foreground xl:hidden">
                      {targetKindLabel(row.target.kind)} · {row.target.locator || 'No locator'} ·{' '}
                      {row.target.sourceCount} {row.target.sourceCount === 1 ? 'source' : 'sources'}
                    </span>
                  </div>
                </th>
                <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {targetKindLabel(row.target.kind)}
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {row.target.locator || '—'}
                </td>
                <td className="px-4 py-3">
                  <Readiness ready={row.target.generationReady} />
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground xl:table-cell">
                  {row.target.sourceCount} {row.target.sourceCount === 1 ? 'source' : 'sources'}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

export function LibraryTargetPage({
  targetRevisionId,
  user,
  search,
}: {
  targetRevisionId: string
  user: ApiPrincipal
  search: LibrarySearch
}) {
  const targetQuery = useQuery({
    queryKey: curriculumLibraryKeys.target(targetRevisionId),
    queryFn: () => getCurriculumTarget(targetRevisionId),
  })
  const target = targetQuery.data
  const groupedSources = target?.sources.reduce((groups, source) => {
    if (!source.linkId) return groups
    const existing = groups.get(source.linkId)
    if (existing) existing.push(source)
    else groups.set(source.linkId, [source])
    return groups
  }, new Map<string, CurriculumSourceDto[]>())

  if (!target && targetQuery.isLoading)
    return (
      <div
        className="mx-auto h-40 max-w-5xl animate-pulse rounded-xl border bg-card"
        role="status"
      />
    )
  if (!target)
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link
          to="/library"
          search={search}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground"
        >
          <ArrowLeft className="size-4" /> Curriculum Library
        </Link>
        <ErrorNotice
          message={`This curriculum target could not be loaded: ${targetQuery.error?.message ?? 'Target not found.'}`}
        />
      </div>
    )

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/library"
        search={search}
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Curriculum Library
      </Link>
      <header className="space-y-3 border-b border-primary/15 pb-6">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{target.framework}</span>
          <span aria-hidden="true">/</span>
          <span>{target.programme}</span>
          <span aria-hidden="true">/</span>
          <span>{target.level}</span>
          <span aria-hidden="true">/</span>
          <span>{target.subject}</span>
          <span className="rounded-full bg-muted px-2.5 py-1">{target.editionLabel}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{target.title}</h1>
        <p className="max-w-3xl leading-7 text-muted-foreground">{target.statement}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Readiness ready={target.generationReady} />
        </div>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers3 className="size-4 text-primary" /> Curriculum hierarchy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CurriculumHierarchy target={target} showTargetSummary={false} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="size-4 text-primary" /> Linked sources{' '}
                <span className="font-normal text-muted-foreground">
                  ({groupedSources?.size ?? 0})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupedSources?.size ? (
                <div className="space-y-3">
                  {[...groupedSources.entries()].map(([linkId, chunks]) => (
                    <SourceCard key={linkId} chunks={chunks} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed p-5 text-sm">
                  <p className="font-medium">No sources are linked to this target.</p>
                  <p className="mt-1 text-muted-foreground">
                    Generation stays disabled until the official curriculum excerpt has been
                    imported, reviewed, and published.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Target details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <DetailRow label="Framework" value={target.framework} />
              <DetailRow label="Programme" value={target.programme} />
              <DetailRow label="Level" value={target.level} />
              <DetailRow label="Subject" value={target.subject} />
              <DetailRow label="Edition" value={target.editionLabel} />
              <DetailRow label="Target type" value={target.kind.replaceAll('_', ' ')} />
            </CardContent>
          </Card>
          <div
            className={`rounded-xl border p-4 ${target.generationReady ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/70'}`}
          >
            <div className="flex gap-2">
              {target.generationReady ? (
                <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 text-amber-700" />
              )}
              <div>
                <h2 className="font-semibold">
                  {target.generationReady ? 'Ready for generation' : 'Sources needed'}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {target.generationReady
                    ? 'Published target and supporting sources can ground a lesson plan.'
                    : 'Browse-only in this demo. Start a plan from a target marked Ready for generation.'}
                </p>
              </div>
            </div>
            {target.generationReady && user.permissions.includes('lesson_plan:create') && (
              <Link
                className={`${buttonVariants({ size: 'sm' })} mt-4 w-full`}
                to="/teacher/plans/new"
                search={{ targetRevisionId: target.id }}
              >
                Create a lesson plan
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

function CurriculumHierarchy({
  target,
  compact = false,
  showTargetSummary = true,
}: {
  target: CurriculumLibraryTargetDto
  compact?: boolean
  showTargetSummary?: boolean
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-3'}>
      {target.hierarchy.map((node, index) => (
        <div
          key={node.id}
          className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
          style={{ paddingInlineStart: `${index * 1.25}rem` }}
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {nodeKindLabel(node.kind)}
          </span>
          {node.code && <span className="text-xs font-medium text-primary">{node.code}</span>}
          <span className={compact ? 'text-sm' : 'font-medium'}>{node.label}</span>
        </div>
      ))}
      <div
        className={
          'rounded-md border border-primary/15 bg-primary/5 ' +
          (compact ? 'mt-2 px-3 py-2' : 'px-4 py-3')
        }
        style={{ marginInlineStart: `${target.hierarchy.length * 1.25}rem` }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            {targetKindLabel(target.kind)}
          </span>
          {target.locator && (
            <span className="rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
              {target.locator}
            </span>
          )}
        </div>
        {showTargetSummary ? (
          <>
            <p className={`mt-1 font-medium ${compact ? 'text-sm' : ''}`}>{target.title}</p>
            <p
              className={`mt-1 text-muted-foreground ${compact ? 'line-clamp-2 text-sm' : 'leading-6'}`}
            >
              {target.statement}
            </p>
          </>
        ) : (
          <p className="mt-1 text-sm font-medium">Selected target</p>
        )}
      </div>
    </div>
  )
}

function sortBranches(branches: Iterable<CurriculumTreeBranch>) {
  return [...branches].sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id))
}

function sortTargets(targets: CurriculumLibraryTargetDto[]) {
  return [...targets].sort(
    (a, b) =>
      a.sortOrder - b.sortOrder || a.locator.localeCompare(b.locator) || a.id.localeCompare(b.id),
  )
}

function nodeKindLabel(kind: CurriculumNodeKind) {
  const labels: Record<CurriculumNodeKind, string> = {
    strand: 'Strand',
    sub_strand: 'Sub-strand',
    topic: 'Topic',
    subtopic: 'Subtopic',
    unit: 'Unit',
    section: 'Section',
  }
  return labels[kind]
}

function targetKindLabel(kind: CurriculumLibraryTargetDto['kind']) {
  const labels: Record<CurriculumLibraryTargetDto['kind'], string> = {
    specific_learning_outcome: 'Specific learning outcome',
    learning_objective: 'Learning objective',
    syllabus_content_point: 'Syllabus content point',
  }
  return labels[kind]
}

function SourceCard({ chunks }: { chunks: CurriculumSourceDto[] }) {
  const source = chunks[0]
  return (
    <article className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{source.title}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${source.status === 'draft' ? 'bg-amber-100 text-amber-900' : source.status === 'retired' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-900'}`}
            >
              {label(source.status)}
            </span>
          </div>
          <SourceProvenance source={source} />
          {(source.editionLabel || source.locator) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {[source.editionLabel, source.locator].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {chunks.map((chunk, index) => (
          <div key={chunk.chunkId}>
            {chunks.length > 1 && (
              <p className="mb-1 text-xs font-medium text-foreground">Excerpt {index + 1}</p>
            )}
            <SourcePassage source={chunk} />
          </div>
        ))}
      </div>
    </article>
  )
}

function Readiness({ ready }: { ready: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${ready ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}
    >
      {ready ? 'Ready for generation' : 'Sources needed'}
    </span>
  )
}
function label(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}
function DetailRow({ label: name, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{name}</span>
      <span className="text-right font-medium capitalize">{value}</span>
    </div>
  )
}
function ErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  )
}
