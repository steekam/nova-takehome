import { LessonContentSchema } from './domain.js'
import type { CorpusChunk, LessonContent, Verification } from './domain.js'
import { fixtureForSources } from './corpus.js'

export function verify(raw: unknown, allowedChunks: CorpusChunk[], requestedDurationMinutes?: number): { content?: LessonContent; verification: Verification } {
  const fixture = fixtureForSources(allowedChunks)
  const { scenario } = fixture
  const requestedDuration = requestedDurationMinutes ?? scenario.durationMinutes
  const parsed = LessonContentSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      verification: {
        passed: false,
        checks: parsed.error.issues.map((issue) => ({
          code: 'OUTPUT_SCHEMA_INVALID', passed: false,
          message: `${issue.path.join('.') || '(root)'}: ${issue.message}`,
        })),
      },
    }
  }

  const content = parsed.data
  const checks: Verification['checks'] = []
  const allowedChunkIds = allowedChunks.map(({ id }) => id)
  const activityMinutes = content.activities.reduce((total, activity) => total + activity.durationMinutes, 0)
  checks.push({
    code: 'DURATION_MATCH', passed: content.durationMinutes === requestedDuration && activityMinutes === requestedDuration,
    message: `Plan duration is ${content.durationMinutes}m; activity total is ${activityMinutes}m; requested ${requestedDuration}m.`,
  })

  const objectiveIds = content.lessonObjectives.map((objective) => objective.id)
  const activityIds = content.activities.map((activity) => activity.id)
  const uniqueIds = new Set([...objectiveIds, ...activityIds, ...content.checksForUnderstanding.map((check) => check.id)])
  checks.push({
    code: 'UNIQUE_SECTION_IDS', passed: uniqueIds.size === objectiveIds.length + activityIds.length + content.checksForUnderstanding.length,
    message: 'Objective, activity, and check IDs must be unique.',
  })

  const allReferences = [
    ...content.lessonObjectives.flatMap((objective) => objective.sourceChunkIds),
    ...content.activities.flatMap((activity) => activity.sourceChunkIds),
    ...content.checksForUnderstanding.flatMap((check) => check.sourceChunkIds),
  ]
  checks.push({
    code: 'KNOWN_SOURCE_IDS', passed: allReferences.every((id) => allowedChunkIds.includes(id)),
    message: 'Every sourceChunkId must be one of the retrieved chunks.',
  })
  const citationLists = [
    ...content.lessonObjectives.map(({ sourceChunkIds }) => sourceChunkIds),
    ...content.activities.map(({ sourceChunkIds }) => sourceChunkIds),
    ...content.checksForUnderstanding.map(({ sourceChunkIds }) => sourceChunkIds),
  ]
  checks.push({
    code: 'UNIQUE_SOURCE_CITATIONS',
    passed: citationLists.every((sourceChunkIds) => new Set(sourceChunkIds).size === sourceChunkIds.length),
    message: 'Each section must cite a source chunk at most once.',
  })
  const targetChunk = allowedChunks.find((chunk) => chunk.kind === 'curriculum_target')
  checks.push({
    code: 'TARGET_GROUNDED', passed: targetChunk !== undefined
      && targetChunk.targetId === scenario.targetId
      && targetChunk.sourceReference?.sourceId === 'source-kicd-g8-integrated-science-july-2024'
      && content.lessonObjectives.some((objective) => objective.sourceChunkIds.includes(targetChunk.id)),
    message: 'At least one lesson objective must cite the selected KICD target revision and its source record.',
  })
  const objectiveText = content.lessonObjectives.map((objective) => objective.text.toLowerCase()).join(' ')
  checks.push({
    code: 'LESSON_OBJECTIVE_SCOPE',
    passed: fixture.id === 'particles'
      ? ['spacing', 'movement', 'particle size'].every((term) => objectiveText.includes(term)) && /same|unchanged|constant/.test(objectiveText)
      : ['physical', 'chemical', 'new substance'].every((term) => objectiveText.includes(term)),
    message: 'The lesson objective must cover the selected fixture focus; KICD wording and synthetic teaching choices remain distinct.',
  })
  checks.push({
    code: 'LESSON_FOCUS_GROUNDED', passed: content.lessonObjectives.some((objective) => objective.sourceChunkIds.includes(fixture.citationEvidence.lessonFocusChunkId)),
    message: 'The lesson objective must cite the synthetic teaching note that supports its teaching emphasis.',
  })
  checks.push({
    code: 'ACTIVITY_EVIDENCE_CITED',
    passed: content.activities.every((activity) => activity.sourceChunkIds.some((id) => allowedChunks.some((chunk) => chunk.id === id && chunk.kind !== 'curriculum_target'))),
    message: 'Every activity must cite at least one retrieved instructional or classroom guidance chunk; the curriculum target alone is insufficient.',
  })
  checks.push({
    code: 'MAIN_ACTIVITY_EVIDENCE_CITED',
    passed: content.activities.some((activity) => activity.kind === 'main' && activity.sourceChunkIds.includes(fixture.citationEvidence.mainActivityChunkId)),
    message: `The main activity must cite its fixture's teaching evidence (${fixture.citationEvidence.mainActivityChunkId}).`,
  })
  checks.push({
    code: 'ASSESSMENT_EVIDENCE_CITED',
    passed: content.checksForUnderstanding.every((check) => check.sourceChunkIds.includes(fixture.citationEvidence.assessmentChunkId)),
    message: `Every check for understanding must cite its fixture's assessment evidence (${fixture.citationEvidence.assessmentChunkId}).`,
  })
  checks.push({
    code: 'OBJECTIVE_LINKS', passed: content.activities.every((activity) => activity.objectiveIds.every((id) => objectiveIds.includes(id)))
      && content.checksForUnderstanding.every((check) => check.objectiveIds.every((id) => objectiveIds.includes(id))),
    message: 'Activities and checks must point to lesson objective IDs.',
  })
  checks.push({
    code: 'LESSON_PHASES', passed: content.activities.some((activity) => activity.kind === 'starter')
      && content.activities.some((activity) => activity.kind === 'closing'),
    message: 'Plan must include a starter and closing activity.',
  })
  checks.push({
    code: 'DEMO_PLAN_SHAPE', passed: content.lessonObjectives.length === 1
      && content.activities.length === 3
      && content.materials.length === 2
      && content.checksForUnderstanding.length === 1
      && content.differentiation.length === 1
      && content.safetyNotes.length === 1,
    message: 'Demo shape requires one objective, three activities, two materials, one check, one differentiation item, and one safety note.',
  })
  checks.push({
    code: 'DEMO_OBJECTIVE_ID', passed: content.lessonObjectives[0].id === fixture.objectiveId,
    message: `The fixture objective ID must be ${fixture.objectiveId}.`,
  })
  if (fixture.id === 'particles') {
    const assessmentPrompt = content.checksForUnderstanding[0].prompt.toLowerCase()
    checks.push({
      code: 'DEMO_ASSESSMENT_PROMPT',
      passed: ['two', 'compare', 'spacing', 'movement', 'select', 'solid', 'liquid', 'gas', 'close together', 'far apart', 'vibrate', 'slide past', 'move freely', 'particle size'].every((term) => assessmentPrompt.includes(term))
        && /all three (?:state )?diagrams/.test(assessmentPrompt)
        && /choos(?:e|es) two/.test(assessmentPrompt)
        && /same/.test(assessmentPrompt)
        && /larger/.test(assessmentPrompt)
        && /smaller/.test(assessmentPrompt)
        && /similar|different/.test(assessmentPrompt),
      message: 'Show all three diagrams, have each learner select two, and assess the selected pair\'s state, spacing, movement, and particle size with explicit choices.',
    })
    const expectedEvidence = content.checksForUnderstanding[0].expectedEvidence.toLowerCase()
    const label = String.raw`\s*(?:[:=—-]\s*)?`
    const completeRubric = new RegExp(String.raw`solid${label}[^.]*close[^.]*(?:vibrat|vibration)`).test(expectedEvidence)
      && new RegExp(String.raw`liquid${label}[^.]*close[^.]*(?:move past|slid(?:e|ing) past)`).test(expectedEvidence)
      && new RegExp(String.raw`gas${label}[^.]*far apart[^.]*(?:move freely|movement is free|moving freely)`).test(expectedEvidence)
      && /particle size[^.]*same/.test(expectedEvidence)
      && /(?:answer|reference) key/.test(expectedEvidence)
      && /misconception:/.test(expectedEvidence)
      && /correction:/.test(expectedEvidence)
    checks.push({
      code: 'DEMO_ASSESSMENT_RUBRIC', passed: completeRubric,
      message: 'Expected evidence must give a reference key for the selected diagrams, unchanged particle size, and a labeled misconception and correction.',
    })
    const scoring = content.checksForUnderstanding[0].scoringCriteria
    const diagramCriteria = ['state', 'spacing', 'movement'] as const
    const validScoring = 'perDiagram' in scoring && scoring.totalPoints === 9
      && scoring.perDiagram.pointsPerCriterion === 1
      && new Set(scoring.perDiagram.criteria).size === 3
      && diagramCriteria.every((criterion) => scoring.perDiagram.criteria.includes(criterion))
      && scoring.totalPoints === scoring.perDiagram.pointsPerCriterion * scoring.perDiagram.criteria.length * 2
        + scoring.particleSizeAcrossPair.points + scoring.spacingComparison.points + scoring.movementComparison.points
      && scoring.particleSizeAcrossPair.points === 1
      && scoring.particleSizeAcrossPair.expected === 'same'
      && scoring.spacingComparison.points === 1
      && scoring.spacingComparison.criterion === 'similar_or_different'
      && scoring.movementComparison.points === 1
      && scoring.movementComparison.criterion === 'compare_movement'
    checks.push({
      code: 'DEMO_ASSESSMENT_SCORING', passed: validScoring,
      message: 'Scoring criteria must cover each diagram, particle-size constancy across the pair, and both comparisons for 9 total points.',
    })
    const mainActions = content.activities.find((activity) => activity.kind === 'main')
    const comparisonText = mainActions ? `${mainActions.teacherActions} ${mainActions.learnerActions}`.toLowerCase() : ''
    const solidLiquidClose = /solid and liquid[^.]{0,60}(?:both[^.]{0,15})?(?:close together|closely spaced)/.test(comparisonText)
      || /liquid and solid[^.]{0,60}(?:both[^.]{0,15})?(?:close together|closely spaced)/.test(comparisonText)
    const gasFarApart = /gas[^.]{0,60}(?:far apart|widely spaced)/.test(comparisonText)
    checks.push({
      code: 'DEMO_COMPARISON_RULE', passed: solidLiquidClose && gasFarApart && /movement|move/.test(comparisonText),
      message: 'The main comparison must show shared close spacing for solids and liquids, wider spacing for gases, and compare movement.',
    })
  } else {
    checks.push(...verifyChangeProfile(content))
  }
  checks.push({
    code: 'DEMO_TIMING', passed: content.activities.map((activity) => activity.kind).join(',') === 'starter,main,closing'
      && content.activities.every((activity) => activity.durationMinutes > 0)
      && activityMinutes === requestedDuration,
    message: 'Demo activities must include one positive-duration starter, main activity, and closing that sum to the requested duration.',
  })
  const closingActions = content.activities.find((activity) => activity.kind === 'closing')
  const materials = content.materials.map((material) => `${material.name} ${material.notes}`).join(' ').toLowerCase()
  const closingText = closingActions ? `${closingActions.teacherActions} ${closingActions.learnerActions}`.toLowerCase() : ''
  checks.push({
    code: 'DEMO_INDIVIDUAL_RESPONSE',
    passed: /individual/.test(materials) && /response/.test(materials)
      && /\b(?:each|every|all)\s+(?:learner|student)s?\b/.test(closingText)
      && /shared|displayed/.test(closingText),
    message: 'The closing check needs an individual response tool for every learner while diagrams remain shared or displayed.',
  })
  const differentiation = content.differentiation.join(' ').toLowerCase()
  if (fixture.id === 'particles') checks.push({
    code: 'DEMO_ACCESSIBILITY_OPTION',
    passed: (differentiation.includes('nonvisual') || /without visual/.test(differentiation))
      && /non[- ]movement|without (?:visual(?: access)? or )?body movement/.test(differentiation)
      && /spoken|read aloud|static|select/.test(differentiation)
      && /every|all/.test(differentiation)
      && /closing|exit/.test(differentiation)
      && /two/.test(differentiation)
      && /descriptions/.test(differentiation)
      && /without visual|nonvisual/.test(differentiation),
    message: 'Differentiation must provide two equivalent spoken descriptions and static responses without visual or body movement for every diagram task, including closing.',
  })
  if (fixture.id === 'changes') checks.push({
    code: 'CHANGES_ACCESSIBILITY_OPTION',
    passed: /spoken/.test(differentiation) && /every|all/.test(differentiation) && /closing/.test(differentiation)
      && /without (?:requiring )?visual access or body movement/.test(differentiation),
    message: 'Every case task, including closing, needs equivalent spoken descriptions and a response option without visual access or body movement.',
  })
  const actionClauses = [
    ...content.activities.flatMap((activity) => `${activity.teacherActions} ${activity.learnerActions}`),
    ...content.safetyNotes,
  ].flatMap((text) => text.split(/[.!?;]+/))
  const unsafeActions = [
    /\b(?:heat|warm|boil)(?:s|ed|ing)?\s+(?:(?:the|a|an)\s+)?(?:water|sample|substance|material|liquid|it|mixture|solution|paper|wood|wax)\b/gi,
    /\b(?:heat|warm|boil)(?:s|ed|ing)?\s+(?:(?:the|a|an)\s+)?(?:water|sample|substance|material|liquid|it|mixture|solution)?\s*(?:on|over|with|using)\s+(?:(?:a|an|the|open)\s+)*(?:hotplate|burner|flames?|fire|candle|bunsen(?: burner)?)\b/gi,
    /\b(?:use|using|operate|operating|turn on|turning on|switch on|switching on|set up|setting up)\s+(?:(?:a|an|the|open|no)\s+)*(?:hotplate|burner|flames?|fire|candle|bunsen(?: burner)?)\b/gi,
    /\b(?:light|lighting|ignite|igniting)\s+(?:(?:a|an|the)\s+)*(?:flames?|fire|candle|burner|bunsen(?: burner)?)\b/gi,
    /\b(?:burn|burns|burned|burning)\s+(?:(?:the|a|an)\s+)?(?:water|sample|substance|material|paper|wood)\b/gi,
    /\b(?:require|requires|requiring|demonstrate|demonstrates|demonstrating)\s+heating\b/gi,
  ]
  const hasNearbyNegation = (clause: string, index: number) => {
    const prefix = clause.slice(Math.max(0, index - 24), index)
    return /\b(?:do\s+not|don't|never|avoid|without|no|not)(?:\s+\w+){0,2}\s*$/i.test(prefix)
  }
  const unsafe = actionClauses.some((clause) => {
    const detected = unsafeActions.flatMap((pattern) => [...clause.matchAll(pattern)].flatMap((match) =>
      match.index === undefined ? [] : [{ index: match.index, end: match.index + match[0].length }],
    )).sort((left, right) => left.index - right.index)
    const matches = detected.reduce<Array<{ index: number; end: number; text: string }>>((result, match) => {
      const previous = result.at(-1)
      if (previous && match.index < previous.end) {
        previous.end = Math.max(previous.end, match.end)
        previous.text = clause.slice(previous.index, previous.end)
      } else {
        result.push({ ...match, text: clause.slice(match.index, match.end) })
      }
      return result
    }, [])
    let previousNegatedEnd = -1
    for (const match of matches) {
      const gap = clause.slice(previousNegatedEnd, match.index)
      const sharedNegation = previousNegatedEnd >= 0 && /^\s*,?\s*(?:and|or|nor)\s*$/i.test(gap)
      const negated = hasNearbyNegation(clause, match.index) || sharedNegation || /\b(?:no|not|without)\b/i.test(match.text)
      if (!negated) return true
      previousNegatedEnd = Math.max(previousNegatedEnd, match.end)
    }
    return false
  })
  checks.push({ code: 'DEMO_SAFETY_RULE', passed: !unsafe, message: 'Plan must not require live flames or burning.' })
  return { content, verification: { passed: checks.every((check) => check.passed), checks } }
}

