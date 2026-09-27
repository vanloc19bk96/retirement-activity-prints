import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent, rememberStudioContent, studioVarietyKey } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { drawHeader } from '../studio-layout'
import { yardSaleTemplate } from './generate'
import { YS_CONFIG_SCHEMA } from './config'
import {
  YS_DEFAULT_TITLE,
  YS_GENTLE_TIP,
  YS_HOW_TO,
  YS_LEVELS,
  YS_SALES,
  YS_TEMPLATE_KEY,
  parseYsBook,
  parseYsLevel,
  pickYsSale,
  ysGridRng,
  ysInstruction,
  ysLevelSpec,
  ysPageLabel,
  ysSignText,
  type YsLevel,
} from './content'
import { YS_PART_KEY, YS_SHADE_FILL, buildYsPuzzle } from './draw'
import { YS_DIGIT_AIR, checkYsDrawnPage, runYsKdpPreflight } from './kdp-preflight'
import { YS_DIGIT_MIN, YS_LEGEND_ROW_GAP, YS_SIGN_GAP_MIN, planYsPage, ysContentBox, ysLegendRowHeight, ysPanelInBody, ysPrintNote } from './layout'
import { buildYsGrid, drawYsCandidate, drawYsLatin, drawYsShading, ysMeetsLevel, ysShadedCount, ysSignature, type YsBuilt } from './puzzle'
import { YS_SHADED, YS_WHITE, countYsSolutions, isYsSolution, solveYs, ysJoined, ysShadeText, ysSolutions, ysWellFormed, type YsPuzzle } from './solver'

