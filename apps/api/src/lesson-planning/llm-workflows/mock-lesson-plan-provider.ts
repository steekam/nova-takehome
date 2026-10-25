import { Injectable } from '@nestjs/common'
import type { LlmMockScenario } from '@nova/shared'
import type { LessonPlanCompletionRequest, LessonPlanProvider } from './llm-provider'
import { LessonPlanProviderFailure } from './llm-provider'
import { recordProviderAttempt } from './generation-telemetry'

@Injectable()
export class MockLessonPlanProvider implements LessonPlanProvider {
  async complete(
    request: LessonPlanCompletionRequest,
    _modelOverride?: string,
    scenario: LlmMockScenario = 'happy_path',
  ) {
    const startedAt = Date.now()
    if (scenario === 'connection_failure') {
      const durationMs = Date.now() - startedAt
      recordProviderAttempt({
        provider: 'mock',
        outcome: 'failure',
        durationMs,
        errorCode: 'LLM_PROVIDER_UNAVAILABLE',
      })
      throw new LessonPlanProviderFailure('mock', 'deterministic-mock', 1, {
        code: 'LLM_PROVIDER_UNAVAILABLE',
        message:
          'The mock provider is simulating an unavailable connection. No draft was saved; select another mock scenario or try again.',
      })
    }
    const inputText = requestPayload(request.user)
    if (request.system.includes('each rubric dimension exactly once')) {
      const input = JSON.parse(inputText) as {
        lessonPlan: { sources: Array<{ chunkId: string }> }
      }
      const keys = [
        'outcome_alignment',
        'objective_measurability',
        'activity_alignment',
        'assessment_quality',
        'pacing_feasibility',
        'source_support',
      ]
      const content = JSON.stringify({
        summary:
          'Mock rubric review: the plan has a usable structure. Replace mock mode with a live reviewer for evidence-based quality guidance.',
        dimensions: keys.map((key) => ({
          key,
          score: 3,
          rationale: 'Mock reviewer placeholder; no model assessment was performed.',
          evidence: [
            {
              planPath: 'learningOutcome',
              sourceChunkIds: input.lessonPlan.sources.map((source) => source.chunkId),
            },
          ],
          suggestions: ['Run a live rubric review for specific improvement guidance.'],
        })),
      })
      const durationMs = Date.now() - startedAt
      recordProviderAttempt({ provider: 'mock', outcome: 'success', durationMs })
      return {
        content,
        provider: 'mock',
        model: 'deterministic-mock',
        durationMs,
        providerAttempts: 1,
      }
    }
    const input = JSON.parse(inputText) as {
      outcome: {
        id: string
        title: string
        subject: string
        grade: string
        content: string
        locator: string
      }
      sources: Array<{ documentId: string; chunkId: string; role: string }>
      durationMinutes: number
    }
    const { outcome, sources, durationMinutes } = input
    const code = outcome.locator.match(/^\d+\.\d+/)?.[0] ?? ''
    const scaffold = lessonScaffolds[code] ?? lessonScaffolds['1.1']
    const splitAt = Math.max(1, Math.floor(durationMinutes / 2))
    const activities = durationMinutes === 1
      ? [{ title: scaffold.guidedTitle, description: scaffold.guidedActivity, durationMinutes: 1 }]
      : [
          {
            title: scaffold.guidedTitle,
            description: scaffold.guidedActivity,
            durationMinutes: splitAt,
          },
          {
            title: scaffold.independentTitle,
            description: `${scaffold.independentActivity} Record evidence for ${outcome.locator}.`,
            durationMinutes: durationMinutes - splitAt,
          },
        ]
    const generated = {
      title: `Mock plan: ${outcome.title}`,
      subject: outcome.subject,
      grade: outcome.grade,
      learningOutcome: outcome.content,
      durationMinutes,
      objectives: [`Use ${scaffold.evidence} to meet the selected outcome: ${outcome.content}`],
      materials: scaffold.materials,
      starter: scaffold.starter,
      activities,
      checkForUnderstanding: `${scaffold.check} Ask learners to connect their evidence to ${outcome.locator}: ${outcome.content}`,
      sources: sources.map((source) => ({
        documentId: source.documentId,
        chunkId: source.chunkId,
      })),
    }
    const output = JSON.stringify({
      ...generated,
      ...(scenario === 'invalid_output' ? { durationMinutes: durationMinutes + 1 } : {}),
    })
    const durationMs = Date.now() - startedAt
    recordProviderAttempt({ provider: 'mock', outcome: 'success', durationMs })
    return {
      content: output,
      provider: 'mock',
      model: 'deterministic-mock',
      durationMs,
      providerAttempts: 1,
    }
  }
}

const lessonScaffolds: Record<
  string,
  {
    materials: string[]
    starter: string
    guidedTitle: string
    guidedActivity: string
    independentTitle: string
    independentActivity: string
    evidence: string
    check: string
  }
