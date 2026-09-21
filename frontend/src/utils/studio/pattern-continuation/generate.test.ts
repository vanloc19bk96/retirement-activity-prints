import { describe, it, expect } from 'vitest'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import {
  STUDIO_ANSWER_INK,
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_CONTENT_SAFE_INSET_X,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import {
  STUDIO_TEST_CTX,
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentBox, drawHeader, insetHorizontal } from '../studio-layout'
import type {
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { letterSlotCount, patternContinuationTemplate } from './generate'
import { NUMBER_RULES } from './rules-number'
import { PATTERN_GROUPS, type PatternGroup } from './types'

const RULE_GROUP = new Map(NUMBER_RULES.map((rule) => [rule.id, rule.group]))
const ALL_GROUPS = PATTERN_GROUPS.map((group) => group.value)

/** Pattern type printed on each row; undefined for a letter row. */
function rowGroups(objects: StudioFabricObject[]): (PatternGroup | undefined)[] {
  return sequenceGroups(objects).map((row) => RULE_GROUP.get(String(row.data?.ruleId ?? '')))
}

const CTX = (): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
})

const base: Record<string, unknown> = {
  ...buildDefaultConfig(patternContinuationTemplate),
  seed: 42,
  fontFamily: 'Inter',
}

function flattenObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const o of objects) {
    out.push(o)
    if (o.type === 'group' && o.objects) {
      out.push(...flattenObjects(o.objects))
    }
  }
  return out
}

function puzzleGroup(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.type === 'group' && o.studioRole === 'structure')
}

function sequenceGroups(objects: StudioFabricObject[]): StudioFabricObject[] {
  const parent = puzzleGroup(objects)
  return (parent?.objects ?? []).filter((o) => o.type === 'group')
}

runGeneratorContractTests(patternContinuationTemplate)
assertGeneratorEntropy(patternContinuationTemplate, { seeds: 120 })
assertGeneratorEntropy(patternContinuationTemplate, {
  seeds: 120,
  configOverrides: { mode: 'letter', difficulty: 'easy' },
})

