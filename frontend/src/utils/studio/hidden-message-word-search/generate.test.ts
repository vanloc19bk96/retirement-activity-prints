import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_RULE_LIGHT,
} from '@/constants/studio.constants'
import { countTokenReadings } from '@/utils/puzzles/word-search-core'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage } from '../studio-answer-key'
import { drawHeader } from '../studio-layout'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
  STUDIO_TEST_CTX,
} from '../studio-generator-test'
import { hiddenMessageWordSearchTemplate } from './generate'
import { validateHiddenMessageConfig } from './config'
import {
  HIDDEN_MESSAGE_DEFAULT_TITLE,
  normalizeMessage,
  poolCountFor,
  resolveTypedMessage,
  selectHiddenMessageWords,
  toBankDisplay,
  toneForSeed,
} from './content'
import {
  CELL_MIN,
  GRID_MAX_SIDE,
  MESSAGE_LABEL,
  GRID_MIN_SIDE,
  hiddenMessageContentBox,
  hiddenMessagePrintNote,
  LETTER_MIN,
  planHiddenMessagePage,
} from './layout'
import {
  DEFAULT_HIDDEN_MESSAGE_LEVEL_ID,
  HIDDEN_MESSAGE_LEVELS,
  hiddenMessageInstruction,
  parseHiddenMessageLevel,
} from './levels'
import { tryBuildHiddenMessagePuzzle, type HiddenMessagePuzzle } from './place'
import { runHiddenMessageKdpPreflight } from './kdp-preflight'
import { FIXTURE_MESSAGE, FIXTURE_WORDS, HIDDEN_MESSAGE_FIXTURE } from './fixture'

const remote = HIDDEN_MESSAGE_FIXTURE

const base: StudioConfig = {
  ...buildDefaultConfig(hiddenMessageWordSearchTemplate),
  seed: 42,
  fontFamily: 'PT Serif',
}

const CTX = (): StudioGenerateContext => ({ ...STUDIO_TEST_CTX, remoteData: remote })

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed,
  instanceId: 'kdp',
  remoteData: remote,
})

/** Trims every level is expected to lay out on. 5 x 8 is deliberately absent. */
const PRINTABLE_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [6, 9],
  [7, 10],
  [7.5, 9.25],
  [8.5, 11],
]

function flatten(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (list: StudioFabricObject[]) => {
    for (const obj of list) {
      out.push(obj)
      if (Array.isArray(obj.objects)) walk(obj.objects)
    }
  }
  walk(objects)
  return out
}

/** Grid letters are the single-character prompt glyphs; bank entries are runs. */
function gridLetters(objects: StudioFabricObject[]): StudioFabricObject[] {
  return flatten(objects).filter(
    (obj) => obj.studioRole === 'prompt' && String(obj.text ?? '').length === 1,
  )
}

function bankEntries(objects: StudioFabricObject[]): StudioFabricObject[] {
  return flatten(objects).filter(
    (obj) => obj.studioRole === 'prompt' && String(obj.text ?? '').length > 1,
  )
}

function planFor(config: StudioConfig, ctx: StudioGenerateContext) {
  const level = parseHiddenMessageLevel(config)
  return planHiddenMessagePage({
    page: ctx,
    config,
    instruction: hiddenMessageInstruction(config),
    level,
  })
}

function buildPuzzle(options: {
  levelId?: string
  ctx?: StudioGenerateContext
  message?: string
  seed?: number
}): { puzzle: HiddenMessagePuzzle; plan: NonNullable<ReturnType<typeof planFor>> } {
  const config = { ...base, level: options.levelId ?? DEFAULT_HIDDEN_MESSAGE_LEVEL_ID }
  const ctx = options.ctx ?? CTX()
  const level = parseHiddenMessageLevel(config)
  const plan = planFor(config, ctx)
  expect(plan, `no plan for ${level.id}`).not.toBeNull()
  const message = normalizeMessage(options.message ?? FIXTURE_MESSAGE, level)
  expect(message).not.toBeNull()
  const words = selectHiddenMessageWords(FIXTURE_WORDS, {
    level,
    maxLetters: plan!.maxWordLetters,
  })
  const puzzle = tryBuildHiddenMessagePuzzle({
    message: message!,
    words,
    level,
    gridSide: plan!.gridSide,
    maxWords: plan!.maxWords,
    seed: options.seed ?? 42,
  })
  expect(puzzle, `no puzzle for ${level.id}`).not.toBeNull()
  return { puzzle: puzzle!, plan: plan! }
}

