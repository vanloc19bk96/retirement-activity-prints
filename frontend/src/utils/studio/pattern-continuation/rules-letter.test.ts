import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { LETTER_RULES, isLetterItemForced, pickLetterItem } from './rules-letter'
import type { BlankPosition, Difficulty } from './types'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']

function draw(difficulty: Difficulty, blankPosition: BlankPosition, seed: number) {
  return pickLetterItem({ difficulty, blankPosition }, createRng(seed))
}

describe('letter rules', () => {
  it('every eligible rule reaches the page', () => {
    for (const difficulty of DIFFICULTIES) {
      const seen = new Set<string>()
      for (let seed = 1; seed <= 2000; seed++) seen.add(draw(difficulty, 'end', seed).ruleId)
      for (const rule of LETTER_RULES.filter((r) => r.difficulties.includes(difficulty))) {
        expect(seen.has(rule.id), `${rule.id} never produced at ${difficulty}`).toBe(true)
      }
    }
  })

  it('the hidden term is forced by the shown terms', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const blankPosition of ['end', 'random', 'mixed'] as BlankPosition[]) {
        for (let seed = 1; seed <= 300; seed++) {
          const item = draw(difficulty, blankPosition, seed)
          expect(
            isLetterItemForced(item.terms, item.blankIndex),
            `${difficulty}/${blankPosition} seed ${seed}: ${item.terms.join(',')}`,
          ).toBe(true)
          expect(item.answerText).toBe(item.terms[item.blankIndex])
        }
      }
    }
  })

  it('only prints A–Z and digits', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 400; seed++) {
        for (const term of draw(difficulty, 'mixed', seed).terms) {
          expect(term).toMatch(/^[A-Z]+\d*$/)
        }
      }
    }
  })

  it('never repeats a sequence within one sheet', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let sheet = 0; sheet < 120; sheet++) {
        const used = new Set<string>()
        for (let i = 0; i < 15; i++) {
          pickLetterItem(
            { difficulty, blankPosition: 'mixed', used },
            createRng(1000 + sheet * 7919 + i * 31),
          )
        }
        expect(used.size, `${difficulty} sheet ${sheet}`).toBe(15)
      }
    }
  })

  it('flags wrap-past-Z only when a run actually wraps', () => {
    expect(isLetterItemForced(['A', 'C', 'E', 'G', 'I'], 4)).toBe(true)
    // Y, A, C, E reads as +2 with a wrap, not as a jump backwards.
    expect(isLetterItemForced(['Y', 'A', 'C', 'E', 'G'], 4)).toBe(true)
  })

  it('rejects a sequence whose blank is not pinned down', () => {
    // Two known terms cannot pin a step: A ? C is +1, but A ? E is not.
    expect(isLetterItemForced(['A', 'B', 'C'], 1)).toBe(false)
  })
})
