export const lessonPlanGenerationPrompt = {
  name: 'nova-lesson-plan-generate',
  config: { model: 'lesson-planner' },
  prompt: 'Return exactly one JSON object with no markdown and no extra keys. Shape: {"title":"string","subject":"string","grade":"string","learningOutcome":"string","durationMinutes":integer,"objectives":["string"],"materials":["string"],"starter":"string","activities":[{"title":"string","description":"string","durationMinutes":integer}],"checkForUnderstanding":"string","sources":[{"documentId":"UUID","chunkId":"UUID"}]}. Use positive integer activity durations that sum exactly to durationMinutes. Copy subject, grade, learningOutcome, and durationMinutes exactly from the selected outcome and request. Use the supplied curriculum material. Cite the chunk from the source marked defines_target. Each source documentId and chunkId pair must exactly match a supplied source; never invent IDs.',
} as const

export const lessonPlanRubricPrompt = {
  name: 'nova-lesson-plan-rubric-review',
  config: { model: 'lesson-planner' },
  prompt: 'Review the lesson plan across the six requested dimensions. Return one compact JSON object only: {"summary":"<=35 words","dimensions":[{"key":"exact requested key","score":1-4,"rationale":"<=35 words","evidence":[{"planPath":"top-level plan field","sourceChunkIds":["one supplied cited UUID"]}],"suggestions":["at most one concise action"]}]}. Include each key exactly once. Include exactly one evidence item and at most one sourceChunkId per dimension. Scores: 1 poor, 2 weak, 3 sound, 4 strong. Never repeat evidence or keys.',
} as const