runGeneratorContractTests(hiddenMessageWordSearchTemplate, {
  contextOverrides: { remoteData: remote },
})
assertGeneratorEntropy(hiddenMessageWordSearchTemplate, {
  contextOverrides: { remoteData: remote },
  seeds: 12,
})

describe('hidden-message-word-search form', () => {
  it('asks three questions, and the third is optional', () => {
    const keys = hiddenMessageWordSearchTemplate.configSchema.map((field) => field.key)
    expect(keys).toEqual(['theme', 'customTheme', 'level', 'customMessage'])
    // The retired form's fields must not come back by accident.
    for (const gone of ['wordsFrom', 'presetThemeId', 'difficulty', 'printStyle', 'tone']) {
      expect(keys).not.toContain(gone)
    }
  })

  it('defaults to mixed themes, the classic level and no typed message', () => {
    const defaults = buildDefaultConfig(hiddenMessageWordSearchTemplate)
    expect(defaults.theme).toBe('mixed')
    expect(defaults.level).toBe(DEFAULT_HIDDEN_MESSAGE_LEVEL_ID)
    expect(defaults.customMessage).toBe('')
    expect(validateHiddenMessageConfig(defaults)).toBeNull()
  })

  it('accepts a blank message and rejects one this level cannot hide', () => {
    expect(validateHiddenMessageConfig({ ...base, customMessage: '' })).toBeNull()
    expect(validateHiddenMessageConfig({ ...base, customMessage: FIXTURE_MESSAGE })).toBeNull()
    // Classic hides 18–28 letters. Eight is too few, forty too many.
    expect(validateHiddenMessageConfig({ ...base, customMessage: 'Too short' })).not.toBeNull()
    expect(
      validateHiddenMessageConfig({ ...base, customMessage: 'A'.repeat(40) }),
    ).not.toBeNull()
  })

  it('ignores a message left behind by the retired mode switch', () => {
    // A sheet saved under the old form with "A theme" selected still carries
    // whatever was typed into the custom-saying box before the seller changed
    // their mind. Under the new form it must stay ignored, not start printing.
    const legacy = { ...base, wordsFrom: 'theme', customMessage: 'STALE SAYING FROM BEFORE' }
    expect(resolveTypedMessage(legacy)).toBe('')
    expect(validateHiddenMessageConfig(legacy)).toBeNull()

    const legacyCustom = { ...base, wordsFrom: 'custom-saying', customMessage: FIXTURE_MESSAGE }
    expect(resolveTypedMessage(legacyCustom)).toBe(FIXTURE_MESSAGE)
    // A config saved under the new form has no switch at all.
    expect(resolveTypedMessage({ ...base, customMessage: FIXTURE_MESSAGE })).toBe(FIXTURE_MESSAGE)
  })

  it('carries legacy difficulty and print style onto the level ladder', () => {
    expect(parseHiddenMessageLevel({ difficulty: 'easy' }).id).toBe('gentle')
    expect(parseHiddenMessageLevel({ difficulty: 'medium' }).id).toBe('classic')
    expect(parseHiddenMessageLevel({ difficulty: 'hard' }).id).toBe('challenging')
    expect(parseHiddenMessageLevel({}).id).toBe(DEFAULT_HIDDEN_MESSAGE_LEVEL_ID)
  })

  it('requires a typed theme only when the theme picker asks for one', () => {
    expect(validateHiddenMessageConfig({ ...base, theme: 'custom', customTheme: '' })).not.toBeNull()
    expect(
      validateHiddenMessageConfig({ ...base, theme: 'custom', customTheme: 'Weekends' }),
    ).toBeNull()
    expect(validateHiddenMessageConfig({ ...base, theme: 'gardening' })).toBeNull()
  })

  it('reports the real grid, letter size and saying length for the page in Settings', () => {
    const level = parseHiddenMessageLevel(base)
    const ctx = kdpCtx(7.5, 9.25)
    const plan = planFor(base, ctx)!
    const note = hiddenMessagePrintNote(level, ctx, base, hiddenMessageInstruction(base))
    expect(note).toContain(`${plan.gridSide} × ${plan.gridSide}`)
    expect(note).toContain(`${plan.maxWords} words`)
    expect(note).toContain(`${level.minMessageLetters}–${level.maxMessageLetters}`)
  })

  it('offers a gentler level only when a gentler level actually fits', () => {
    const gentle = HIDDEN_MESSAGE_LEVELS[0]!
    const challenging = HIDDEN_MESSAGE_LEVELS.find((level) => level.id === 'challenging')!

    // 5.5 x 8.5 with a heading holds a gentle page but not a challenging one,
    // so the level is the lever worth naming.
    const small = kdpCtx(5.5, 8.5)
    const hard = hiddenMessagePrintNote(
      challenging,
      small,
      { ...base, level: 'challenging', title: 'Game 1' },
      challenging.instruction,
    )
    expect(hard).toContain('gentler level')

    // 5 x 8 with a heading holds none of them. Sending a seller to a gentler
    // level here is a loop that ends where it started.
    const tiny = kdpCtx(5, 8)
    const note = hiddenMessagePrintNote(
      gentle,
      tiny,
      { ...base, level: 'gentle', title: 'Game 1' },
      gentle.instruction,
    )
    expect(note).toContain('larger page')
    expect(note).not.toContain('gentler level')
  })
})

