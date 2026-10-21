import assert from 'node:assert/strict'
import test from 'node:test'
import { matchesRubricExpectation } from '../dist/workflow-cases.js'

const keys = [
  'outcome_alignment',
  'objective_measurability',
  'activity_alignment',
  'assessment_quality',
  'pacing_feasibility',
  'source_support',
]

function rubric(scores = [4, 3, 4, 3, 4, 4]) {
  return {
    status: 'completed',
    dimensions: keys.map((key, index) => ({ key, score: scores[index] })),
  }
}

test('rejects duplicate or missing rubric dimensions', () => {
  const duplicate = rubric()
  duplicate.dimensions[5].key = keys[0]
  assert.equal(matchesRubricExpectation({ band: 'strong' }, duplicate), false)
  assert.equal(
    matchesRubricExpectation(
      { band: 'strong' },
      { ...rubric(), dimensions: rubric().dimensions.slice(1) },
    ),
    false,
  )
})

test('rejects invalid rubric scores', () => {
  assert.equal(matchesRubricExpectation({ band: 'strong' }, rubric([4, 3, 4, 3, 4, 5])), false)
  assert.equal(matchesRubricExpectation({ band: 'strong' }, rubric([4, 3, 4, 3, 4, 1.5])), false)
})

test('matches declared rubric bands', () => {
  assert.equal(matchesRubricExpectation({ band: 'strong' }, rubric()), true)
  assert.equal(matchesRubricExpectation({ band: 'strong' }, rubric([3, 3, 3, 3, 3, 3])), false)
  assert.equal(matchesRubricExpectation({ band: 'borderline' }, rubric([3, 3, 3, 2, 2, 3])), true)
  assert.equal(matchesRubricExpectation({ band: 'weak' }, rubric([2, 2, 1, 1, 3, 1])), true)
  assert.equal(
    matchesRubricExpectation({ band: 'weak_source_support' }, rubric([4, 4, 4, 4, 4, 2])),
    true,
  )
  assert.equal(matchesRubricExpectation({ band: 'unknown' }, rubric()), false)
})