const FONT = 'PT Serif'
/** Tests that build many grids: generous room when the whole suite runs at once. */
const SLOW = 60_000
const LEVELS = YS_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: YS_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(yardSaleTemplate),
  showTitle: true,
  title: YS_DEFAULT_TITLE,
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
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed,
  instanceId: 'kdp',
  remoteData: { bookLabels },
  ownerSalt,
})

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return yardSaleTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[YS_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[YS_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: YsLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(ysContentBox(ctx), config, tag, ysInstruction(config, level))
  return ysPanelInBody(header.body, header.objects.length > 0)
}

/** A grid from its rows of digits. */
function gridFrom(rows: string[]): YsPuzzle {
  return { size: rows.length, numbers: rows.join('').split('').map(Number) }
}

/** A shading from its rows: # shaded, o white. */
const shadeFrom = (rows: string[]) => rows.join('').split('').map((ch) => (ch === '#' ? YS_SHADED : YS_WHITE))

function builtFor(level: YsLevel, seed = 1): YsBuilt {
  return buildYsGrid({ ...ysLevelSpec(level), rng: ysGridRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(yardSaleTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: YS_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(yardSaleTemplate, { seeds: 12 })

describe('yard-sale registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === YS_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(YS_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(YS_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(YS_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(yardSaleTemplate).level).toBe('classic')
    expect(parseYsLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseYsLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, on a line of its own, and drops the how-to when asked', () => {
    expect(ysInstruction(base, 'gentle')).toBe(`${YS_HOW_TO}\n${YS_GENTLE_TIP}`)
    expect(ysInstruction(base, 'classic')).toBe(YS_HOW_TO)
    expect(ysInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square and number sizes on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = ysPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the grid \d\.\d\d in across, numbers \d+(\.5)? pt\.$/)
      expect(ysPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(ysPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('yard-sale rules and solver', () => {
  // A 4 × 4 grid and an answer: a Latin square with three squares turned into repeats.
  const grid = gridFrom(['2234', '2341', '3432', '4423'])
  const answer = shadeFrom(['#ooo', 'oooo', 'oo#o', 'o#oo'])

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    expect(ysWellFormed(grid)).toBe(true)
    expect(isYsSolution(grid, answer)).toBe(true)
    // A white twin left in a line.
    expect(isYsSolution(grid, shadeFrom(['oooo', 'oooo', 'oo#o', 'o#oo']))).toBe(false)
    // Two shaded side by side.
    expect(isYsSolution(grid, shadeFrom(['##oo', 'oooo', 'oo#o', 'o#oo']))).toBe(false)
    // A number that does not repeat (the 1 in row 2), shaded.
    expect(isYsSolution(grid, shadeFrom(['#ooo', 'ooo#', 'oo#o', 'o#oo']))).toBe(false)
    // The white squares cut in two: the corner 1 walled off by two shaded 3s.
    const cut = gridFrom(['1334', '3341', '3412', '4123'])
    expect(isYsSolution(cut, shadeFrom(['o#oo', '#ooo', 'oooo', 'oooo']))).toBe(false)
    expect(isYsSolution(grid, answer.slice(0, 15))).toBe(false)
    expect(ysWellFormed({ size: 4, numbers: [...grid.numbers.slice(0, 15), 5] })).toBe(false)
    expect(ysWellFormed({ size: 3, numbers: grid.numbers.slice(0, 9) })).toBe(false)
  })

  it('knows when the white squares are joined', () => {
    expect(ysJoined(3, [true, true, true, false, false, true, true, true, true])).toBe(true)
    expect(ysJoined(3, [true, false, true, false, true, false, true, false, true])).toBe(false)
    expect(ysJoined(2, [false, false, false, false])).toBe(false)
  })

  it('takes the first steps: singles, sandwiches, pairs, repeats and neighbours', () => {
    // Row 0: 1 1 … 1 (a pair and a third). Row 1: 2 3 2 (a sandwich). Column 1: 3 over 3 (a pair).
    const p = gridFrom(['113416', '232561', '335612', '456123', '561234', '612345'])
    const s = solveYs(p, 'basic').state
    expect(s[1 * 6 + 1]).toBe(YS_WHITE) // sandwich: 2 3 2
    expect(s[0 * 6 + 2]).toBe(YS_WHITE) // single: the 3 shows once in its row and its column
    expect(s[0 * 6 + 4]).toBe(YS_SHADED) // pairs: 1 1 … 1
    expect(s[0 * 6 + 3]).toBe(YS_WHITE) // neighbours of a shaded square
    expect(s[0 * 6 + 5]).toBe(YS_WHITE)
    expect(s[1 * 6 + 4]).toBe(YS_WHITE)
    expect(s[2 * 6 + 1]).toBe(YS_SHADED) // repeats: the white 3 above it
    expect(s[2 * 6 + 0]).toBe(YS_WHITE)
    expect(s[2 * 6 + 2]).toBe(YS_WHITE)
  })

  it('never walls off a white square, and only the walls step sees it', () => {
    const built = builtFor('classic', 3)
    const basic = solveYs(built.puzzle, 'basic')
    const walls = solveYs(built.puzzle, 'walls')
    expect(basic.solved).toBe(false)
    expect(walls.solved).toBe(true)
    expect(walls.tally.walls).toBeGreaterThanOrEqual(2)
  })

  it('solves a proven grid step by step, on exactly its answer', () => {
    const built = drawYsCandidate({ ...ysLevelSpec('classic'), rng: createRng(3) }) ?? builtFor('classic', 3)
    const result = solveYs(built.puzzle, 'probe')
    expect(result.solved).toBe(true)
    expect(ysShadeText(result.state)).toBe(ysShadeText(built.shade))
  })

  it('refuses to guess: a grid with several answers is left unfinished at every level', () => {
    // 1 2 1 in the top row, and the right-hand 1 over another: shade the left one and the lower one, or the right one alone.
    const loose = gridFrom(['1214', '2341', '3412', '4123'])
    expect(countYsSolutions(loose, 5)).toBeGreaterThan(1)
    for (const rules of ['basic', 'walls', 'probe'] as const) expect(solveYs(loose, rules).solved).toBe(false)
  })

  it('agrees with brute force: every grid the solver finishes has exactly one answer', () => {
    let finished = 0
    for (const [size, rules] of [
      [5, 'basic'],
      [5, 'walls'],
      [6, 'basic'],
      [6, 'walls'],
      [6, 'probe'],
      [7, 'walls'],
      [7, 'probe'],
    ] as const) {
      const rng = createRng(2024 + size)
      for (let k = 0; k < 25; k++) {
        const built = drawYsCandidate({ size, rules, shaded: [0.2, 0.4], rng })
        if (!built) continue
        finished++
        expect(countYsSolutions(built.puzzle, 2), `${size} × ${size} ${rules} #${k}`).toBe(1)
        expect(ysShadeText(ysSolutions(built.puzzle, 1)[0]!)).toBe(ysShadeText(built.shade))
      }
    }
    expect(finished).toBeGreaterThan(120)
  }, SLOW)

  it('never claims a grid with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 400 && ambiguous < 40; k++) {
      // A Latin square with a few numbers changed at random: most have many answers, or none.
      const rng = createRng(77 + k)
      const size = rng.pick([4, 5, 6])
      const numbers = drawYsLatin(size, rng)
      if (!numbers) continue
      for (const i of rng.sample(Array.from({ length: size * size }, (_, j) => j), Math.round(size * size * 0.3))) numbers[i] = rng.int(1, size)
      const puzzle = { size, numbers }
      if (countYsSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'walls', 'probe'] as const) expect(solveYs(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(20)
  }, SLOW)

  it('finds a grid with no answer broken', () => {
    // 1 1 1 1 in a line: three of them must go, and two would sit side by side.
    const q = gridFrom(['1111', '2341', '3412', '4123'])
    expect(countYsSolutions(q, 2)).toBe(0)
    for (const rules of ['basic', 'walls', 'probe'] as const) expect(solveYs(q, rules).solved).toBe(false)
  })
})

describe('yard-sale building', () => {
  it('draws Latin squares, and shadings that never touch and never cut the whites in two', () => {
    const rng = createRng(5)
    for (let k = 0; k < 20; k++) {
      const n = rng.pick([6, 8, 9])
      const latin = drawYsLatin(n, rng)!
      for (let a = 0; a < n; a++) {
        expect(new Set(latin.slice(a * n, a * n + n)).size).toBe(n)
        expect(new Set(Array.from({ length: n }, (_, r) => latin[r * n + a])).size).toBe(n)
      }
      const shade = drawYsShading(n, Math.round(n * n * 0.3), rng)
      for (let i = 0; i < n * n; i++) {
        if (shade[i] !== YS_SHADED) continue
        if (i % n < n - 1) expect(shade[i + 1]).toBe(YS_WHITE)
        if (i + n < n * n) expect(shade[i + n]).toBe(YS_WHITE)
      }
      expect(ysJoined(n, shade.map((v) => v === YS_WHITE))).toBe(true)
    }
  })
})

describe('yard-sale levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds grids of the level's size that its own steps finish`, () => {
      const spec = ysLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = level === 'challenging' ? 3 : 5
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(ysWellFormed(built.puzzle)).toBe(true)
        expect(isYsSolution(built.puzzle, built.shade)).toBe(true)
        if (spec.size <= 8) expect(countYsSolutions(built.puzzle, 2)).toBe(1)
        expect(ysMeetsLevel(built.puzzle, built.shade, spec)).toBe(true)
        expect(solveYs(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveYs(built.puzzle, spec.beyond).solved).toBe(false)
        const shaded = ysShadedCount(built.shade)
        expect(shaded).toBeGreaterThanOrEqual(Math.ceil(spec.shaded[0] * spec.size * spec.size))
        expect(shaded).toBeLessThanOrEqual(Math.floor(spec.shaded[1] * spec.size * spec.size))
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first grid: the first steps finish it', () => {
    for (let seed = 0; seed < 5; seed++) expect(solveYs(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  })

  it('makes Challenging need "what if": the walls alone never finish it', () => {
    const built = builtFor('challenging', 7)
    expect(solveYs(built.puzzle, 'walls').solved).toBe(false)
    expect(solveYs(built.puzzle, 'probe').tally.probe).toBeGreaterThanOrEqual(2)
    // 9 × 9: the plain search still agrees on the one answer.
    expect(countYsSolutions(built.puzzle, 2)).toBe(1)
  }, SLOW)

  it('knows a grid however it is turned or mirrored, or with its numbers renamed', () => {
    const built = builtFor('classic', 2)
    const { puzzle } = built
    const n = puzzle.size
    const mirrored: YsPuzzle = { size: n, numbers: puzzle.numbers.map((_, i) => puzzle.numbers[Math.floor(i / n) * n + (n - 1 - (i % n))]!) }
    const turned: YsPuzzle = { size: n, numbers: puzzle.numbers.map((_, i) => puzzle.numbers[(n - 1 - (i % n)) * n + Math.floor(i / n)]!) }
    const renamed: YsPuzzle = { size: n, numbers: puzzle.numbers.map((v) => (v % n) + 1) }
    expect(ysSignature(mirrored)).toBe(built.signature)
    expect(ysSignature(turned)).toBe(built.signature)
    expect(ysSignature(renamed)).toBe(built.signature)
    // One number changed is another puzzle.
    const changed: YsPuzzle = { size: n, numbers: puzzle.numbers.map((v, i) => (i === 0 ? (v % n) + 1 : v)) }
    expect(ysSignature(changed)).not.toBe(built.signature)
  })
})

describe('yard-sale sales', () => {
  it('names every sale once, in retirement words, with no brand, drink, money or sadness', () => {
    expect(YS_SALES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(YS_SALES.map((s) => s.id)).size).toBe(YS_SALES.length)
    for (const s of YS_SALES) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/)
      expect(s.name).not.toMatch(/beer|wine|whisk|rum\b|cocktail|happy hour|pension|money|cash|dollar|price|old age|senior|estate|funeral|widow|clearance/i)
      expect(ysSignText(s)).toBe(s.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const lake = YS_SALES.find((s) => s.id === 'moving-to-the-lake-house')!
    expect(ysSignText(lake, 2)).toBe('Moving to the\nLake House')
    const porch = YS_SALES.find((s) => s.id === 'porch-sale-on-elm-street')!
    expect(ysSignText(porch, 2).split('\n')).toHaveLength(2)
    expect(ysSignText(porch, 2).replace('\n', ' ')).toBe(porch.name)
  })

  it('works through every sale before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < YS_SALES.length + 5; page++) {
      const book = parseYsBook(labels)
      const pick = pickYsSale({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.sale)
      labels.push(ysPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, YS_SALES.length).map((l) => l.split('|')[0])).size).toBe(YS_SALES.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickYsSale({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = YS_SALES.slice(0, YS_SALES.length - 3).map((s) => s.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a sale', () => {
    expect(parseYsBook(['front-lawn-sale|gentle|abc', 'nowhere|classic|x', 'card-club-swap|odd|def', ''])).toEqual([
      { sale: 'front-lawn-sale', level: 'gentle', signature: 'abc' },
      { sale: 'card-club-swap', level: null, signature: 'def' },
    ])
  })
})

describe('yard-sale pages', () => {
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
        const size = ysLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'number')).toHaveLength(size * size)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor, with numbers at 16 pt or more', () => {
    const big = planYsPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planYsPage(panelFor(kdpCtx(w, h), level), level, FONT)!
        expect(plan.cell, `${level} ${w}x${h}`).toBeGreaterThanOrEqual(Math.ceil(ysLevelSpec(level).minCell))
        expect(plan.digitSize).toBeGreaterThanOrEqual(YS_DIGIT_MIN)
        expect(plan.cell - plan.digitSize).toBeGreaterThanOrEqual(YS_DIGIT_AIR * 2)
      }
    }
  })

  it('keeps the legend on one row on every trim, and stacks it cleanly when a wide font needs to', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) expect(planYsPage(panelFor(kdpCtx(w, h), level), level, FONT)!.legendRows, `${level} ${w}x${h}`).toBe(1)
    }
    const panel = panelFor(kdpCtx(8.5, 11), 'gentle')
    const flat = planYsPage(panel, 'gentle', FONT)!
    const plan = { ...flat, legendRows: 2 as const, legendHeight: ysLegendRowHeight() * 2 + YS_LEGEND_ROW_GAP }
    const built = builtFor('gentle')
    const sale = YS_SALES.find((s) => s.id === 'moving-to-the-lake-house')!
    const puzzle = buildYsPuzzle({ built, plan, sale, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkYsDrawnPage({ puzzle, built, sale })).toEqual([])
    const [repeatWords, touchWords] = partsOf(puzzle, 'legend-text')
    expect(touchWords!.top).toBeGreaterThan(repeatWords!.top)
    expect(touchWords!.left).toBe(repeatWords!.left)
  })

  it('keeps the sign and the legend clear of the grid', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planYsPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(YS_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planYsPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runYsKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', sale: YS_SALES[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the grid.')
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, a bold number in every square, and the shading hidden for the answer page', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${YS_TEMPLATE_KEY}:${signature}`)
    const sale = YS_SALES.find((s) => s.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(ysSignText(sale))
    expect(partsOf(puzzle, 'rule')).toHaveLength(18)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    const numbers = partsOf(puzzle, 'number')
    expect(numbers).toHaveLength(64)
    expect(numbers.every((t) => t.visible !== false && t.studioRole === 'prompt' && t.fontWeight === 700)).toBe(true)
    const shades = partsOf(puzzle, 'answer-shade')
    expect(shades.length).toBeGreaterThanOrEqual(16)
    expect(shades.every((s) => s.visible === false && s.studioRole === 'answer' && s.fill === YS_SHADE_FILL)).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual(['shade one', 'never touch'])
    expect(partsOf(puzzle, 'legend-shade')).toHaveLength(3)
    expect(partsOf(puzzle, 'legend-cross')).toHaveLength(1)
  })

  it('shades every square to shade on the answer page, gray with its number showing, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const puzzleGroup = puzzleOf(out[0]!.objects)!
    const hidden = partsOf(puzzleGroup, 'answer-shade').length
    expect(out.flatMap((p) => harvestAnswers(p.objects)).length).toBe(hidden)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const shades = partsOf(puzzle, 'answer-shade')
    expect(shades).toHaveLength(hidden)
    expect(shades.every((s) => s.visible === true && s.fill === YS_SHADE_FILL)).toBe(true)
    expect(partsOf(puzzle, 'number').every((t) => t.visible !== false)).toBe(true)
    // The grid read back from the key keeps every rule.
    const n = 8
    const numbers = new Array<number>(n * n).fill(0)
    for (const o of partsOf(puzzle, 'number')) numbers[Number(o.data?.row) * n + Number(o.data?.col)] = Number(o.text)
    const shade = new Array<number>(n * n).fill(YS_WHITE)
    for (const o of shades) shade[Number(o.data?.row) * n + Number(o.data?.col)] = YS_SHADED
    expect(isYsSolution({ size: n, numbers }, shade)).toBe(true)
    expect(key.some((o) => o.text === YS_HOW_TO)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === YS_HOW_TO)).toBe(true)
  })

  it('builds a book that works through every sale before one returns, never printing a grid twice', () => {
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

  it('opens a seller’s next book at sales their last one did not use', () => {
    const recent = YS_SALES.slice(0, 20).map((s) => s.id)
    rememberStudioContent(studioVarietyKey(YS_TEMPLATE_KEY, 'sales'), recent)
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

describe('yard-sale preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planYsPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const sale = YS_SALES[0]!
  const run = (over: Partial<Parameters<typeof runYsKdpPreflight>[0]>) => runYsKdpPreflight({ built, plan, level: 'classic', sale, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven grid', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    const i = built.shade.findIndex((v) => v === YS_SHADED)
    const shade = built.shade.map((v, k) => (k === i ? YS_WHITE : v))
    expect(run({ built: { ...built, shade } })).toMatch(/breaks a rule/)
  })

  it('refuses a grid with several answers', () => {
    // One shaded square given another repeat, until the answer still holds but is no longer the only one.
    const n = built.puzzle.size
    let loose: YsPuzzle | null = null
    for (let i = 0; i < n * n && !loose; i++) {
      if (built.shade[i] !== YS_SHADED) continue
      for (let v = 1; v <= n && !loose; v++) {
        const p: YsPuzzle = { size: n, numbers: built.puzzle.numbers.map((x, k) => (k === i ? v : x)) }
        if (isYsSolution(p, built.shade) && countYsSolutions(p, 2) === 2) loose = p
      }
    }
    expect(loose).not.toBeNull()
    expect(run({ built: { ...built, puzzle: loose!, signature: ysSignature(loose!) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic grid that the first steps alone finish', () => {
    let easy: YsBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawYsCandidate({ ...ysLevelSpec('gentle'), size: 8, shaded: ysLevelSpec('classic').shaded, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a grid or a sale the book already has', () => {
    const book = parseYsBook([ysPageLabel(sale, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseYsBook([ysPageLabel(YS_SALES[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this grid/)
  })

  it('refuses squares below the level’s floor, small numbers, and a grid off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    expect(run({ plan: { ...plan, digitSize: 12 } })).toMatch(/below 16 pt/)
    expect(run({ plan: { ...plan, digitSize: plan.cell - 4 } })).toMatch(/crowds its square/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
  })

  it('catches a drawn page whose numbers, shading or sign do not match', () => {
    const puzzle = buildYsPuzzle({ built, plan, sale, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkYsDrawnPage({ puzzle, built, sale })).toEqual([])
    expect(checkYsDrawnPage({ puzzle, built: builtFor('classic', 4), sale }).join(' ')).toMatch(/wrong number|shading/)
    const white = built.shade.findIndex((v) => v === YS_WHITE)
    const moved: YsBuilt = { ...built, shade: built.shade.map((v, i) => (i === white ? YS_SHADED : v)) }
    expect(checkYsDrawnPage({ puzzle, built: moved, sale }).join(' ')).toMatch(/shading is missing or wrong/)
    expect(checkYsDrawnPage({ puzzle, built, sale: YS_SALES[5]! }).join(' ')).toMatch(/sign does not name/)
  })
})