describe('hidden-message-word-search layout', () => {
  it.each(PRINTABLE_TRIMS)('plans a large-print page on %s x %s', (wIn, hIn) => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      for (const title of ['', 'Game 1']) {
        const config = { ...base, level: level.id, title }
        const plan = planFor(config, kdpCtx(wIn, hIn))
        expect(plan, `${level.id} ${wIn}x${hIn} title=${title}`).not.toBeNull()
        expect(plan!.cell).toBeGreaterThanOrEqual(CELL_MIN)
        expect(plan!.letterFont).toBeGreaterThanOrEqual(LETTER_MIN)
        expect(plan!.gridSide).toBeGreaterThanOrEqual(GRID_MIN_SIDE)
        expect(plan!.gridSide).toBeLessThanOrEqual(GRID_MAX_SIDE)
        expect(plan!.maxWords).toBeGreaterThanOrEqual(level.minWords)
        expect(plan!.maxWordLetters).toBeLessThanOrEqual(plan!.gridSide)
      }
    }
  })

  it('grows the grid with the page rather than reprinting one size everywhere', () => {
    const small = planFor(base, kdpCtx(6, 9))!
    const large = planFor(base, kdpCtx(8.5, 11))!
    expect(large.gridSide).toBeGreaterThanOrEqual(small.gridSide)
    expect(large.cell).toBeGreaterThan(small.cell)
  })

  it('refuses a page it cannot set at large print instead of shrinking the type', () => {
    const tiny = {
      pageWidth: Math.round(5 * DPI),
      pageHeight: Math.round(8 * DPI),
      margin: STUDIO_TEST_CTX.margin,
    }
    const level = parseHiddenMessageLevel({ ...base, level: 'challenging' })
    expect(
      planHiddenMessagePage({
        page: tiny,
        config: { ...base, level: 'challenging', title: 'Game 1' },
        instruction: level.instruction,
        level,
      }),
    ).toBeNull()
  })
})

