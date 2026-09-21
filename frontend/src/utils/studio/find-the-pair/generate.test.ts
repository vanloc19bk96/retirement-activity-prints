import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioGenerateContext } from '@/types/studio-template.types'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { FIND_THE_PAIR_INSTRUCTIONS } from '@/constants/studio-phrasing'
import {
  runGeneratorContractTests,
  assertGeneratorEntropy,
} from '../studio-generator-test'
import { resetObjectCounter } from '../studio-fabric-builders'
import { clearStudioRecentContent } from '../studio-variety'
import { isDistinguishable } from '../matrix-reasoning/distractors'
import { isPrintable, type Figure } from '../matrix-reasoning/types'
import { STUDIO_ENTROPY_FLOOR_BITS } from '../_shared/uniqueness'
import { createRng } from '../studio-rng'
import { contentBox, measureHeaderHeight } from '../studio-layout'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import {
  buildFindThePairField,
  figureDistance,
  figureToken,
  findThePairCanonicalForm,
  findThePairPageEntropyBits,
  printableSpace,
} from './build'
import { fitPairField, MIN_PAIR_CELL } from './draw'
import { fieldBoxFor, findThePairEntropyBits, findThePairTemplate } from './generate'
import {
  FIND_THE_PAIR_TIERS,
  FIND_THE_PAIR_TIER_KEYS,
  PAIR_EXTRA_ATTRIBUTES,
  type PairExtraAttribute,
} from './types'

runGeneratorContractTests(findThePairTemplate)
assertGeneratorEntropy(findThePairTemplate)

/** Trims the library must survive, matching the card pack's print QA gate. */
const TRIMS: { label: string; ctx: Omit<StudioGenerateContext, 'seed' | 'instanceId'> }[] = [
  {
    label: '5 x 8 in',
    ctx: { pageWidth: 480, pageHeight: 768, margin: { top: 24, right: 24, bottom: 24, left: 72 } },
  },
  {
    label: '6 x 9 in',
    ctx: { pageWidth: 576, pageHeight: 864, margin: { top: 36, right: 36, bottom: 36, left: 84 } },
  },
  {
    label: '8.5 x 11 in',
    ctx: { pageWidth: 816, pageHeight: 1056, margin: { top: 48, right: 48, bottom: 48, left: 96 } },
  },
]

const EXTRA_SETS: PairExtraAttribute[][] = [[], ['count'], ['size'], ['count', 'size']]

function defaults(over: StudioConfig = {}): StudioConfig {
  return { ...buildDefaultConfig(findThePairTemplate), fontFamily: 'PT Serif', ...over }
}

describe('find-the-pair figure space', () => {
  it('only ever offers figures that survive print', () => {
    for (const extras of EXTRA_SETS) {
      for (const figure of printableSpace(extras)) {
        expect(isPrintable(figure), figureToken(figure)).toBe(true)
      }
    }
  })

  it('holds no two figures that would print alike', () => {
    for (const extras of EXTRA_SETS) {
      const space = printableSpace(extras)
      for (let i = 0; i < space.length; i++) {
        for (let j = i + 1; j < space.length; j++) {
          expect(
            isDistinguishable(space[i]!, space[j]!),
            `${figureToken(space[i]!)} vs ${figureToken(space[j]!)}`,
          ).toBe(true)
        }
      }
    }
  })

  /**
   * The size ladder is wide enough that nothing is pruned. If a later change to
   * SIZE_FACTOR narrows it, this fails rather than silently shrinking the space
   * under the largest field.
   */
  it('keeps every printable figure — the distinguishability prune removes none', () => {
    for (const extras of EXTRA_SETS) {
      const space = printableSpace(extras)
      const tokens = new Set(space.map(figureToken))
      expect(tokens.size).toBe(space.length)
    }
    expect(printableSpace([]).length).toBeGreaterThanOrEqual(51)
  })

  it('can fill the largest field with distinct figures at every setting', () => {
    const hardest = FIND_THE_PAIR_TIERS.hard
    for (const extras of EXTRA_SETS) {
      // 36 cells, 1 pair -> 35 distinct figures needed.
      expect(printableSpace(extras).length, extras.join('+') || 'base').toBeGreaterThanOrEqual(
        hardest.cells - 1,
      )
    }
  })
})

