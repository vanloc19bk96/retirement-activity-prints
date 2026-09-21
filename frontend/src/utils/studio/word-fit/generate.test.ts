import { describe, it, expect, beforeEach } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { WORD_FIT_INSTRUCTIONS } from '@/constants/studio-phrasing'
import {
  runGeneratorContractTests,
  assertGeneratorEntropy,
} from '../studio-generator-test'
import { resetObjectCounter } from '../studio-fabric-builders'
import { clearStudioRecentContent } from '../studio-variety'
import { harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { delta } from '../crossword/types'
import { STUDIO_ENTROPY_FLOOR_BITS } from '../_shared/uniqueness'
import { buildWordFitPuzzle, resolveWordFitPuzzle, wordFitCanonicalForm } from './build'
import { countFillings, nextStarterSlot } from './solver'
import { bankColumns } from './draw'
import {
  resolveWordCountMax,
  wordFitEntropyBits,
  wordFitPoolSize,
  wordFitTemplate,
} from './generate'
import {
  CUSTOM_THEME_MAX_LENGTH,
  drawSpreadWords,
  lengthLadder,
  numberBank,
  themedPool,
  WORD_FIT_MAX_LENGTH,
  WORD_FIT_MIN_LENGTH,
} from './words'
import {
  bankGlyphs,
  parseWordFitCount,
  WORD_FIT_STARTERS_MAX,
  type WordFitMode,
  type WordFitPuzzle,
} from './types'

runGeneratorContractTests(wordFitTemplate)
assertGeneratorEntropy(wordFitTemplate, { seeds: 40 })

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

const MODES: WordFitMode[] = ['themed', 'numbers']

function defaults(over: StudioConfig = {}): StudioConfig {
  return { ...buildDefaultConfig(wordFitTemplate), fontFamily: 'PT Serif', ...over }
}

/** Read each slot back out of the grid — what the reader actually sees. */
function slotWords(puzzle: WordFitPuzzle): string[] {
  return puzzle.slots.map((slot) => {
    const step = delta(slot.dir)
    let text = ''
    for (let i = 0; i < slot.length; i++) {
      text += puzzle.grid[slot.row + step.dr * i]![slot.col + step.dc * i] ?? '?'
    }
    return text
  })
}

function buildPuzzle(seed: number, mode: WordFitMode = 'themed', wordCount = 12) {
  return resolveWordFitPuzzle({
    mode,
    wordCount,
    starters: 1,
    // A 6x9 body prints comfortably more than this; the cap is what the page
    // would hand the packer, not a limit invented for the test.
    maxSize: 15,
    drawBank: (attempt) => {
      // XOR, not addition: `seed + attempt * stride` makes one seed's later
      // attempt identical to a later seed's first, which reads as a duplicate
      // puzzle when it is really a duplicate test.
      const rng = createRng((seed ^ (attempt * 0x9e3779b9)) >>> 0)
      const words =
        mode === 'numbers'
          ? numberBank(rng, wordCount, lengthLadder(wordCount))
          : drawSpreadWords(rng, themedPool('animals'), wordCount)
      return { rng, words }
    },
  })
}

describe('word-fit solver (§9.1 — the answer key is the only answer)', () => {
  /**
   * A skeleton of two three-letter slots that cross nothing, and a bank of two
   * three-letter words. Both fillings are valid — this is precisely the defect
   * the solver exists to catch, so it must report two.
   */
  it('counts an ambiguous skeleton as ambiguous', () => {
    const slots = [
      { id: 0, row: 0, col: 0, dir: 'across' as const, length: 3 },
      { id: 1, row: 2, col: 0, dir: 'across' as const, length: 3 },
    ]
    expect(
      countFillings({ slots, crossings: [], words: ['CAT', 'DOG'], fixed: new Map() }),
    ).toBe(2)
  })

  it('counts a pinned skeleton as unique', () => {
    const slots = [
      { id: 0, row: 0, col: 0, dir: 'across' as const, length: 3 },
      { id: 1, row: 2, col: 0, dir: 'across' as const, length: 3 },
    ]
    expect(
      countFillings({
        slots,
        crossings: [],
        words: ['CAT', 'DOG'],
        fixed: new Map([[0, 0]]),
      }),
    ).toBe(1)
  })

  it('honours crossing letters', () => {
    // Two across slots crossed by one down slot pinned to "AXE": only the
    // filling whose letters agree at the shared cells survives.
    const slots = [
      { id: 0, row: 0, col: 0, dir: 'across' as const, length: 3 },
      { id: 1, row: 2, col: 0, dir: 'across' as const, length: 3 },
      { id: 2, row: 0, col: 0, dir: 'down' as const, length: 3 },
    ]
    const crossings = [
      { a: 0, ai: 0, b: 2, bi: 0 },
      { a: 1, ai: 0, b: 2, bi: 2 },
    ]
    const count = countFillings({
      slots,
      crossings,
      words: ['ARC', 'EEL', 'AXE'],
      fixed: new Map(),
    })
    expect(count).toBe(1)
  })

  it('reports zero when the bank cannot fill the skeleton', () => {
    const slots = [{ id: 0, row: 0, col: 0, dir: 'across' as const, length: 5 }]
    expect(
      countFillings({ slots, crossings: [], words: ['CAT'], fixed: new Map() }),
    ).toBe(0)
  })

  it('picks a starter that has rivals to eliminate', () => {
    const slots = [
      { id: 0, row: 0, col: 0, dir: 'across' as const, length: 3 },
      { id: 1, row: 2, col: 0, dir: 'across' as const, length: 3 },
      { id: 2, row: 4, col: 0, dir: 'across' as const, length: 6 },
    ]
    const slot = nextStarterSlot({
      slots,
      crossings: [],
      words: ['CAT', 'DOG', 'BADGER'],
      fixed: new Map(),
    })
    // The six-letter slot is already unambiguous; revealing it would help nobody.
    expect(slot!.length).toBe(3)
  })
})

describe('word-fit construction', () => {
  for (const mode of MODES) {
    describe(mode, () => {
      const puzzles = Array.from({ length: 24 }, (_, i) => buildPuzzle(2_000 + i * 7_919, mode))

      it('always produces a printable grid', () => {
        expect(puzzles.every(Boolean)).toBe(true)
      })

      it('prints exactly one right answer', () => {
        for (const puzzle of puzzles) {
          const fixed = new Map(
            puzzle!.starters.map((slotId) => [slotId, puzzle!.assignment[slotId]!]),
          )
          expect(
            countFillings({
              slots: puzzle!.slots,
              crossings: puzzle!.crossings,
              words: puzzle!.words,
              fixed,
            }),
          ).toBe(1)
        }
      })

      it('uses every bank entry exactly once', () => {
        for (const puzzle of puzzles) {
          const used = [...puzzle!.assignment].sort((a, b) => a - b)
          expect(used).toEqual(puzzle!.words.map((_, i) => i))
        }
      })

      it('reads each slot back as the word the key claims', () => {
        for (const puzzle of puzzles) {
          slotWords(puzzle!).forEach((text, slotId) => {
            expect(text).toBe(puzzle!.words[puzzle!.assignment[slotId]!])
          })
        }
      })

      it('never reveals more starters than the cap', () => {
        for (const puzzle of puzzles) {
          expect(puzzle!.starters.length).toBeLessThanOrEqual(WORD_FIT_STARTERS_MAX)
        }
      })

      it('lists every bank entry in the printed groups', () => {
        for (const puzzle of puzzles) {
          const printed = bankColumns(puzzle!).flatMap((column) => column.entries)
          expect(printed.slice().sort()).toEqual(
            puzzle!.words.map((word) => bankGlyphs(puzzle!.mode, word)).sort(),
          )
        }
      })
    })
  }

  it('is deterministic for one seed and different across seeds', () => {
    expect(wordFitCanonicalForm(buildPuzzle(77)!)).toBe(
      wordFitCanonicalForm(buildPuzzle(77)!),
    )
    const forms = new Set(
      Array.from({ length: 30 }, (_, i) => wordFitCanonicalForm(buildPuzzle(3_000 + i * 7_919)!)),
    )
    expect(forms.size).toBe(30)
  })

  it('refuses a bank too small to interlock', () => {
    expect(
      buildWordFitPuzzle(createRng(5), {
        mode: 'themed',
        words: ['CAT', 'DOG'],
        wordCount: 2,
        starters: 1,
        maxSize: 15,
      }),
    ).toBeNull()
  })
})

describe('word-fit bare grid (starters: 0)', () => {
  /**
   * "Entries filled in to start: 0" is a promise, not a preference: the page
   * prints no hint at all. Uniqueness then has to come from the draw, so an
   * ambiguous bank is redrawn rather than rescued with a revealed word.
   */
  it('reveals nothing, and still ships only single-solution grids', () => {
    let built = 0
    for (let seed = 0; seed < 60; seed++) {
      const puzzle = resolveWordFitPuzzle({
        mode: 'themed',
        wordCount: 12,
        starters: 0,
        maxSize: 15,
        drawBank: (attempt) => {
          const rng = createRng((seed ^ (attempt * 0x9e3779b9)) >>> 0)
          return { rng, words: drawSpreadWords(rng, themedPool('animals'), 12) }
        },
      })
      if (!puzzle) continue
      built++
      expect(puzzle.starters).toEqual([])
      expect(
        countFillings({
          slots: puzzle.slots,
          crossings: puzzle.crossings,
          words: puzzle.words,
          fixed: new Map(),
        }),
      ).toBe(1)
    }
    // The widened draw budget must actually land pages, not only reject them.
    expect(built).toBeGreaterThan(0)
  })

  it('still produces a printable page and key with starters: 0', () => {
    for (let seed = 0; seed < 12; seed++) {
      clearStudioRecentContent()
      resetObjectCounter()
      const pages = wordFitTemplate.generate(defaults({ starters: 0 }), {
        ...TRIMS[1]!.ctx,
        seed: 4_000 + seed,
        instanceId: `bare-${seed}`,
      })
      const source = pages[0]!.answerSourceObjects ?? pages[0]!.objects
      // A key is still produced; it just isn't primed with a revealed word.
      expect(harvestAnswers(source).length).toBeGreaterThan(0)
    }
  })
})

describe('word-fit word sources', () => {
  it('keeps every entry inside the printable length band', () => {
    for (const pool of [themedPool('animals'), themedPool('food')]) {
      for (const word of pool) {
        expect(word.length).toBeGreaterThanOrEqual(WORD_FIT_MIN_LENGTH)
        expect(word.length).toBeLessThanOrEqual(WORD_FIT_MAX_LENGTH)
        expect(word).toMatch(/^[A-Z]+$/)
      }
    }
  })

  it('draws a spread of lengths rather than whatever the theme leans on', () => {
    const words = drawSpreadWords(createRng(9), themedPool('animals'), 14)
    expect(words).toHaveLength(14)
    const byLength = new Map<number, number>()
    for (const word of words) byLength.set(word.length, (byLength.get(word.length) ?? 0) + 1)
    // No single length may dominate — that is where ambiguity comes from.
    expect(Math.max(...byLength.values())).toBeLessThanOrEqual(6)
    expect(byLength.size).toBeGreaterThanOrEqual(3)
  })

  it('never leads a number with zero, and never repeats one', () => {
    for (let seed = 0; seed < 40; seed++) {
      const bank = numberBank(createRng(seed), 14, lengthLadder(14))
      expect(new Set(bank).size).toBe(bank.length)
      for (const entry of bank) {
        expect(bankGlyphs('numbers', entry)).not.toMatch(/^0/)
        expect(bankGlyphs('numbers', entry)).toMatch(/^[0-9]+$/)
      }
    }
  })
})

describe('word-fit entropy (§4.5)', () => {
  it('clears the floor in every mode at every word count', () => {
    for (const mode of MODES) {
      for (const wordCount of [8, 14, 18]) {
        const config = defaults({ mode, wordCount })
        expect(wordFitEntropyBits(config), `${mode}/${wordCount}`).toBeGreaterThanOrEqual(
          STUDIO_ENTROPY_FLOOR_BITS,
        )
        expect(wordFitTemplate.validateConfig?.(config)).toBeNull()
      }
    }
  })

  it('draws from a pool far larger than one page uses', () => {
    for (const mode of MODES) {
      const config = defaults({ mode })
      expect(wordFitPoolSize(config)).toBeGreaterThan(parseWordFitCount(config.wordCount) * 20)
    }
  })

  it('rejects a custom theme phrase longer than the cap', () => {
    const config = defaults({
      customTheme: true,
      customThemeText: 'x'.repeat(CUSTOM_THEME_MAX_LENGTH + 1),
    })
    const error = wordFitTemplate.validateConfig?.(config)
    expect(error).not.toBeNull()
    expect(error!.field).toBe('customThemeText')
  })

  it('accepts a blank custom theme — it falls back to the preset', () => {
    const config = defaults({ customTheme: true, customThemeText: '   ' })
    expect(wordFitTemplate.validateConfig?.(config)).toBeNull()
  })
})

describe('word-fit print layout', () => {
  beforeEach(() => clearStudioRecentContent())

  for (const trim of TRIMS) {
    it(`prints a grid, a bank and a key on ${trim.label}`, () => {
      for (const mode of MODES) {
        clearStudioRecentContent()
        resetObjectCounter()
        const ctx: StudioGenerateContext = {
          ...trim.ctx,
          seed: 6_000,
          instanceId: `fit-${mode}`,
        }
        const pages = wordFitTemplate.generate(
          defaults({ mode, wordCount: resolveWordCountMax({}, trim.ctx) }),
          ctx,
        )
        const figure = pages[0]!.objects.find((o) => o.type === 'group')
        expect(figure, `${trim.label} ${mode}`).toBeDefined()
        // Grid group plus bank group.
        expect(figure!.objects!.length, `${trim.label} ${mode}`).toBeGreaterThanOrEqual(2)

        const source = pages[0]!.answerSourceObjects ?? pages[0]!.objects
        expect(harvestAnswers(source).length, `${trim.label} ${mode} key`).toBeGreaterThan(0)
      }
    })
  }

  it('prints one grid size per setting, whatever instruction is drawn', () => {
    const sizes = new Set<string>()
    for (let seed = 0; seed < 12; seed++) {
      clearStudioRecentContent()
      resetObjectCounter()
      const pages = wordFitTemplate.generate(defaults(), {
        ...TRIMS[1]!.ctx,
        seed: 900,
        instanceId: `size-${seed}`,
      })
      const figure = pages[0]!.objects.find((o) => o.type === 'group')!
      sizes.add(`${Math.round(figure.top ?? 0)}`)
    }
    // Same seed, same settings: the header band cannot move between runs.
    expect(sizes.size).toBe(1)
  })
})

describe('word-fit phrasing', () => {
  it('never says "word" on a page of numbers', () => {
    for (const mode of ['numbers', 'numbersWithStarter'] as const) {
      for (const text of WORD_FIT_INSTRUCTIONS[mode]!) {
        expect(text.toLowerCase(), text).not.toMatch(/\bword|\bletter/)
      }
    }
  })

  /**
   * A page with no starter must never claim one. The reverse — a page that has
   * a starter and does not mention it — costs the reader nothing, so only the
   * direction that can mislead is asserted.
   */
  it('never promises a starter on a page that prints none', () => {
    for (const mode of ['words', 'numbers'] as const) {
      for (const text of WORD_FIT_INSTRUCTIONS[mode]!) {
        expect(text.toLowerCase(), text).not.toMatch(
          /filled in|already|starting|done for you|entered|foothold|to start you off/,
        )
      }
    }
  })

  it('keeps a separate pool for every mode the generator can select', () => {
    for (const mode of ['words', 'wordsWithStarter', 'numbers', 'numbersWithStarter']) {
      expect(WORD_FIT_INSTRUCTIONS[mode], mode).toBeDefined()
      expect(WORD_FIT_INSTRUCTIONS[mode]!.length, mode).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('word-fit custom theme switch', () => {
  const field = (key: string) => wordFitTemplate.configSchema.find((f) => f.key === key)!

  it('shows the preset dropdown only until the switch is turned on', () => {
    expect(field('theme').visibleWhen?.(defaults({ customTheme: false }))).toBe(true)
    expect(field('theme').visibleWhen?.(defaults({ customTheme: true }))).toBe(false)
  })

  it('shows the free-text box only while the switch is on and the mode is themed', () => {
    expect(field('customThemeText').visibleWhen?.(defaults({ customTheme: true }))).toBe(true)
    expect(field('customThemeText').visibleWhen?.(defaults({ customTheme: false }))).toBe(false)
    expect(
      field('customThemeText').visibleWhen?.(defaults({ mode: 'numbers', customTheme: true })),
    ).toBe(false)
  })

  it('drops the "words from every theme" option from the mode select', () => {
    const values = (field('mode').options ?? []).map((o) => o.value)
    expect(values).toEqual(['themed', 'numbers'])
  })

  it('still prints an offline grid from the preset when the switch is on', () => {
    // A typed custom theme steers only the fetch; with no bank fetched the page
    // must fall back to the preset pool, not to an empty one.
    clearStudioRecentContent()
    resetObjectCounter()
    const pages = wordFitTemplate.generate(
      defaults({ customTheme: true, customThemeText: 'tools in a garden shed' }),
      { ...TRIMS[1]!.ctx, seed: 7, instanceId: 'custom-theme-offline' },
    )
    const source = pages[0]!.answerSourceObjects ?? pages[0]!.objects
    expect(harvestAnswers(source).length).toBeGreaterThan(0)
  })
})

describe('word-fit AI bank (themed pages)', () => {
  beforeEach(() => {
    clearStudioRecentContent()
    resetObjectCounter()
  })

  /** A bank no bundled theme contains, so its presence proves where it came from. */
  const AI_BANK = [
    'ZORNIK', 'VELMAQ', 'BRIDLE', 'QUARTZ', 'PLINTH', 'FJORD',
    'GAMBIT', 'HALYARD', 'ICEBOX', 'JUNIPER', 'KESTREL', 'LANTERN',
    'MARLIN', 'NUTMEG', 'OBELISK', 'PARSNIP', 'QUILL', 'RAMPART',
  ]

  function ctxWith(remoteData: unknown, seed = 11): StudioGenerateContext {
    return { ...TRIMS[1]!.ctx, seed, instanceId: 'ai-run', remoteData }
  }

  function printedText(objects: readonly StudioFabricObject[]): string {
    const out: string[] = []
    const walk = (list: readonly StudioFabricObject[]) => {
      for (const obj of list) {
        if (typeof obj.text === 'string') out.push(obj.text)
        if (obj.objects) walk(obj.objects)
      }
    }
    walk(objects)
    return out.join(' ')
  }

  it('prints the fetched bank rather than the bundled theme', () => {
    const pages = wordFitTemplate.generate(defaults(), ctxWith({ items: AI_BANK }))
    const text = printedText(pages[0]!.objects)
    const fromBank = AI_BANK.filter((word) => text.includes(word))
    expect(fromBank.length, `printed: ${text.slice(0, 200)}`).toBeGreaterThanOrEqual(8)
  })

  it('falls back to the bundled theme when no bank was fetched', () => {
    // Every ship-blocking gate calls generate() with no remoteData at all, so
    // this path is what keeps the print-QA and reprint suites meaningful.
    const pages = wordFitTemplate.generate(defaults(), ctxWith(undefined))
    const text = printedText(pages[0]!.objects)
    const themed = new Set(themedPool('animals'))
    const printed = text.split(/\s+/).filter((word) => themed.has(word))
    expect(printed.length).toBeGreaterThan(0)
  })

  it('falls back when the fetched bank is too short to spread lengths', () => {
    const short = { items: AI_BANK.slice(0, 4) }
    const text = printedText(wordFitTemplate.generate(defaults(), ctxWith(short))[0]!.objects)
    expect(AI_BANK.slice(0, 4).every((word) => !text.includes(word))).toBe(true)
  })

  it('makes no request for the numbers mode, still sold as procedural (§5.4)', async () => {
    const signal = new AbortController().signal
    await expect(
      wordFitTemplate.prefetch!(defaults({ mode: 'numbers' }), signal),
    ).resolves.toBeUndefined()
  })
})
