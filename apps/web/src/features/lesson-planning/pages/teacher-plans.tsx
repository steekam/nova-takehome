import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useBlocker } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ApiPrincipal } from '@nova/shared'
import { LessonPlanContentSchema } from '@nova/shared'
import { AppShell } from '../../../components/app-shell'
import { Button } from '../../../components/ui/button'
import { buttonVariants } from '../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card'
import type { LessonPlanVersion } from '../../../components/plan-history'
import { PlanDetailLayout } from '../components/plan-detail-layout'
import {
  generateLessonPlan,
  getLessonPlan,
  lessonPlanningKeys,
  submitLessonPlan,
  updateLessonPlan,
  type LessonPlan,
  type LessonPlanContent,
  type LessonPlanDetails,
} from '../api'
import {
  curriculumLibraryKeys,
  getCurriculumCatalogue,
  getCurriculumDesign,
  getCurriculumTarget,
  listCurriculumSources,
  type CurriculumSource,
} from '../../curriculum-library/api'

type Plan = LessonPlan
type Detail = LessonPlanDetails
type CurriculumTarget = Awaited<
  ReturnType<typeof getCurriculumDesign>
>['designs'][number]['targets'][number]

export function GeneratePage({
  user,
  targetRevisionId,
}: {
  user: ApiPrincipal
  targetRevisionId?: string
}) {
  return (
    <GeneratePageContent
      key={targetRevisionId ?? 'new-plan'}
      user={user}
      targetRevisionId={targetRevisionId}
    />
  )
}