> = {
  '1.1': {
    materials: ['Clean product labels', 'Counters or particle cards', 'Element-symbol and word-equation cards'],
    starter: 'Compare a clean packaging label with two particle models. Ask what evidence distinguishes an element from a compound.',
    guidedTitle: 'Model and classify',
    guidedActivity: 'In pairs, build or sort atom, molecule, element and compound models. Explain one choice using the model evidence.',
    independentTitle: 'Apply the chemistry language',
    independentActivity: 'Complete an outcome-matched label, symbol, use or word-equation task. Check names and symbols against the supplied reference cards.',
    evidence: 'a labelled model, symbol match, word equation or label-reading decision',
    check: 'Ask learners to justify one classification or written response with evidence from the model or label.',
  },
  '1.2': {
    materials: ['State-of-matter cards', 'Counters', 'Teacher-prepared melting and boiling observations'],
    starter: 'Show the same substance as a solid, liquid and gas. Ask learners to predict what changes in the particle model.',
    guidedTitle: 'Model particles and changes',
    guidedActivity: 'Use counters or diagrams to represent particle spacing and movement. Compare a physical change with a chemical change using observations.',
    independentTitle: 'Interpret evidence',
    independentActivity: 'Use the supplied observation cards or data to explain an impurity or change-of-state example. Do not handle hot substances.',
    evidence: 'a particle diagram, comparison table or explanation supported by observations',
    check: 'Ask learners to name the evidence that supports their classification or prediction.',
  },
  '1.3': {
    materials: ['Teacher-vetted fire-class guide', 'Scenario cards', 'Poster paper or response cards'],
    starter: 'Present a fictional fire scenario. Ask learners to identify a possible cause and one immediate safety concern.',
    guidedTitle: 'Reason through a safe scenario',
    guidedActivity: 'Use scenario cards to connect causes, the fire triangle, fire classes and safe control principles. No live-fire activity or equipment handling.',
    independentTitle: 'Explain a safe response',
    independentActivity: 'Prepare a short response or safety message for a new scenario, checking each action against the supplied guide and school procedure.',
    evidence: 'a correctly matched cause, risk and safe response',
    check: 'Ask learners which action is safe, what evidence supports it and what they must avoid doing.',
  },
  '2.1': {
    materials: ['Prepared plant and animal slides or enlarged cell images', 'Microscope if available', 'Drawing sheets'],
    starter: 'Show plant- and animal-cell images. Ask learners to name visible structures and identify what needs closer observation.',
    guidedTitle: 'Observe and label',
    guidedActivity: 'Observe a prepared slide or image, draw only visible structures, then use a vetted reference card to connect a component to its function.',
    independentTitle: 'Compare cell evidence',
    independentActivity: 'Complete an outcome-matched structure, function, comparison or magnification task. Use prepared material; do not collect learner body samples.',
    evidence: 'a labelled observation, structure-function match, comparison or shown calculation',
    check: 'Ask learners to distinguish an observed feature from one inferred from a reference.',
  },
  '2.2': {
    materials: ['Plant material', 'Visking tubing if available', 'Water, food colouring and clear containers'],
    starter: 'Show a drop of colouring spreading through water. Ask learners to predict how a concentration difference affects movement.',
    guidedTitle: 'Observe movement of materials',
    guidedActivity: 'Run a teacher-supervised diffusion or osmosis demonstration with plant material or tubing. Record starting conditions and observable change.',
    independentTitle: 'Explain the observation',
    independentActivity: 'Use the recorded evidence or a supplied diagram to explain the process and its role in a living thing.',
    evidence: 'a labelled setup, observation record and explanation linked to evidence',
    check: 'Ask learners to explain what moved, in which direction and what observation supports the explanation.',
  },
  '2.3': {
    materials: ['Age-appropriate health information cards', 'Fictional scenario cards', 'Reproductive-system diagrams'],
    starter: 'Use a fictional scenario or labelled diagram. Set respectful discussion rules and remind learners not to disclose personal experiences.',
    guidedTitle: 'Work with a fictional case',
    guidedActivity: 'Use vetted, age-appropriate information to sequence a process or identify a support and prevention choice. Keep questions private and discussion non-stigmatising.',
    independentTitle: 'Make a supported response',
    independentActivity: 'Complete a fictional planning, diagram or information task. Check claims against the supplied source and identify when trusted adult or health support is needed.',
    evidence: 'a correctly labelled sequence, evidence-based plan or respectful health-information response',
    check: 'Ask learners to justify their response from the information card and name an appropriate support route where relevant.',
  },
  '3.1': {
    materials: ['Energy-form and source cards', 'Low-voltage circuit kit or teacher demonstration', 'Observation sheet'],
    starter: 'Show a familiar device or energy-conversion picture. Ask learners to identify the energy entering and the useful change produced.',
    guidedTitle: 'Trace an energy change',
    guidedActivity: 'Sort forms from sources, then observe a safe teacher-led or low-voltage example. Record the starting form, transformation and evidence.',
    independentTitle: 'Apply and explain',
    independentActivity: 'Classify a new energy source or transformation example and state one relevant safety measure or day-to-day application.',
    evidence: 'a labelled energy pathway, justified classification or safety explanation',
    check: 'Ask learners to trace the energy change and identify evidence for each stage.',
  },
  '3.2': {
    materials: ['Light rectangular block', 'Sponge or damp sand tray', 'Teacher-prepared bottle with holes and water tray'],
    starter: 'Show a block resting on two different faces. Ask which face may make a deeper mark and what should stay constant in a fair comparison.',
    guidedTitle: 'Compare pressure safely',
    guidedActivity: 'Use a light block and soft surface to compare contact areas. Observe a teacher-prepared liquid-pressure demonstration; keep treatment qualitative.',
    independentTitle: 'Explain an application',
    independentActivity: 'Use a labelled sketch or everyday example to connect pressure with contact area, load or liquid depth. Record an observation before explaining it.',
    evidence: 'a fair comparison, labelled sketch or supported pressure explanation',
    check: 'Ask learners which factor changed, which stayed constant and how that supports the pressure explanation.',
  },
}

function requestPayload(user: string): string {
  const correctionStart = user.indexOf('\n\nValidation issues:')
  return correctionStart === -1 ? user : user.slice(0, correctionStart)
}
