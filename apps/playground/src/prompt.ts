import { z } from 'zod'
import { retrievalQuery, fixtureForSources, getFixture } from './corpus.js'
import type { FixtureId } from './corpus.js'
import { LessonContentSchema, ParticleScoringSchema, ChangeScoringSchema } from './domain.js'
import type { CorpusChunk } from './domain.js'

export const PROMPT_VERSION = 'generate-lesson-v21'
export type JsonSchemaNode = { [key: string]: unknown }

export function lessonTiming(durationMinutes: number): { starter: number; main: number; closing: number; model: number; practice: number; compare: number; share: number } {
  if (!Number.isInteger(durationMinutes) || durationMinutes < 30 || durationMinutes > 60 || durationMinutes % 5 !== 0) {
    throw new Error('Lesson duration must be 30-60 minutes in 5-minute increments.')
  }
  const starter = 5
  const closing = Math.max(5, Math.floor((durationMinutes * 0.25) / 5) * 5)
  const main = durationMinutes - starter - closing
  const model = Math.max(1, Math.round(main * 0.12))
  const practice = Math.max(1, Math.round(main * 0.36))
  const compare = Math.max(1, Math.round(main * 0.4))
  return { starter, main, closing, model, practice, compare, share: main - model - practice - compare }
}

function durationGuidance(fixtureId: FixtureId, durationMinutes: number): string {
  const timing = lessonTiming(durationMinutes)
  const sequence = fixtureId === 'particles'
    ? 'Use the main activity to model one diagram, practise all states, compare a selected pair, and share one comparison.'
    : 'Use the main activity to model the new-substance rule, classify all four cases, compare evidence, and share a correction.'
  return `Return exactly one objective, three activities in this order (starter ${timing.starter}m, main ${timing.main}m, closing ${timing.closing}m), two materials, one check, one differentiation item, and one safety note. Keep each teacherActions and learnerActions field to one or two concise sentences. Total duration must be ${durationMinutes} minutes. Use this requested duration if a synthetic sample sequence gives another duration; adapt its activities while preserving the learning outcome.\n\n${sequence} In the main activity, model for ${timing.model} minutes, practise for ${timing.practice} minutes, compare for ${timing.compare} minutes, then share for ${timing.share} minutes.`
}

export function toStrictJsonSchema(input: JsonSchemaNode): JsonSchemaNode {
  const schema = JSON.parse(JSON.stringify(input)) as JsonSchemaNode
  const visit = (node: JsonSchemaNode): void => {
    delete node.default
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      if (Array.isArray(node[key])) for (const branch of node[key]) visit(branch as JsonSchemaNode)
    }
    if (typeof node.exclusiveMinimum === 'number') {
      node.minimum = node.exclusiveMinimum + 1
      delete node.exclusiveMinimum
    }
    if (node.type === 'object' && typeof node.properties === 'object' && node.properties !== null) {
      const properties = node.properties as JsonSchemaNode
      node.required = Object.keys(properties)
      node.additionalProperties = false
      for (const value of Object.values(properties)) visit(value as JsonSchemaNode)
    }
    if (node.type === 'array' && typeof node.items === 'object' && node.items !== null) {
      visit(node.items as JsonSchemaNode)
    }
  }
  visit(schema)
  return schema
}

export const outputSchema = toStrictJsonSchema(z.toJSONSchema(LessonContentSchema))

function schemaNodeAt(root: JsonSchemaNode, path: string[]): JsonSchemaNode {
  return path.reduce<JsonSchemaNode>((node, key) => node[key] as JsonSchemaNode, root)
}

function setEnum(root: JsonSchemaNode, path: string[], values: string[]): void {
  schemaNodeAt(root, path).enum = values
}

function setBounds(root: JsonSchemaNode, path: string[], minItems: number, maxItems: number): void {
  const node = schemaNodeAt(root, path)
  node.minItems = minItems
  node.maxItems = maxItems
}