export function schemaIssues(raw: unknown): string[] {
  const result = LessonContentSchema.safeParse(raw)
  return result.success ? [] : result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
}

function verifyChangeProfile(content: LessonContent): Verification['checks'] {
  const check = content.checksForUnderstanding[0]
  const prompt = check.prompt.toLowerCase()
  const evidence = check.expectedEvidence.toLowerCase()
  const main = content.activities.find((activity) => activity.kind === 'main')
  const mainText = `${main?.teacherActions ?? ''} ${main?.learnerActions ?? ''}`.toLowerCase()
  const cases = [
    { name: 'melting ice', classification: 'physical', substance: 'no new substance' },
    { name: 'tearing paper', classification: 'physical', substance: 'no new substance' },
    { name: 'rusting iron', classification: 'chemical', substance: 'a new substance' },
    { name: 'cooking an egg', classification: 'chemical', substance: 'a new substance' },
  ]
  const scoring = check.scoringCriteria
  const correctCases = cases.every(({ name, classification, substance }) =>
    new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^.]{0,180}\\b${classification}\\b[^.]{0,80}\\b${substance.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(evidence))
  const scoringValid = 'perCase' in scoring && scoring.perCase.caseCount === 4
    && scoring.perCase.pointsPerCriterion === 1 && scoring.totalPoints === 8
    && new Set(scoring.perCase.criteria).size === 2
    && scoring.perCase.criteria.includes('classification') && scoring.perCase.criteria.includes('new_substance_evidence')
    && scoring.totalPoints === scoring.perCase.caseCount * scoring.perCase.criteria.length * scoring.perCase.pointsPerCriterion
  const allActions = content.activities.map(({ teacherActions, learnerActions }) => `${teacherActions} ${learnerActions}`).join(' ').toLowerCase()
  const liveCooking = /(?:cook|heat|burn|handle) (?:the |an? )?(?:egg|ice|iron|paper|sample)/.test(allActions)
  return [
    { code: 'CHANGES_ASSESSMENT_PROMPT', passed: cases.every(({ name }) => prompt.includes(name)) && ['physical', 'chemical', 'new substance', 'each'].every((term) => prompt.includes(term)), message: 'Each learner must classify all four named cases and state whether a new substance forms in each.' },
    { code: 'CHANGES_ASSESSMENT_KEY', passed: correctCases && /misconception:/.test(evidence) && /correction:/.test(evidence) && /revers/.test(evidence), message: 'The reference key must pair all four cases with correct classification and new-substance evidence, correcting the reversibility misconception.' },
    { code: 'CHANGES_ASSESSMENT_SCORING', passed: scoringValid, message: 'Score classification and new-substance evidence for four cases at one point each: eight total.' },
    { code: 'CHANGES_MAIN_CASES', passed: cases.every(({ name }) => mainText.includes(name)) && mainText.includes('new substance'), message: 'The main activity must practise all four cases using whether a new substance forms.' },
    { code: 'CHANGES_DESCRIBED_CASES_ONLY', passed: !liveCooking && /(?:do not|don't|never|avoid)[^.!?]{0,160}\b(?:heating|heat|cooking|cook|burning|burn|handling|handle)\b/i.test(content.safetyNotes.join(' ')), message: 'Use described cases only; no live heating, cooking, burning, or handling samples.' },
  ]
}