describe('hidden-message-word-search puzzle', () => {
  it('is registered as monochrome answer ink', () => {
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('hidden-message-word-search')).toBe(true)
    expect(hiddenMessageWordSearchTemplate.defaultPageTitle).toBe(HIDDEN_MESSAGE_DEFAULT_TITLE)
  })

  it('leaves exactly the saying in the cells the words do not claim', () => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      const { puzzle } = buildPuzzle({ levelId: level.id, ctx: kdpCtx(8.5, 11) })
      const read = puzzle.leftoverCells
        .map((cell) => puzzle.grid[cell.r]![cell.c])
        .join('')
      expect(read, level.id).toBe(puzzle.messageLetters)
      expect(puzzle.messageLetters).toBe('EVERYDAYISSATURDAYNOW')
      // No cell is left blank: every one holds a word letter or a saying letter.
      expect(puzzle.grid.flat().every((cell) => /^[A-Z]$/.test(cell))).toBe(true)
    }
  })

  it('places every listed word exactly once, scanned in all eight directions', () => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      const { puzzle } = buildPuzzle({ levelId: level.id, ctx: kdpCtx(8.5, 11) })
      expect(new Set(puzzle.words).size).toBe(puzzle.words.length)
      expect(puzzle.placements).toHaveLength(puzzle.words.length)
      for (const token of puzzle.words) {
        // Blind to the level's own directions on purpose — a solver scans with
        // their eyes, so a second reading is a second correct answer.
        expect(countTokenReadings(puzzle.grid, token), `${level.id} ${token}`).toBe(1)
      }
    }
  })

  it('keeps every listed word inside the page word budget', () => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      const { puzzle, plan } = buildPuzzle({ levelId: level.id, ctx: kdpCtx(8.5, 11) })
      expect(puzzle.words.length).toBeLessThanOrEqual(plan.maxWords)
      expect(puzzle.words.length).toBeGreaterThanOrEqual(level.minWords)
      expect(Math.max(...puzzle.words.map((w) => w.length))).toBeLessThanOrEqual(plan.gridSide)
    }
  })

  it('uses the headings its level promises', () => {
    const across = buildPuzzle({ levelId: 'gentle', ctx: kdpCtx(8.5, 11) }).puzzle
    expect(across.placements.every((p) => p.dir.dr >= 0 && p.dir.dc >= 0)).toBe(true)
    expect(across.placements.every((p) => p.dir.dr === 0 || p.dir.dc === 0)).toBe(true)

    const diagonal = buildPuzzle({ levelId: 'classic', ctx: kdpCtx(8.5, 11) }).puzzle
    expect(diagonal.placements.some((p) => p.dir.dr !== 0 && p.dir.dc !== 0)).toBe(true)
  })

  it('hides a message the seller typed, letter for letter', () => {
    const typed = 'HAPPY RETIREMENT MARGARET'
    const { puzzle } = buildPuzzle({ ctx: kdpCtx(8.5, 11), message: typed })
    expect(puzzle.messageDisplay).toBe(typed)
    expect(
      puzzle.leftoverCells.map((cell) => puzzle.grid[cell.r]![cell.c]).join(''),
    ).toBe('HAPPYRETIREMENTMARGARET')
  })

  it('is deterministic for the same seed and payload', () => {
    const a = buildPuzzle({ ctx: kdpCtx(7.5, 9.25), seed: 99 }).puzzle
    const b = buildPuzzle({ ctx: kdpCtx(7.5, 9.25), seed: 99 }).puzzle
    expect(a).toEqual(b)
  })

  it('passes its own KDP preflight', () => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      const ctx = kdpCtx(8.5, 11)
      const config = { ...base, level: level.id }
      const { puzzle, plan } = buildPuzzle({ levelId: level.id, ctx })
      const header = drawHeader(
        hiddenMessageContentBox(ctx),
        config,
        { templateKey: 'hidden-message-word-search', instanceId: 'x', pageRole: 'single' },
        hiddenMessageInstruction(config),
      )
      const result = runHiddenMessageKdpPreflight({
        puzzle,
        plan,
        level: parseHiddenMessageLevel(config),
        field: header.body,
      })
      expect(result.errors, level.id).toEqual([])
      expect(result.ok).toBe(true)
    }
  })

  it('catches a grid whose leftover letters were tampered with', () => {
    const ctx = kdpCtx(8.5, 11)
    const { puzzle, plan } = buildPuzzle({ ctx })
    const broken: HiddenMessagePuzzle = {
      ...puzzle,
      grid: puzzle.grid.map((row) => [...row]),
    }
    const cell = broken.leftoverCells[0]!
    broken.grid[cell.r]![cell.c] = broken.grid[cell.r]![cell.c] === 'Q' ? 'Z' : 'Q'
    const header = drawHeader(
      hiddenMessageContentBox(ctx),
      base,
      { templateKey: 'hidden-message-word-search', instanceId: 'x', pageRole: 'single' },
      hiddenMessageInstruction(base),
    )
    const result = runHiddenMessageKdpPreflight({
      puzzle: broken,
      plan,
      level: parseHiddenMessageLevel(base),
      field: header.body,
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toContain('do not spell the hidden message')
  })
})

