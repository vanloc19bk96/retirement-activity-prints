import { describe, it, expect } from 'vitest'
import { createRng } from '../studio-rng'
import { isForced, solveMasked } from './families'
import {
  MAX_TERMS,
  NUMBER_RULES,
  eligibleNumberRules,
  pickNumberItem,
  sequenceLength,
} from './rules-number'
import { PATTERN_GROUPS, type BlankPosition, type Difficulty, type PatternGroup } from './types'

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const MAX_ABS: Record<Difficulty, number> = { easy: 120, medium: 999, hard: 9999 }
const ALL_GROUPS = PATTERN_GROUPS.map((g) => g.value) as PatternGroup[]
const RULE_GROUP = new Map(NUMBER_RULES.map((rule) => [rule.id, rule.group]))

function draw(difficulty: Difficulty, blankPosition: BlankPosition, seed: number) {
  return pickNumberItem({ difficulty, blankPosition }, createRng(seed))
}

function assertItemsMatchGroups(
  items: { ruleId: string }[],
  groups: readonly PatternGroup[],
  difficulty: Difficulty,
  label: string,
): void {
  const allowed = new Set(eligibleNumberRules(difficulty, groups).map((r) => r.id))
  expect(allowed.size, `${label}: empty eligible pool`).toBeGreaterThan(0)
  for (const item of items) {
    expect(allowed.has(item.ruleId), `${label}: leaked ${item.ruleId}`).toBe(true)
    expect(groups.includes(RULE_GROUP.get(item.ruleId)!), `${label}: ${item.ruleId}`).toBe(
      true,
    )
  }
}

