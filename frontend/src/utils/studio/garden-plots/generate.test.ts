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
import { gardenPlotsTemplate } from './generate'
import { GP_CONFIG_SCHEMA } from './config'
import {
  GP_DEFAULT_TITLE,
  GP_GARDENS,
  GP_GENTLE_TIP,
  GP_INSTRUCTION,
  GP_LEVELS,
  GP_TEMPLATE_KEY,
  gpGardenRng,
  gpInstruction,
  gpLevelSpec,
  gpPageLabel,
  gpSignText,
  parseGpBook,
  parseGpLevel,
  pickGpGarden,
  type GpLevel,
} from './content'
import { GP_PART_KEY, GP_TINTS, buildGpPuzzle, gpBedTints, gpWallRuns } from './draw'
import { checkGpDrawnPage, runGpKdpPreflight } from './kdp-preflight'
import { GP_SIGN_GAP_MIN, planGpPage, gpContentBox, gpPanelInBody, gpPrintNote } from './layout'
import { GP_MIN_BED, buildGpGarden, drawGpCandidate, drawGpFlowers, gpHandOver, gpMeetsLevel, gpSignature, growGpBeds, type GpBuilt } from './puzzle'
import { countGpSolutions, gpConnected, gpFlowerList, gpFlowersOf, gpWellFormed, isGpSolution, solveGp, type GpPuzzle } from './solver'