describe('hidden-message-word-search page', () => {
  it.each(PRINTABLE_TRIMS)('keeps puzzle and solution inside the safe area on %s x %s', (wIn, hIn) => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      const ctx = kdpCtx(wIn, hIn)
      const config = { ...base, level: level.id, showTitle: true, title: 'Game 1' }
      resetObjectCounter()
      const [page] = hiddenMessageWordSearchTemplate.generate(config, ctx)
      assertObjectsInSafeMargin(page!.objects, ctx)
      const key = buildAnswerPage(
        page!.answerSourceObjects ?? page!.objects,
        STUDIO_ANSWER_INK_MONO,
      )
      assertObjectsInSafeMargin(key, ctx)
    }
  })

  it('prints grid letters and bank words at or above the large-print floor', () => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      const ctx = kdpCtx(7.5, 9.25)
      resetObjectCounter()
      const [page] = hiddenMessageWordSearchTemplate.generate(
        { ...base, level: level.id, showTitle: true, title: 'Game 1' },
        ctx,
      )
      const letters = gridLetters(page!.objects).map((obj) => Number(obj.fontSize))
      const bank = bankEntries(page!.objects).map((obj) => Number(obj.fontSize))
      expect(letters.length, level.id).toBeGreaterThan(0)
      expect(bank.length, level.id).toBeGreaterThan(0)
      expect(Math.min(...letters), level.id).toBeGreaterThanOrEqual(LETTER_MIN)
      expect(Math.min(...bank), level.id).toBeGreaterThanOrEqual(LETTER_MIN - 2)
    }
  })

  it('draws the grid the plan sized, and one write-in rule per hidden letter', () => {
    const ctx = kdpCtx(7.5, 9.25)
    const config = { ...base, showTitle: true, title: 'Game 1' }
    const plan = planFor(config, ctx)!
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(config, ctx)
    expect(gridLetters(page!.objects)).toHaveLength(plan.gridSide * plan.gridSide)

    // One writing rule and one hidden answer glyph per letter of the saying.
    // The grid's own answer objects are the word capsules, which are rects.
    const letters = FIXTURE_MESSAGE.replace(/[^A-Z]/g, '').length
    const answerGlyphs = flatten(page!.objects).filter(
      (obj) => obj.type === 'textbox' && obj.studioRole === 'answer',
    )
    const rules = flatten(page!.objects).filter(
      (obj) => obj.type === 'rect' && obj.studioRole === 'structure',
    )
    expect(answerGlyphs).toHaveLength(letters)
    expect(rules).toHaveLength(letters)
    expect(answerGlyphs.map((obj) => String(obj.text)).join('')).toBe(
      FIXTURE_MESSAGE.replace(/[^A-Z]/g, ''),
    )
  })

  it('captions the writing lines so the page needs no explaining', () => {
    const ctx = kdpCtx(7.5, 9.25)
    const config = { ...base, showTitle: true, title: 'Game 1' }
    expect(planFor(config, ctx)!.message.labelled).toBe(true)
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(config, ctx)
    const texts = flatten(page!.objects).map((obj) =>
      String(obj.text ?? '').replace(/ /g, ' '),
    )
    expect(texts).toContain(MESSAGE_LABEL)
    expect(texts.some((text) => text.startsWith('Words to find'))).toBe(true)
  })

  it('answers both halves of the puzzle on the solution page', () => {
    const ctx = kdpCtx(8.5, 11)
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(
      { ...base, showTitle: true, title: 'Game 1' },
      ctx,
    )
    const key = buildAnswerPage(
      page!.answerSourceObjects ?? page!.objects,
      STUDIO_ANSWER_INK_MONO,
    )
    const texts = flatten(key).map((obj) => String(obj.text ?? ''))
    // The saying, set on one line, with the spaces locked so it cannot wrap.
    const saying = texts.find((text) => text.replace(/ /g, ' ').includes('SATURDAY'))
    expect(saying).toBeDefined()
    expect(saying).not.toContain('\n')
    expect(saying).not.toContain(' ')
    // One capsule per listed word, drawn over the grid.
    const capsules = flatten(key).filter((obj) => obj.type === 'rect' && obj.rx != null)
    const { puzzle } = buildPuzzle({ ctx })
    expect(capsules.length).toBe(puzzle.words.length)
    // The bank is not reprinted on the key.
    expect(texts.some((text) => text.includes('Words to find'))).toBe(false)
    // One tinted cell per letter of the saying: the circles answer the word
    // search, the tint answers the hidden message.
    const tinted = flatten(key).filter(
      (obj) => obj.type === 'rect' && obj.rx == null && obj.fill === STUDIO_RULE_LIGHT,
    )
    expect(tinted).toHaveLength(puzzle.messageLetters.length)
    // The grid itself is still readable under both marks.
    expect(gridLetters(key).length).toBe(puzzle.size * puzzle.size)
  })

  it('paints the saying letters under the answer circles, not over them', () => {
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(
      { ...base, showTitle: true, title: 'Game 1' },
      CTX(),
    )
    const grid = page!.answerSourceObjects?.find(
      (obj) =>
        obj.type === 'group' && (obj.objects ?? []).some((child) => child.studioRole === 'answer'),
    )
    const children = grid?.objects ?? []
    const lastLetter = children.findLastIndex((child) => child.studioRole === 'prompt')
    const firstCapsule = children.findIndex((child) => child.studioRole === 'answer')
    expect(lastLetter).toBeGreaterThanOrEqual(0)
    expect(firstCapsule).toBeGreaterThan(lastLetter)
  })

  it('shows a plain-language page instead of a broken one when content is unusable', () => {
    resetObjectCounter()
    const [page] = hiddenMessageWordSearchTemplate.generate(base, {
      ...CTX(),
      remoteData: { message: 'HI', words: ['Tea', 'Nap'] },
    })
    const texts = page!.objects.map((obj) => String(obj.text ?? '')).join(' ')
    expect(texts).toContain('could not')
    expect(gridLetters(page!.objects)).toHaveLength(0)
  })
})

