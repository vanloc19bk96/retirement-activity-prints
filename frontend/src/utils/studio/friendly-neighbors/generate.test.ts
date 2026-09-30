import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK, STUDIO_PAPER } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent, rememberStudioContent, studioVarietyKey } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { drawHeader } from '../studio-layout'
import { friendlyNeighborsTemplate } from './generate'
import { NEIGHBORS_CONFIG_SCHEMA } from './config'
import {
  NEIGHBORS_BLOCK_WORD,
  NEIGHBORS_DEFAULT_TITLE,
  NEIGHBORS_GENTLE_TIP,
  NEIGHBORS_HOW_TO,
  NEIGHBORS_LEVELS,
  NEIGHBORS_STREETS,
  NEIGHBORS_TEMPLATE_KEY,
  NEIGHBORS_TOUCH_WORD,
  neighborsInstruction,
  neighborsLevelSpec,
  neighborsPageLabel,
  neighborsSignText,
  neighborsTownRng,
  parseNeighborsBook,
  parseNeighborsLevel,
  pickNeighborsStreet,
  type NeighborsLevel,
} from './content'
import {
  NEIGHBORS_PART_KEY,
  NEIGHBORS_STREET_FILL,
  buildNeighborsPuzzle,
  neighborsBlockAtOf,
  neighborsBlockOutline,
  neighborsCentre,
  neighborsGeometryOf,
  neighborsHouseLines,
  neighborsRoundedOutline,
} from './draw'
import { checkNeighborsDrawnPage, runNeighborsKdpPreflight } from './kdp-preflight'
import { NEIGHBORS_DIGIT_MIN, NEIGHBORS_LEGEND_TWIN_STREET, NEIGHBORS_SIGN_GAP_MIN, NEIGHBORS_STREET_MIN, neighborsContentBox, neighborsPanelInBody, neighborsPrintNote, planNeighborsPage } from './layout'
import {
  buildNeighborsTown,
  drawNeighborsBlocks,
  drawNeighborsCandidate,
  drawNeighborsTown,
  neighborsBlockSizes,
  neighborsBlocksBalanced,
  neighborsClueCount,
  neighborsClueRange,
  neighborsMeetsLevel,
  neighborsSignature,
  type NeighborsBuilt,
} from './puzzle'
import {
  NEIGHBORS_BLANK,
  countNeighborsSolutions,
  fillNeighborsTown,
  isNeighborsSolution,
  neighborsAnswerKey,
  neighborsBlockCells,
  neighborsBlocksWellFormed,
  neighborsKeepsRules,
  neighborsTouching,
  neighborsWellFormed,
  solveNeighbors,
  type NeighborsPuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many towns: generous room when the whole suite runs at once. */
const SLOW = 180_000
const LEVELS = NEIGHBORS_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: NEIGHBORS_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(friendlyNeighborsTemplate),
  showTitle: true,
  title: NEIGHBORS_DEFAULT_TITLE,
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
  return friendlyNeighborsTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[NEIGHBORS_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[NEIGHBORS_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: NeighborsLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(neighborsContentBox(ctx), config, tag, neighborsInstruction(config, level))
  return neighborsPanelInBody(header.body, header.objects.length > 0)
}

/**
 * A town from a picture: rows of houses, each a block letter and what is
 * printed there (`.` for nothing) — `a1 a. b.` is two houses of block a,
 * the first printed 1, then a house of block b.
 */
function townFrom(rows: string[]): NeighborsPuzzle {
  const names = new Map<string, number>()
  const blocks: number[] = []
  const clues: number[] = []
  for (const row of rows) {
    for (const cell of row.trim().split(/\s+/)) {
      const name = cell[0]!
      if (!names.has(name)) names.set(name, names.size)
      blocks.push(names.get(name)!)
      clues.push(cell[1] === '.' ? NEIGHBORS_BLANK : Number(cell[1]))
    }
  }
  return { size: rows.length, blocks, clues }
}

function builtFor(level: NeighborsLevel, seed = 1): NeighborsBuilt {
  return buildNeighborsTown({ ...neighborsLevelSpec(level), rng: neighborsTownRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/** Point in polygon, by crossings. */
function insidePolygon(points: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!
    const [xj, yj] = points[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * A small finished town the rules tests use (4 × 4, four blocks of four):
 *
 *   a2 a4 b3 b4
 *   a3 a1 b2 b1
 *   c2 c4 d3 d4
 *   c3 c1 d2 d1
 */
const SMALL = townFrom(['a2 a4 b3 b4', 'a3 a1 b2 b1', 'c2 c4 d3 d4', 'c3 c1 d2 d1'])
const SMALL_VALUES = [...SMALL.clues]

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(friendlyNeighborsTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: NEIGHBORS_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(friendlyNeighborsTemplate, { seeds: 12 })

describe('friendly neighbors registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === NEIGHBORS_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(NEIGHBORS_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(NEIGHBORS_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(NEIGHBORS_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(friendlyNeighborsTemplate).level).toBe('classic')
    expect(parseNeighborsLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseNeighborsLevel(level)).toBe(level)
  })

  it('states both rules, adds the small-block tip at Gentle only, and drops the how-to when asked', () => {
    expect(NEIGHBORS_HOW_TO).toMatch(/1 up to its number of houses/)
    expect(NEIGHBORS_HOW_TO).toMatch(/corner to corner/)
    expect(NEIGHBORS_HOW_TO).toMatch(/across a street/)
    expect(neighborsInstruction(base, 'gentle')).toBe(`${NEIGHBORS_HOW_TO}\n${NEIGHBORS_GENTLE_TIP}`)
    expect(neighborsInstruction(base, 'classic')).toBe(NEIGHBORS_HOW_TO)
    expect(neighborsInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the house and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = neighborsPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Houses print 0\.\d\d in apart, the town \d\.\d\d in across, numbers \d+(\.5)? pt\.$/)
      expect(neighborsPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(neighborsPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('friendly neighbors rules and solver', () => {
  it('reads a town picture the way it is drawn, and knows who touches whom', () => {
    expect(SMALL.size).toBe(4)
    expect(neighborsBlockCells(SMALL)).toEqual([
      [0, 1, 4, 5],
      [2, 3, 6, 7],
      [8, 9, 12, 13],
      [10, 11, 14, 15],
    ])
    const touch = neighborsTouching(4)
    // The corner touches three houses; a middle house touches all eight round it.
    expect(touch[0]).toEqual([1, 4, 5])
    expect(touch[5]).toEqual([0, 1, 2, 4, 6, 8, 9, 10])
  })

  it('knows a finished town when it sees one, and every way one can be wrong', () => {
    expect(neighborsWellFormed(SMALL)).toBe(true)
    expect(neighborsKeepsRules(SMALL, SMALL_VALUES)).toBe(true)
    expect(isNeighborsSolution({ ...SMALL, clues: new Array(16).fill(NEIGHBORS_BLANK) }, SMALL_VALUES)).toBe(true)
    // Block b's 4 and 1 swapped: the 4 now touches block d's 4 across a street.
    const touching = [...SMALL_VALUES]
    ;[touching[3], touching[7]] = [touching[7]!, touching[3]!]
    expect(neighborsKeepsRules(SMALL, touching)).toBe(false)
    // A 5 in a block of four.
    const five = [...SMALL_VALUES]
    five[0] = 5
    expect(neighborsKeepsRules(SMALL, five)).toBe(false)
    // A printed number the answer does not keep.
    expect(isNeighborsSolution({ ...SMALL, clues: [1, ...new Array(15).fill(NEIGHBORS_BLANK)] }, SMALL_VALUES)).toBe(false)
    // A block in two pieces, a block of six, a printed number its block cannot hold, the same number twice in a block.
    expect(neighborsBlocksWellFormed(2, [0, 1, 1, 0])).toBe(false)
    expect(neighborsBlocksWellFormed(3, [0, 0, 0, 0, 0, 0, 1, 1, 1])).toBe(false)
    expect(neighborsWellFormed(townFrom(['a3 a.', 'b. b.']))).toBe(false)
    expect(neighborsWellFormed(townFrom(['a1 a1', 'b. b.']))).toBe(false)
    expect(neighborsWellFormed(townFrom(['a1 a.', 'b. b2']))).toBe(true)
  })

  it('finishes a town with "one left": the last number of a block, and the last house for a number', () => {
    // Block a is missing its 1 and block d its 1: each block has one number and one house left.
    const p = { ...SMALL, clues: SMALL_VALUES.map((v, s) => (s === 5 || s === 15 ? NEIGHBORS_BLANK : v)) }
    const solve = solveNeighbors(p, 'single')
    expect(solve.solved).toBe(true)
    expect(solve.values[5]).toBe(1)
    expect(solve.values[15]).toBe(1)
    expect(solve.tally.single).toBeGreaterThan(0)
  })

  it('crosses a number off a house that every place for it in a block touches', () => {
    // A small town "one left" cannot finish but "all touch one house" can, found among fresh ones.
    let found: NeighborsBuilt | null = null
    for (let seed = 0; !found && seed < 200; seed++) {
      found = drawNeighborsCandidate({ size: 5, rules: 'touch', beyond: 'single', mix: [6, 5, 2, 0], clues: [0, 1], rng: createRng(seed) })
    }
    expect(found).not.toBeNull()
    expect(solveNeighbors(found!.puzzle, 'single').solved).toBe(false)
    const solve = solveNeighbors(found!.puzzle, 'touch')
    expect(solve.solved).toBe(true)
    expect(solve.tally.touch).toBeGreaterThan(0)
    expect(countNeighborsSolutions(found!.puzzle, 2)).toBe(1)
  }, SLOW)

  it('catches a broken puzzle: printed numbers that touch', () => {
    const solve = solveNeighbors(townFrom(['a1 b1', 'a. b.']), 'single')
    expect(solve.solved).toBe(false)
    expect(solve.broken).toBe(true)
  })

  it('refuses to guess: a town with several answers is left unfinished at every level', () => {
    // With nothing printed, the small town can be numbered many ways.
    const blank = { ...SMALL, clues: new Array(16).fill(NEIGHBORS_BLANK) }
    expect(countNeighborsSolutions(blank, 3)).toBeGreaterThan(1)
    for (const rules of ['single', 'touch', 'probe'] as const) expect(solveNeighbors(blank, rules).solved).toBe(false)
  })

  it('needs "all touch one house" at Classic, and more at Challenging', () => {
    for (let seed = 0; seed < 2; seed++) {
      const classic = builtFor('classic', seed)
      expect(solveNeighbors(classic.puzzle, 'single').solved).toBe(false)
      const solve = solveNeighbors(classic.puzzle, 'touch')
      expect(solve.solved).toBe(true)
      expect(solve.tally.touch).toBeGreaterThan(0)
      const hard = builtFor('challenging', seed)
      expect(solveNeighbors(hard.puzzle, 'touch').solved).toBe(false)
      const deep = solveNeighbors(hard.puzzle, 'probe')
      expect(deep.solved).toBe(true)
      expect(deep.tally.claim + deep.tally.probe).toBeGreaterThan(0)
    }
  }, SLOW)

  it('agrees with plain search: every town the solver finishes has exactly one answer', () => {
    let finished = 0
    for (let seed = 0; seed < 80; seed++) {
      const rng = createRng(1000 + seed)
      const n = 4 + (seed % 2)
      const town = drawNeighborsTown(n, rng, [4, 4, 2, 1])
      if (!town) continue
      // Keep a random third of the numbers.
      const clues = town.values.map((v) => (rng.chance(0.3) ? v : NEIGHBORS_BLANK))
      const p = { size: n, blocks: town.blocks, clues }
      const solve = solveNeighbors(p, 'probe')
      const count = countNeighborsSolutions(p, 2)
      expect(count).toBeGreaterThanOrEqual(1)
      if (solve.solved) {
        finished++
        expect(count, `seed ${seed}`).toBe(1)
        expect(neighborsAnswerKey(solve.values)).toBe(neighborsAnswerKey(town.values))
      }
      expect(solve.broken).toBe(false)
    }
    expect(finished).toBeGreaterThan(10)
  }, SLOW)

  it('never claims a town with several answers is solved', () => {
    let several = 0
    for (let seed = 0; seed < 80; seed++) {
      const rng = createRng(5000 + seed)
      const town = drawNeighborsTown(5, rng, [6, 5, 2, 0])
      if (!town) continue
      const clues = town.values.map((v) => (rng.chance(0.12) ? v : NEIGHBORS_BLANK))
      const p = { size: 5, blocks: town.blocks, clues }
      if (countNeighborsSolutions(p, 2) < 2) continue
      several++
      for (const rules of ['single', 'touch', 'probe'] as const) expect(solveNeighbors(p, rules).solved, `seed ${seed} ${rules}`).toBe(false)
    }
    expect(several).toBeGreaterThan(10)
  }, SLOW)

  it('cuts towns into whole blocks of one to five houses, and numbers them by the rules', () => {
    for (let seed = 0; seed < 12; seed++) {
      const n = 6 + (seed % 4)
      const blocks = drawNeighborsBlocks(n, createRng(seed), [8, 4, 1, 0])
      expect(neighborsBlocksWellFormed(n, blocks)).toBe(true)
      const town = drawNeighborsTown(n, createRng(seed), [8, 4, 1, 0])
      expect(town, `seed ${seed}`).not.toBeNull()
      expect(neighborsBlocksBalanced(n, town!.blocks)).toBe(true)
      expect(neighborsKeepsRules({ size: n, blocks: town!.blocks }, town!.values)).toBe(true)
    }
    // A town that cannot be numbered — a 2 × 2 of blocks of one — is found out, not forced.
    expect(fillNeighborsTown({ size: 2, blocks: [0, 1, 2, 3] }, (o) => [...o])).toBeNull()
  })
})

describe('friendly neighbors levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds towns of the level's size that its own steps finish`, () => {
      const spec = neighborsLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 4
      const [fewest, most] = neighborsClueRange(spec)
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(neighborsWellFormed(built.puzzle)).toBe(true)
        expect(neighborsBlocksBalanced(spec.size, built.puzzle.blocks)).toBe(true)
        expect(isNeighborsSolution(built.puzzle, built.values)).toBe(true)
        expect(neighborsMeetsLevel(built.puzzle, built.values, spec)).toBe(true)
        expect(solveNeighbors(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveNeighbors(built.puzzle, spec.beyond).solved).toBe(false)
        expect(neighborsClueCount(built.puzzle)).toBeGreaterThanOrEqual(fewest)
        expect(neighborsClueCount(built.puzzle)).toBeLessThanOrEqual(most)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first town: smaller blocks, "one left" finishes it, and it has one answer', () => {
    let small = 0
    let big = 0
    for (let seed = 0; seed < 4; seed++) {
      const built = builtFor('gentle', seed)
      expect(solveNeighbors(built.puzzle, 'single').solved).toBe(true)
      expect(countNeighborsSolutions(built.puzzle, 2)).toBe(1)
      const sizes = neighborsBlockSizes(built.puzzle.blocks)
      small += sizes[2]! + sizes[3]!
      big += sizes[5]!
    }
    expect(small).toBeGreaterThan(0)
    expect(big).toBeGreaterThan(0)
  }, SLOW)

  it('knows a town however it is turned or mirrored, whatever its blocks were called', () => {
    const a = townFrom(['a1 a. b.', 'c. a. b2', 'c. c. b.'])
    // Mirrored left to right.
    const mirrored = townFrom(['b. a. a1', 'b2 a. c.', 'b. c. c.'])
    // Turned a quarter clockwise: (r, c) → (c, 2 − r).
    const turned = townFrom(['c. c. a1', 'c. a. a.', 'b. b2 b.'])
    // The same town with its blocks named the other way round.
    const renamed = townFrom(['x1 x. y.', 'z. x. y2', 'z. z. y.'])
    for (const same of [mirrored, turned, renamed]) expect(neighborsSignature(same)).toBe(neighborsSignature(a))
    expect(neighborsSignature(townFrom(['a1 a. b.', 'c. a. b3', 'c. c. b.']))).not.toBe(neighborsSignature(a))
    expect(neighborsSignature(townFrom(['a1 a. b.', 'c. c. b2', 'c. a. b.']))).not.toBe(neighborsSignature(a))
  })
})

describe('friendly neighbors streets', () => {
  it('names every street once, in retirement words, with no brand, drink or money', () => {
    expect(NEIGHBORS_STREETS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(NEIGHBORS_STREETS.map((w) => w.id)).size).toBe(NEIGHBORS_STREETS.length)
    for (const w of NEIGHBORS_STREETS) {
      expect(w.id).toMatch(/^[a-z0-9-]+$/)
      expect(w.name).not.toMatch(/beer|wine|vineyard|whisk|rum\b|cocktail|margarita|champagne|happy hour|drunk|pension|money|cash|dollar|old age|senior|elm street|wisteria/i)
      expect(neighborsSignText(w)).toBe(w.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const cul = NEIGHBORS_STREETS.find((w) => w.id === 'grandkids-cul-de-sac')!
    expect(neighborsSignText(cul, 2)).toBe('Grandkids’\nCul-de-Sac')
    const harbor = NEIGHBORS_STREETS.find((w) => w.id === 'harbor-view-cottages')!
    expect(neighborsSignText(harbor, 2).split('\n')).toHaveLength(2)
    expect(neighborsSignText(harbor, 2).replace('\n', ' ')).toBe(harbor.name)
  })

  it('works through every street before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < NEIGHBORS_STREETS.length + 5; page++) {
      const book = parseNeighborsBook(labels)
      const pick = pickNeighborsStreet({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.street)
      labels.push(neighborsPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, NEIGHBORS_STREETS.length).map((l) => l.split('|')[0])).size).toBe(NEIGHBORS_STREETS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickNeighborsStreet({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = NEIGHBORS_STREETS.slice(0, NEIGHBORS_STREETS.length - 3).map((w) => w.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a street', () => {
    expect(parseNeighborsBook(['maple-lane|gentle|abc', 'nowhere|classic|x', 'heron-point|odd|def', ''])).toEqual([
      { street: 'maple-lane', level: 'gentle', signature: 'abc' },
      { street: 'heron-point', level: null, signature: 'def' },
    ])
  })
})

describe('friendly neighbors pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print town on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = neighborsLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'given').length).toBeGreaterThan(0)
        expect([...partsOf(puzzle!, 'given'), ...partsOf(puzzle!, 'answer')].every((t) => Number(t.fontSize) >= NEIGHBORS_DIGIT_MIN)).toBe(true)
      }
    }
  }, SLOW)

  it('prints houses as large as the trim allows, never below the level’s floor, with streets to see', () => {
    const big = planNeighborsPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planNeighborsPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(neighborsLevelSpec('challenging').minCell))
    for (const plan of [big, small]) {
      expect(plan.street).toBeGreaterThanOrEqual(NEIGHBORS_STREET_MIN)
      expect(plan.inner * 2).toBeLessThanOrEqual(plan.street)
      // A number fits its house with room round it, even between two streets.
      expect(plan.digitSize * 1.2).toBeLessThanOrEqual(plan.cell - plan.street)
    }
  })

  it('outlines every block round exactly its own houses, half a street clear of the next', () => {
    const plan = planNeighborsPage(panelFor(kdpCtx(6, 9), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const n = built.puzzle.size
    const geo = neighborsGeometryOf(plan)
    const blockAt = neighborsBlockAtOf(n, built.puzzle.blocks)
    const cells = neighborsBlockCells(built.puzzle)
    cells.forEach((list, b) => {
      const outline = neighborsBlockOutline(
        geo,
        blockAt,
        b,
        list.map((s) => [Math.floor(s / n), s % n] as const),
      )
      expect(outline.length).toBeGreaterThanOrEqual(4)
      for (let s = 0; s < n * n; s++) {
        const [x, y] = neighborsCentre(geo, Math.floor(s / n), s % n)
        expect(insidePolygon(outline, x, y), `block ${b} house ${s}`).toBe(built.puzzle.blocks[s] === b)
      }
      // Every corner sits half a street off the pitch lines, or on a pitch line inside the block.
      const half = plan.street / 2
      for (const [x] of outline) {
        const off = (((x - plan.grid.left) % plan.cell) + plan.cell) % plan.cell
        expect([0, half, plan.cell - half].some((d) => Math.abs(off - d) < 0.01)).toBe(true)
      }
      const commands = neighborsRoundedOutline(outline, plan.radius, plan.inner)
      expect(commands[0]![0]).toBe('M')
      expect(commands.at(-1)).toEqual(['Z'])
    })
    // One fine line for every side two houses of a block share.
    const shared = cells.reduce((sum, list) => sum + list.filter((s) => s % n < n - 1 && list.includes(s + 1)).length + list.filter((s) => list.includes(s + n)).length, 0)
    expect(neighborsHouseLines(geo, blockAt, n, n)).toHaveLength(shared)
  })

  it('keeps every number inside its house', () => {
    const plan = planNeighborsPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const puzzle = buildNeighborsPuzzle({ built, plan, street: NEIGHBORS_STREETS[0]!, level: 'challenging', label: 'x', tag, font: FONT })
    // Children sit relative to the group's centre.
    const dx = puzzle.left + puzzle.width! / 2
    const dy = puzzle.top + puzzle.height! / 2
    const half = plan.street / 2
    let checked = 0
    for (const name of ['given', 'answer']) {
      for (const o of partsOf(puzzle, name)) {
        const left = plan.grid.left + Number(o.data?.col) * plan.cell + half
        const top = plan.grid.top + Number(o.data?.row) * plan.cell + half
        const inner = plan.cell - plan.street
        const w = Number(o.fontSize) * 0.6
        const h = Number(o.fontSize) * 0.75
        expect(o.left + dx - w / 2).toBeGreaterThanOrEqual(left)
        expect(o.left + dx + w / 2).toBeLessThanOrEqual(left + inner)
        expect(o.top + dy - h / 2).toBeGreaterThanOrEqual(top)
        expect(o.top + dy + h / 2).toBeLessThanOrEqual(top + inner)
        checked++
      }
    }
    expect(checked).toBe(81)
  })

  it('stacks the legend rather than shrinking the town on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 380, height: 1000 }
    const plan = planNeighborsPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const street = NEIGHBORS_STREETS.find((w) => w.id === 'grandkids-cul-de-sac')!
    expect(runNeighborsKdpPreflight({ built, plan, level: 'gentle', street, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildNeighborsPuzzle({ built, plan, street, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkNeighborsDrawnPage({ puzzle, built, street })).toEqual([])
    const [blockWords, touchWords] = partsOf(puzzle, 'legend-text')
    expect(touchWords!.top).toBeGreaterThan(blockWords!.top)
    // The town takes the whole width; only the legend gives way.
    expect(plan.grid.width).toBeLessThanOrEqual(380)
    expect(plan.grid.width).toBeGreaterThan(380 - 6)
  })

  it('keeps the legend on one row when both entries fit beside each other', () => {
    const panel = panelFor(kdpCtx(8, 10))
    const plan = planNeighborsPage(panel, 'classic', FONT)!
    expect(plan.legendRows).toBe(1)
    const built = builtFor('classic')
    const street = NEIGHBORS_STREETS[0]!
    expect(runNeighborsKdpPreflight({ built, plan, level: 'classic', street, panel, font: FONT }).errors).toEqual([])
    const puzzle = buildNeighborsPuzzle({ built, plan, street, level: 'classic', label: 'x', tag, font: FONT })
    const [blockWords, touchWords] = partsOf(puzzle, 'legend-text')
    expect(touchWords!.top).toBe(blockWords!.top)
    // The words' boxes stay on the panel.
    const dx = puzzle.left + puzzle.width! / 2
    expect(touchWords!.left + dx + Number(touchWords!.width)).toBeLessThanOrEqual(panel.left + panel.width + 0.5)
  })

  it('ends the legend cross on the two houses’ outlines, not inside them', () => {
    const plan = planNeighborsPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const puzzle = buildNeighborsPuzzle({ built: builtFor('classic'), plan, street: NEIGHBORS_STREETS[0]!, level: 'classic', label: 'x', tag, font: FONT })
    const [cross] = partsOf(puzzle, 'legend-cross')
    // The round caps reach half a stroke past the path: exactly the street.
    expect(Number(cross!.width) + Number(cross!.strokeWidth)).toBeCloseTo(NEIGHBORS_LEGEND_TWIN_STREET, 5)
  })

  it('keeps the sign and the legend clear of the town', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planNeighborsPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(NEIGHBORS_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planNeighborsPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runNeighborsKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', street: NEIGHBORS_STREETS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the town.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, the blocks and the printed numbers, with the answer hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${NEIGHBORS_TEMPLATE_KEY}:${signature}`)
    const street = NEIGHBORS_STREETS.find((w) => w.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(neighborsSignText(street))
    expect(partsOf(puzzle, 'sign')).toHaveLength(2)
    const [blocks] = partsOf(puzzle, 'blocks')
    expect(blocks!.visible).not.toBe(false)
    expect(blocks!.fill).toBe(STUDIO_PAPER)
    expect(blocks!.stroke).toBe(STUDIO_INK)
    expect(Number(blocks!.data?.count)).toBe(Number(puzzle.data?.blocks))
    expect(partsOf(puzzle, 'houses')).toHaveLength(1)
    const givens = partsOf(puzzle, 'given')
    expect(givens.length).toBeGreaterThanOrEqual(neighborsClueRange(neighborsLevelSpec('classic'))[0])
    expect(givens.every((t) => t.visible !== false && t.fill === STUDIO_INK && Number(t.fontWeight) === 700)).toBe(true)
    const answers = partsOf(puzzle, 'answer')
    expect(givens.length + answers.length).toBe(64)
    expect(answers.every((t) => t.visible === false && t.studioRole === 'answer' && Number(t.fontWeight) === 400)).toBe(true)
    const [streets] = partsOf(puzzle, 'streets')
    expect(streets!.visible).toBe(false)
    expect(streets!.studioRole).toBe('answer')
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual([NEIGHBORS_BLOCK_WORD, NEIGHBORS_TOUCH_WORD])
    expect(['legend-block', 'legend-lines', 'legend-twins', 'legend-number', 'legend-cross'].flatMap((name) => partsOf(puzzle, name)).every((o) => o.visible !== false)).toBe(true)
    expect(partsOf(puzzle, 'legend-number').map((t) => Number(t.text))).toEqual([1, 2, 3, 2, 2])
  })

  it('paves the streets on the answer page and writes every number in, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const [streets] = partsOf(puzzle, 'streets')
    expect(streets!.visible).toBe(true)
    expect(streets!.fill).toBe(NEIGHBORS_STREET_FILL)
    expect(streets!.strokeWidth).toBe(0)
    const written = partsOf(puzzle, 'answer')
    expect(written.every((t) => t.visible === true && t.fill === STUDIO_INK)).toBe(true)
    // The numbers on the key keep the rules in the town's own blocks.
    const n = 8
    const values = new Array<number>(n * n).fill(0)
    for (const t of [...partsOf(puzzle, 'given'), ...written]) values[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    const blocks = String(partsOf(puzzle, 'blocks')[0]!.data?.blocks).split(',').map(Number)
    expect(neighborsKeepsRules({ size: n, blocks }, values)).toBe(true)
    // The streets under the blocks, the numbers on top.
    const names = puzzle.objects!.map((o) => String(o.data?.[NEIGHBORS_PART_KEY]))
    expect(names.indexOf('streets')).toBeLessThan(names.indexOf('blocks'))
    expect(names.indexOf('blocks')).toBeLessThan(names.indexOf('houses'))
    expect(names.indexOf('houses')).toBeLessThan(Math.min(names.indexOf('given'), names.indexOf('answer')))
    expect(key.some((o) => o.text === NEIGHBORS_HOW_TO)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === NEIGHBORS_HOW_TO)).toBe(true)
  })

  it('builds a book that works through every street before one returns, never printing a town twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at streets their last one did not use', () => {
    const recent = NEIGHBORS_STREETS.slice(0, 20).map((w) => w.id)
    rememberStudioContent(studioVarietyKey(NEIGHBORS_TEMPLATE_KEY, 'streets'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different town for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('friendly neighbors preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planNeighborsPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const street = NEIGHBORS_STREETS[0]!
  const run = (over: Partial<Parameters<typeof runNeighborsKdpPreflight>[0]>) =>
    runNeighborsKdpPreflight({ built, plan, level: 'classic', street, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven town', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks the rules', () => {
    const values = [...built.values]
    // Two houses of one block swap numbers: the block still holds 1 to its size, but a neighbour now matches.
    const cells = neighborsBlockCells(built.puzzle)
    let broken = false
    for (const list of cells) {
      for (let i = 0; i < list.length && !broken; i++) {
        for (let j = i + 1; j < list.length && !broken; j++) {
          const trial = [...values]
          ;[trial[list[i]!], trial[list[j]!]] = [trial[list[j]!]!, trial[list[i]!]!]
          if (!neighborsKeepsRules(built.puzzle, trial)) {
            values.splice(0, values.length, ...trial)
            broken = true
          }
        }
      }
    }
    expect(broken).toBe(true)
    expect(run({ built: { ...built, values } })).toMatch(/touching houses alike/)
  })

  it('refuses a town with several answers', () => {
    // Every number taken away: the town is free to be numbered many ways.
    const bare: NeighborsPuzzle = { ...built.puzzle, clues: built.puzzle.clues.map(() => NEIGHBORS_BLANK) }
    expect(run({ built: { puzzle: bare, values: built.values, signature: neighborsSignature(bare) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic town that "one left" alone finishes', () => {
    let easy: NeighborsBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawNeighborsCandidate({ ...neighborsLevelSpec('classic'), rules: 'single', beyond: null, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  }, SLOW)

  it('refuses a town or a street the book already has', () => {
    const book = parseNeighborsBook([neighborsPageLabel(street, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseNeighborsBook([neighborsPageLabel(NEIGHBORS_STREETS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this town/)
  })

  it('refuses houses below the level’s floor, small numbers, narrow streets and a town off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, signSize: 12 } })).toMatch(/below 14 pt/)
    expect(run({ plan: { ...plan, digitSize: 14 } })).toMatch(/below 16 pt/)
    expect(run({ plan: { ...plan, street: 3 } })).toMatch(/too narrow/)
  })

  it('catches a drawn page whose blocks or numbers do not match', () => {
    const puzzle = buildNeighborsPuzzle({ built, plan, street, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkNeighborsDrawnPage({ puzzle, built, street })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkNeighborsDrawnPage({ puzzle, built: other, street }).join(' ')
    expect(errors).toMatch(/printed numbers/)
    expect(errors).toMatch(/blocks are not drawn/)
    expect(checkNeighborsDrawnPage({ puzzle, built, street: NEIGHBORS_STREETS[5]! }).join(' ')).toMatch(/name the street/)
  })
})
