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
import { islandHoppingTemplate } from './generate'
import { IH_CONFIG_SCHEMA } from './config'
import {
  IH_CHAINS,
  IH_DEFAULT_TITLE,
  IH_GENTLE_TIP,
  IH_INSTRUCTION,
  IH_LEVELS,
  IH_TEMPLATE_KEY,
  ihChartRng,
  ihInstruction,
  ihLevelSpec,
  ihPageLabel,
  ihSignText,
  parseIhBook,
  parseIhLevel,
  pickIhChain,
  type IhLevel,
} from './content'
import { IH_PART_KEY, buildIhPuzzle } from './draw'
import { checkIhDrawnPage, runIhKdpPreflight } from './kdp-preflight'
import { IH_NUMBER_MIN, IH_SIGN_GAP_MIN, ihContentBox, ihPanelInBody, ihPrintNote, planIhPage } from './layout'
import { buildIhChart, draftIhChart, drawIhCandidate, ihSignature, type IhBuilt } from './puzzle'
import { bridgesOf, countIhSolutions, ihBridgeList, ihLanes, ihNumbers, isIhSolution, solveIh, type IhBridge, type IhPuzzle } from './solver'

const FONT = 'PT Serif'
const LEVELS = IH_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: IH_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(islandHoppingTemplate),
  showTitle: true,
  title: IH_DEFAULT_TITLE,
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
  return islandHoppingTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[IH_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[IH_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: IhLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(ihContentBox(ctx), config, tag, ihInstruction(config, level))
  return ihPanelInBody(header.body, header.objects.length > 0)
}

/**
 * Parse a picture of a chart: a digit is an island, `-` / `=` a single or
 * double bridge across, `|` / `H` a single or double bridge down, anything
 * else open sea. The numbers are read off the bridges.
 */
function chartFrom(rows: string[]): IhBuilt {
  const cols = rows[0]!.length
  const spots: [number, number][] = []
  rows.forEach((row, r) => [...row].forEach((ch, c) => /\d/.test(ch) && spots.push([r, c])))
  const index = new Map(spots.map(([r, c], i) => [`${r},${c}`, i]))
  const bridges: IhBridge[] = []
  spots.forEach(([r, c], i) => {
    for (const [dr, dc, marks] of [
      [0, 1, '-='],
      [1, 0, '|H'],
    ] as const) {
      const first = rows[r + dr]?.[c + dc]
      if (!first || !marks.includes(first)) continue
      let rr = r + dr
      let cc = c + dc
      while (rows[rr]?.[cc] && marks.includes(rows[rr]![cc]!)) {
        rr += dr
        cc += dc
      }
      const j = index.get(`${rr},${cc}`)
      if (j !== undefined) bridges.push({ a: i, b: j, count: first === marks[0] ? 1 : 2 })
    }
  })
  const numbers = ihNumbers(spots.length, bridges)
  const puzzle: IhPuzzle = { rows: rows.length, cols, islands: spots.map(([row, col], i) => ({ row, col, n: numbers[i]! })) }
  return { puzzle, bridges, signature: ihSignature(puzzle) }
}

function builtFor(level: IhLevel, seed = 1): IhBuilt {
  return buildIhChart({ ...ihLevelSpec(level), rng: ihChartRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(islandHoppingTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: IH_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(islandHoppingTemplate, { seeds: 12 })

describe('island-hopping registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === IH_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(IH_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retirement/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(IH_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(IH_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(islandHoppingTemplate).level).toBe('classic')
    expect(parseIhLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseIhLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(ihInstruction(base, 'gentle')).toBe(`${IH_INSTRUCTION} ${IH_GENTLE_TIP}`)
    expect(ihInstruction(base, 'classic')).toBe(IH_INSTRUCTION)
    expect(ihInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports island and number sizes on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = ihPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Islands print 0\.\d\d in across, 0\.\d\d in apart, numbers at \d+(\.5)? pt\.$/)
      expect(ihPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(ihPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('island-hopping rules and solver', () => {
  // A solved 5 × 5: a loop of four islands and a tail, one double bridge.
  const solved = chartFrom(['2-2..', '|.|..', '3-3=2', '.....', '.....'])

  it('reads a chart picture the way it is drawn', () => {
    expect(solved.puzzle.islands.map((i) => i.n)).toEqual([2, 2, 2, 4, 2])
    expect(ihLanes(solved.puzzle)).toHaveLength(5)
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    const { puzzle, bridges } = solved
    expect(isIhSolution(puzzle, bridges)).toBe(true)
    // A number that disagrees.
    expect(isIhSolution({ ...puzzle, islands: puzzle.islands.map((isl, i) => (i === 0 ? { ...isl, n: 3 } : isl)) }, bridges)).toBe(false)
    // Three bridges on one lane.
    expect(isIhSolution(puzzle, bridges.map((b) => (b.count === 2 ? { ...b, count: 3 as 2 } : b)))).toBe(false)
    // A bridge between islands that do not face each other.
    expect(isIhSolution(puzzle, [...bridges, { a: 0, b: 3, count: 1 }])).toBe(false)
    // Two groups, each finished on its own.
    const split = chartFrom(['1-1.1', '....|', '1-1.1'])
    expect(isIhSolution(split.puzzle, split.bridges)).toBe(false)
    // Crossing bridges.
    const cross: IhPuzzle = { rows: 3, cols: 3, islands: [{ row: 0, col: 1, n: 1 }, { row: 1, col: 0, n: 1 }, { row: 1, col: 2, n: 1 }, { row: 2, col: 1, n: 1 }] }
    expect(isIhSolution(cross, [{ a: 0, b: 3, count: 1 }, { a: 1, b: 2, count: 1 }])).toBe(false)
  })

  it('solves a proven chart step by step, on exactly its answer', () => {
    const result = solveIh(solved.puzzle, 'probe')
    expect(result.solved).toBe(true)
    expect(ihBridgeList(bridgesOf(solved.puzzle, result.state))).toBe(ihBridgeList(solved.bridges))
  })

  it('refuses to guess: a chart with two answers is left unfinished at every level', () => {
    // A square of four 3s: the doubles go on the top and bottom, or on the sides.
    const ring = chartFrom(['3=3', '|.|', '3=3'])
    expect(countIhSolutions(ring.puzzle, 5)).toBe(2)
    for (const rules of ['basic', 'connect', 'probe'] as const) expect(solveIh(ring.puzzle, rules).solved).toBe(false)
  })

  it('joins up where counting cannot: two 1s never join, two 2s never double up, when that cuts them off', () => {
    // The tail's double leaves the square of 2s open to singles or opposite doubles;
    // only the singles keep the chart in one piece.
    expect(countIhSolutions(solved.puzzle, 2)).toBe(1)
    expect(solveIh(solved.puzzle, 'basic').solved).toBe(false)
    const joined = solveIh(solved.puzzle, 'connect')
    expect(joined.solved).toBe(true)
    expect(joined.tally.connect).toBeGreaterThan(0)
    // Two 1s facing each other: joined, they would sail off on their own.
    const ones = chartFrom(['1.1', '|.|', '2-2'])
    expect(countIhSolutions(ones.puzzle, 2)).toBe(1)
    expect(solveIh(ones.puzzle, 'basic').solved).toBe(false)
    expect(solveIh(ones.puzzle, 'connect').solved).toBe(true)
  })

  it('finishes with joining up (Classic) and "what if" (Challenging) charts that counting cannot', () => {
    let byConnect = 0
    let byProbe = 0
    for (let k = 0; k < 600 && (byConnect < 3 || byProbe < 3); k++) {
      const rng = createRng(31 + k)
      const draft = draftIhChart({ rows: 9, cols: 9, islands: 16, rng, double: 0.25, loop: 0.2 })
      if (!draft || solveIh(draft.puzzle, 'basic').solved) continue
      const connect = solveIh(draft.puzzle, 'connect')
      if (connect.solved) {
        byConnect++
        expect(connect.tally.connect).toBeGreaterThan(0)
        expect(countIhSolutions(draft.puzzle, 2)).toBe(1)
      } else if (solveIh(draft.puzzle, 'probe').solved) {
        byProbe++
        expect(solveIh(draft.puzzle, 'probe').tally.probe).toBeGreaterThan(0)
        expect(countIhSolutions(draft.puzzle, 2)).toBe(1)
      }
    }
    expect(byConnect).toBeGreaterThan(0)
    expect(byProbe).toBeGreaterThan(0)
  })

  it('agrees with brute force: every chart the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, islands, rules] of [[7, 9, 'basic'], [7, 11, 'connect'], [8, 13, 'probe'], [9, 15, 'probe']] as const) {
      for (let k = 0; k < 80; k++) {
        const built = drawIhCandidate({ rows: size, cols: size, islands, rules, rng })
        if (!built) continue
        finished++
        expect(countIhSolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(100)
  })

  it('never claims a chart with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 600 && ambiguous < 25; k++) {
      const draft = draftIhChart({ rows: 7, cols: 7, islands: 10, rng: createRng(77 + k), double: 0.2, loop: 0.5 })
      if (!draft || countIhSolutions(draft.puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'connect', 'probe'] as const) expect(solveIh(draft.puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(5)
  })
})

describe('island-hopping levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds charts of the level's size and islands that its own steps finish`, () => {
      const spec = ihLevelSpec(level)
      const signatures = new Set<string>()
      for (let seed = 0; seed < 6; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.rows).toBe(spec.size)
        expect(built.puzzle.cols).toBe(spec.size)
        expect(built.puzzle.islands.length).toBeGreaterThanOrEqual(spec.minIslands)
        expect(built.puzzle.islands.length).toBeLessThanOrEqual(spec.maxIslands)
        expect(isIhSolution(built.puzzle, built.bridges)).toBe(true)
        expect(solveIh(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveIh(built.puzzle, spec.beyond).solved).toBe(false)
        // Never two islands side by side: every bridge spans open sea.
        const spots = new Set(built.puzzle.islands.map((i) => `${i.row},${i.col}`))
        for (const isl of built.puzzle.islands) {
          expect(spots.has(`${isl.row},${isl.col + 1}`) || spots.has(`${isl.row + 1},${isl.col}`)).toBe(false)
        }
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(6)
    })
  }

  it('makes Gentle a reader’s first chart: counting alone finishes it', () => {
    for (let seed = 0; seed < 6; seed++) expect(solveIh(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  })
})

describe('island-hopping island chains', () => {
  it('names every chain once, in retirement words, with no brand, drink or money', () => {
    expect(IH_CHAINS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(IH_CHAINS.map((c) => c.id)).size).toBe(IH_CHAINS.length)
    for (const c of IH_CHAINS) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/)
      expect(c.name).not.toMatch(/beer|wine|whisk|rum|cocktail|margarita|happy hour|pension|money|cash|dollar|old age|senior/i)
      expect(ihSignText(c)).toBe(`${c.name} Islands`)
    }
  })

  it('sails to every chain before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < IH_CHAINS.length + 5; page++) {
      const book = parseIhBook(labels)
      const pick = pickIhChain({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.chain)
      labels.push(ihPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, IH_CHAINS.length).map((l) => l.split('|')[0])).size).toBe(IH_CHAINS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickIhChain({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = IH_CHAINS.slice(0, IH_CHAINS.length - 3).map((c) => c.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a chain', () => {
    expect(parseIhBook(['porch-swing|gentle|abc', 'nowhere|classic|x', 'slow-tide|odd|def', ''])).toEqual([
      { chain: 'porch-swing', level: 'gentle', signature: 'abc' },
      { chain: 'slow-tide', level: null, signature: 'def' },
    ])
  })
})

describe('island-hopping pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print chart on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const numbers = partsOf(puzzle!, 'number')
        expect(numbers).toHaveLength(Number(puzzle!.data?.islands))
        expect(numbers.every((n) => (n.fontSize ?? 0) >= IH_NUMBER_MIN)).toBe(true)
        expect(puzzle!.data?.size).toBe(`${ihLevelSpec(level).size}x${ihLevelSpec(level).size}`)
      }
    }
  })

  it('spaces islands as widely as the trim allows, never below the level’s floor', () => {
    const big = planIhPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planIhPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(ihLevelSpec('challenging').minCell))
    for (const plan of [big, small]) expect(plan.numberSize).toBeLessThan(plan.islandRadius * 2)
  })

  it('breaks the sign under the name, and stacks the legend, rather than shrinking the chart on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 400, height: 1000 }
    const plan = planIhPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const chain = IH_CHAINS.find((c) => c.id === 'no-alarm-clock')!
    expect(runIhKdpPreflight({ built, plan, level: 'gentle', chain, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildIhPuzzle({ built, plan, chain, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkIhDrawnPage({ puzzle, built, chain })).toEqual([])
    const [islandWords, bridgeWords] = partsOf(puzzle, 'legend-text')
    expect(bridgeWords!.top).toBeGreaterThan(islandWords!.top)
    const tight = planIhPage({ left: 0, top: 0, width: 300, height: 1000 }, 'gentle', FONT)
    if (tight) expect(tight.signLines === 2 || tight.signSize < plan.signSize).toBe(true)
  })

  it('keeps the sign clear of the chart', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planIhPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(IH_SIGN_GAP_MIN)
      }
    }
    const plan = planIhPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runIhKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', chain: IH_CHAINS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the chart.')
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, every island with its number, a dot on every open point and a hidden bridge on every answer lane', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${IH_TEMPLATE_KEY}:${signature}`)
    const chain = IH_CHAINS.find((c) => c.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(ihSignText(chain))
    const islands = partsOf(puzzle, 'island')
    expect(partsOf(puzzle, 'dot')).toHaveLength(81 - islands.length)
    const bridges = partsOf(puzzle, 'bridge')
    expect(bridges.length).toBeGreaterThanOrEqual(islands.length - 1)
    expect(bridges.every((b) => b.visible === false && b.studioRole === 'answer')).toBe(true)
    expect(partsOf(puzzle, 'legend-bridge')[0]!.visible).not.toBe(false)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual([`Island (${islands.length} to join)`, 'Bridge (1 or 2)'])
  })

  it('builds every bridge on the answer page in black, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(10)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const bridges = partsOf(puzzle, 'bridge')
    expect(bridges.length).toBe(answers.length)
    expect(bridges.every((b) => b.visible === true && b.stroke === STUDIO_INK && b.fill === 'transparent')).toBe(true)
    // A double bridge is two strokes in one path.
    for (const b of bridges) expect((b.path as unknown[]).length).toBe(Number(b.data?.count) * 2)
    expect(key.some((o) => o.text === IH_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === IH_INSTRUCTION)).toBe(true)
  })

  it('builds a book that sails to every chain before one returns, never printing a chart twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  })

  it('opens a seller’s next book at chains their last one did not visit', () => {
    const recent = IH_CHAINS.slice(0, 20).map((c) => c.id)
    rememberStudioContent(studioVarietyKey(IH_TEMPLATE_KEY, 'chains'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different chart for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('island-hopping preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planIhPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const chain = IH_CHAINS[0]!
  const run = (over: Partial<Parameters<typeof runIhKdpPreflight>[0]>) =>
    runIhKdpPreflight({ built, plan, level: 'classic', chain, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven chart', () => {
    expect(run({})).toBe('')
  })

  it('refuses numbers that do not match the answer', () => {
    const islands = built.puzzle.islands.map((isl, i) => (i === 0 ? { ...isl, n: isl.n + 1 } : isl))
    expect(run({ built: { ...built, puzzle: { ...built.puzzle, islands } } })).toMatch(/do not match/)
  })

  it('refuses a chart with several answers', () => {
    const ring = chartFrom(['3=3......', '|.|......', '3=3......', '.........', '.........', '.........', '.........', '.........', '.........'])
    expect(run({ built: ring })).toMatch(/logic alone/)
  })

  it('refuses a Classic chart that counting alone finishes', () => {
    let easy: IhBuilt | null = null
    for (let k = 0; !easy; k++) {
      easy = drawIhCandidate({ rows: 9, cols: 9, islands: 16, rules: 'basic', rng: createRng(5 + k) })
    }
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a chain or a chart the book already has', () => {
    const book = parseIhBook([ihPageLabel(chain, 'classic', 'other')])
    expect(run({ book })).toMatch(/already visits/)
    const same = parseIhBook([ihPageLabel(IH_CHAINS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this chart/)
  })

  it('refuses islands packed below the level’s spacing and a chart off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/closer together/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
  })

  it('catches a drawn page whose islands, numbers or bridges do not match', () => {
    const puzzle = buildIhPuzzle({ built, plan, chain, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkIhDrawnPage({ puzzle, built, chain })).toEqual([])
    expect(checkIhDrawnPage({ puzzle, built: builtFor('classic', 4), chain }).length).toBeGreaterThan(0)
    const flipped: IhBuilt = { ...built, bridges: built.bridges.map((b, i) => (i === 0 ? { ...b, count: (3 - b.count) as 1 | 2 } : b)) }
    expect(checkIhDrawnPage({ puzzle, built: flipped, chain }).join(' ')).toMatch(/single where it is double/)
    expect(checkIhDrawnPage({ puzzle, built, chain: IH_CHAINS[5]! }).join(' ')).toMatch(/sign/)
  })
})