export function outputSchemaFor(sources: CorpusChunk[]): JsonSchemaNode {
  const fixture = fixtureForSources(sources)
  const schema = JSON.parse(JSON.stringify(outputSchema)) as JsonSchemaNode
  const checkProperties = schemaNodeAt(schema, ['properties', 'checksForUnderstanding', 'items', 'properties'])
  checkProperties.scoringCriteria = toStrictJsonSchema(z.toJSONSchema(fixture.id === 'particles' ? ParticleScoringSchema : ChangeScoringSchema))
  const sourceIds = sources.map(({ id }) => id)
  const sourceItemPaths = [
    ['properties', 'lessonObjectives', 'items', 'properties', 'sourceChunkIds', 'items'],
    ['properties', 'activities', 'items', 'properties', 'sourceChunkIds', 'items'],
    ['properties', 'checksForUnderstanding', 'items', 'properties', 'sourceChunkIds', 'items'],
  ]
  for (const path of sourceItemPaths) setEnum(schema, path, sourceIds)
  setEnum(schema, ['properties', 'lessonObjectives', 'items', 'properties', 'id'], [fixture.objectiveId])
  setEnum(schema, ['properties', 'activities', 'items', 'properties', 'objectiveIds', 'items'], [fixture.objectiveId])
  setEnum(schema, ['properties', 'checksForUnderstanding', 'items', 'properties', 'objectiveIds', 'items'], [fixture.objectiveId])
  setBounds(schema, ['properties', 'lessonObjectives'], 1, 1)
  setBounds(schema, ['properties', 'activities'], 3, 3)
  setBounds(schema, ['properties', 'materials'], 2, 2)
  setBounds(schema, ['properties', 'checksForUnderstanding'], 1, 1)
  setBounds(schema, ['properties', 'differentiation'], 1, 1)
  setBounds(schema, ['properties', 'safetyNotes'], 1, 1)
  return schema
}