function GeneratePageContent({
  user,
  targetRevisionId,
}: {
  user: ApiPrincipal
  targetRevisionId?: string
}) {
  const queryClient = useQueryClient()
  const catalogue = useQuery({
    queryKey: curriculumLibraryKeys.catalogue,
    queryFn: getCurriculumCatalogue,
  })
  const targetLookup = useQuery({
    queryKey: curriculumLibraryKeys.target(targetRevisionId ?? 'none'),
    queryFn: () => getCurriculumTarget(targetRevisionId ?? ''),
    enabled: Boolean(targetRevisionId),
  })
  const [targetId, setTargetId] = useState(targetRevisionId ?? '')
  const [frameworkId, setFrameworkId] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [levelKey, setLevelKey] = useState('')
  const [offeringId, setOfferingId] = useState('')
  const [designVersionId, setDesignVersionId] = useState('')
  const [targetSearch, setTargetSearch] = useState('')
  const [targetLimit, setTargetLimit] = useState(50)
  const [durationMinutes, setDurationMinutes] = useState(45)
  const readyOfferings = (catalogue.data?.offerings ?? []).filter((offering) =>
    offering.designs.some(
      (design) => design.status === 'published' && design.generationReadyCount > 0,
    ),
  )
  const routeTarget = targetId === targetRevisionId ? targetLookup.data : undefined
  const routeOffering = readyOfferings.find((offering) => offering.id === routeTarget?.offeringId)
  const frameworkChoices = uniqueChoices(
    readyOfferings,
    (offering) => offering.frameworkId,
    (offering) => offering.framework,
  )
  const selectedFrameworkId =
    frameworkId || routeOffering?.frameworkId || onlyChoice(frameworkChoices)
  const frameworkOfferings = readyOfferings.filter(
    (offering) => offering.frameworkId === selectedFrameworkId,
  )
  const programmeChoices = uniqueChoices(
    frameworkOfferings,
    (offering) => offering.programmeId,
    (offering) => offering.programme,
  )
  const selectedProgrammeId =
    programmeId || routeOffering?.programmeId || onlyChoice(programmeChoices)
  const programmeOfferings = frameworkOfferings.filter(
    (offering) => offering.programmeId === selectedProgrammeId,
  )
  const levelChoices = uniqueChoices(
    programmeOfferings,
    (offering) => offering.levelId ?? 'all-levels',
    (offering) => offering.level,
  )
  const selectedLevelKey =
    levelKey ||
    (routeOffering ? (routeOffering.levelId ?? 'all-levels') : '') ||
    onlyChoice(levelChoices)
  const levelOfferings = programmeOfferings.filter(
    (offering) => (offering.levelId ?? 'all-levels') === selectedLevelKey,
  )
  const subjectChoices = uniqueChoices(
    levelOfferings,
    (offering) => offering.id,
    (offering) => offering.subject,
  )
  const selectedOfferingId = offeringId || routeOffering?.id || onlyChoice(subjectChoices)
  const selectedOffering = readyOfferings.find((offering) => offering.id === selectedOfferingId)
  const editionChoices = (selectedOffering?.designs ?? [])
    .filter((design) => design.status === 'published' && design.generationReadyCount > 0)
    .map((design) => ({
      id: design.id,
      label: `${design.editionLabel} · Revision ${design.revisionNumber}`,
      revisionNumber: design.revisionNumber,
      generationReadyCount: design.generationReadyCount,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
  const selectedDesignVersionId =
    designVersionId ||
    (routeOffering?.id === selectedOfferingId ? (routeTarget?.designVersionId ?? '') : '') ||
    onlyChoice(editionChoices)
  const design = useQuery({
    queryKey: curriculumLibraryKeys.design(selectedDesignVersionId || 'none'),
    queryFn: () => getCurriculumDesign(selectedDesignVersionId),
    enabled: Boolean(selectedDesignVersionId),
  })
  const selectedDesign = design.data?.designs.find((item) => item.id === selectedDesignVersionId)
  const readyTargets =
    selectedDesign?.targets
      .filter((target) => target.generationReady)
      .sort((a, b) => a.sortOrder - b.sortOrder) ?? []
  const selectedTarget =
    readyTargets.find((target) => target.id === targetId) ??
    (routeTarget?.generationReady ? routeTarget : undefined)
  const pathSteps = [
    { label: 'a curriculum', selected: Boolean(selectedFrameworkId) },
    { label: 'a programme', selected: Boolean(selectedProgrammeId) },
    { label: 'a grade or stage', selected: Boolean(selectedLevelKey) },
    { label: 'a subject', selected: Boolean(selectedOfferingId) },
    { label: 'an edition', selected: Boolean(selectedDesignVersionId) },
    { label: 'a learning outcome', selected: Boolean(selectedTarget) },
  ]
  const nextPathStep = pathSteps.findIndex((step) => !step.selected)
  const progressMessage =
    nextPathStep === -1
      ? 'Curriculum path and outcome selected. Ready to generate.'
      : `Step ${nextPathStep + 1} of ${pathSteps.length} · Choose ${pathSteps[nextPathStep].label}.`
  const searchTerm = targetSearch.trim().toLocaleLowerCase()
  const matchingTargets = readyTargets.filter((target) =>
    [
      target.locator,
      target.title,
      target.statement,
      ...target.hierarchy.flatMap((node) => [node.code ?? '', node.label]),
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(searchTerm),
  )
  const targetsToShow = matchingTargets.slice(0, targetLimit)
  const visibleTargetIds = new Set(targetsToShow.map((target) => target.id))
  const selectedTargetIsInSearch = matchingTargets.some(
    (target) => target.id === selectedTarget?.id,
  )
  if (selectedTargetIsInSearch && selectedTarget) visibleTargetIds.add(selectedTarget.id)
  const targetTree = buildTargetTree(matchingTargets)
  const linkedSources = selectedTarget
    ? [...selectedTarget.sources]
        .sort((a, b) => {
          const aIsDefinition = a.role === 'defines_target' ? 0 : 1
          const bIsDefinition = b.role === 'defines_target' ? 0 : 1
          return aIsDefinition - bIsDefinition
        })
        .slice(0, 3)
    : []
  const generate = useMutation({
    mutationFn: () => generateLessonPlan({ targetRevisionId: targetId, durationMinutes }),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
  })
  function clearTargetSelection() {
    setTargetId('')
    setTargetSearch('')
    setTargetLimit(50)
    generate.reset()
  }

  function clearEditionSelection() {
    setDesignVersionId('')
    clearTargetSelection()
  }

  function selectTarget(target: CurriculumTarget) {
    setFrameworkId(selectedFrameworkId)
    setProgrammeId(selectedProgrammeId)
    setLevelKey(selectedLevelKey)
    setOfferingId(selectedOfferingId)
    setDesignVersionId(selectedDesignVersionId)
    setTargetId(target.id)
    generate.reset()
  }
  const selectClassName =
    'h-11 w-full rounded-md border bg-background px-3 font-normal disabled:cursor-not-allowed disabled:opacity-60'
  return (
    <AppShell permissions={user.permissions}>
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="border-b border-primary/15 pb-6">
          <Link
            to="/teacher"
            className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden="true" className="size-4" /> Overview
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Create a lesson plan</h1>
          <p className="mt-2 text-muted-foreground">
            Follow the curriculum path to choose an outcome. Its linked sources ground the draft.
          </p>
        </header>
        {catalogue.error && (
          <ErrorMessage
            message={`The curriculum catalogue could not be loaded: ${catalogue.error.message}`}
          />
        )}
        {targetRevisionId && targetLookup.error && (
          <ErrorMessage
            message={`The selected curriculum target could not be loaded: ${targetLookup.error.message}`}
          />
        )}
        {targetRevisionId && targetLookup.data && !targetLookup.data.generationReady && (
          <ErrorMessage message="This curriculum outcome is not ready for generation. Choose a ready outcome from the curriculum path." />
        )}
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Choose a curriculum outcome</CardTitle>
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {design.isLoading && selectedDesignVersionId
                  ? 'Loading outcomes for the selected edition…'
                  : progressMessage}
              </p>
            </CardHeader>
            <CardContent className="space-y-5">
              {catalogue.isLoading ? (
                <div
                  role="status"
                  aria-label="Loading curriculum catalogue"
                  className="h-48 animate-pulse rounded-md bg-muted"
                />
              ) : catalogue.isError ? null : readyOfferings.length ? (
                <>
                  <section aria-label="Curriculum path" className="space-y-4">
                    <fieldset disabled={generate.isPending} className="space-y-4">
                      <legend className="sr-only">Curriculum path</legend>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block space-y-2 text-sm font-medium">
                          Curriculum
                          <select
                            className={selectClassName}
                            value={selectedFrameworkId}
                            onChange={(event) => {
                              setFrameworkId(event.target.value)
                              setProgrammeId('')
                              setLevelKey('')
                              setOfferingId('')
                              clearEditionSelection()
                            }}
                          >
                            <option value="">Choose a curriculum</option>
                            {frameworkChoices.map((choice) => (
                              <option key={choice.id} value={choice.id}>
                                {choice.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-2 text-sm font-medium">
                          Programme
                          <select
                            className={selectClassName}
                            value={selectedProgrammeId}
                            disabled={!selectedFrameworkId}
                            onChange={(event) => {
                              setProgrammeId(event.target.value)
                              setFrameworkId(selectedFrameworkId)
                              setLevelKey('')
                              setOfferingId('')
                              clearEditionSelection()
                            }}
                          >
                            <option value="">Choose a programme</option>
                            {programmeChoices.map((choice) => (
                              <option key={choice.id} value={choice.id}>
                                {choice.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-2 text-sm font-medium">
                          Grade or stage
                          <select
                            className={selectClassName}
                            value={selectedLevelKey}
                            disabled={!selectedProgrammeId}
                            onChange={(event) => {
                              setLevelKey(event.target.value)
                              setFrameworkId(selectedFrameworkId)
                              setProgrammeId(selectedProgrammeId)
                              setOfferingId('')
                              clearEditionSelection()
                            }}
                          >
                            <option value="">Choose a grade or stage</option>
                            {levelChoices.map((choice) => (
                              <option key={choice.id} value={choice.id}>
                                {choice.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block space-y-2 text-sm font-medium">
                          Subject
                          <select
                            className={selectClassName}
                            value={selectedOfferingId}
                            disabled={!selectedLevelKey}
                            onChange={(event) => {
                              setOfferingId(event.target.value)
                              setFrameworkId(selectedFrameworkId)
                              setProgrammeId(selectedProgrammeId)
                              setLevelKey(selectedLevelKey)
                              clearEditionSelection()
                            }}
                          >
                            <option value="">Choose a subject</option>
                            {subjectChoices.map((choice) => (
                              <option key={choice.id} value={choice.id}>
                                {choice.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <label className="block space-y-2 text-sm font-medium">
                        Curriculum edition
                        <select
                          className={selectClassName}
                          value={selectedDesignVersionId}
                          disabled={!selectedOffering}
                          onChange={(event) => {
                            setDesignVersionId(event.target.value)
                            setFrameworkId(selectedFrameworkId)
                            setProgrammeId(selectedProgrammeId)
                            setLevelKey(selectedLevelKey)
                            setOfferingId(selectedOfferingId)
                            clearTargetSelection()
                          }}
                        >
                          <option value="">Choose an edition</option>
                          {editionChoices.map((edition) => (
                            <option key={edition.id} value={edition.id}>
                              {edition.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </fieldset>
                    <p className="text-xs text-muted-foreground">
                      Changing a level clears choices below it.
                    </p>
                  </section>
                  {design.error && (
                    <ErrorMessage
                      message={`This curriculum edition could not be loaded: ${design.error.message}`}
                    />
                  )}
                  {design.isLoading && (
                    <div
                      role="status"
                      aria-label="Loading edition outcomes"
                      className="h-16 animate-pulse rounded-md bg-muted"
                    />
                  )}
                  {selectedDesign && readyTargets.length > 8 && (
                    <label className="block space-y-2 text-sm font-medium">
                      Find an outcome
                      <input
                        type="search"
                        value={targetSearch}
                        disabled={generate.isPending}
                        onChange={(event) => {
                          setTargetSearch(event.target.value)
                          setTargetLimit(50)
                        }}
                        placeholder="Search strand, sub-strand, code, or wording"
                        className="h-11 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                    </label>
                  )}
                  {selectedTarget &&
                    searchTerm &&
                    !matchingTargets.some((target) => target.id === selectedTarget.id) && (
                      <p className="text-xs text-muted-foreground">
                        Your current outcome stays selected. Choose a result to replace it.
                      </p>
                    )}
                  <fieldset
                    className="space-y-3"
                    disabled={!selectedDesign || design.isLoading || generate.isPending}
                  >
                    <legend className="text-sm font-medium">Choose one learning outcome</legend>
                    {!selectedDesign ? (
                      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        Choose a curriculum path and edition to browse its strands and outcomes.
                      </p>
                    ) : targetsToShow.length === 0 ? (
                      <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                        {searchTerm
                          ? 'No outcomes match that search.'
                          : 'No generation-ready outcomes are available in this edition.'}
                      </p>
                    ) : (
                      <div className="max-h-[27rem] space-y-2 overflow-y-auto rounded-md border p-3">
                        {readyTargets.length === 1 && targetsToShow.length === 1 ? (
                          <section
                            aria-label="Outcome hierarchy"
                            className="space-y-2 rounded-md bg-muted/25 p-3"
                          >
                            <ol className="ml-2 space-y-1 border-l pl-3">
                              {targetsToShow[0].hierarchy.map((node) => (
                                <li key={node.id} className="text-sm">
                                  <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                    {hierarchyKindLabel(node.kind)}
                                  </span>
                                  {node.code && (
                                    <span className="mr-2 text-xs text-muted-foreground">
                                      {node.code}
                                    </span>
                                  )}
                                  <span className="font-medium">{node.label}</span>
                                </li>
                              ))}
                            </ol>
                            <CurriculumTargetChoice
                              target={targetsToShow[0]}
                              selected={selectedTarget?.id === targetsToShow[0].id}
                              onSelect={() => selectTarget(targetsToShow[0])}
                            />
                          </section>
                        ) : (
                          <>
                            {targetTree.targets.some((target) =>
                              visibleTargetIds.has(target.id),
                            ) && (
                              <section aria-label="Outcomes without a strand" className="space-y-2">
                                <h3 className="border-b px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  Outcomes
                                </h3>
                                {targetTree.targets
                                  .filter((target) => visibleTargetIds.has(target.id))
                                  .map((target) => (
                                    <CurriculumTargetChoice
                                      key={target.id}
                                      target={target}
                                      selected={selectedTarget?.id === target.id}
                                      onSelect={() => selectTarget(target)}
                                    />
                                  ))}
                              </section>
                            )}
                            {targetTree.branches.map((branch) => (
                              <CurriculumHierarchyBranch
                                key={branch.id}
                                branch={branch}
                                depth={0}
                                selectedTargetId={selectedTarget?.id}
                                visibleTargetIds={visibleTargetIds}
                                expandSinglePath={matchingTargets.length <= 8}
                                onSelect={selectTarget}
                              />
                            ))}
                            {targetsToShow.length < matchingTargets.length && (
                              <Button
                                className="w-full"
                                variant="outline"
                                onClick={() => setTargetLimit((current) => current + 50)}
                              >
                                Show next 50 outcomes
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </fieldset>
                  {selectedDesign && (
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {matchingTargets.length > targetsToShow.length
                        ? `${searchTerm ? 'Showing' : 'Showing first'} ${targetsToShow.length} of ${matchingTargets.length} ${searchTerm ? 'matches' : 'outcomes'}. Search to narrow the list or show more.`
                        : `${matchingTargets.length} generation-ready ${matchingTargets.length === 1 ? 'outcome' : 'outcomes'} in this edition.`}
                    </p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    Only published editions with source-backed outcomes are available here. Browse
                    the full catalogue in the{' '}
                    <Link className="font-medium text-primary underline" to="/library">
                      Curriculum Library
                    </Link>
                    .
                  </p>
                </>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  No published curriculum editions with source-backed outcomes are ready yet. Browse
                  the{' '}
                  <Link className="font-medium text-primary underline" to="/library">
                    Curriculum Library
                  </Link>{' '}
                  to explore the full catalogue.
                </p>
              )}
              <label className="block space-y-2 text-sm font-medium">
                Lesson length
                <select
                  className="h-11 w-full rounded-md border bg-background px-3 font-normal"
                  value={durationMinutes}
                  disabled={generate.isPending}
                  onChange={(event) => {
                    setDurationMinutes(Number(event.target.value))
                    generate.reset()
                  }}
                >
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                  <option value={90}>90 minutes</option>
                </select>
              </label>
              {generate.error && (
                <ErrorMessage message={`Plan generation failed: ${generate.error.message}`} />
              )}
              {generate.data ? (
                <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <p className="font-medium">Draft ready: {generate.data.plan.content.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Review the full plan, then edit it before submission.
                  </p>
                  <Link
                    className={`${buttonVariants()} mt-4`}
                    to="/teacher/plans/$planId/edit"
                    params={{ planId: generate.data.plan.id }}
                  >
                    Edit draft <ArrowRight aria-hidden="true" />
                  </Link>
                  <Button className="mt-4" variant="outline" onClick={() => generate.reset()}>
                    Generate another draft
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {!selectedTarget && readyOfferings.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Select an outcome above to enable draft generation.
                    </p>
                  )}
                  <Button
                    disabled={!selectedTarget || generate.isPending || catalogue.isLoading}
                    onClick={() => generate.mutate()}
                  >
                    {generate.isPending ? 'Generating draft…' : 'Generate draft'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <aside className="space-y-5 border-t pt-5 text-sm leading-6 text-muted-foreground lg:border-l lg:border-t-0 lg:pl-7 lg:pt-1">
            <div>
              <h2 className="font-semibold text-foreground">Curriculum evidence</h2>
              <p className="mt-1">
                Official curriculum excerpts define the outcome. Up to six relevant linked passages
                may also inform the draft; synthetic demo material can shape suggestions and is
                labeled.
              </p>
            </div>
            {selectedTarget ? (
              <>
                <div className="space-y-2 border-b pb-4">
                  <p className="font-medium text-foreground">
                    {selectedTarget.framework} / {selectedTarget.programme} / {selectedTarget.level}{' '}
                    {selectedTarget.subject}
                  </p>
                  <p>
                    {selectedTarget.editionLabel}
                    {selectedDesign ? ` · Revision ${selectedDesign.revisionNumber}` : ''} ·{' '}
                    {selectedTarget.locator}
                  </p>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Curriculum wording
                  </p>
                  <p className="text-foreground">{selectedTarget.statement}</p>
                  {selectedTarget.hierarchy.length ? (
                    <p className="text-xs">
                      {selectedTarget.hierarchy.map((node) => node.label).join(' / ')}
                    </p>
                  ) : null}
                  <Link
                    className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
                    to="/library/targets/$targetRevisionId"
                    params={{ targetRevisionId: selectedTarget.id }}
                  >
                    View in Curriculum Library <ArrowRight aria-hidden="true" className="size-3" />
                  </Link>
                </div>
                {linkedSources.length ? (
                  <div>
                    <p className="mb-2 font-medium text-foreground">
                      {selectedTarget.sourceCount}{' '}
                      {selectedTarget.sourceCount === 1
                        ? 'source revision linked'
                        : 'source revisions linked'}
                      <span className="font-normal text-muted-foreground">
                        {' '}
                        · previewing {linkedSources.length} linked{' '}
                        {linkedSources.length === 1 ? 'passage' : 'passages'}
                      </span>
                    </p>
                    <ul className="divide-y rounded-md border bg-card text-foreground">
                      {linkedSources.map((source) => (
                        <li key={source.chunkId} className="px-3 py-2">
                          <p className="font-medium">{source.title}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            <span
                              className={`rounded-full border px-2 py-0.5 font-medium ${
                                source.synthetic
                                  ? 'border-amber-700/30 bg-amber-50 text-amber-950'
                                  : source.authority === 'official'
                                    ? 'border-emerald-700/25 bg-emerald-50 text-emerald-950'
                                    : 'border-border bg-muted text-foreground'
                              }`}
                            >
                              {source.synthetic
                                ? 'Synthetic demo material'
                                : `${sourceAuthorityLabel(source.authority)} source`}
                            </span>
                            <span className="rounded-full border px-2 py-0.5 text-foreground">
                              {sourceRoleLabel(source.role)}
                            </span>
                            <span>{source.locator ?? 'Source passage'}</span>
                          </div>
                          <p className="mt-2 text-sm leading-5 text-muted-foreground">
                            {source.content.length > 210
                              ? `${source.content.slice(0, 210).trimEnd()}…`
                              : source.content}
                          </p>
                          {source.sourceUrl ? (
                            <a
                              className="mt-2 inline-flex font-medium text-primary underline underline-offset-2"
                              href={source.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open source document
                            </a>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="rounded-md border border-dashed p-3">
                    No published sources are linked to this outcome.
                  </p>
                )}
              </>
            ) : (
              <p>
                Select an outcome to review its curriculum wording and source evidence before
                generation.
              </p>
            )}
            {selectedTarget && (
              <p className="border-t pt-4">The generated plan lists the exact citations used.</p>
            )}
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function uniqueChoices<T>(
  items: readonly T[],
  idFor: (item: T) => string,
  labelFor: (item: T) => string,
) {
  return [...new Map(items.map((item) => [idFor(item), labelFor(item)])).entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

type TargetHierarchyBranch = {
  id: string
  kind: CurriculumTarget['hierarchy'][number]['kind']
  code: string | null
  label: string
  sortOrder: number
  targetCount: number
  children: Map<string, TargetHierarchyBranch>
  targets: CurriculumTarget[]
}

function buildTargetTree(targets: readonly CurriculumTarget[]) {
  const branches = new Map<string, TargetHierarchyBranch>()
  const rootTargets: CurriculumTarget[] = []

  for (const target of targets) {
    if (target.hierarchy.length === 0) {
      rootTargets.push(target)
      continue
    }

    let siblings = branches
    let parent: TargetHierarchyBranch | undefined
    for (const node of target.hierarchy) {
      let branch = siblings.get(node.id)
      if (!branch) {
        branch = {
          id: node.id,
          kind: node.kind,
          code: node.code,
          label: node.label,
          sortOrder: node.sortOrder,
          targetCount: 0,
          children: new Map(),
          targets: [],
        }
        siblings.set(node.id, branch)
      }
      branch.targetCount += 1
      parent = branch
      siblings = branch.children
    }
    parent?.targets.push(target)
  }

  return {
    branches: [...branches.values()].sort((a, b) => a.sortOrder - b.sortOrder),
    targets: rootTargets,
  }
}

function CurriculumHierarchyBranch({
  branch,
  depth,
  selectedTargetId,
  visibleTargetIds,
  expandSinglePath,
  onSelect,
}: {
  branch: TargetHierarchyBranch
  depth: number
  selectedTargetId?: string
  visibleTargetIds: ReadonlySet<string>
  expandSinglePath: boolean
  onSelect: (target: CurriculumTarget) => void
}) {
  const children = [...branch.children.values()]
    .filter((child) => branchHasVisibleTarget(child, visibleTargetIds))
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const targets = branch.targets.filter((target) => visibleTargetIds.has(target.id))
  const containsSelectedTarget =
    targets.some((target) => target.id === selectedTargetId) ||
    children.some((child) => branchContainsTarget(child, selectedTargetId))
  if (!targets.length && !children.length) return null
  return (
    <details
      className="group rounded-md"
      open={containsSelectedTarget || depth === 0 || (expandSinglePath && branch.targetCount === 1)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 transition-transform group-open:rotate-90"
          />
          <span className="min-w-0">
            <span className="mr-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {hierarchyKindLabel(branch.kind)}
            </span>
            {branch.code && (
              <span className="mr-2 text-xs text-muted-foreground">{branch.code}</span>
            )}
            <span className="font-medium">{branch.label}</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {branch.targetCount} {branch.targetCount === 1 ? 'outcome' : 'outcomes'}
        </span>
      </summary>
      <div className="ml-3 space-y-1 border-l pl-2">
        {children.map((child) => (
          <CurriculumHierarchyBranch
            key={child.id}
            branch={child}
            depth={depth + 1}
            selectedTargetId={selectedTargetId}
            visibleTargetIds={visibleTargetIds}
            expandSinglePath={expandSinglePath}
            onSelect={onSelect}
          />
        ))}
        {targets.map((target) => (
          <CurriculumTargetChoice
            key={target.id}
            target={target}
            selected={target.id === selectedTargetId}
            onSelect={() => onSelect(target)}
          />
        ))}
      </div>
    </details>
  )
}

function CurriculumTargetChoice({
  target,
  selected,
  onSelect,
}: {
  target: CurriculumTarget
  selected: boolean
  onSelect: () => void
}) {
  return (
    <label
      className={`flex cursor-pointer gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50 ${
        selected ? 'border-primary bg-primary/5' : 'border-transparent bg-muted/20'
      }`}
    >
      <input
        type="radio"
        name="targetRevisionId"
        value={target.id}
        checked={selected}
        onChange={onSelect}
        className="mt-1 size-4 accent-primary"
      />
      <span className="min-w-0">
        <span className="block font-medium text-foreground">
          <span className="mr-2 text-xs text-muted-foreground">{target.locator}</span>
          {target.title}
        </span>
        <span className="mt-1 block text-sm leading-5 text-muted-foreground">
          {target.statement.length > 180
            ? `${target.statement.slice(0, 180).trimEnd()}…`
            : target.statement}
        </span>
      </span>
    </label>
  )
}

function branchContainsTarget(branch: TargetHierarchyBranch, targetId?: string): boolean {
  return (
    branch.targets.some((target) => target.id === targetId) ||
    [...branch.children.values()].some((child) => branchContainsTarget(child, targetId))
  )
}

function branchHasVisibleTarget(
  branch: TargetHierarchyBranch,
  targetIds: ReadonlySet<string>,
): boolean {
  return (
    branch.targets.some((target) => targetIds.has(target.id)) ||
    [...branch.children.values()].some((child) => branchHasVisibleTarget(child, targetIds))
  )
}

function hierarchyKindLabel(kind: CurriculumTarget['hierarchy'][number]['kind']) {
  return kind === 'sub_strand' ? 'Sub-strand' : kind[0].toUpperCase() + kind.slice(1)
}

function onlyChoice(choices: readonly { id: string }[]) {
  return choices.length === 1 ? choices[0].id : ''
}

function sourceAuthorityLabel(authority: CurriculumSource['authority']) {
  return {
    official: 'Official',
    school: 'School',
    internal: 'Internal',
    synthetic: 'Synthetic',
  }[authority]
}

function sourceRoleLabel(role: CurriculumSource['role']) {
  return {
    defines_target: 'Curriculum definition',
    teaching_support: 'Teaching support',
    assessment_support: 'Assessment support',
    guidance: 'Guidance',
    exemplar: 'Exemplar',
  }[role]
}

export function PlanDetailPage({ user, planId }: { user: ApiPrincipal; planId: string }) {
  const detail = useQuery({
    queryKey: lessonPlanningKeys.detail(planId),
    queryFn: () => getLessonPlan(planId),
  })
  const sources = useQuery({
    queryKey: curriculumLibraryKeys.sources,
    queryFn: listCurriculumSources,
  })
  if (detail.isLoading) return <ShellLoading user={user} label="Loading lesson plan" />
  if (detail.error)
    return (
      <ShellError
        user={user}
        message={`This lesson plan could not be loaded: ${detail.error.message}`}
      />
    )
  if (!detail.data) return null
  return (
    <AppShell permissions={user.permissions}>
      <PlanContent
        detail={detail.data}
        sources={sources.data ?? []}
        sourcesLoading={sources.isLoading}
        sourcesError={sources.error?.message}
      />
    </AppShell>
  )
}

export function EditPlanPage({ user, planId }: { user: ApiPrincipal; planId: string }) {
  const detail = useQuery({
    queryKey: lessonPlanningKeys.detail(planId),
    queryFn: () => getLessonPlan(planId),
  })
  const sources = useQuery({
    queryKey: curriculumLibraryKeys.sources,
    queryFn: listCurriculumSources,
  })
  if (detail.isLoading) return <ShellLoading user={user} label="Loading lesson plan editor" />
  if (detail.error)
    return (
      <ShellError
        user={user}
        message={`This lesson plan could not be loaded: ${detail.error.message}`}
      />
    )
  if (!detail.data) return null
  if (!detail.data.viewer.availableActions.edit)
    return (
      <AppShell permissions={user.permissions}>
        <PlanContent
          detail={detail.data}
          sources={sources.data ?? []}
          sourcesLoading={sources.isLoading}
          sourcesError={sources.error?.message}
        />
      </AppShell>
    )
  return (
    <AppShell permissions={user.permissions}>
      <PlanEditor
        key={detail.data.plan.id}
        initial={detail.data}
        sources={sources.data ?? []}
        sourcesLoading={sources.isLoading}
        sourcesError={sources.error?.message}
      />
    </AppShell>
  )
}

function ShellLoading({ user, label }: { user: ApiPrincipal; label: string }) {
  return (
    <AppShell permissions={user.permissions}>
      <div
        role="status"
        aria-label={label}
        className="h-96 animate-pulse rounded-xl border bg-card"
      />
    </AppShell>
  )
}
function ShellError({ user, message }: { user: ApiPrincipal; message: string }) {
  return (
    <AppShell permissions={user.permissions}>
      <div className="space-y-4">
        <Link
          to="/teacher"
          className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Overview
        </Link>
        <ErrorMessage message={message} />
      </div>
    </AppShell>
  )
}

function PlanEditor({
  initial,
  sources,
  sourcesLoading,
  sourcesError,
}: {
  initial: Detail
  sources: CurriculumSource[]
  sourcesLoading: boolean
  sourcesError?: string
}) {
  const queryClient = useQueryClient()
  const errorsRef = useRef<HTMLDivElement>(null)
  const plan = initial.plan
  const [viewer, setViewer] = useState(initial.viewer)
  const latestReturn = [...initial.reviews]
    .filter((review) => review.decision === 'returned')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const [content, setContent] = useState(plan.content)
  const [savedContent, setSavedContent] = useState(plan.content)
  const [versions, setVersions] = useState(initial.versions)
  const [currentVersionId, setCurrentVersionId] = useState(plan.versionId)
  const [currentVersion, setCurrentVersion] = useState(plan.version)
  const [qa, setQa] = useState(initial.qa)
  const [submittedView, setSubmittedView] = useState<Pick<Detail, 'plan' | 'viewer'> | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const hasUnsavedChanges = JSON.stringify(content) !== JSON.stringify(savedContent)
  useBlocker({
    shouldBlockFn: () =>
      hasUnsavedChanges &&
      !window.confirm('Leave this page? Your unsaved lesson plan changes will be lost.'),
    enableBeforeUnload: hasUnsavedChanges,
    disabled: !hasUnsavedChanges,
  })
  const save = useMutation({
    mutationFn: (value: LessonPlanContent) => updateLessonPlan(plan.id, value),
    onSuccess: async (result) => {
      setViewer(result.viewer)
      setContent(result.plan.content)
      setSavedContent(result.plan.content)
      setCurrentVersionId(result.plan.versionId)
      setCurrentVersion(result.plan.version)
      setQa(result.qa)
      setVersions((current) => withLatestVersion(current, result.plan))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(plan.id) }),
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
      ])
    },
  })
  const submit = useMutation({
    mutationFn: async (value: LessonPlanContent) => {
      const saved = await updateLessonPlan(plan.id, value)
      try {
        return await submitLessonPlan(plan.id)
      } catch (error) {
        setContent(saved.plan.content)
        setViewer(saved.viewer)
        setSavedContent(saved.plan.content)
        setCurrentVersionId(saved.plan.versionId)
        setCurrentVersion(saved.plan.version)
        setQa(saved.qa)
        setVersions((current) => withLatestVersion(current, saved.plan))
        queryClient.setQueryData(lessonPlanningKeys.detail(plan.id), {
          ...initial,
          ...saved,
          reviews: initial.reviews,
        })
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(plan.id) }),
          queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
        ])
        throw new Error(
          `Changes were saved, but submission failed: ${error instanceof Error ? error.message : 'Request failed.'}`,
        )
      }
    },
    onSuccess: async (result) => {
      setSubmittedView({ plan: result.plan, viewer: result.viewer })
      setVersions((current) => withLatestVersion(current, result.plan))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.detail(plan.id) }),
        queryClient.invalidateQueries({ queryKey: lessonPlanningKeys.all }),
      ])
    },
  })
  useEffect(() => {
    if (validationErrors.length) errorsRef.current?.focus()
  }, [validationErrors])
  function update<K extends keyof LessonPlanContent>(key: K, value: LessonPlanContent[K]) {
    setContent((existing) => ({ ...existing, [key]: value }))
    setValidationErrors([])
    save.reset()
    submit.reset()
  }
  function validate() {
    const result = LessonPlanContentSchema.safeParse(content)
    if (!result.success) {
      setValidationErrors(
        result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      )
      return null
    }
    setValidationErrors([])
    return result.data
  }
  const editorDetail: Detail = {
    ...initial,
    viewer,
    versions,
    qa,
    plan: { ...plan, versionId: currentVersionId, version: currentVersion, content },
  }
  if (submittedView)
    return (
      <PlanContent
        detail={{ ...initial, ...submittedView, versions, qa: submit.data?.qa ?? qa }}
        sources={sources}
        sourcesLoading={sourcesLoading}
        sourcesError={sourcesError}
      />
    )
  return (
    <PlanDetailLayout
      detail={editorDetail}
      sources={sources}
      sourcesLoading={sourcesLoading}
      sourcesError={sourcesError}
      qualityStale={hasUnsavedChanges}
      panelBottomClassName="bottom-28 md:bottom-20"
      backLink={
        <Link
          to="/teacher/plans/$planId"
          params={{ planId: plan.id }}
          className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> View plan
        </Link>
      }
      headerSupplement={
        <p className="mt-1 text-sm text-muted-foreground">
          Changes stay in draft until you submit for review.
        </p>
      }
    >
      <div className="space-y-5 pb-36">
        {(plan.status === 'returned' || (latestReturn && plan.status === 'draft')) && (
          <section
            className="rounded-xl border border-amber-700/20 bg-amber-50 p-4 text-amber-950"
            aria-labelledby="lead-feedback-heading"
          >
            <h2 id="lead-feedback-heading" className="font-semibold">
              Feedback from your curriculum lead
            </h2>
            {latestReturn ? (
              <>
                <p className="mt-1 text-xs text-amber-900/80">
                  Returned · Version {latestReturn.lessonPlanVersionNumber} ·{' '}
                  {new Date(latestReturn.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">
                  {latestReturn.comment ?? 'No written feedback was recorded for this return.'}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6">
                No written feedback was recorded. Ask your curriculum lead if you need
                clarification.
              </p>
            )}
          </section>
        )}
        {validationErrors.length > 0 && (
          <div
            ref={errorsRef}
            tabIndex={-1}
            role="alert"
            className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <p className="font-medium">Fix these fields before saving:</p>
            <ul className="mt-2 list-inside list-disc">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </div>
        )}
        <div className="mx-auto max-w-4xl">
          <fieldset disabled={save.isPending || submit.isPending} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Plan details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <TextField
                  label="Title"
                  value={content.title}
                  onChange={(value) => update('title', value)}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField
                    label="Subject"
                    readOnly={!!plan.targetRevisionId}
                    value={content.subject}
                    onChange={(value) => update('subject', value)}
                  />
                  <TextField
                    label="Grade"
                    readOnly={!!plan.targetRevisionId}
                    value={content.grade}
                    onChange={(value) => update('grade', value)}
                  />
                </div>
                <TextAreaField
                  label="Learning outcome"
                  readOnly={!!plan.targetRevisionId}
                  value={content.learningOutcome}
                  onChange={(value) => update('learningOutcome', value)}
                />
                {plan.targetRevisionId && (
                  <p className="text-sm text-muted-foreground">
                    The curriculum target fixes the subject, grade and learning outcome.{' '}
                    <Link to="/teacher/plans/new" className="font-medium text-primary underline">
                      Create a new plan
                    </Link>{' '}
                    to choose another target.
                  </p>
                )}
                <ListEditor
                  label="Objectives"
                  values={content.objectives}
                  onChange={(values) => update('objectives', values)}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Lesson sequence</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <ListEditor
                  label="Materials"
                  values={content.materials}
                  onChange={(values) => update('materials', values)}
                  allowEmpty
                />
                <TextAreaField
                  label="Starter"
                  value={content.starter}
                  onChange={(value) => update('starter', value)}
                />
                <ActivitiesEditor
                  activities={content.activities}
                  onChange={(activities) => update('activities', activities)}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Assessment</CardTitle>
              </CardHeader>
              <CardContent>
                <TextAreaField
                  label="Check for understanding"
                  value={content.checkForUnderstanding}
                  onChange={(value) => update('checkForUnderstanding', value)}
                />
              </CardContent>
            </Card>
          </fieldset>
        </div>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-lg backdrop-blur md:pl-64 md:pr-0">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-2 md:px-8">
            {(save.error || submit.error) && (
              <div role="alert" className="text-sm text-destructive">
                {save.error?.message ?? submit.error?.message ?? 'The plan could not be saved.'}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p role="status" aria-live="polite" className="text-sm font-medium">
                {hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
              </p>
              <div role="group" aria-label="Save and submit lesson plan" className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={save.isPending || submit.isPending}
                  onClick={() => {
                    const valid = validate()
                    if (valid) save.mutate(valid)
                  }}
                >
                  {save.isPending ? 'Saving…' : 'Save draft'}
                </Button>
                <Button
                  disabled={!viewer.availableActions.submit || submit.isPending || save.isPending}
                  onClick={() => {
                    const valid = validate()
                    if (valid) submit.mutate(valid)
                  }}
                >
                  {submit.isPending ? 'Submitting…' : 'Submit for review'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PlanDetailLayout>
  )
}

function withLatestVersion(versions: LessonPlanVersion[], plan: Plan): LessonPlanVersion[] {
  return [
    {
      version: plan.version,
      content: plan.content,
      createdBy: plan.teacherId,
      createdAt: plan.updatedAt,
    },
    ...versions.filter((version) => version.version !== plan.version),
  ].sort((a, b) => b.version - a.version)
}

function PlanContent({
  detail,
  sources,
  sourcesLoading,
  sourcesError,
}: {
  detail: Detail
  sources: CurriculumSource[]
  sourcesLoading: boolean
  sourcesError?: string
}) {
  const { plan } = detail
  const editable = detail.viewer.availableActions.edit

  return (
    <PlanDetailLayout
      detail={detail}
      sources={sources}
      sourcesLoading={sourcesLoading}
      sourcesError={sourcesError}
      backLink={
        <Link
          to="/teacher"
          className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Overview
        </Link>
      }
      headerAction={
        editable ? (
          <Link
            className={buttonVariants()}
            to="/teacher/plans/$planId/edit"
            params={{ planId: plan.id }}
          >
            Edit plan
          </Link>
        ) : undefined
      }
    >
      <div className="space-y-7">
        <Card>
          <CardHeader>
            <CardTitle>Learning goals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground">Learning outcome</h2>
              <p className="mt-2 leading-7">{plan.content.learningOutcome}</p>
            </section>
            <ListReadOnly label="Objectives" values={plan.content.objectives} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lesson sequence</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <ListReadOnly label="Materials" values={plan.content.materials} />
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground">Starter</h2>
              <p className="mt-2 whitespace-pre-wrap leading-7">{plan.content.starter}</p>
            </section>
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-muted-foreground">Activities</h2>
              <ol className="divide-y">
                {plan.content.activities.map((activity, index) => (
                  <li
                    key={`${activity.title}-${index}`}
                    className="flex gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">{activity.title}</h3>
                        <span className="text-sm text-muted-foreground">
                          {activity.durationMinutes} min
                        </span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap leading-7 text-muted-foreground">
                        {activity.description}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap leading-7">{plan.content.checkForUnderstanding}</p>
          </CardContent>
        </Card>
      </div>
    </PlanDetailLayout>
  )
}

function TextField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string
  value: string
  readOnly?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      <input
        className="h-10 w-full rounded-md border bg-background px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
function TextAreaField({
  label,
  value,
  onChange,
  readOnly = false,
}: {
  label: string
  value: string
  readOnly?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      {label}
      <textarea
        className="min-h-24 w-full rounded-md border bg-background p-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
function ListEditor({
  label,
  values,
  onChange,
  allowEmpty = false,
}: {
  label: string
  values: string[]
  onChange: (values: string[]) => void
  allowEmpty?: boolean
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      {values.map((value, index) => (
        <div key={`${label}-${index}`} className="flex gap-2">
          <input
            aria-label={`${label} item ${index + 1}`}
            className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
            value={value}
            onChange={(event) =>
              onChange(values.map((item, i) => (i === index ? event.target.value : item)))
            }
          />
          {allowEmpty || values.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={`Remove ${label.toLowerCase()} item ${index + 1}`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ''])}>
        Add item
      </Button>
    </fieldset>
  )
}
function ListReadOnly({ label, values }: { label: string; values: string[] }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
      <ul className="mt-2 list-inside list-disc space-y-1.5">
        {values.map((value, index) => (
          <li key={`${label}-${index}`} className="leading-6">
            {value}
          </li>
        ))}
      </ul>
    </section>
  )
}
function ActivitiesEditor({
  activities,
  onChange,
}: {
  activities: LessonPlanContent['activities']
  onChange: (activities: LessonPlanContent['activities']) => void
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-semibold">Activities</legend>
      {activities.map((activity, index) => (
        <div key={`activity-${index}`} className="space-y-3 rounded-lg bg-muted/50 p-4">
          <TextField
            label="Activity title"
            value={activity.title}
            onChange={(title) =>
              onChange(activities.map((item, i) => (i === index ? { ...item, title } : item)))
            }
          />
          <TextAreaField
            label="Description"
            value={activity.description}
            onChange={(description) =>
              onChange(activities.map((item, i) => (i === index ? { ...item, description } : item)))
            }
          />
          <label className="block space-y-1.5 text-sm font-medium">
            Duration (minutes)
            <input
              type="number"
              min={1}
              className="h-10 w-full rounded-md border bg-background px-3 sm:max-w-40"
              value={activity.durationMinutes}
              onChange={(event) =>
                onChange(
                  activities.map((item, i) =>
                    i === index ? { ...item, durationMinutes: Number(event.target.value) } : item,
                  ),
                )
              }
            />
          </label>
          {activities.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange(activities.filter((_, i) => i !== index))}
            >
              Remove activity
            </Button>
          )}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          onChange([...activities, { title: '', description: '', durationMinutes: 1 }])
        }
      >
        Add activity
      </Button>
    </fieldset>
  )
}
function ErrorMessage({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      {message}
    </p>
  )
}