describe('hidden-message-word-search robustness', () => {
  /**
   * The failure this game can have that the plain word search cannot: the words
   * must consume the grid to the letter, and some pools simply will not add up.
   * When that happens the seller gets an error page where a puzzle should be, so
   * the sweep below is the real production check — every level, every printable
   * trim, a spread of seeds, and not one page that gave up.
   */
  it('builds a real puzzle on every level and trim, across many seeds', () => {
    for (const [wIn, hIn] of PRINTABLE_TRIMS) {
      for (const level of HIDDEN_MESSAGE_LEVELS) {
        for (let i = 0; i < 8; i++) {
          const seed = 1_000 + i * 7_919
          const ctx = kdpCtx(wIn, hIn, seed)
          const config = { ...base, seed, level: level.id, showTitle: true, title: 'Game 1' }
          resetObjectCounter()
          const [page] = hiddenMessageWordSearchTemplate.generate(config, ctx)
          const where = `${level.id} ${wIn}x${hIn} seed=${seed}`
          const plan = planFor(config, ctx)!
          // An error page draws no grid at all, which is the tell.
          expect(gridLetters(page!.objects).length, where).toBe(
            plan.gridSide * plan.gridSide,
          )
          assertObjectsInSafeMargin(page!.objects, ctx)
        }
      }
    }
  })

  it('hides a message the seller typed on every level, at both band ends', () => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      for (const letters of [level.minMessageLetters, level.maxMessageLetters]) {
        // A saying of exactly `letters` letters, in words a page would really wrap.
        const words: string[] = []
        let left = letters
        while (left > 0) {
          const take = Math.min(5, left)
          words.push('ABCDE'.slice(0, take))
          left -= take
        }
        const typed = words.join(' ')
        const ctx = kdpCtx(8.5, 11)
        const { puzzle } = buildPuzzle({ levelId: level.id, ctx, message: typed })
        const where = `${level.id} ${letters}`
        expect(puzzle.messageLetters.length, where).toBe(letters)
        expect(
          puzzle.leftoverCells.map((cell) => puzzle.grid[cell.r]![cell.c]).join(''),
          where,
        ).toBe(puzzle.messageLetters)
      }
    }
  })
})