describe('pattern-continuation', () => {
  it('is deterministic', () => {
    resetObjectCounter()
    const a = patternContinuationTemplate.generate(base, CTX())
    resetObjectCounter()
    const b = patternContinuationTemplate.generate(base, CTX())
    expect(a).toEqual(b)
  })

  it('different seeds give different pages', () => {
    resetObjectCounter()
    const a = JSON.stringify(patternContinuationTemplate.generate(base, CTX()))
    resetObjectCounter()
    const b = JSON.stringify(
      patternContinuationTemplate.generate({ ...base, seed: 7 }, { ...CTX(), seed: 7 }),
    )
    expect(a).not.toEqual(b)
  })

  it('one or more hidden answers per item', () => {
    resetObjectCounter()
    const [page] = patternContinuationTemplate.generate(base, CTX())
    const answers = harvestAnswers(page!.objects)
    expect(answers.length).toBeGreaterThanOrEqual(Number(base.itemCount ?? 10))
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })

  it('groups each sequence, then the full table', () => {
    resetObjectCounter()
    const itemCount = 8
    const [page] = patternContinuationTemplate.generate(
      { ...base, itemCount },
      CTX(),
    )
    const parent = puzzleGroup(page!.objects)
    expect(parent).toBeDefined()
    const rows = sequenceGroups(page!.objects)
    expect(rows.length).toBe(itemCount)
    for (const row of rows) {
      const parts = row.objects ?? []
      expect(parts.some((o) => o.studioRole === 'prompt')).toBe(true)
      expect(parts.some((o) => o.studioRole === 'answer')).toBe(true)
    }
  })

  it('all modes generate without throwing', () => {
    for (const mode of ['number', 'letter', 'mixed'] as const) {
      resetObjectCounter()
      expect(() =>
        patternContinuationTemplate.generate({ ...base, mode }, CTX()),
      ).not.toThrow()
    }
  })

  it('never prints the same sequence twice on one sheet', () => {
    for (const mode of ['number', 'letter', 'mixed'] as const) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        for (let seed = 1; seed <= 60; seed++) {
          resetObjectCounter()
          const [page] = patternContinuationTemplate.generate(
            { ...base, mode, difficulty, itemCount: 15, seed },
            { ...CTX(), seed },
          )
          const rows = sequenceGroups(page!.objects)
          expect(rows.length).toBe(15)
          const sequences = rows.map((row) =>
            (row.objects ?? [])
              .filter((o) => o.studioRole === 'prompt')
              .map((o) => String(o.text))
              .join(','),
          )
          expect(new Set(sequences).size, `${mode}/${difficulty} seed ${seed}`).toBe(15)
        }
      }
    }
  })

  it('stays inside the safe margin at the densest settings', () => {
    // Longest sequences (hard) at the highest puzzle count on a real page.
    for (const mode of ['number', 'letter', 'mixed'] as const) {
      for (const showTitle of [false, true] as const) {
        for (let seed = 1; seed <= 20; seed++) {
          resetObjectCounter()
          const pages = patternContinuationTemplate.generate(
            {
              ...base,
              mode,
              difficulty: 'hard',
              itemCount: 15,
              blankPosition: 'mixed',
              showTitle,
              title: showTitle ? 'Game 1' : '',
              seed,
            },
            { ...STUDIO_TEST_CTX, seed },
          )
          for (const page of pages) {
            assertObjectsInSafeMargin(page.objects)
            assertObjectsInSafeMargin(page.answerSourceObjects ?? page.objects)
          }
        }
      }
    }
  })

  it('question and solution grids share the same size', () => {
    for (const showTitle of [false, true] as const) {
      for (const itemCount of [6, 10, 15] as const) {
        resetObjectCounter()
        const [page] = patternContinuationTemplate.generate(
          {
            ...base,
            showTitle,
            title: showTitle ? 'Game 1' : '',
            itemCount,
            difficulty: 'hard',
            seed: 11,
          },
          { ...STUDIO_TEST_CTX, seed: 11 },
        )
        const question = puzzleGroup(page!.objects)
        const solution = puzzleGroup(page!.answerSourceObjects ?? [])
        expect(question, `q missing title=${showTitle} n=${itemCount}`).toBeDefined()
        expect(solution, `a missing title=${showTitle} n=${itemCount}`).toBeDefined()
        expect(question!.width).toBeCloseTo(solution!.width ?? -1, 0)
        expect(question!.height).toBeCloseTo(solution!.height ?? -1, 0)
      }
    }
  })

  it('honours the pattern-type picker', () => {
    resetObjectCounter()
    const [page] = patternContinuationTemplate.generate(
      { ...base, difficulty: 'hard', patternTypes: ['special'] },
      CTX(),
    )
    const prompts = flattenObjects(page!.objects)
      .filter((o) => o.studioRole === 'prompt')
      .map((o) => Number(o.text))
    // "special" is primes only.
    const primes = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53])
    expect(prompts.every((n) => primes.has(n))).toBe(true)
  })

  it('generated pages only use rules from the selected pattern types', () => {
    const selections: PatternGroup[][] = [
      ['special'],
      ['recursive'],
      ['growing'],
      ['multiply'],
      ['recursive', 'interleaved', 'special'],
      ['add', 'multiply', 'figurate'],
      PATTERN_GROUPS.map((g) => g.value),
    ]
    for (const patternTypes of selections) {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        for (let seed = 1; seed <= 25; seed++) {
          resetObjectCounter()
          const [page] = patternContinuationTemplate.generate(
            {
              ...base,
              mode: 'number',
              difficulty,
              itemCount: 10,
              blankPosition: 'end',
              patternTypes,
              seed,
            },
            { ...CTX(), seed },
          )
          const ruleIds = sequenceGroups(page!.objects).map((row) =>
            String(row.data?.ruleId ?? ''),
          )
          expect(ruleIds.length).toBe(10)
          expect(ruleIds.every(Boolean), `${patternTypes}/${difficulty}/${seed}`).toBe(true)
          for (const ruleId of ruleIds) {
            const group = RULE_GROUP.get(ruleId)
            expect(
              group && patternTypes.includes(group),
              `${patternTypes}/${difficulty}/${seed}: leaked ${ruleId} (${group})`,
            ).toBe(true)
          }
          if (patternTypes.length === 1 && patternTypes[0] === 'multiply') {
            expect(
              ruleIds.every((id) => id !== 'affineStep'),
              `${difficulty}/${seed}: affineStep on multiply-only sheet`,
            ).toBe(true)
          }
        }
      }
    }
  })

  it('warns when puzzle count is below the selected pattern types', () => {
    const underCount = {
      ...base,
      itemCount: 4,
      patternTypes: ['add', 'multiply', 'growing', 'figurate', 'recursive'],
    }
    for (const key of ['itemCount', 'patternTypes'] as const) {
      const field = patternContinuationTemplate.configSchema.find((f) => f.key === key)
      expect(field?.warningWhen, key).toBeTypeOf('function')
      expect(field!.warningWhen!(underCount)).toMatch(/4 puzzles for 5 pattern types/)
      expect(
        field!.warningWhen!({
          ...base,
          itemCount: 7,
          patternTypes: [
            'add',
            'multiply',
            'growing',
            'figurate',
            'recursive',
            'interleaved',
            'special',
          ],
        }),
      ).toBeNull()
      expect(
        field!.warningWhen!({
          ...base,
          mode: 'letter',
          itemCount: 4,
          patternTypes: PATTERN_GROUPS.map((g) => g.value),
        }),
      ).toBeNull()
    }
  })

  // A ticked pattern type that never prints is a broken promise on a sheet the
  // seller is about to upload. These lock the guarantee across the whole option
  // space, not just the defaults.
  describe('pattern type coverage', () => {
    const SELECTIONS: PatternGroup[][] = [
      ALL_GROUPS,
      ['add', 'multiply', 'figurate', 'growing', 'recursive'],
      ['figurate', 'recursive', 'special'],
      ['multiply', 'figurate'],
      ['interleaved', 'special'],
      ['growing'],
    ]

    it('prints every selected type on every sheet', () => {
      for (const patternTypes of SELECTIONS) {
        for (const mode of ['number', 'mixed'] as const) {
          for (const blankPosition of ['end', 'random', 'mixed'] as const) {
            for (const difficulty of ['easy', 'medium', 'hard'] as const) {
              for (const itemCount of [7, 10, 15] as const) {
                if (itemCount < patternTypes.length) continue
                for (let seed = 1; seed <= 12; seed++) {
                  resetObjectCounter()
                  const [page] = patternContinuationTemplate.generate(
                    {
                      ...base,
                      mode,
                      blankPosition,
                      difficulty,
                      itemCount,
                      patternTypes,
                      seed,
                    },
                    { ...CTX(), seed },
                  )
                  const groups = rowGroups(page!.objects)
                  const label = `${patternTypes.join('+')}/${mode}/${blankPosition}/${difficulty}/n=${itemCount}/seed ${seed}`
                  expect(groups.length, label).toBe(itemCount)
                  for (const wanted of patternTypes) {
                    expect(groups.includes(wanted), `${label}: missing ${wanted}`).toBe(true)
                  }
                  // Coverage must never come at the cost of leaking a type.
                  for (const got of groups) {
                    if (got === undefined) {
                      expect(mode, `${label}: letter row on a number sheet`).toBe('mixed')
                      continue
                    }
                    expect(patternTypes.includes(got), `${label}: leaked ${got}`).toBe(true)
                  }
                }
              }
            }
          }
        }
      }
    }, 30_000)

    it('spreads the spare rows instead of stacking one type', () => {
      // 15 rows over 7 types: no type may take more than its round-robin share.
      for (let seed = 1; seed <= 40; seed++) {
        resetObjectCounter()
        const [page] = patternContinuationTemplate.generate(
          { ...base, itemCount: 15, patternTypes: ALL_GROUPS, seed },
          { ...CTX(), seed },
        )
        const tally = new Map<PatternGroup | undefined, number>()
        for (const group of rowGroups(page!.objects)) {
          tally.set(group, (tally.get(group) ?? 0) + 1)
        }
        const cap = Math.ceil(15 / ALL_GROUPS.length)
        for (const [group, count] of tally) {
          expect(count, `seed ${seed}: ${group} took ${count} rows`).toBeLessThanOrEqual(cap)
        }
      }
    })

    it('keeps letter rows on a mixed sheet that has room for them', () => {
      for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        for (const itemCount of [8, 10, 15] as const) {
          for (let seed = 1; seed <= 15; seed++) {
            resetObjectCounter()
            const [page] = patternContinuationTemplate.generate(
              { ...base, mode: 'mixed', difficulty, itemCount, patternTypes: ALL_GROUPS, seed },
              { ...CTX(), seed },
            )
            const groups = rowGroups(page!.objects)
            const letters = groups.filter((group) => group === undefined).length
            expect(letters, `${difficulty}/n=${itemCount}/seed ${seed}`).toBe(
              letterSlotCount(itemCount, ALL_GROUPS.length),
            )
          }
        }
      }
    })

    it('holds across a book-sized run of scattered seeds', () => {
      // Bulk and "Build a book" draw fresh random seeds per sheet; a per-sheet
      // guarantee is the only thing that makes a 60-page interior safe.
      for (let page = 0; page < 120; page++) {
        const seed = 1_000 + page * 7_919
        resetObjectCounter()
        const [sheet] = patternContinuationTemplate.generate(
          { ...base, difficulty: 'hard', blankPosition: 'mixed', itemCount: 9, seed },
          { ...CTX(), seed },
        )
        const groups = rowGroups(sheet!.objects)
        for (const wanted of ALL_GROUPS) {
          expect(groups.includes(wanted), `seed ${seed}: missing ${wanted}`).toBe(true)
        }
      }
    })

    it('reserves letter rows only out of the spare capacity', () => {
      expect(letterSlotCount(7, 7)).toBe(0)
      expect(letterSlotCount(8, 7)).toBe(1)
      expect(letterSlotCount(10, 7)).toBe(3)
      expect(letterSlotCount(15, 7)).toBe(6)
      expect(letterSlotCount(10, 2)).toBe(4)
    })
  })

  it('warns that a mixed sheet has no room for letter rows', () => {
    const field = patternContinuationTemplate.configSchema.find((f) => f.key === 'itemCount')
    expect(
      field!.warningWhen!({
        ...base,
        mode: 'mixed',
        itemCount: 7,
        patternTypes: ALL_GROUPS,
      }),
    ).toMatch(/no letter sequences/)
    expect(
      field!.warningWhen!({
        ...base,
        mode: 'mixed',
        itemCount: 8,
        patternTypes: ALL_GROUPS,
      }),
    ).toBeNull()
  })

  it('auto-adds a solution page (no form toggles)', () => {
    expect(patternContinuationTemplate.producesAnswerKey).toBe(true)
    const registered = getStudioTemplate('pattern-continuation')
    const regKeys = new Set(registered!.configSchema.map((f) => f.key))
    expect(regKeys.has('includeAnswerKey')).toBe(false)
    expect(regKeys.has('answerKeyForAll')).toBe(false)
  })

  it('answer key uses black ink, not blue', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('pattern-continuation')).toBe(true)
    resetObjectCounter()
    const [page] = patternContinuationTemplate.generate(base, CTX())
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const answers = harvestAnswers(keyObjects)
    expect(answers.length).toBeGreaterThan(0)
    const textAnswers = answers.filter((o) => o.type === 'textbox')
    expect(textAnswers.length).toBeGreaterThan(0)
    expect(textAnswers.every((o) => o.fill === STUDIO_ANSWER_INK_MONO)).toBe(true)
    expect(textAnswers.every((o) => o.fill !== STUDIO_ANSWER_INK)).toBe(true)
  })

  it('centers the grouped solution block in the key body', () => {
    resetObjectCounter()
    const config = { ...base, itemCount: 6, showTitle: true, title: 'Game 1' }
    const [page] = patternContinuationTemplate.generate(config, STUDIO_TEST_CTX)
    expect(page!.answerSourceObjects?.length).toBeGreaterThan(0)
    const keyObjects = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const parent = puzzleGroup(keyObjects)
    expect(parent).toBeDefined()
    const rows = sequenceGroups(keyObjects)
    expect(rows.length).toBe(6)

    const content = insetHorizontal(contentBox(STUDIO_TEST_CTX), STUDIO_CONTENT_SAFE_INSET_X)
    // Solution layout omits instruction + example — match that taller body.
    const header = drawHeader(
      content,
      config,
      { templateKey: 'pattern-continuation', instanceId: 'test-run', pageRole: 'single' },
      '',
    )
    const bodyCenterY = header.body.top + header.body.height / 2
    const bodyCenterX = header.body.left + header.body.width / 2
    const groupCenterY = (parent!.top ?? 0) + (parent!.height ?? 0) / 2
    const groupCenterX = (parent!.left ?? 0) + (parent!.width ?? 0) / 2
    expect(Math.abs(groupCenterY - bodyCenterY)).toBeLessThan(30)
    expect(Math.abs(groupCenterX - bodyCenterX)).toBeLessThan(30)
  })
})