export function makePrompt(sources: CorpusChunk[], repairErrors: string[] = [], durationMinutes?: number): string {
  const fixture = fixtureForSources(sources)
  const requestedDuration = durationMinutes ?? fixture.scenario.durationMinutes
  if (fixture.id === 'changes') return makeChangePrompt(sources, repairErrors, requestedDuration)
  const schema = outputSchemaFor(sources)
  const repair = repairErrors.length > 0
    ? `\nFix these validation issues from your previous answer:\n${repairErrors.map((error) => `- ${error}`).join('\n')}\nUse objective-particles as the only objective ID. Copy citation IDs as literal strings from the enum values; never return numeric positions.`
    : ''
  return `Draft one teacher-editable lesson plan from the supplied evidence. Return one JSON object matching the JSON Schema below, with no markdown or text outside it.

This fixture combines one exact KICD learning outcome with synthetic supporting sources. The target's sourceReference identifies its authority and locator. The lessonFocus is a synthetic teaching emphasis, not official KICD wording. Use only the supplied evidence; do not invent curriculum claims or source IDs. Use the exact objective ID "objective-particles". Each sourceChunkIds value must be an exact string enum value in the schema, never a number or list position; for example, ["chunk-target-particles"]. Do not repeat a source ID within one sourceChunkIds list. Attach the target chunk to the objective. Cite synthetic teaching notes when using their particle-size emphasis, and do not attribute that emphasis to KICD. Every activity and check must cite supporting source IDs.

${durationGuidance(fixture.id, requestedDuration)}

Make the activities usable without teacher invention. In the starter, collect learners' first ideas before revealing the legend. For every particle diagram, specify the legend: same-size dots; solid dots close together with short vibration marks; liquid dots close together with arrows showing particles sliding past; gas dots far apart with arrows showing free movement. Give a spoken or tactile card option for each diagram task. Tactile cards must represent movement too: tap a counter in place for solid vibration, slide close counters for liquid, and move spaced counters freely for gas. Also give a distinct non-movement choice such as listening to spoken descriptions and selecting static cards; do not make counter movement the only accessible option.

In the main comparison, state that solid and liquid particles are both close together, gas particles are far apart, and movement differs among all three. Ask learners to describe where spacing is similar or different, then compare movement. Do not imply that every pair of states has different spacing.

The check must show all three state diagrams, then each learner chooses two to compare. The learner answers only for those two. Ask for each selected diagram's state, spacing, and movement, then ask once for the pair whether particle size stays the same, gets larger, or gets smaller across states. Selecting only a state name is insufficient. In the check prompt, list selectable choices explicitly: states solid, liquid, gas; spacing close together or far apart; movement vibrate around fixed positions, slide past one another, or move freely; particle size stays the same, gets larger, or gets smaller. Ask learners to state whether spacing is similar or different in their selected pair and name how movement differs between those two states. In expectedEvidence, give a reference answer key for all three states so the teacher can use only the entries matching the learner's two selected diagrams. State that particle size stays the same and label both parts: "Possible misconception: particles grow when a gas fills a container. Correction: a gas changing container shape does not mean each particle grows." Use the structured scoringCriteria object exactly: perDiagram has pointsPerCriterion 1 and criteria ["state", "spacing", "movement"]; particleSizeAcrossPair has points 1 and expected "same"; spacingComparison has points 1 and criterion "similar_or_different"; movementComparison has points 1 and criterion "compare_movement"; totalPoints is 9. The six perDiagram points score correct state, spacing, and movement for each of two selected diagrams. The three remaining points separately score particle size, whether spacing is similar or different, and a movement comparison that names how movement differs between the selected states. These comparison points do not require a separate written justification. Closing requires each learner to submit a simultaneous written, recorded, or selectable comparison covering state, spacing, movement, and particle size; do not rely on sequential oral responses. State that the diagrams remain shared or displayed and provide each learner an individual response sheet or equivalent. The lesson objective must reflect the official target and supplied lesson focus. Do not present synthetic lesson-focus details as KICD wording. Differentiation must say the spoken-description/static-card option provides two equivalent descriptions for the two selected diagrams, and is available for every diagram task, including closing, without visual or body movement. In each activity that offers this option, explicitly say learners can use it without visual access or body movement. Do not require heating, burning, or open flames; safetyNotes should state this constraint.

Scenario:
${JSON.stringify({ ...fixture.scenario, durationMinutes: requestedDuration, retrievalQuery })}

Allowed source chunks:
${JSON.stringify(sources.map(({ id, title, kind, text, targetId, sourceReference }) => ({ id, title, kind, text, targetId, sourceReference })))}

Allowed sourceChunkIds: ${JSON.stringify(sources.map(({ id }) => id))}

JSON Schema:
${JSON.stringify(schema)}
${repair}`
}

export function makePromptTemplate(fixtureId: FixtureId = 'particles'): string {
  const { chunks: fixture, scenario, retrievalQuery } = getFixture(fixtureId)
  const serializedSources = JSON.stringify(fixture.map(({ id, title, kind, text, targetId, sourceReference }) => ({ id, title, kind, text, targetId, sourceReference })))
  const serializedIds = JSON.stringify(fixture.map(({ id }) => id))
  const serializedScenario = JSON.stringify({ ...scenario, retrievalQuery })
  const serializedSchema = JSON.stringify(outputSchemaFor(fixture))
  return makePrompt(fixture)
    .replace(serializedScenario, '{{scenario}}')
    .replace(serializedSources, '{{allowed_source_chunks}}')
    .replace(serializedIds, '{{allowed_source_ids}}')
    .replace(serializedSchema, '{{json_schema}}')
    .replace(durationGuidance(fixtureId, scenario.durationMinutes), '{{duration_guidance}}')
    .replace(/\n$/, '\n{{repair}}')
}