const FONT = 'PT Serif'
/** Tests that grow many gardens: generous room when the whole suite runs at once. */
const SLOW = 30_000
const LEVELS = GP_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: GP_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(gardenPlotsTemplate),
  showTitle: true,
  title: GP_DEFAULT_TITLE,
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
  return gardenPlotsTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[GP_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[GP_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: GpLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(gpContentBox(ctx), config, tag, gpInstruction(config, level))
  return gpPanelInBody(header.body, header.objects.length > 0)
}

/** A garden from a picture: each letter is a bed. */
function gardenFrom(rows: string[]): GpPuzzle {
  const ids = new Map<string, number>()
  const beds = rows.flatMap((row) =>
    [...row].map((ch) => {
      if (!ids.has(ch)) ids.set(ch, ids.size)
      return ids.get(ch)!
    }),
  )
  return { size: rows.length, beds }
}

/** Squares in reading order from (row, column) pairs. */
const at = (size: number, ...cells: [number, number][]) => cells.map(([r, c]) => r * size + c)

function builtFor(level: GpLevel, seed = 1): GpBuilt {
  return buildGpGarden({ ...gpLevelSpec(level), rng: gpGardenRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(gardenPlotsTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: GP_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(gardenPlotsTemplate, { seeds: 12 })

describe('garden-plots registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === GP_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(GP_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(GP_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(GP_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(gardenPlotsTemplate).level).toBe('classic')
    expect(parseGpLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseGpLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(gpInstruction(base, 'gentle')).toBe(`${GP_INSTRUCTION} ${GP_GENTLE_TIP}`)
    expect(gpInstruction(base, 'classic')).toBe(GP_INSTRUCTION)
    expect(gpInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24 + STUDIO_SAFE_AREA_PADDING_X, bottom: 24, left: 36 + STUDIO_SAFE_AREA_PADDING_X } })
    for (const level of LEVELS) {
      const note = gpPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the garden \d\.\d\d in across\.$/)
      expect(gpPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(gpPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('garden-plots rules and solver', () => {
  // A 5 × 5 garden and its answer: rows 0–4 plant in columns 0, 2, 4, 1, 3.
  const garden = gardenFrom(['AABBC', 'ABBBC', 'DDDCC', 'DDEEC', 'EEEEE'])
  const answer = at(5, [0, 0], [1, 2], [2, 4], [3, 1], [4, 3])

  it('reads a garden picture the way it is drawn', () => {
    expect(garden.size).toBe(5)
    expect(gpWellFormed(garden)).toBe(true)
    expect(gpWellFormed(gardenFrom(['AABBC', 'ABBBC', 'DDDCC', 'DDEEC', 'EEEEA']))).toBe(false)
    expect(gpConnected(at(5, [0, 0], [0, 1], [1, 1]), 5)).toBe(true)
    expect(gpConnected(at(5, [0, 0], [1, 1]), 5)).toBe(false)
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    expect(isGpSolution(garden, answer)).toBe(true)
    // Two flowers in a row.
    expect(isGpSolution(garden, at(5, [0, 0], [0, 2], [2, 4], [3, 1], [4, 3]))).toBe(false)
    // Two flowers in bed E, none in bed C.
    expect(isGpSolution(garden, at(5, [0, 1], [1, 3], [2, 0], [3, 2], [4, 4]))).toBe(false)
    // Flowers touching corner to corner: rows, columns and beds all fine.
    const stripes = gardenFrom(['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE'])
    expect(isGpSolution(stripes, at(5, [0, 0], [1, 2], [2, 4], [3, 1], [4, 3]))).toBe(true)
    expect(isGpSolution(stripes, at(5, [0, 0], [1, 1], [2, 3], [3, 4], [4, 2]))).toBe(false)
    // A flower short.
    expect(isGpSolution(garden, answer.slice(0, 4))).toBe(false)
  })

  it('solves a proven garden step by step, on exactly its answer', () => {
    const built = drawGpCandidate({ size: 7, rules: 'basic', rng: createRng(3) }) ?? builtFor('gentle', 3)
    const result = solveGp(built.puzzle, 'probe')
    expect(result.solved).toBe(true)
    expect(gpFlowerList(gpFlowersOf(result.state))).toBe(gpFlowerList(built.flowers))
  })

  it('refuses to guess: a garden with several answers is left unfinished at every level', () => {
    // Four beds in four stripes: every row-and-column answer that fits also fits the beds.
    const stripes = gardenFrom(['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE'])
    expect(countGpSolutions(stripes, 5)).toBeGreaterThan(1)
    for (const rules of ['basic', 'sets', 'probe'] as const) expect(solveGp(stripes, rules).solved).toBe(false)
  })

  it('counts beds in groups where the basic steps cannot', () => {
    let grouped = 0
    for (let k = 0; k < 40 && grouped < 3; k++) {
      const built = drawGpCandidate({ size: 8, rules: 'sets', beyond: 'basic', rng: createRng(900 + k) })
      if (!built) continue
      grouped++
      expect(solveGp(built.puzzle, 'basic').solved).toBe(false)
      expect(solveGp(built.puzzle, 'sets').tally.sets).toBeGreaterThan(0)
    }
    expect(grouped).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with brute force: every garden the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, rules] of [[5, 'basic'], [6, 'basic'], [6, 'sets'], [7, 'sets'], [7, 'probe'], [8, 'probe']] as const) {
      for (let k = 0; k < 40; k++) {
        const built = drawGpCandidate({ size, rules, rng })
        if (!built) continue
        finished++
        expect(countGpSolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(60)
  }, SLOW)

  it('never claims a garden with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 400 && ambiguous < 40; k++) {
      // Beds grown at random round a random answer, never trimmed to one answer.
      const rng = createRng(77 + k)
      const size = rng.int(5, 8)
      const cols = drawGpFlowers(size, rng)
      if (!cols) continue
      const puzzle: GpPuzzle = { size, beds: growGpBeds(size, cols.map((c, r) => r * size + c), rng) }
      if (countGpSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'sets', 'probe'] as const) expect(solveGp(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(20)
  }, SLOW)

  it('hands a square to a neighbouring bed with any piece it held on, never a flower’s, never below two squares', () => {
    //  A A B
    //  A B B      a 3 × 3 toy: each bed's flower is only what the hand-over keeps in place
    //  C C C      (A at the top left, B in the middle right, C in the bottom middle).
    const beds = [0, 0, 1, 0, 1, 1, 2, 2, 2]
    const flowers = [0, 5, 7]
    // (1,0) leaves A with (0,0),(0,1): fine.
    expect(gpHandOver(3, beds, flowers, 3, 2)).toEqual([0, 0, 1, 2, 1, 1, 2, 2, 2])
    // A flower never moves; a bed never drops to one square.
    expect(gpHandOver(3, beds, flowers, 0, 2)).toBeNull()
    expect(gpHandOver(3, [0, 0, 1, 2, 1, 1, 2, 2, 2], flowers, 1, 1)).toBeNull()
    // A square that held a piece on takes the piece with it.
    const snake = [0, 0, 0, 1, 1, 0, 1, 1, 1]
    expect(gpHandOver(3, snake, [0, 4, 8], 2, 1)).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 1])
  })
})

describe('garden-plots levels', () => {
  for (const level of LEVELS) {
    it(`${level}: grows gardens of the level's size that its own steps finish`, () => {
      const spec = gpLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = level === 'challenging' ? 3 : 5
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(gpWellFormed(built.puzzle)).toBe(true)
        expect(isGpSolution(built.puzzle, built.flowers)).toBe(true)
        expect(countGpSolutions(built.puzzle, 2)).toBe(1)
        expect(gpMeetsLevel(built.puzzle, built.flowers, spec)).toBe(true)
        const solve = solveGp(built.puzzle, spec.rules)
        expect(solve.solved).toBe(true)
        expect(solve.tally.sets + solve.tally.probe).toBeGreaterThanOrEqual(spec.minSets)
        if (spec.beyond) expect(solveGp(built.puzzle, spec.beyond).solved).toBe(false)
        for (let k = 0; k < spec.size; k++) expect(built.puzzle.beds.filter((b) => b === k).length).toBeGreaterThanOrEqual(GP_MIN_BED)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first garden: crossing off and counting finish it', () => {
    for (let seed = 0; seed < 5; seed++) expect(solveGp(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  }, SLOW)

  it('knows a garden however it is turned or mirrored', () => {
    const a = gardenFrom(['AABBC', 'ABBBC', 'DDDCC', 'DDEEC', 'EEEEE'])
    // Mirrored left to right, and turned a quarter: the beds renumber, the fingerprint does not.
    const mirrored = gardenFrom(['CBBAA', 'CBBBA', 'CCDDD', 'CEEDD', 'EEEEE'])
    const turned = gardenFrom(['EDDAA', 'EDDBA', 'EEDBB', 'EECBB', 'ECCCC'])
    expect(gpSignature(mirrored)).toBe(gpSignature(a))
    expect(gpSignature(turned)).toBe(gpSignature(a))
    expect(gpSignature(gardenFrom(['AABBC', 'ABBBC', 'DDDCC', 'DDEEE', 'EEEEE']))).not.toBe(gpSignature(a))
  })
})

describe('garden-plots gardens', () => {
  it('names every garden once, in retirement words, with no brand, drink or money', () => {
    expect(GP_GARDENS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(GP_GARDENS.map((g) => g.id)).size).toBe(GP_GARDENS.length)
    for (const g of GP_GARDENS) {
      expect(g.id).toMatch(/^[a-z0-9-]+$/)
      expect(g.name).not.toMatch(/beer|wine|whisk|rum|cocktail|margarita|happy hour|pension|money|cash|dollar|old age|senior/i)
      expect(gpSignText(g)).toBe(g.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const allotment = GP_GARDENS.find((g) => g.id === 'community-allotment')!
    expect(gpSignText(allotment, 2)).toBe('Community\nAllotment')
    const gate = GP_GARDENS.find((g) => g.id === 'secret-garden-gate')!
    expect(gpSignText(gate, 2).split('\n')).toHaveLength(2)
    expect(gpSignText(gate, 2).replace('\n', ' ')).toBe(gate.name)
  })

  it('works through every garden before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < GP_GARDENS.length + 5; page++) {
      const book = parseGpBook(labels)
      const pick = pickGpGarden({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.garden)
      labels.push(gpPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, GP_GARDENS.length).map((l) => l.split('|')[0])).size).toBe(GP_GARDENS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickGpGarden({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = GP_GARDENS.slice(0, GP_GARDENS.length - 3).map((g) => g.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a garden', () => {
    expect(parseGpBook(['lavender-lane|gentle|abc', 'nowhere|classic|x', 'poppy-field|odd|def', ''])).toEqual([
      { garden: 'lavender-lane', level: 'gentle', signature: 'abc' },
      { garden: 'poppy-field', level: null, signature: 'def' },
    ])
  })
})

describe('garden-plots pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print garden on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = gpLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'flower')).toHaveLength(size)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor', () => {
    const big = planGpPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planGpPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(gpLevelSpec('challenging').minCell))
  })

  it('stacks the legend rather than shrinking the garden on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 380, height: 1000 }
    const plan = planGpPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const garden = GP_GARDENS.find((g) => g.id === 'community-allotment')!
    expect(runGpKdpPreflight({ built, plan, level: 'gentle', garden, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildGpPuzzle({ built, plan, garden, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkGpDrawnPage({ puzzle, built, garden })).toEqual([])
    const [bedWords, flowerWords] = partsOf(puzzle, 'legend-text')
    expect(flowerWords!.top).toBeGreaterThan(bedWords!.top)
    // The garden takes the whole width; only the legend gives way.
    expect(plan.cell).toBe(Math.floor(380 / 7))
  })

  it('keeps the sign and the legend clear of the garden', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planGpPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(GP_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planGpPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runGpKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', garden: GP_GARDENS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the garden.')
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, the tinted beds in heavy walls, and a hidden flower in every planted square', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${GP_TEMPLATE_KEY}:${signature}`)
    const garden = GP_GARDENS.find((g) => g.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(gpSignText(garden))
    expect(partsOf(puzzle, 'rule')).toHaveLength(18)
    expect(partsOf(puzzle, 'wall').filter((w) => w.data?.line === 'frame')).toHaveLength(4)
    expect(partsOf(puzzle, 'wall').every((w) => w.fill === STUDIO_INK && w.visible !== false)).toBe(true)
    expect(partsOf(puzzle, 'tint').every((t) => GP_TINTS.includes(t.fill as (typeof GP_TINTS)[number]) && t.fill !== STUDIO_PAPER)).toBe(true)
    const flowers = partsOf(puzzle, 'flower')
    expect(flowers).toHaveLength(8)
    expect(flowers.every((f) => f.visible === false && f.studioRole === 'answer')).toBe(true)
    expect(partsOf(puzzle, 'legend-flower')[0]!.visible).not.toBe(false)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual(['8 garden beds', 'Flower (plant 8)'])
  })

  it('walls every stretch where two beds meet, and paints no two neighbours alike', () => {
    //  A A B
    //  A B B
    //  C C B
    const { across, down } = gpWallRuns(3, [0, 0, 1, 0, 1, 1, 2, 2, 1])
    // [line, from, to]: column line 1 walls row 1 only; column line 2 walls rows 0 and 2.
    expect(down).toEqual([[1, 1, 2], [2, 0, 1], [2, 2, 3]])
    expect(across).toEqual([[1, 1, 2], [2, 0, 2]])
    for (let seed = 0; seed < 5; seed++) {
      const { puzzle } = builtFor('classic', seed)
      const tints = gpBedTints(puzzle.size, puzzle.beds)
      const n = puzzle.size
      for (let i = 0; i < n * n; i++) {
        if (i % n < n - 1 && puzzle.beds[i] !== puzzle.beds[i + 1]) expect(tints[puzzle.beds[i]!]).not.toBe(tints[puzzle.beds[i + 1]!])
        if (i + n < n * n && puzzle.beds[i] !== puzzle.beds[i + n]) expect(tints[puzzle.beds[i]!]).not.toBe(tints[puzzle.beds[i + n]!])
      }
      expect(Math.max(...tints)).toBeLessThan(GP_TINTS.length)
    }
  })

  it('plants every flower on the answer page in black, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    // Petals and a heart for each of the eight flowers.
    expect(answers).toHaveLength(16)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const flowers = partsOf(puzzle, 'flower')
    expect(flowers.length).toBe(8)
    expect(flowers.every((f) => f.visible === true && f.stroke === STUDIO_INK && f.fill === STUDIO_PAPER)).toBe(true)
    expect(partsOf(puzzle, 'flower-heart').every((f) => f.visible === true && f.fill === STUDIO_INK)).toBe(true)
    // The planted squares are an answer: one per row, column and bed, none touching.
    const n = 8
    const squares = flowers.map((f) => Number(f.data?.row) * n + Number(f.data?.col))
    const [, , signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(new Set(flowers.map((f) => f.data?.bed)).size).toBe(n)
    expect(new Set(squares.map((i) => Math.floor(i / n))).size).toBe(n)
    expect(new Set(squares.map((i) => i % n)).size).toBe(n)
    expect(signature).toBeTruthy()
    expect(key.some((o) => o.text === GP_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === GP_INSTRUCTION)).toBe(true)
  })

  it('builds a book that works through every garden before one returns, never printing a garden twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at gardens their last one did not use', () => {
    const recent = GP_GARDENS.slice(0, 20).map((g) => g.id)
    rememberStudioContent(studioVarietyKey(GP_TEMPLATE_KEY, 'gardens'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different garden for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('garden-plots preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planGpPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const garden = GP_GARDENS[0]!
  const run = (over: Partial<Parameters<typeof runGpKdpPreflight>[0]>) =>
    runGpKdpPreflight({ built, plan, level: 'classic', garden, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven garden', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    // Row 0's flower one square along: two flowers share a column.
    const flowers = built.flowers.map((i, r) => (r === 0 ? (i % 8 === 7 ? i - 1 : i + 1) : i))
    expect(run({ built: { ...built, flowers } })).toMatch(/breaks a rule/)
  })

  it('refuses a garden with several answers', () => {
    const stripes = gardenFrom(Array.from({ length: 8 }, (_, r) => String.fromCharCode(65 + r).repeat(8)))
    const cols = [0, 2, 4, 6, 1, 3, 5, 7]
    const flowers = cols.map((c, r) => r * 8 + c)
    expect(countGpSolutions(stripes, 2)).toBe(2)
    expect(run({ built: { puzzle: stripes, flowers, signature: gpSignature(stripes) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic garden that the basic steps alone finish', () => {
    let easy: GpBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawGpCandidate({ size: 8, rules: 'basic', rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a bed in pieces or a bed of one square', () => {
    const beds = [...built.puzzle.beds]
    // Hand one corner to a bed that does not reach it.
    const far = beds.find((b) => b !== beds[0] && b !== beds[1] && b !== beds[8] && b !== beds[9])!
    beds[0] = far
    expect(run({ built: { ...built, puzzle: { ...built.puzzle, beds } } })).toMatch(/in pieces|breaks a rule|one answer/)
  })

  it('refuses a garden or a name the book already has', () => {
    const book = parseGpBook([gpPageLabel(garden, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseGpBook([gpPageLabel(GP_GARDENS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this garden/)
  })

  it('refuses squares below the level’s floor and a garden off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
  })

  it('catches a drawn page whose walls or flowers do not match', () => {
    const puzzle = buildGpPuzzle({ built, plan, garden, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkGpDrawnPage({ puzzle, built, garden })).toEqual([])
    expect(checkGpDrawnPage({ puzzle, built: builtFor('classic', 4), garden }).join(' ')).toMatch(/walls/)
    const moved: GpBuilt = { ...built, flowers: built.flowers.map((i, r) => (r === 0 ? (i + 1) % 8 : i)) }
    expect(checkGpDrawnPage({ puzzle, built: moved, garden }).join(' ')).toMatch(/off its square/)
    expect(checkGpDrawnPage({ puzzle, built, garden: GP_GARDENS[5]! }).join(' ')).toMatch(/sign/)
  })
})