describe('find-the-pair field construction', () => {
  const cases = [
    { tier: 'warmup', cols: 4, rows: 4, pairCount: 1 },
    { tier: 'easy', cols: 6, rows: 4, pairCount: 1 },
    { tier: 'medium', cols: 6, rows: 5, pairCount: 2 },
    { tier: 'hard', cols: 6, rows: 6, pairCount: 4 },
  ] as const

  for (const scenario of cases) {
    describe(`${scenario.tier} (${scenario.cols}x${scenario.rows}, ${scenario.pairCount} pairs)`, () => {
      const fields = Array.from({ length: 40 }, (_, i) =>
        buildFindThePairField(createRng(1_000 + i * 7_919), {
          cols: scenario.cols,
          rows: scenario.rows,
          pairCount: scenario.pairCount,
          extras: ['count'],
          tier: FIND_THE_PAIR_TIERS[scenario.tier],
        }),
      )

      it('repeats exactly the twinned figures and nothing else', () => {
        for (const field of fields) {
          const counts = new Map<string, number>()
          for (const figure of field.cells) {
            const token = figureToken(figure)
            counts.set(token, (counts.get(token) ?? 0) + 1)
          }
          const repeated = [...counts.values()].filter((n) => n > 1)
          expect(repeated).toHaveLength(scenario.pairCount)
          // A figure printed three times would give the page two valid pairings.
          expect(repeated.every((n) => n === 2)).toBe(true)
        }
      })

      it('marks every repeat and only repeats', () => {
        for (const field of fields) {
          const counts = new Map<string, number>()
          for (const figure of field.cells) {
            const token = figureToken(figure)
            counts.set(token, (counts.get(token) ?? 0) + 1)
          }
          field.cells.forEach((figure, index) => {
            expect(field.marked[index]).toBe(counts.get(figureToken(figure))! > 1)
          })
          expect(field.marked.filter(Boolean)).toHaveLength(scenario.pairCount * 2)
        }
      })

      it('never prints two different figures that look alike', () => {
        for (const field of fields) {
          for (let i = 0; i < field.cells.length; i++) {
            for (let j = i + 1; j < field.cells.length; j++) {
              const a = field.cells[i]!
              const b = field.cells[j]!
              if (figureToken(a) === figureToken(b)) continue
              expect(isDistinguishable(a, b), `${figureToken(a)} vs ${figureToken(b)}`).toBe(true)
            }
          }
        }
      })

      it('keeps twins off each other row, column and neighbours', () => {
        let separated = 0
        for (const field of fields) {
          const byToken = new Map<string, number[]>()
          field.cells.forEach((figure, index) => {
            if (!field.marked[index]) return
            const token = figureToken(figure)
            byToken.set(token, [...(byToken.get(token) ?? []), index])
          })
          const ok = [...byToken.values()].every(([a, b]) => {
            const ar = Math.floor(a! / field.cols)
            const ac = a! % field.cols
            const br = Math.floor(b! / field.cols)
            const bc = b! % field.cols
            return ar !== br && ac !== bc
          })
          if (ok) separated++
        }
        // The constraint relaxes rather than looping forever, so this is a
        // strong-majority check, not an absolute one.
        expect(separated / fields.length).toBeGreaterThanOrEqual(0.9)
      })
    })
  }

  it('is deterministic for one seed and different across seeds', () => {
    const build = (seed: number) =>
      findThePairCanonicalForm(
        buildFindThePairField(createRng(seed), {
          cols: 6,
          rows: 5,
          pairCount: 1,
          extras: ['count'],
          tier: FIND_THE_PAIR_TIERS.medium,
        }),
      )
    expect(build(11)).toBe(build(11))
    const forms = new Set(Array.from({ length: 50 }, (_, i) => build(500 + i * 7_919)))
    expect(forms.size).toBe(50)
  })

  it('collapses a field turned ninety degrees onto the same canonical form', () => {
    const field = buildFindThePairField(createRng(31), {
      cols: 5,
      rows: 5,
      pairCount: 1,
      extras: ['count'],
      tier: FIND_THE_PAIR_TIERS.medium,
    })
    const rotated = {
      ...field,
      cells: Array.from({ length: 25 }, (_, i) => {
        const r = Math.floor(i / 5)
        const c = i % 5
        return field.cells[(5 - 1 - c) * 5 + r]!
      }),
    }
    expect(findThePairCanonicalForm(rotated)).toBe(findThePairCanonicalForm(field))
  })
})

describe('find-the-pair entropy (§4.5)', () => {
  it('clears the floor at every tier with the fixed figure space', () => {
    for (const tierKey of FIND_THE_PAIR_TIER_KEYS) {
      const tier = FIND_THE_PAIR_TIERS[tierKey]
      const cols = Math.max(3, Math.round(Math.sqrt(tier.cells)))
      const rows = Math.max(3, Math.round(tier.cells / cols))
      const bits = findThePairPageEntropyBits({
        cols,
        rows,
        pairCount: 1,
        extras: ['count'],
        tier,
      })
      expect(bits, tierKey).toBeGreaterThanOrEqual(STUDIO_ENTROPY_FLOOR_BITS)
    }
  })

  it('accepts every setting the form can reach', () => {
    for (const tier of FIND_THE_PAIR_TIER_KEYS) {
      for (const pairCount of [1, 2, 3, 4]) {
        const config = defaults({ tier, pairCount })
        expect(
          findThePairTemplate.validateConfig?.(config),
          `${tier} / ${pairCount} pairs`,
        ).toBeNull()
        expect(findThePairEntropyBits(config)).toBeGreaterThanOrEqual(STUDIO_ENTROPY_FLOOR_BITS)
      }
    }
  })
})