export function renderPromptTemplate(template: string, sources: CorpusChunk[], repairErrors: string[] = [], durationMinutes?: number): string {
  const fixture = fixtureForSources(sources)
  const requestedDuration = durationMinutes ?? fixture.scenario.durationMinutes
  const { scenario, retrievalQuery, objectiveId } = fixture
  const schema = outputSchemaFor(sources)
  const repair = repairErrors.length > 0
    ? `\nFix these validation issues from your previous answer:\n${repairErrors.map((error) => `- ${error}`).join('\n')}\nUse ${objectiveId} as the only objective ID. Copy citation IDs as literal strings from the enum values; never return numeric positions.`
    : ''
  const values: Record<string, string> = {
    scenario: JSON.stringify({ ...scenario, durationMinutes: requestedDuration, retrievalQuery }),
    allowed_source_chunks: JSON.stringify(sources.map(({ id, title, kind, text, targetId, sourceReference }) => ({ id, title, kind, text, targetId, sourceReference }))),
    allowed_source_ids: JSON.stringify(sources.map(({ id }) => id)),
    json_schema: JSON.stringify(schema),
    repair,
    duration_guidance: durationGuidance(fixture.id, requestedDuration),
  }
  const requiredVariables = Object.keys(values)
  if (requiredVariables.some((name) => !template.includes(`{{${name}}}`))) {
    throw new Error(`Prompt template must include: ${requiredVariables.map((name) => `{{${name}}}`).join(', ')}.`)
  }
  return template.replace(/\{\{(scenario|allowed_source_chunks|allowed_source_ids|json_schema|repair|duration_guidance)\}\}/g, (_match, name: string) => values[name])
}

function makeChangePrompt(sources: CorpusChunk[], repairErrors: string[], durationMinutes: number): string {
  const fixture = fixtureForSources(sources)
  const repair = repairErrors.length ? `Fix these validation issues:\n${repairErrors.map((error) => `- ${error}`).join('\n')}` : ''
  return `Draft one teacher-editable CBC lesson plan from the supplied evidence. Return one JSON object matching the schema. This fixture combines an exact KICD outcome with clearly synthetic teaching cases and lead guidance. The four examples and eight-point rubric are local teaching choices, not KICD requirements. Cite only exact supplied chunk IDs; do not duplicate IDs in a citation list. Use objective-changes as the sole objective ID. Cite the target and teaching note on the objective. Every activity and check must cite its supporting sources.

${durationGuidance(fixture.id, durationMinutes)} The objective distinguishes physical and chemical changes using whether a new substance forms. Use these four cases throughout: melting ice (physical, no new substance), tearing paper (physical, no new substance), rusting iron (chemical, new substance), cooking an egg (chemical, new substance). Explain these are supplied case descriptions. Do not perform heating, cooking, burning, or handling rusting samples. Do not use reversibility as the sole classification test: tearing paper stays physical although difficult to reverse.

Starter collects first classifications before giving the rule. Closing keeps all case cards displayed or read aloud, gives each learner an individual response sheet or equivalent, and collects simultaneous written, recorded, or selectable answers for every case. State each case's evidence, including whether a new substance forms. Offer equivalent spoken descriptions and static or spoken response options for every task including closing, without visual access or body movement.

The check prompt must name all four cases and ask each learner to select physical or chemical and state whether a new substance forms for each case. Expected evidence must provide the four correct case-classification-evidence pairings, plus a labelled "Possible misconception:" and "Correction:" explaining that difficulty reversing tearing paper does not imply a chemical change. Use scoringCriteria: perCase has pointsPerCriterion 1, criteria ["classification", "new_substance_evidence"], caseCount 4; totalPoints 8. These points score classification and new-substance evidence for each of the four cases. Do not use particle-diagram scoring fields.

Scenario:
${JSON.stringify({ ...fixture.scenario, retrievalQuery: fixture.retrievalQuery })}

Allowed source chunks:
${JSON.stringify(sources.map(({ id, title, kind, text, targetId, sourceReference }) => ({ id, title, kind, text, targetId, sourceReference })))}

Allowed sourceChunkIds: ${JSON.stringify(sources.map(({ id }) => id))}

JSON Schema:
${JSON.stringify(outputSchemaFor(sources))}
${repair}
`
}
