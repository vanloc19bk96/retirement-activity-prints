import { describe, expect, it } from 'vitest'
import { createRng } from '../studio-rng'
import { ALPHABETS } from './sequence'
import {
  buildRecallPuzzle,
  isValidRecallQuestion,
  maxRecallQuestionCount,
  pickRecallQuestions,
} from './recall-questions'

describe('isValidRecallQuestion', () => {
  // 0-based:        0    1    2    3    4    5    6    7
  // 1-based pos:    1    2    3    4    5    6    7    8
  const seq = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

  it('enforces target >= 3 (1-based), i.e. targetIndex >= 2', () => {
    const n = 2
    // targetIndex 0 / 1 are first two items — invalid
    expect(isValidRecallQuestion(seq, 2, n)).toBe(false) // target 0
    expect(isValidRecallQuestion(seq, 3, n)).toBe(false) // target 1
    // targetIndex 2 = 1-based position 3
    expect(isValidRecallQuestion(seq, 4, n)).toBe(true)
  })

  it('rejects when answer symbol equals anchor symbol', () => {
    const n = 2
    // target 2='C', anchor 4 — make anchor also 'C'
    const collided = ['A', 'B', 'C', 'D', 'C', 'F', 'G', 'H']
    expect(isValidRecallQuestion(collided, 4, n)).toBe(false)
    expect(
      isValidRecallQuestion(collided, 4, n, { requireSymbolDiff: false }),
    ).toBe(true)
  })

  it('rejects when answer symbol matches an adjacent symbol', () => {
    const n = 2
    // target 2='C', neighbor at 1 also 'C'
    const leftHit = ['A', 'C', 'C', 'D', 'E', 'F', 'G', 'H']
    expect(isValidRecallQuestion(leftHit, 4, n)).toBe(false)

    // target 2='C', neighbor at 3 also 'C'
    const rightHit = ['A', 'B', 'C', 'C', 'E', 'F', 'G', 'H']
    expect(isValidRecallQuestion(rightHit, 4, n)).toBe(false)

    expect(
      isValidRecallQuestion(leftHit, 4, n, { requireAdjacentDiff: false }),
    ).toBe(true)
  })
})

describe('pickRecallQuestions', () => {
  it('never duplicates anchors or targets', () => {
    const seq = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'A', 'B', 'C', 'D']
    const n = 2
    const questions = pickRecallQuestions(seq, n, 6, createRng(7))
    const anchors = questions.map((q) => q.anchorIndex)
    const targets = questions.map((q) => q.targetIndex)
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(new Set(targets).size).toBe(targets.length)
    for (const q of questions) {
      expect(q.targetIndex).toBe(q.anchorIndex - n)
      expect(q.targetIndex).toBeGreaterThanOrEqual(2)
    }
  })

  it('is deterministic for the same seed', () => {
    const seq = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'A', 'B', 'C', 'D']
    const a = pickRecallQuestions(seq, 2, 5, createRng(99))
    const b = pickRecallQuestions(seq, 2, 5, createRng(99))
    expect(a).toEqual(b)
  })
})

describe('buildRecallPuzzle', () => {
  it('is deterministic across two runs with the same seed', () => {
    const opts = {
      symbols: ALPHABETS.letters,
      seqLength: 12,
      n: 2,
      questionCount: 6,
      seed: 12345,
    }
    const a = buildRecallPuzzle(opts)
    const b = buildRecallPuzzle(opts)
    expect(a).toEqual(b)
    expect(a.questions.length).toBeGreaterThan(0)
    for (const q of a.questions) {
      expect(a.seq[q.targetIndex]).toBeDefined()
      expect(q.targetIndex).toBeGreaterThanOrEqual(2)
      // (a) + (e) always; (c)/(d) may be relaxed on hard seeds
      expect(q.targetIndex).toBe(q.anchorIndex - opts.n)
    }
    const anchors = a.questions.map((q) => q.anchorIndex)
    const targets = a.questions.map((q) => q.targetIndex)
    expect(new Set(anchors).size).toBe(anchors.length)
    expect(new Set(targets).size).toBe(targets.length)
  })

  it('caps distinct questions by sequence length and N', () => {
    expect(maxRecallQuestionCount(8, 3)).toBe(3)
    expect(maxRecallQuestionCount(8, 2)).toBe(4)
    expect(maxRecallQuestionCount(14, 2)).toBe(10)
  })

  it('handles min sequenceLength with max questionCount without throwing', () => {
    const maxDistinct = maxRecallQuestionCount(8, 3)
    expect(maxDistinct).toBe(3)

    const result = buildRecallPuzzle({
      symbols: ALPHABETS.shapes,
      seqLength: 8,
      n: 3,
      questionCount: 12,
      seed: 1,
    })

    expect(result.seq).toHaveLength(8)
    expect(result.questions.length).toBeGreaterThan(0)
    expect(result.questions.length).toBeLessThanOrEqual(maxDistinct)

    const anchors = new Set(result.questions.map((q) => q.anchorIndex))
    const targets = new Set(result.questions.map((q) => q.targetIndex))
    expect(anchors.size).toBe(result.questions.length)
    expect(targets.size).toBe(result.questions.length)
    for (const q of result.questions) {
      expect(q.targetIndex).toBeGreaterThanOrEqual(2)
      expect(q.anchorIndex).toBeLessThan(result.seq.length)
    }
  })
})