describe('number rules', () => {
  it('every rule produces a sequence its own family solver can finish', () => {
    for (const rule of NUMBER_RULES) {
      for (const difficulty of rule.difficulties) {
        let forced = 0
        for (let seed = 1; seed <= 40; seed++) {
          const length = sequenceLength(rule, false)
          const seq = rule.generate(createRng(seed), difficulty, length)
          expect(seq).toHaveLength(length)
          expect(seq.every(Number.isFinite)).toBe(true)
          if (isForced(seq, seq.length - 1)) forced++
        }
        // Every rule must be solvable most of the time, else it is dead weight
        // that only burns sampler attempts.
        expect(
          forced,
          `${rule.id}/${difficulty} solvable in ${forced}/40 draws`,
        ).toBeGreaterThan(20)
      }
    }
  })

  it('no rule is longer than the sheet can lay out', () => {
    for (const rule of NUMBER_RULES) {
      expect(sequenceLength(rule, true)).toBeLessThanOrEqual(MAX_TERMS)
    }
  })

  /**
   * Regression: competing families used to match on too little evidence, so
   * every rule except plain arithmetic was rejected and never reached paper.
   */
  it('every eligible rule actually reaches the page', () => {
    for (const difficulty of DIFFICULTIES) {
      const eligible = eligibleNumberRules(difficulty)
      const seen = new Set<string>()
      for (let seed = 1; seed <= 3000; seed++) {
        seen.add(draw(difficulty, 'end', seed).ruleId)
      }
      for (const rule of eligible) {
        expect(seen.has(rule.id), `${rule.id} never produced at ${difficulty}`).toBe(true)
      }
    }
  })

  it('the printed answer is the only answer the families allow', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const blankPosition of ['end', 'random', 'mixed'] as BlankPosition[]) {
        for (let seed = 1; seed <= 300; seed++) {
          const item = draw(difficulty, blankPosition, seed)
          const seq = item.terms.map(Number)
          const masked = seq.map((value, i) => (i === item.blankIndex ? null : value))
          const solved = solveMasked(masked, item.blankIndex)
          expect(
            solved.value,
            `${difficulty}/${blankPosition} seed ${seed}: ${item.terms.join(',')}`,
          ).not.toBeNull()
          expect(solved.value).toBe(Number(item.answerText))
        }
      }
    }
  })

  it('keeps terms inside the printable range for the difficulty', () => {
    for (const difficulty of DIFFICULTIES) {
      for (let seed = 1; seed <= 400; seed++) {
        const item = draw(difficulty, 'mixed', seed)
        for (const term of item.terms) {
          const value = Number(term)
          expect(Number.isInteger(value)).toBe(true)
          expect(Math.abs(value)).toBeLessThanOrEqual(MAX_ABS[difficulty])
          if (difficulty === 'easy') expect(value).toBeGreaterThanOrEqual(0)
        }
      }
    }
  })

  it('honours the blank position', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const end = draw('hard', 'end', seed)
      expect(end.blankIndex).toBe(end.terms.length - 1)

      const random = draw('hard', 'random', seed)
      expect(random.blankIndex).toBeGreaterThanOrEqual(1)
      expect(random.blankIndex).toBeLessThanOrEqual(random.terms.length - 2)
    }
  })

  it('restricts to the selected pattern groups', () => {
    const groups = ['multiply'] as const
    const items = Array.from({ length: 300 }, (_, seed) =>
      pickNumberItem(
        { difficulty: 'hard', blankPosition: 'end', groups },
        createRng(seed + 1),
      ),
    )
    assertItemsMatchGroups(items, groups, 'hard', 'multiply-only')
    // Multiplying & dividing must stay pure ×/÷ — never ×m+k.
    expect(items.every((item) => item.ruleId !== 'affineStep')).toBe(true)
    expect(
      items.every((item) =>
        ['doubling', 'geometric', 'halving', 'multiplyGrowing'].includes(item.ruleId),
      ),
    ).toBe(true)
  })

  it('selected pattern types never leak unticked groups into output', () => {
    // Pure ×/÷ only under multiply — ×m+k belongs with growing (regression: multiply sheets).
    expect(RULE_GROUP.get('affineStep')).toBe('growing')
    expect(RULE_GROUP.get('multiplyGrowing')).toBe('multiply')
    expect(RULE_GROUP.get('fibonacci')).toBe('recursive')
    expect(eligibleNumberRules('hard', ['recursive']).map((r) => r.id)).toEqual(['fibonacci'])
    expect(eligibleNumberRules('hard', ['multiply']).map((r) => r.id).sort()).toEqual([
      'doubling',
      'geometric',
      'halving',
      'multiplyGrowing',
    ])
    expect(eligibleNumberRules('hard', ['growing']).map((r) => r.id).sort()).toEqual([
      'affineStep',
      'growingStep',
      'shrinkingStep',
    ])

    const selections: readonly PatternGroup[][] = [
      ...ALL_GROUPS.map((group) => [group]),
      // Exact UI case: multiply-only must stay free of ×m+k / growing-looking runs.
      ['multiply'],
      ['recursive', 'interleaved', 'special'],
      ['add', 'multiply'],
      ['figurate', 'growing'],
      ['special'],
      ALL_GROUPS,
    ]

    for (const difficulty of DIFFICULTIES) {
      for (const groups of selections) {
        for (const blankPosition of ['end', 'mixed'] as BlankPosition[]) {
          const used = new Set<string>()
          const ruleUsage = new Map<string, number>()
          const itemCount = 10
          const items = []
          for (let i = 0; i < itemCount; i++) {
            items.push(
              pickNumberItem(
                {
                  difficulty,
                  blankPosition,
                  groups,
                  used,
                  ruleUsage,
                  itemCount,
                },
                createRng(9000 + difficulty.length * 1000 + groups.length * 40 + i),
              ),
            )
          }
          // Also stress independent draws (fallback path).
          for (let seed = 1; seed <= 80; seed++) {
            items.push(
              pickNumberItem(
                { difficulty, blankPosition, groups, itemCount },
                createRng(12_000 + seed * 17 + groups.join('').length),
              ),
            )
          }
          assertItemsMatchGroups(
            items,
            groups,
            difficulty,
            `${difficulty}/${blankPosition}/${groups.join('+')}`,
          )
          // Unticked groups must be absent — not merely "allowed ids".
          const forbidden = ALL_GROUPS.filter((g) => !groups.includes(g))
          for (const item of items) {
            const group = RULE_GROUP.get(item.ruleId)
            expect(forbidden.includes(group as PatternGroup), item.ruleId).toBe(false)
          }
        }
      }
    }
  })

  it('every pattern group has at least one rule at every difficulty', () => {
    const groups = [
      'add',
      'multiply',
      'figurate',
      'growing',
      'recursive',
      'interleaved',
      'special',
    ] as const
    for (const difficulty of DIFFICULTIES) {
      for (const group of groups) {
        const rules = eligibleNumberRules(difficulty, [group])
        expect(rules.length, `${group}/${difficulty}`).toBeGreaterThan(0)
        expect(rules.every((rule) => rule.group === group)).toBe(true)
      }
    }
  })

  it('covers each selected pattern group when the sheet has enough puzzles', () => {
    const groups = [
      'add',
      'multiply',
      'figurate',
      'growing',
      'recursive',
      'interleaved',
      'special',
    ] as const
    for (const difficulty of DIFFICULTIES) {
      for (const itemCount of [groups.length, 10] as const) {
        let fullCoverage = 0
        let primesSheets = 0
        for (let sheet = 0; sheet < 40; sheet++) {
          const used = new Set<string>()
          const ruleUsage = new Map<string, number>()
          const seen = new Set<string>()
          let hasPrimes = false
          for (let i = 0; i < itemCount; i++) {
            const item = pickNumberItem(
              {
                difficulty,
                blankPosition: 'end',
                groups,
                used,
                ruleUsage,
                itemCount,
              },
              createRng(5000 + sheet * 97 + i * 13),
            )
            const rule = eligibleNumberRules(difficulty, groups).find((r) => r.id === item.ruleId)
            if (rule) seen.add(rule.group)
            if (item.ruleId === 'primes') hasPrimes = true
          }
          if (seen.size === groups.length) fullCoverage++
          if (hasPrimes) primesSheets++
        }
        // Least-used-group picking must land every type, including primes.
        expect(
          fullCoverage,
          `${difficulty}/${itemCount} full group coverage`,
        ).toBeGreaterThanOrEqual(38)
        expect(primesSheets, `${difficulty}/${itemCount} primes`).toBeGreaterThanOrEqual(38)
      }
    }
  })

  it('never repeats a sequence within one sheet', () => {
    for (const difficulty of DIFFICULTIES) {
      for (const blankPosition of ['end', 'random'] as BlankPosition[]) {
        for (let sheet = 0; sheet < 120; sheet++) {
          const used = new Set<string>()
          for (let i = 0; i < 15; i++) {
            pickNumberItem(
              { difficulty, blankPosition, used },
              createRng(1000 + sheet * 7919 + i * 31),
            )
          }
          expect(used.size, `${difficulty}/${blankPosition} sheet ${sheet}`).toBe(15)
        }
      }
    }
  })
})
