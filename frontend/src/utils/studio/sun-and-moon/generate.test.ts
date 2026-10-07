import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK, STUDIO_PAPER, STUDIO_SAFE_AREA_PADDING_X } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent, rememberStudioContent, studioVarietyKey } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { drawHeader } from '../studio-layout'
import { sunAndMoonTemplate } from './generate'
import { SM_CONFIG_SCHEMA } from './config'
import {
  SM_DAYS,
  SM_DEFAULT_TITLE,
  SM_GENTLE_TIP,
  SM_HOW_TO,
  SM_LEVELS,
  SM_TEMPLATE_KEY,
  parseSmBook,
  parseSmLevel,
  pickSmDay,
  smGridRng,
  smInstruction,
  smLevelSpec,
  smPageLabel,
  smSignText,
  type SmLevel,
} from './content'
import { SM_GIVEN_TINT, SM_PART_KEY, buildSmPuzzle } from './draw'
import { SM_SYMBOL_AIR, checkSmDrawnPage, runSmKdpPreflight } from './kdp-preflight'
import { SM_BADGE_MIN, SM_LEGEND_ROW_GAP, SM_SIGN_GAP_MIN, planSmPage, smContentBox, smLegendRowHeight, smPanelInBody, smPrintNote } from './layout'
import { buildSmGrid, drawSmAnswer, drawSmCandidate, smClueCount, smMeetsLevel, smPuzzleFrom, smSignature, type SmBuilt } from './puzzle'
import {
  SM_BLANK,
  SM_MOON,
  SM_NONE,
  SM_OPPOSITE,
  SM_SAME,
  SM_SUN,
  countSmSolutions,
  isSmSolution,
  smAnswerText,
  smLinePatterns,
  smSolutions,
  smWellFormed,
  solveSm,
  type SmPuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many grids: generous room when the whole suite runs at once. */
const SLOW = 60_000
const LEVELS = SM_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: SM_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(sunAndMoonTemplate),
  showTitle: true,
  title: SM_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42, bookLabels: string[] = [], ownerSalt?: string): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI) + STUDIO_SAFE_AREA_PADDING_X,
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI) + STUDIO_SAFE_AREA_PADDING_X,
  },
  seed,
  instanceId: 'kdp',
  remoteData: { bookLabels },
  ownerSalt,
})

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return sunAndMoonTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[SM_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[SM_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: SmLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(smContentBox(ctx), config, tag, smInstruction(config, level))
  return smPanelInBody(header.body, header.objects.length > 0)
}

/**
 * A grid from a picture: rows of squares (S sun, M moon, . blank) with the
 * signs between them — `=` or `x` between two squares across, and on the
 * lines between rows, under a square, the sign between it and the one below
 * (`=`, `x` or `.`, one per square).
 */
function gridFrom(rows: string[]): SmPuzzle {
  const squares = rows.filter((_, k) => k % 2 === 0)
  const n = squares.length
  const givens: number[] = []
  const across: number[] = []
  const down: number[] = new Array<number>(n * n).fill(SM_NONE)
  const sign = (ch: string | undefined) => (ch === '=' ? SM_SAME : ch === 'x' ? SM_OPPOSITE : SM_NONE)
  squares.forEach((row) => {
    for (let c = 0; c < n; c++) {
      const ch = row[c * 2]
      givens.push(ch === 'S' ? SM_SUN : ch === 'M' ? SM_MOON : SM_BLANK)
      across.push(c < n - 1 ? sign(row[c * 2 + 1]) : SM_NONE)
    }
  })
  rows.forEach((row, k) => {
    if (k % 2 === 0) return
    const r = (k - 1) / 2
    for (let c = 0; c < n; c++) down[r * n + c] = sign(row[c])
  })
  return { size: n, givens, across, down }
}

/** An answer from its rows: S for a sun, M for a moon. */
const answerFrom = (rows: string[]) => rows.join('').split('').map((ch) => (ch === 'S' ? SM_SUN : SM_MOON))

function builtFor(level: SmLevel, seed = 1): SmBuilt {
  return buildSmGrid({ ...smLevelSpec(level), rng: smGridRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(sunAndMoonTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: SM_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(sunAndMoonTemplate, { seeds: 12 })

describe('sun-and-moon registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === SM_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(SM_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(found[0]!.description).not.toMatch(/tango|linkedin/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(SM_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(SM_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(sunAndMoonTemplate).level).toBe('classic')
    expect(parseSmLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseSmLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, on a line of its own, and drops the how-to when asked', () => {
    expect(smInstruction(base, 'gentle')).toBe(`${SM_HOW_TO}\n${SM_GENTLE_TIP}`)
    expect(smInstruction(base, 'classic')).toBe(SM_HOW_TO)
    expect(smInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24 + STUDIO_SAFE_AREA_PADDING_X, bottom: 24, left: 36 + STUDIO_SAFE_AREA_PADDING_X } })
    for (const level of LEVELS) {
      const note = smPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the grid \d\.\d\d in across\.$/)
      expect(smPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(smPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('sun-and-moon rules and solver', () => {
  // A 4 × 4 answer and a grid of it: two printed squares and three signs.
  const answer = answerFrom(['SMSM', 'MSMS', 'SSMM', 'MMSS'])
  const grid = gridFrom(['S......', '....', '...=...', '....', '.......', 'x...', '......M'])

  it('knows every way to fill one line on its own', () => {
    // 4 squares: SSMM SMSM SMMS MSSM MSMS MMSS.
    expect(smLinePatterns(4)).toHaveLength(6)
    expect(smLinePatterns(6)).toHaveLength(14)
    expect(smLinePatterns(8)).toHaveLength(34)
    expect(smLinePatterns(10)).toHaveLength(84)
  })

  it('reads a grid picture the way it is drawn', () => {
    expect(grid.size).toBe(4)
    expect(smWellFormed(grid)).toBe(true)
    expect(grid.givens[0]).toBe(SM_SUN)
    expect(grid.givens[15]).toBe(SM_MOON)
    expect(grid.across[1 * 4 + 1]).toBe(SM_SAME)
    expect(grid.down[2 * 4]).toBe(SM_OPPOSITE)
    expect(smWellFormed({ ...grid, across: grid.across.map((v, i) => (i === 3 ? SM_SAME : v)) })).toBe(false)
    expect(smWellFormed({ ...grid, size: 5 })).toBe(false)
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    const free: SmPuzzle = { size: 4, givens: new Array(16).fill(SM_BLANK), across: new Array(16).fill(SM_NONE), down: new Array(16).fill(SM_NONE) }
    expect(isSmSolution(free, answer)).toBe(true)
    // Three alike across.
    expect(isSmSolution({ ...free, size: 6, givens: new Array(36).fill(SM_BLANK), across: new Array(36).fill(SM_NONE), down: new Array(36).fill(SM_NONE) }, answerFrom(['SSSMMM', 'MMMSSS', 'SSSMMM', 'MMMSSS', 'SSSMMM', 'MMMSSS']))).toBe(false)
    // A row with three suns.
    expect(isSmSolution(free, answerFrom(['SMSS', 'MSMM', 'SSMM', 'MMSS']))).toBe(false)
    // A printed square changed, a sign not kept.
    expect(isSmSolution({ ...free, givens: free.givens.map((v, i) => (i === 0 ? SM_MOON : v)) }, answer)).toBe(false)
    expect(isSmSolution({ ...free, across: free.across.map((v, i) => (i === 0 ? SM_SAME : v)) }, answer)).toBe(false)
    expect(isSmSolution({ ...free, down: free.down.map((v, i) => (i === 0 ? SM_OPPOSITE : v)) }, answer)).toBe(true)
    expect(isSmSolution(free, answer.slice(0, 15))).toBe(false)
  })

  it('takes the four first steps: signs, pairs, gaps and counting', () => {
    // Row 0 of a 6 × 6 reads  S = .  .  M  .
    const p: SmPuzzle = { size: 6, givens: new Array(36).fill(SM_BLANK), across: new Array(36).fill(SM_NONE), down: new Array(36).fill(SM_NONE) }
    const givens = [...p.givens]
    const across = [...p.across]
    givens[0] = SM_SUN
    across[0] = SM_SAME
    givens[4] = SM_MOON
    const s = solveSm({ ...p, givens, across }, 'basic').state
    expect(s[1]).toBe(SM_SUN) // signs
    expect(s[2]).toBe(SM_MOON) // pairs
    // M . M → the middle is a sun (gaps).
    expect(s[3]).toBe(SM_SUN)
    // Counting: three suns in the row fill the rest with moons.
    expect(s[5]).toBe(SM_MOON)
  })

  it('solves a proven grid step by step, on exactly its answer', () => {
    const built = drawSmCandidate({ ...smLevelSpec('classic'), rng: createRng(3) }) ?? builtFor('classic', 3)
    const result = solveSm(built.puzzle, 'probe')
    expect(result.solved).toBe(true)
    expect(smAnswerText(result.state)).toBe(smAnswerText(built.answer))
  })

  it('refuses to guess: a grid with several answers is left unfinished at every level', () => {
    const empty: SmPuzzle = { size: 6, givens: new Array(36).fill(SM_BLANK), across: new Array(36).fill(SM_NONE), down: new Array(36).fill(SM_NONE) }
    expect(countSmSolutions(empty, 5)).toBe(5)
    for (const rules of ['basic', 'lines', 'probe'] as const) expect(solveSm(empty, rules).solved).toBe(false)
  })

  it('makes a row fit where the four first steps cannot', () => {
    let fitted = 0
    for (let k = 0; k < 20 && fitted < 3; k++) {
      const built = drawSmCandidate({ ...smLevelSpec('classic'), rng: createRng(900 + k) })
      if (!built) continue
      fitted++
      expect(solveSm(built.puzzle, 'basic').solved).toBe(false)
      expect(solveSm(built.puzzle, 'lines').tally.lines).toBeGreaterThanOrEqual(2)
    }
    expect(fitted).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with brute force: every grid the solver finishes has exactly one answer', () => {
    let finished = 0
    for (const [size, rules, signShare] of [
      [4, 'basic', 0.5],
      [6, 'basic', 0.3],
      [6, 'lines', 0.8],
      [6, 'probe', 0.5],
      [8, 'lines', 0.5],
      [8, 'probe', 0.5],
    ] as const) {
      const rng = createRng(2024 + size)
      for (let k = 0; k < 25; k++) {
        const built = drawSmCandidate({ size, rules, signShare, clues: [0, 1], rng })
        if (!built) continue
        finished++
        expect(countSmSolutions(built.puzzle, 2), `${size} × ${size} ${rules} #${k}`).toBe(1)
        expect(smAnswerText(smSolutions(built.puzzle, 1)[0]!)).toBe(smAnswerText(built.answer))
      }
    }
    expect(finished).toBeGreaterThan(100)
  }, SLOW)

  it('never claims a grid with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 400 && ambiguous < 40; k++) {
      // A proven grid with one clue taken away, or random clues round a random answer.
      const rng = createRng(77 + k)
      const size = rng.pick([4, 6, 8])
      const answer = drawSmAnswer(size, rng)
      if (!answer) continue
      const clues = rng.sample(Array.from({ length: 3 * size * size }, (_, i) => i), Math.round(size * size * 0.18))
      const puzzle = smPuzzleFrom(size, answer, clues.filter((c) => !(c >= size * size && c < 2 * size * size && c % size === size - 1) && !(c >= 2 * size * size && c % (size * size) >= size * (size - 1))))
      if (countSmSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'lines', 'probe'] as const) expect(solveSm(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(20)
  }, SLOW)

  it('finds a broken grid broken', () => {
    // S = M cannot be kept.
    const q: SmPuzzle = { size: 4, givens: [SM_SUN, SM_MOON, ...new Array(14).fill(SM_BLANK)], across: [SM_SAME, ...new Array(15).fill(SM_NONE)], down: new Array(16).fill(SM_NONE) }
    expect(countSmSolutions(q, 2)).toBe(0)
    for (const rules of ['basic', 'lines', 'probe'] as const) expect(solveSm(q, rules).solved).toBe(false)
  })
})

describe('sun-and-moon levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds grids of the level's size that its own steps finish`, () => {
      const spec = smLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = level === 'challenging' ? 3 : 5
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(smWellFormed(built.puzzle)).toBe(true)
        expect(isSmSolution(built.puzzle, built.answer)).toBe(true)
        if (spec.size <= 8) expect(countSmSolutions(built.puzzle, 2)).toBe(1)
        expect(smMeetsLevel(built.puzzle, built.answer, spec)).toBe(true)
        const solve = solveSm(built.puzzle, spec.rules)
        expect(solve.solved).toBe(true)
        if (spec.beyond) expect(solveSm(built.puzzle, spec.beyond).solved).toBe(false)
        const { givens, signs } = smClueCount(built.puzzle)
        expect(givens).toBeGreaterThan(0)
        expect(signs).toBeGreaterThan(0)
        expect(givens + signs).toBeLessThanOrEqual(spec.clues[1] * spec.size * spec.size)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first grid: the four first steps finish it', () => {
    for (let seed = 0; seed < 5; seed++) expect(solveSm(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  })

  it('makes Challenging need "what if": row fitting alone never finishes it', () => {
    const built = builtFor('challenging', 7)
    expect(solveSm(built.puzzle, 'lines').solved).toBe(false)
    expect(solveSm(built.puzzle, 'probe').tally.probe).toBeGreaterThanOrEqual(2)
    // 10 × 10: the plain search still agrees on the one answer.
    expect(countSmSolutions(built.puzzle, 2)).toBe(1)
  }, SLOW)

  it('knows a grid however it is turned or mirrored, or with suns and moons swapped', () => {
    const built = builtFor('classic', 2)
    const { puzzle } = built
    const n = puzzle.size
    // Mirrored left to right: squares swap columns, across signs move to the mirrored gap.
    const flip = (i: number) => Math.floor(i / n) * n + (n - 1 - (i % n))
    const mirrored: SmPuzzle = {
      size: n,
      givens: puzzle.givens.map((_, i) => puzzle.givens[flip(i)]!),
      across: puzzle.across.map((_, i) => (i % n === n - 1 ? SM_NONE : puzzle.across[flip(i) - 1]!)),
      down: puzzle.down.map((_, i) => puzzle.down[flip(i)]!),
    }
    // Every sun a moon: the signs stay as they are.
    const swapped: SmPuzzle = { ...puzzle, givens: puzzle.givens.map((v) => (v === SM_BLANK ? v : 1 - v)) }
    expect(smWellFormed(mirrored)).toBe(true)
    expect(smSignature(mirrored)).toBe(built.signature)
    expect(smSignature(swapped)).toBe(built.signature)
    // One sign changed is another puzzle.
    const k = puzzle.across.findIndex((v) => v !== SM_NONE)
    const changed = { ...puzzle, across: puzzle.across.map((v, i) => (i === k ? (v === SM_SAME ? SM_OPPOSITE : SM_SAME) : v)) }
    expect(smSignature(changed)).not.toBe(built.signature)
  })
})

describe('sun-and-moon days', () => {
  it('names every day once, in retirement words, with no brand, drink or money', () => {
    expect(SM_DAYS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(SM_DAYS.map((d) => d.id)).size).toBe(SM_DAYS.length)
    for (const d of SM_DAYS) {
      expect(d.id).toMatch(/^[a-z0-9-]+$/)
      expect(d.name).not.toMatch(/beer|wine|whisk|rum|cocktail|margarita|happy hour|pension|money|cash|dollar|old age|senior|blue moon/i)
      expect(smSignText(d)).toBe(d.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const club = SM_DAYS.find((d) => d.id === 'sun-porch-crossword-hour')!
    expect(smSignText(club, 2)).toBe('Sun Porch\nCrossword Hour')
    const trip = SM_DAYS.find((d) => d.id === 'early-bird-fishing-trip')!
    expect(smSignText(trip, 2).split('\n')).toHaveLength(2)
    expect(smSignText(trip, 2).replace('\n', ' ')).toBe(trip.name)
  })

  it('works through every day before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < SM_DAYS.length + 5; page++) {
      const book = parseSmBook(labels)
      const pick = pickSmDay({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.day)
      labels.push(smPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, SM_DAYS.length).map((l) => l.split('|')[0])).size).toBe(SM_DAYS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickSmDay({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = SM_DAYS.slice(0, SM_DAYS.length - 3).map((d) => d.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a day', () => {
    expect(parseSmBook(['sunset-cruise|gentle|abc', 'nowhere|classic|x', 'cabin-by-the-lake|odd|def', ''])).toEqual([
      { day: 'sunset-cruise', level: 'gentle', signature: 'abc' },
      { day: 'cabin-by-the-lake', level: null, signature: 'def' },
    ])
  })
})

describe('sun-and-moon pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print grid on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = smLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        const shown = partsOf(puzzle!, 'given-sun').length + partsOf(puzzle!, 'given-moon').length
        const hidden = partsOf(puzzle!, 'answer-sun').length + partsOf(puzzle!, 'answer-moon').length
        expect(shown + hidden).toBe(size * size)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor, with room round every sign', () => {
    const big = planSmPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planSmPage(panelFor(kdpCtx(w, h), level), level, FONT)!
        expect(plan.cell, `${level} ${w}x${h}`).toBeGreaterThanOrEqual(Math.ceil(smLevelSpec(level).minCell))
        expect(plan.badge).toBeGreaterThanOrEqual(SM_BADGE_MIN)
        expect((plan.cell - plan.symbol) / 2 - plan.badge).toBeGreaterThanOrEqual(SM_SYMBOL_AIR)
      }
    }
  })

  it('keeps the legend on one row on every trim, and stacks it cleanly when a wide font needs to', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) expect(planSmPage(panelFor(kdpCtx(w, h), level), level, FONT)!.legendRows, `${level} ${w}x${h}`).toBe(1)
    }
    const panel = panelFor(kdpCtx(8.5, 11), 'gentle')
    const flat = planSmPage(panel, 'gentle', FONT)!
    const plan = { ...flat, legendRows: 2 as const, legendHeight: smLegendRowHeight() * 2 + SM_LEGEND_ROW_GAP }
    const built = builtFor('gentle')
    const day = SM_DAYS.find((d) => d.id === 'sun-porch-crossword-hour')!
    const puzzle = buildSmPuzzle({ built, plan, day, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkSmDrawnPage({ puzzle, built, day })).toEqual([])
    const [alikeWords, oppositeWords] = partsOf(puzzle, 'legend-text')
    expect(oppositeWords!.top).toBeGreaterThan(alikeWords!.top)
    expect(oppositeWords!.left).toBe(alikeWords!.left)
  })

  it('keeps the sign and the legend clear of the grid', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planSmPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(SM_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planSmPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runSmKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', day: SM_DAYS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the grid.')
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, tinted printed squares, the signs on their lines, and a hidden answer in every other square', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${SM_TEMPLATE_KEY}:${signature}`)
    const day = SM_DAYS.find((d) => d.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(smSignText(day))
    expect(partsOf(puzzle, 'rule')).toHaveLength(18)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    const tints = partsOf(puzzle, 'given-tint')
    const given = [...partsOf(puzzle, 'given-sun'), ...partsOf(puzzle, 'given-moon')]
    expect(tints.length).toBe(given.length)
    expect(tints.every((t) => t.fill === SM_GIVEN_TINT)).toBe(true)
    expect(given.every((g) => g.visible !== false && g.studioRole === 'prompt')).toBe(true)
    const hidden = [...partsOf(puzzle, 'answer-sun'), ...partsOf(puzzle, 'answer-moon')]
    expect(hidden.every((h) => h.visible === false && h.studioRole === 'answer')).toBe(true)
    const marks = partsOf(puzzle, 'sign-mark')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks.every((m) => m.visible !== false && m.stroke === STUDIO_INK)).toBe(true)
    expect(partsOf(puzzle, 'sign-mark-disc').every((d) => d.fill === STUDIO_PAPER)).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual(['alike', 'opposite'])
    // Suns ringed white, moons solid.
    expect(partsOf(puzzle, 'given-sun').every((s) => s.fill === STUDIO_PAPER)).toBe(true)
    expect(partsOf(puzzle, 'given-moon').every((m) => m.fill === STUDIO_INK)).toBe(true)
  })

  it('puts a sun or a moon in every square on the answer page, in black, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const puzzleGroup = puzzleOf(out[0]!.objects)!
    const blanks = partsOf(puzzleGroup, 'answer-sun').length + partsOf(puzzleGroup, 'answer-moon').length
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    // A sun or a moon is one shape.
    expect(answers.length).toBe(blanks)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const suns = partsOf(puzzle, 'answer-sun')
    const moons = partsOf(puzzle, 'answer-moon')
    expect(suns.every((s) => s.visible === true && s.stroke === STUDIO_INK && s.fill === STUDIO_PAPER)).toBe(true)
    expect(moons.every((m) => m.visible === true && m.fill === STUDIO_INK)).toBe(true)
    // The whole grid read back from the key is a finished grid: half suns in every row and column.
    const n = 8
    const grid = new Array<number>(n * n).fill(-1)
    for (const [name, value] of [['answer-sun', SM_SUN], ['answer-moon', SM_MOON], ['given-sun', SM_SUN], ['given-moon', SM_MOON]] as const) {
      for (const o of partsOf(puzzle, name)) grid[Number(o.data?.row) * n + Number(o.data?.col)] = value
    }
    expect(grid.includes(-1)).toBe(false)
    for (let r = 0; r < n; r++) expect(grid.slice(r * n, r * n + n).filter((v) => v === SM_MOON)).toHaveLength(n / 2)
    expect(key.some((o) => o.text === SM_HOW_TO)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === SM_HOW_TO)).toBe(true)
  })

  it('builds a book that works through every day before one returns, never printing a grid twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('never repeats a grid the book already prints, even when the seed would build it again', () => {
    const first = generate(base, kdpCtx(8.5, 11, 21))
    const label = String(puzzleOf(first[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    const again = generate(base, kdpCtx(8.5, 11, 21, [label]))
    const next = String(puzzleOf(again[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    expect(next.split('|')[2]).not.toBe(label.split('|')[2])
    expect(next.split('|')[0]).not.toBe(label.split('|')[0])
  })

  it('opens a seller’s next book at days their last one did not use', () => {
    const recent = SM_DAYS.slice(0, 20).map((d) => d.id)
    rememberStudioContent(studioVarietyKey(SM_TEMPLATE_KEY, 'days'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different grid for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('sun-and-moon preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planSmPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const day = SM_DAYS[0]!
  const run = (over: Partial<Parameters<typeof runSmKdpPreflight>[0]>) => runSmKdpPreflight({ built, plan, level: 'classic', day, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven grid', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    const answer = built.answer.map((v, i) => (i === 0 ? 1 - v : v))
    expect(run({ built: { ...built, answer } })).toMatch(/breaks a rule/)
  })

  it('refuses a grid with several answers', () => {
    // Every clue but one printed square taken away.
    const i = built.puzzle.givens.findIndex((v) => v !== SM_BLANK)
    const bare: SmPuzzle = { ...built.puzzle, givens: built.puzzle.givens.map((v, k) => (k === i ? v : SM_BLANK)), across: built.puzzle.across.map(() => SM_NONE), down: built.puzzle.down.map(() => SM_NONE) }
    expect(countSmSolutions(bare, 2)).toBe(2)
    expect(run({ built: { ...built, puzzle: bare, signature: smSignature(bare) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic grid that the four first steps alone finish', () => {
    let easy: SmBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawSmCandidate({ ...smLevelSpec('gentle'), size: 8, clues: [0, 1], rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a grid with only one kind of clue, or more clues than the level’s share', () => {
    const answerOnly: SmPuzzle = { ...built.puzzle, across: built.puzzle.across.map(() => SM_NONE), down: built.puzzle.down.map(() => SM_NONE) }
    expect(run({ built: { ...built, puzzle: answerOnly, signature: smSignature(answerOnly) } })).toMatch(/both printed squares and signs/)
    const full = smPuzzleFrom(8, built.answer, Array.from({ length: 64 }, (_, i) => i).concat([64]))
    expect(run({ built: { ...built, puzzle: full, signature: smSignature(full) } })).toMatch(/share of clues|too easy/)
  })

  it('refuses a grid or a day the book already has', () => {
    const book = parseSmBook([smPageLabel(day, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseSmBook([smPageLabel(SM_DAYS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this grid/)
  })

  it('refuses squares below the level’s floor, crowded signs, and a grid off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    expect(run({ plan: { ...plan, symbol: plan.cell - 4 } })).toMatch(/crowds the signs/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
  })

  it('catches a drawn page whose squares, signs or answers do not match', () => {
    const puzzle = buildSmPuzzle({ built, plan, day, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkSmDrawnPage({ puzzle, built, day })).toEqual([])
    expect(checkSmDrawnPage({ puzzle, built: builtFor('classic', 4), day }).join(' ')).toMatch(/gray squares|signs|answer|printed/)
    const blank = built.puzzle.givens.findIndex((v) => v === SM_BLANK)
    const moved: SmBuilt = { ...built, answer: built.answer.map((v, i) => (i === blank ? 1 - v : v)) }
    expect(checkSmDrawnPage({ puzzle, built: moved, day }).join(' ')).toMatch(/answer is missing or wrong/)
    expect(checkSmDrawnPage({ puzzle, built, day: SM_DAYS[5]! }).join(' ')).toMatch(/sign does not name/)
  })
})
