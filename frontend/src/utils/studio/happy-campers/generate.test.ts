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
import { happyCampersTemplate } from './generate'
import { HC_CONFIG_SCHEMA } from './config'
import {
  HC_CAMPGROUNDS,
  HC_DEFAULT_TITLE,
  HC_GENTLE_TIP,
  HC_INSTRUCTION,
  HC_LEVELS,
  HC_TEMPLATE_KEY,
  hcGridRng,
  hcInstruction,
  hcLevelSpec,
  hcPageLabel,
  hcSignText,
  parseHcBook,
  parseHcLevel,
  pickHcCampground,
  type HcLevel,
} from './content'
import { HC_PART_KEY, buildHcPuzzle } from './draw'
import { checkHcDrawnPage, runHcKdpPreflight } from './kdp-preflight'
import { HC_COUNT_MIN, HC_SIGN_GAP_MIN, hcContentBox, hcPanelInBody, hcPrintNote, planHcPage } from './layout'
import { buildHcGrid, drawHcCandidate, hcSignature, type HcBuilt } from './puzzle'
import { TENT, UNKNOWN, countHcSolutions, hcCounts, isHcSolution, solveHc, type HcPuzzle } from './solver'

const FONT = 'PT Serif'
const LEVELS = HC_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: HC_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(happyCampersTemplate),
  showTitle: true,
  title: HC_DEFAULT_TITLE,
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
  return happyCampersTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[HC_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[HC_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: HcLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(hcContentBox(ctx), config, tag, hcInstruction(config, level))
  return hcPanelInBody(header.body, header.objects.length > 0)
}

/** Parse a picture of a grid: T tree, A tent, anything else open. */
function gridFrom(rows: string[]): HcBuilt {
  const cols = rows[0]!.length
  const trees = rows.flatMap((row) => [...row].map((ch) => ch === 'T'))
  const tents = rows.flatMap((row) => [...row].map((ch) => ch === 'A'))
  const { rowCounts, colCounts } = hcCounts(rows.length, cols, tents)
  const puzzle: HcPuzzle = { rows: rows.length, cols, trees, rowCounts, colCounts }
  return { puzzle, tents, signature: hcSignature(puzzle, tents) }
}

function builtFor(level: HcLevel, seed = 1): HcBuilt {
  return buildHcGrid({ ...hcLevelSpec(level), rng: hcGridRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(happyCampersTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: HC_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(happyCampersTemplate, { seeds: 12 })

describe('happy-campers registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === HC_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(HC_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retirement/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(HC_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(HC_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(happyCampersTemplate).level).toBe('classic')
    expect(parseHcLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseHcLevel(level)).toBe(level)
  })

  it('adds the dotting tip at Gentle only, and drops the how-to when asked', () => {
    expect(hcInstruction(base, 'gentle')).toBe(`${HC_INSTRUCTION} ${HC_GENTLE_TIP}`)
    expect(hcInstruction(base, 'classic')).toBe(HC_INSTRUCTION)
    expect(hcInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports square and number sizes on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = hcPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print at 0\.\d\d in, numbers at \d+(\.5)? pt\.$/)
      expect(hcPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(hcPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('happy-campers rules and solver', () => {
  // A solved 5 × 5: five trees, each with its tent beside it.
  const solved = gridFrom(['TA.T.', '...A.', 'A....', 'T..AT', '.AT..'])

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    const { puzzle, tents } = solved
    expect(isHcSolution(puzzle, tents)).toBe(true)
    // Two tents touching corner to corner.
    const touching = [...tents]
    touching[1] = false
    touching[6] = true
    expect(isHcSolution({ ...puzzle, ...hcCounts(5, 5, touching) }, touching)).toBe(false)
    // A tent with no tree of its own.
    const stray = [...tents]
    stray[24] = true
    expect(isHcSolution({ ...puzzle, ...hcCounts(5, 5, stray) }, stray)).toBe(false)
    // Numbers that disagree.
    expect(isHcSolution({ ...puzzle, rowCounts: [2, 0, 1, 1, 1] }, tents)).toBe(false)
    // A tent on a tree.
    const onTree = [...tents]
    onTree[0] = true
    expect(isHcSolution(puzzle, onTree)).toBe(false)
  })

  it('solves a proven grid step by step, on exactly its answer', () => {
    const result = solveHc(solved.puzzle, 'probe')
    expect(result.solved).toBe(true)
    expect(Array.from(result.state, (v) => v === TENT)).toEqual(solved.tents)
    expect(result.state.includes(UNKNOWN)).toBe(false)
  })

  it('refuses to guess: a grid with two answers is left unfinished at every level', () => {
    // Two trees in the middle column: the tents go on opposite corners, either pair.
    const twin: HcPuzzle = { rows: 3, cols: 3, trees: [false, true, false, false, false, false, false, true, false], rowCounts: [1, 0, 1], colCounts: [1, 0, 1] }
    expect(countHcSolutions(twin, 5)).toBe(2)
    for (const rules of ['basic', 'runs', 'probe'] as const) expect(solveHc(twin, rules).solved).toBe(false)
  })

  it('finishes with gap counting (Classic) and "what if" (Challenging) grids the basic steps cannot', () => {
    const rng = createRng(31)
    let byRuns = 0
    let byProbe = 0
    for (let k = 0; k < 300 && (byRuns < 3 || byProbe < 3); k++) {
      const built = drawHcCandidate({ rows: 8, cols: 8, tentCount: 12, rules: 'probe', rng })
      if (!built || solveHc(built.puzzle, 'basic').solved) continue
      expect(countHcSolutions(built.puzzle, 2)).toBe(1)
      const runs = solveHc(built.puzzle, 'runs')
      if (runs.solved) {
        byRuns++
        expect(runs.tally.runs).toBeGreaterThan(0)
      } else {
        byProbe++
        expect(solveHc(built.puzzle, 'probe').tally.probe).toBeGreaterThan(0)
      }
    }
    expect(byRuns).toBeGreaterThan(0)
    expect(byProbe).toBeGreaterThan(0)
  })

  it('agrees with brute force: every grid the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, tents, rules] of [[6, 7, 'basic'], [7, 9, 'runs'], [8, 12, 'runs'], [8, 13, 'probe']] as const) {
      for (let k = 0; k < 60; k++) {
        const built = drawHcCandidate({ rows: size, cols: size, tentCount: tents, rules, rng })
        if (!built) continue
        finished++
        expect(countHcSolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(100)
  })

  it('never claims a grid with several answers is solved', () => {
    const rng = createRng(77)
    let ambiguous = 0
    for (let k = 0; k < 400 && ambiguous < 25; k++) {
      // Plant trees for random tents, and keep the grids with more than one answer.
      const built = drawHcCandidate({ rows: 6, cols: 6, tentCount: 8, rules: 'probe', rng })
      if (built) continue
      const loose = gridFromRandom(rng)
      if (!loose || countHcSolutions(loose.puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'runs', 'probe'] as const) expect(solveHc(loose.puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(5)
  })
})

/** A random 6 × 6 grid with a real answer, whatever its answer count. */
function gridFromRandom(rng: ReturnType<typeof createRng>): HcBuilt | null {
  const rows: string[][] = Array.from({ length: 6 }, () => new Array<string>(6).fill('.'))
  let placed = 0
  for (let k = 0; k < 80 && placed < 7; k++) {
    const r = rng.int(0, 5)
    const c = rng.int(0, 5)
    if (rows[r]![c] !== '.') continue
    let clear = true
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (rows[r + dr]?.[c + dc] === 'A') clear = false
    if (!clear) continue
    const sides = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].filter(([rr, cc]) => rows[rr!]?.[cc!] === '.')
    if (sides.length === 0) continue
    const [tr, tc] = rng.pick(sides)!
    rows[r]![c] = 'A'
    rows[tr!]![tc!] = 'T'
    placed++
  }
  return placed === 7 ? gridFrom(rows.map((row) => row.join(''))) : null
}

describe('happy-campers levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds grids of the level's size and trees that its own steps finish`, () => {
      const spec = hcLevelSpec(level)
      const signatures = new Set<string>()
      for (let seed = 0; seed < 6; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.rows).toBe(spec.size)
        expect(built.puzzle.cols).toBe(spec.size)
        const trees = built.puzzle.trees.filter(Boolean).length
        expect(trees).toBeGreaterThanOrEqual(spec.minTents)
        expect(trees).toBeLessThanOrEqual(spec.maxTents)
        expect(built.tents.filter(Boolean).length).toBe(trees)
        expect(isHcSolution(built.puzzle, built.tents)).toBe(true)
        expect(solveHc(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyondBasic) expect(solveHc(built.puzzle, 'basic').solved).toBe(false)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(6)
    })
  }

  it('makes Gentle a reader’s first grid: the basic steps alone finish it', () => {
    for (let seed = 0; seed < 6; seed++) expect(solveHc(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  })
})

describe('happy-campers campgrounds', () => {
  it('names every campground once, in retirement words, with no brand, drink or money', () => {
    expect(HC_CAMPGROUNDS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(HC_CAMPGROUNDS.map((c) => c.id)).size).toBe(HC_CAMPGROUNDS.length)
    for (const c of HC_CAMPGROUNDS) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/)
      expect(c.name).not.toMatch(/beer|wine|whisk|cocktail|happy hour|pension|money|cash|dollar|old age|senior/i)
      expect(hcSignText(c)).toBe(`${c.name} Campground`)
    }
  })

  it('walks every campground before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < HC_CAMPGROUNDS.length + 5; page++) {
      const book = parseHcBook(labels)
      const pick = pickHcCampground({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.campground)
      labels.push(hcPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, HC_CAMPGROUNDS.length).map((l) => l.split('|')[0])).size).toBe(HC_CAMPGROUNDS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickHcCampground({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = HC_CAMPGROUNDS.slice(0, HC_CAMPGROUNDS.length - 3).map((c) => c.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a campground', () => {
    expect(parseHcBook(['rocking-chair-ridge|gentle|abc', 'nowhere|classic|x', 'slow-lane-lake|odd|def', ''])).toEqual([
      { campground: 'rocking-chair-ridge', level: 'gentle', signature: 'abc' },
      { campground: 'slow-lane-lake', level: null, signature: 'def' },
    ])
  })
})

describe('happy-campers pages', () => {
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
        const counts = partsOf(puzzle!, 'count')
        expect(counts).toHaveLength(hcLevelSpec(level).size * 2)
        expect(counts.every((c) => (c.fontSize ?? 0) >= HC_COUNT_MIN)).toBe(true)
        expect(puzzle!.data?.size).toBe(`${hcLevelSpec(level).size}x${hcLevelSpec(level).size}`)
      }
    }
  })

  it('prints squares as large as the trim allows, never below the level’s floor', () => {
    const big = planHcPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planHcPage(panelFor(kdpCtx(5.5, 8.5), 'challenging', base), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(hcLevelSpec('challenging').minCell))
  })

  it('breaks the sign under the name, rather than shrinking the grid, when one line is too wide', () => {
    const narrow = { left: 0, top: 0, width: 380, height: 1000 }
    const plan = planHcPage(narrow, 'gentle', FONT)!
    expect(plan.signLines).toBe(2)
    const built = builtFor('gentle')
    const campground = HC_CAMPGROUNDS.find((c) => c.id === 'pancake-breakfast-pines')!
    expect(runHcKdpPreflight({ built, plan, level: 'gentle', campground, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildHcPuzzle({ built, plan, campground, level: 'gentle', label: 'x', tag, font: FONT })
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe('Pancake Breakfast Pines\nCampground')
    expect(checkHcDrawnPage({ puzzle, built, campground })).toEqual([])
  })

  it('keeps the sign clear of the numbers, with room for its name to set on one line', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const plan = planHcPage(panelFor(ctx, level), level, FONT)!
        const puzzle = puzzleOf(generate({ ...base, level, seed: 11 }, ctx)[0]!.objects)!
        const board = partsOf(puzzle, 'sign')[0]!
        const text = partsOf(puzzle, 'sign-text')[0]!
        const firstNumberTop = plan.grid.top - plan.countGap - plan.colCountHeight
        // Air under the board grows with the squares and never drops below the floor.
        expect(firstNumberTop - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(HC_SIGN_GAP_MIN)
        expect(plan.signGap).toBeGreaterThanOrEqual(Math.round(plan.cell * 0.45) - 1)
        // The words' box is at least as wide as the board, so a wider font runs past the padding rather than wrapping.
        expect(text.width!).toBeGreaterThanOrEqual(board.width!)
      }
    }
    const plan = planHcPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runHcKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', campground: HC_CAMPGROUNDS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the numbers.')
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, every number in its line, a tree on every tree square and a hidden tent on every answer square', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${HC_TEMPLATE_KEY}:${signature}`)
    const campground = HC_CAMPGROUNDS.find((c) => c.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(hcSignText(campground))
    const tents = partsOf(puzzle, 'tent')
    expect(tents.length).toBe(partsOf(puzzle, 'tree').length)
    expect(tents.every((t) => t.visible === false && t.studioRole === 'answer')).toBe(true)
    expect(partsOf(puzzle, 'legend-tent')[0]!.visible).not.toBe(false)
    const legend = partsOf(puzzle, 'legend-text').map((t) => t.text)
    expect(legend).toEqual(['Tree', `Tent (${tents.length} to pitch)`])
  })

  it('pitches every tent on the answer page, outlined in black, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(10)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const tents = partsOf(puzzle, 'tent')
    expect(tents.length).toBe(answers.length)
    expect(tents.every((t) => t.visible === true && t.stroke === STUDIO_INK && t.fill !== STUDIO_INK)).toBe(true)
    expect(key.some((o) => o.text === HC_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === HC_INSTRUCTION)).toBe(true)
  })

  it('builds a book that visits every campground before one returns, never printing a grid twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  })

  it('opens a seller’s next book at campgrounds their last one did not visit', () => {
    const recent = HC_CAMPGROUNDS.slice(0, 20).map((c) => c.id)
    rememberStudioContent(studioVarietyKey(HC_TEMPLATE_KEY, 'campgrounds'), recent)
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

describe('happy-campers preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planHcPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const campground = HC_CAMPGROUNDS[0]!
  const run = (over: Partial<Parameters<typeof runHcKdpPreflight>[0]>) =>
    runHcKdpPreflight({ built, plan, level: 'classic', campground, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven grid', () => {
    expect(run({})).toBe('')
  })

  it('refuses numbers that do not match the answer', () => {
    const rowCounts = [...built.puzzle.rowCounts]
    rowCounts[0] = rowCounts[0]! + 1
    expect(run({ built: { ...built, puzzle: { ...built.puzzle, rowCounts } } })).toMatch(/do not match/)
  })

  it('refuses a grid with two answers', () => {
    const twin = gridFrom(['TA......', '......AT', '........', '........', '........', '........', '........', '........'])
    const errors = run({ built: twin })
    expect(errors).toMatch(/logic alone|trees/)
  })

  it('refuses a Challenging grid the basic steps alone finish', () => {
    const rng = createRng(5)
    let easy: HcBuilt | null = null
    while (!easy) easy = drawHcCandidate({ rows: 10, cols: 10, tentCount: 19, rules: 'basic', rng })
    const hard = planHcPage(panel, 'challenging', FONT)!
    const errors = runHcKdpPreflight({ built: easy, plan: hard, level: 'challenging', campground, panel, font: FONT }).errors.join(' ')
    expect(errors).toMatch(/too easy/)
  })

  it('refuses a campground or a grid the book already has', () => {
    const book = parseHcBook([hcPageLabel(campground, 'classic', 'other')])
    expect(run({ book })).toMatch(/already visits/)
    const same = parseHcBook([hcPageLabel(HC_CAMPGROUNDS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this grid/)
  })

  it('refuses squares below the level’s size and a grid off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/below this level/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
  })

  it('catches a drawn page whose trees, tents or numbers do not match', () => {
    const puzzle = buildHcPuzzle({ built, plan, campground, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkHcDrawnPage({ puzzle, built, campground })).toEqual([])
    const other = builtFor('classic', 4)
    expect(checkHcDrawnPage({ puzzle, built: other, campground }).length).toBeGreaterThan(0)
    expect(checkHcDrawnPage({ puzzle, built, campground: HC_CAMPGROUNDS[1]! })).toContain('The sign does not name the campground.')
  })
})