describe('hidden-message-word-search content', () => {
  it('sets the bank in Title Case, whatever case the writer sent', () => {
    expect(toBankDisplay('HAMMOCK')).toBe('Hammock')
    expect(toBankDisplay('road   trip')).toBe('Road Trip')
    expect(toBankDisplay("Sunday's best")).toBe("Sunday's Best")
  })

  it('drops palindromes, nested tokens and unsafe copy from the pool', () => {
    const level = parseHiddenMessageLevel(base)
    const tokens = selectHiddenMessageWords(
      ['LEVEL', 'REST', 'RESTAURANT', 'Disney', 'cure memory loss', 'GARDEN', 'NAP', 'frail'],
      { level, maxLetters: 10 },
    ).map((entry) => entry.token)
    expect(tokens).not.toContain('LEVEL')
    expect(tokens).not.toContain('REST')
    expect(tokens).not.toContain('DISNEY')
    expect(tokens).not.toContain('FRAIL')
    // Under the four-letter floor: accidental readings in the saying's letters.
    expect(tokens).not.toContain('NAP')
    expect(tokens).toContain('RESTAURANT')
    expect(tokens).toContain('GARDEN')
  })

  it('holds the saying to the level band it will be packed against', () => {
    const gentle = HIDDEN_MESSAGE_LEVELS[0]!
    expect(normalizeMessage('EVERY DAY IS SATURDAY NOW', gentle)).not.toBeNull()
    expect(normalizeMessage('TOO SHORT', gentle)).toBeNull()
    expect(normalizeMessage('A'.repeat(gentle.maxMessageLetters + 1), gentle)).toBeNull()
    const parsed = normalizeMessage('Every day is Saturday now!', gentle)!
    expect(parsed.letters).toBe('EVERYDAYISSATURDAYNOW')
    expect(parsed.boxWords).toEqual(['EVERY', 'DAY', 'IS', 'SATURDAY', 'NOW'])
  })

  it('over-requests the pool so the packer has something else to try', () => {
    for (const level of HIDDEN_MESSAGE_LEVELS) {
      expect(poolCountFor(level.maxWords)).toBeGreaterThan(level.maxWords)
      expect(poolCountFor(level.maxWords)).toBeLessThanOrEqual(40)
    }
  })

  it('rotates the saying tone by seed and never asks for the sharp one', () => {
    const tones = new Set(
      Array.from({ length: 40 }, (_, i) => toneForSeed(1_000 + i * 7_919)),
    )
    expect(tones.size).toBeGreaterThan(1)
    expect(tones.has('sassy')).toBe(false)
  })
})