describe('find-the-pair print layout', () => {
  beforeEach(() => clearStudioRecentContent())

  for (const trim of TRIMS) {
    it(`prints a legible field at every tier on ${trim.label}`, () => {
      for (const [index, tier] of FIND_THE_PAIR_TIER_KEYS.entries()) {
        clearStudioRecentContent()
        resetObjectCounter()
        const ctx: StudioGenerateContext = {
          ...trim.ctx,
          seed: 4_000 + index,
          instanceId: `fit-${tier}`,
        }
        const pages = findThePairTemplate.generate(defaults({ tier }), ctx)
        // The field is one group; count what it actually holds. A page with
        // no field group at all means nothing legible fit, which is never
        // acceptable on a supported trim.
        const field = pages[0]!.objects.find((o) => o.type === 'group')
        expect(field, `${trim.label} ${tier}`).toBeDefined()
        const cells = FIND_THE_PAIR_TIERS[tier].cells
        // Every cell draws at least one shape, so the group cannot be
        // meaningfully emptier than the tier asked for.
        expect(field!.objects!.length, `${trim.label} ${tier}`).toBeGreaterThanOrEqual(
          Math.floor(cells * 0.6),
        )
      }
    })
  }

  it('never lays out a cell under the legibility floor', () => {
    for (const trim of TRIMS) {
      for (const tier of FIND_THE_PAIR_TIER_KEYS) {
        const body = {
          left: trim.ctx.margin.left,
          top: trim.ctx.margin.top + 140,
          width: trim.ctx.pageWidth - trim.ctx.margin.left - trim.ctx.margin.right - 44,
          height: trim.ctx.pageHeight - trim.ctx.margin.top - trim.ctx.margin.bottom - 160,
        }
        const fit = fitPairField(body, FIND_THE_PAIR_TIERS[tier].cells)
        expect(fit, `${trim.label} ${tier}`).not.toBeNull()
        expect(fit!.cell).toBeGreaterThanOrEqual(MIN_PAIR_CELL)
        expect(fit!.cols * fit!.rows).toBeLessThanOrEqual(FIND_THE_PAIR_TIERS[tier].cells)
      }
    }
  })
})

describe('find-the-pair phrasing', () => {
  /**
   * The field is measured against one instruction and printed under another.
   * If any variant builds a taller header than the one measured, the lattice
   * is pushed down into — or past — the bottom safe margin.
   */
  it('reserves a header band no instruction in the pool can outgrow', () => {
    for (const trim of TRIMS) {
      const ctx: StudioGenerateContext = { ...trim.ctx, seed: 1, instanceId: 'header' }
      const content = contentBox(ctx)
      const columnWidth = content.width - STUDIO_CONTENT_SAFE_INSET_X * 2
      const config = defaults()
      const body = fieldBoxFor(config, ctx)
      for (const text of Object.values(FIND_THE_PAIR_INSTRUCTIONS).flat()) {
        const headerHeight = measureHeaderHeight(config, text, columnWidth)
        expect(
          content.top + headerHeight,
          `${trim.label}: "${text.slice(0, 32)}…"`,
        ).toBeLessThanOrEqual(body.top)
      }
    }
  })

  it('prints one field size per tier, whatever instruction is drawn', () => {
    for (const tier of FIND_THE_PAIR_TIER_KEYS) {
      const shapes = new Set<string>()
      for (let seed = 0; seed < 16; seed++) {
        const ctx: StudioGenerateContext = {
          ...TRIMS[1]!.ctx,
          seed: 900 + seed * 7_919,
          instanceId: `size-${seed}`,
        }
        const fit = fitPairField(
          fieldBoxFor(defaults({ tier }), ctx),
          FIND_THE_PAIR_TIERS[tier].cells,
        )!
        shapes.add(`${fit.cols}x${fit.rows}@${fit.cell}`)
      }
      expect(shapes.size, tier).toBe(1)
    }
  })

  it('names the pair count honestly', () => {
    for (const text of FIND_THE_PAIR_INSTRUCTIONS.single!) {
      expect(text.toLowerCase(), text).not.toMatch(/\bpairs\b|\bevery (matching )?pair\b/)
    }
  })
})

describe('find-the-pair figure distance', () => {
  it('counts changed attributes', () => {
    const base: Figure = {
      shape: 'circle',
      count: 1,
      fill: 'hollow',
      size: 'medium',
      mark: 'none',
    }
    expect(figureDistance(base, base)).toBe(0)
    expect(figureDistance(base, { ...base, shape: 'square' })).toBe(1)
    expect(figureDistance(base, { ...base, shape: 'square', fill: 'solid' })).toBe(2)
  })

  it('grows the figure space when an extra attribute is opened', () => {
    for (const extra of PAIR_EXTRA_ATTRIBUTES) {
      expect(printableSpace([extra]).length).toBeGreaterThan(printableSpace([]).length)
    }
  })
})
