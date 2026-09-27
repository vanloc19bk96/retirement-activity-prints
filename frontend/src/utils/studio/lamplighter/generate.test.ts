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
import { lamplighterTemplate } from './generate'
import { LAMP_CONFIG_SCHEMA } from './config'
import {
  LAMP_DEFAULT_TITLE,
  LAMP_GENTLE_TIP,
  LAMP_HOMES,
  LAMP_INSTRUCTION,
  LAMP_LEVELS,
  LAMP_TEMPLATE_KEY,
  lampHouseRng,
  lampInstruction,
  lampLevelSpec,
  lampPageLabel,
  lampSignText,
  parseLampBook,
  parseLampLevel,
  pickLampHome,
  type LampLevel,
} from './content'
import { LAMP_BEAM_FILL, LAMP_PART_KEY, buildLampPuzzle, lampArms } from './draw'
import { checkLampDrawnPage, runLampKdpPreflight } from './kdp-preflight'
import { LAMP_NUMBER_MIN, LAMP_SIGN_GAP_MIN, lampContentBox, lampPanelInBody, lampPrintNote, planLampPage } from './layout'
import {
  buildLampHouse,
  drawLampAnswer,
  drawLampCandidate,
  drawLampWalls,
  lampFloorConnected,
  lampMeetsLevel,
  lampNumberAll,
  lampSignature,
  lampWallBlock,
  type LampBuilt,
} from './puzzle'
import {
  LAMP_FLOOR,
  LAMP_WALL,
  countLampSolutions,
  isLampNumber,
  isLampSolution,
  lampAnswerKey,
  lampSight,
  lampWellFormed,
  solveLamp,
  type LampPuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many houses: generous room when the whole suite runs at once. */
const SLOW = 60_000
const LEVELS = LAMP_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: LAMP_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(lamplighterTemplate),
  showTitle: true,
  title: LAMP_DEFAULT_TITLE,
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
  return lamplighterTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[LAMP_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[LAMP_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: LampLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(lampContentBox(ctx), config, tag, lampInstruction(config, level))
  return lampPanelInBody(header.body, header.objects.length > 0)
}

/**
 * A house from a picture: `.` floor, `#` a plain wall, a digit a numbered
 * wall, `*` floor with a lamp in the answer.
 */
function houseFrom(rows: string[]): { puzzle: LampPuzzle; lamps: number[] } {
  const n = rows.length
  const cells: number[] = []
  const lamps: number[] = []
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.' || ch === '*') cells.push(LAMP_FLOOR)
      else if (ch === '#') cells.push(LAMP_WALL)
      else cells.push(Number(ch))
      if (ch === '*') lamps.push(r * n + c)
    }),
  )
  return { puzzle: { size: n, cells }, lamps }
}

function builtFor(level: LampLevel, seed = 1): LampBuilt {
  return buildLampHouse({ ...lampLevelSpec(level), rng: lampHouseRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/** The toy house the rules tests use: one answer, found by counting alone. */
const TOY = houseFrom(['*..#', '#.*2', '0..*', '.*..'])

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(lamplighterTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: LAMP_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(lamplighterTemplate, { seeds: 12 })

describe('lamplighter registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === LAMP_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(LAMP_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(LAMP_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(LAMP_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(lamplighterTemplate).level).toBe('classic')
    expect(parseLampLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseLampLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(lampInstruction(base, 'gentle')).toBe(`${LAMP_INSTRUCTION} ${LAMP_GENTLE_TIP}`)
    expect(lampInstruction(base, 'classic')).toBe(LAMP_INSTRUCTION)
    expect(lampInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = lampPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the house \d\.\d\d in across, numbers \d+(\.5)? pt\.$/)
      expect(lampPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(lampPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('lamplighter rules and solver', () => {
  it('reads a house picture the way it is drawn', () => {
    expect(TOY.puzzle.size).toBe(4)
    expect(lampWellFormed(TOY.puzzle)).toBe(true)
    expect(TOY.puzzle.cells.filter(isLampNumber)).toEqual([2, 0])
    expect(TOY.lamps).toEqual([0, 6, 11, 13])
    expect(lampWellFormed({ size: 4, cells: [...TOY.puzzle.cells.slice(0, 15), 5] })).toBe(false)
  })

  it('shines a lamp along its row and column, up to the walls', () => {
    // The lamp in the corner: along the top row to the wall; the wall under it stops it going down.
    expect([...lampSight(TOY.puzzle, 0)].sort((a, b) => a - b)).toEqual([1, 2])
    // The lamp beside the 2: left to the wall, up to the edge, down to the edge.
    expect([...lampSight(TOY.puzzle, 6)].sort((a, b) => a - b)).toEqual([2, 5, 10, 14])
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    const { puzzle, lamps } = TOY
    expect(isLampSolution(puzzle, lamps)).toBe(true)
    // A square left dark.
    expect(isLampSolution(puzzle, lamps.slice(1))).toBe(false)
    // Two lamps shining on each other.
    expect(isLampSolution(puzzle, [...lamps, 1])).toBe(false)
    // A lamp on a wall.
    expect(isLampSolution(puzzle, [...lamps, 5])).toBe(false)
    // A number with the wrong count beside it: every square lit, but a lamp next to the 0.
    expect(isLampSolution(puzzle, [0, 6, 11, 12])).toBe(false)
    const bare: LampPuzzle = { size: 4, cells: puzzle.cells.map((v) => (v === 0 ? LAMP_WALL : v)) }
    expect(isLampSolution(bare, [0, 6, 11, 12])).toBe(true)
  })

  it('solves a proven house step by step, on exactly its answer', () => {
    const result = solveLamp(TOY.puzzle, 'basic')
    expect(result.solved).toBe(true)
    expect(lampAnswerKey(result.lamps)).toBe(lampAnswerKey(TOY.lamps))
    const built = builtFor('gentle', 3)
    const probed = solveLamp(built.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(lampAnswerKey(probed.lamps)).toBe(lampAnswerKey(built.lamps))
  })

  it('refuses to guess: a house with several answers is left unfinished at every level', () => {
    // An open 2 × 2 room: a lamp in either diagonal pair lights it.
    const room: LampPuzzle = { size: 3, cells: [LAMP_FLOOR, LAMP_FLOOR, LAMP_WALL, LAMP_FLOOR, LAMP_FLOOR, LAMP_WALL, LAMP_WALL, LAMP_WALL, LAMP_WALL] }
    expect(countLampSolutions(room, 5)).toBe(2)
    for (const rules of ['basic', 'shine', 'probe'] as const) expect(solveLamp(room, rules).solved).toBe(false)
  })

  it('needs "wherever the light comes from" at Classic, and "what if" at Challenging', () => {
    const classic = builtFor('classic', 2)
    expect(solveLamp(classic.puzzle, 'basic').solved).toBe(false)
    const shone = solveLamp(classic.puzzle, 'shine')
    expect(shone.solved).toBe(true)
    expect(shone.tally.shine).toBeGreaterThan(0)
    const challenging = builtFor('challenging', 2)
    expect(solveLamp(challenging.puzzle, 'shine').solved).toBe(false)
    const probed = solveLamp(challenging.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(probed.tally.probe).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with brute force: every house the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, walls, rules] of [[5, 7, 'basic'], [6, 9, 'shine'], [7, 13, 'probe'], [8, 17, 'shine'], [9, 21, 'probe']] as const) {
      for (let k = 0; k < 40; k++) {
        const built = drawLampCandidate({ size, walls, rules, minNumbers: 0, rng })
        if (!built) continue
        finished++
        expect(countLampSolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(40)
  }, SLOW)

  it('never claims a house with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 600 && ambiguous < 40; k++) {
      // Walls and lamps at random, then numbers rubbed out at random with no check.
      const rng = createRng(77 + k)
      const size = rng.int(4, 8)
      const wall = drawLampWalls(size, rng, Math.round(size * size * 0.2))
      if (!wall) continue
      const bare: LampPuzzle = { size, cells: Array.from(wall, (w) => (w ? LAMP_WALL : LAMP_FLOOR)) }
      const full = lampNumberAll(size, wall, drawLampAnswer(bare, rng))
      const puzzle: LampPuzzle = { size, cells: full.cells.map((v) => (v >= 0 && rng.chance(0.6) ? LAMP_WALL : v)) }
      if (countLampSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'shine', 'probe'] as const) expect(solveLamp(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(20)
  }, SLOW)

  it('lays walls mirrored through the centre, never four in a block, never walling off a room', () => {
    for (let seed = 0; seed < 30; seed++) {
      const wall = drawLampWalls(9, createRng(seed), 21)
      if (!wall) continue
      for (let i = 0; i < 81; i++) expect(wall[i]).toBe(wall[80 - i])
      expect(lampWallBlock(9, wall)).toBe(false)
      expect(lampFloorConnected(9, wall)).toBe(true)
      expect(wall.reduce((sum, w) => sum + w, 0)).toBeGreaterThanOrEqual(20)
    }
    // A wall across the house cuts it in two.
    const cut = Uint8Array.from({ length: 16 }, (_, i) => (Math.floor(i / 4) === 2 ? 1 : 0))
    expect(lampFloorConnected(4, cut)).toBe(false)
    expect(lampWallBlock(3, Uint8Array.from([1, 1, 0, 1, 1, 0, 0, 0, 0]))).toBe(true)
  })

  it('drops lamps that light the whole house without shining on each other', () => {
    for (let seed = 0; seed < 20; seed++) {
      const rng = createRng(seed)
      const wall = drawLampWalls(8, rng, 16)!
      const bare: LampPuzzle = { size: 8, cells: Array.from(wall, (w) => (w ? LAMP_WALL : LAMP_FLOOR)) }
      const lamps = drawLampAnswer(bare, rng)
      expect(isLampSolution(lampNumberAll(8, wall, lamps), lamps)).toBe(true)
    }
  })
})

describe('lamplighter levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds houses of the level's size that its own steps finish`, () => {
      const spec = lampLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 5
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(lampWellFormed(built.puzzle)).toBe(true)
        expect(isLampSolution(built.puzzle, built.lamps)).toBe(true)
        expect(countLampSolutions(built.puzzle, 2)).toBe(1)
        expect(lampMeetsLevel(built.puzzle, built.lamps, spec)).toBe(true)
        expect(solveLamp(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveLamp(built.puzzle, spec.beyond).solved).toBe(false)
        expect(built.puzzle.cells.filter(isLampNumber).length).toBeGreaterThanOrEqual(spec.minNumbers)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first house: counting and "only one place" finish it', () => {
    for (let seed = 0; seed < 5; seed++) expect(solveLamp(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  }, SLOW)

  it('knows a house however it is turned or mirrored', () => {
    const W = LAMP_WALL
    const F = LAMP_FLOOR
    const a: LampPuzzle = { size: 3, cells: [1, F, F, F, W, F, F, F, 0] }
    // Mirrored left to right.
    const mirrored: LampPuzzle = { size: 3, cells: [F, F, 1, F, W, F, 0, F, F] }
    // Turned a quarter clockwise: (r, c) → (c, 2 − r).
    const turned: LampPuzzle = { size: 3, cells: [F, F, 1, F, W, F, 0, F, F] }
    expect(lampSignature(mirrored)).toBe(lampSignature(a))
    expect(lampSignature(turned)).toBe(lampSignature(a))
    expect(lampSignature({ size: 3, cells: [2, F, F, F, W, F, F, F, 0] })).not.toBe(lampSignature(a))
  })
})

describe('lamplighter homes', () => {
  it('names every home once, in retirement words, with no brand, drink or money', () => {
    expect(LAMP_HOMES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(LAMP_HOMES.map((h) => h.id)).size).toBe(LAMP_HOMES.length)
    for (const h of LAMP_HOMES) {
      expect(h.id).toMatch(/^[a-z0-9-]+$/)
      expect(h.name).not.toMatch(/beer|wine|whisk|rum\b|cocktail|margarita|happy hour|drunk|pension|money|cash|dollar|old age|senior/i)
      expect(lampSignText(h)).toBe(h.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const keeper = LAMP_HOMES.find((h) => h.id === 'lighthouse-keepers-house')!
    expect(lampSignText(keeper, 2)).toBe('Lighthouse\nKeeper’s House')
    const boat = LAMP_HOMES.find((h) => h.id === 'houseboat-on-the-bay')!
    expect(lampSignText(boat, 2).split('\n')).toHaveLength(2)
    expect(lampSignText(boat, 2).replace('\n', ' ')).toBe(boat.name)
  })

  it('works through every home before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < LAMP_HOMES.length + 5; page++) {
      const book = parseLampBook(labels)
      const pick = pickLampHome({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.home)
      labels.push(lampPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, LAMP_HOMES.length).map((l) => l.split('|')[0])).size).toBe(LAMP_HOMES.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickLampHome({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = LAMP_HOMES.slice(0, LAMP_HOMES.length - 3).map((h) => h.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a home', () => {
    expect(parseLampBook(['lakeside-cabin|gentle|abc', 'nowhere|classic|x', 'tiny-house|odd|def', ''])).toEqual([
      { home: 'lakeside-cabin', level: 'gentle', signature: 'abc' },
      { home: 'tiny-house', level: null, signature: 'def' },
    ])
  })
})

describe('lamplighter pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print house on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = lampLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        const numbers = partsOf(puzzle!, 'number')
        expect(numbers.length).toBeGreaterThanOrEqual(lampLevelSpec(level).minNumbers)
        expect(numbers.every((t) => Number(t.fontSize) >= LAMP_NUMBER_MIN)).toBe(true)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor', () => {
    const big = planLampPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planLampPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(lampLevelSpec('challenging').minCell))
    expect(small.numberSize).toBeGreaterThanOrEqual(LAMP_NUMBER_MIN)
  })

  it('keeps every lamp and its halo inside its square at the smallest squares', () => {
    const plan = planLampPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const puzzle = buildLampPuzzle({ built, plan, home: LAMP_HOMES[0]!, level: 'challenging', label: 'x', tag, font: FONT })
    // Children sit relative to the group's centre.
    const dx = puzzle.left + puzzle.width! / 2
    const dy = puzzle.top + puzzle.height! / 2
    let checked = 0
    for (const name of ['lamp', 'lamp-base', 'lamp-rays', 'halo']) {
      for (const o of partsOf(puzzle, name)) {
        const cellLeft = plan.grid.left + Number(o.data?.col) * plan.cell
        const cellTop = plan.grid.top + Number(o.data?.row) * plan.cell
        expect(o.left + dx - o.width! / 2).toBeGreaterThanOrEqual(cellLeft - 0.5)
        expect(o.left + dx + o.width! / 2).toBeLessThanOrEqual(cellLeft + plan.cell + 0.5)
        expect(o.top + dy - o.height! / 2).toBeGreaterThanOrEqual(cellTop - 0.5)
        expect(o.top + dy + o.height! / 2).toBeLessThanOrEqual(cellTop + plan.cell + 0.5)
        checked++
      }
    }
    expect(checked).toBe(built.lamps.length * 4)
  })

  it('stacks the legend rather than shrinking the house on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 340, height: 1000 }
    const plan = planLampPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const home = LAMP_HOMES.find((h) => h.id === 'lighthouse-keepers-house')!
    expect(runLampKdpPreflight({ built, plan, level: 'gentle', home, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildLampPuzzle({ built, plan, home, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkLampDrawnPage({ puzzle, built, home })).toEqual([])
    const [countWords, sampleWords] = partsOf(puzzle, 'legend-text')
    expect(sampleWords!.top).toBeGreaterThan(countWords!.top)
    // The house takes the whole width; only the legend gives way.
    expect(plan.cell).toBe(Math.floor(340 / 7))
  })

  it('keeps the name board and the legend clear of the house', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planLampPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(LAMP_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planLampPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runLampKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', home: LAMP_HOMES[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The name board crowds the house.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the board, the ruled floor, the walls and their numbers in a frame, and the lit house hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${LAMP_TEMPLATE_KEY}:${signature}`)
    const home = LAMP_HOMES.find((h) => h.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(lampSignText(home))
    expect(partsOf(puzzle, 'sign')).toHaveLength(2)
    expect(partsOf(puzzle, 'rule')).toHaveLength(20)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    const walls = partsOf(puzzle, 'wall')
    expect(walls.length).toBeGreaterThanOrEqual(lampLevelSpec('classic').walls - 1)
    expect(walls.every((w) => w.fill === STUDIO_INK)).toBe(true)
    const numbers = partsOf(puzzle, 'number')
    expect(numbers.every((t) => t.visible !== false && t.fontWeight === 700 && t.fill === STUDIO_PAPER)).toBe(true)
    const bulbs = partsOf(puzzle, 'lamp')
    expect(bulbs.length).toBeGreaterThan(5)
    const hidden = ['lamp', 'lamp-base', 'lamp-rays', 'halo', 'beam'].flatMap((name) => partsOf(puzzle, name))
    expect(hidden.length).toBeGreaterThan(bulbs.length * 4)
    expect(hidden.every((o) => o.visible === false && o.studioRole === 'answer' && o.type === 'path')).toBe(true)
    expect(partsOf(puzzle, 'beam').every((b) => b.fill === LAMP_BEAM_FILL)).toBe(true)
    const texts = partsOf(puzzle, 'legend-text').map((t) => t.text)
    expect(texts).toEqual([`${bulbs.length} lamps`, '= 2 lamps touch it'])
    // The legend's lamp is on show; only the house's lamps wait for the answer page.
    expect(partsOf(puzzle, 'legend-lamp').every((o) => o.visible !== false)).toBe(true)
  })

  it('throws a beam for every stretch of light, stopped by the walls', () => {
    const arms = lampArms(TOY.puzzle, TOY.lamps).map((a) => `${a.at}:${a.dir}:${a.reach}`)
    expect(arms.sort()).toEqual(['0:right:2', '6:left:1', '6:up:1', '6:down:2', '11:left:2', '11:down:1', '13:left:1', '13:right:2', '13:up:3'].sort())
  })

  it('lights the whole house on the answer page in black and grays, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const bulbs = partsOf(puzzle, 'lamp')
    expect(bulbs.every((b) => b.visible === true && b.fill === STUDIO_PAPER && b.stroke === STUDIO_INK)).toBe(true)
    expect(partsOf(puzzle, 'beam').every((b) => b.visible === true && b.fill === LAMP_BEAM_FILL)).toBe(true)
    expect(partsOf(puzzle, 'halo').every((h) => h.visible === true && h.fill === STUDIO_PAPER)).toBe(true)
    // The lamps on the key light a finished house for the page's walls and numbers.
    const n = 9
    const cells = new Array<number>(n * n).fill(LAMP_FLOOR)
    for (const w of partsOf(puzzle, 'wall')) cells[Number(w.data?.row) * n + Number(w.data?.col)] = LAMP_WALL
    for (const t of partsOf(puzzle, 'number')) cells[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    const lamps = bulbs.map((b) => Number(b.data?.row) * n + Number(b.data?.col))
    expect(isLampSolution({ size: n, cells }, lamps)).toBe(true)
    // The rules run over the walls, every beam over the rules, and every lamp over the beams.
    const names = puzzle.objects!.map((o) => String(o.data?.[LAMP_PART_KEY]))
    expect(names.lastIndexOf('wall')).toBeLessThan(names.indexOf('rule'))
    expect(names.lastIndexOf('rule')).toBeLessThan(names.indexOf('beam'))
    expect(names.lastIndexOf('beam')).toBeLessThan(names.indexOf('halo'))
    expect(names.lastIndexOf('beam')).toBeLessThan(names.indexOf('number'))
    expect(key.some((o) => o.text === LAMP_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === LAMP_INSTRUCTION)).toBe(true)
  })

  it('builds a book that works through every home before one returns, never printing a house twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at homes their last one did not use', () => {
    const recent = LAMP_HOMES.slice(0, 20).map((h) => h.id)
    rememberStudioContent(studioVarietyKey(LAMP_TEMPLATE_KEY, 'homes'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different house for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('lamplighter preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planLampPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const home = LAMP_HOMES[0]!
  const run = (over: Partial<Parameters<typeof runLampKdpPreflight>[0]>) =>
    runLampKdpPreflight({ built, plan, level: 'classic', home, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven house', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    expect(run({ built: { ...built, lamps: built.lamps.slice(1) } })).toMatch(/breaks a rule/)
  })

  it('refuses a house with several answers', () => {
    // Every number rubbed out: the lamps are free to move.
    const bare: LampPuzzle = { size: 9, cells: built.puzzle.cells.map((v) => (v >= 0 ? LAMP_WALL : v)) }
    expect(countLampSolutions(bare, 2)).toBe(2)
    const errors = run({ built: { puzzle: bare, lamps: built.lamps, signature: lampSignature(bare) } })
    expect(errors).toMatch(/logic alone|breaks a rule/)
    expect(errors).toMatch(/too few numbers/)
  })

  it('refuses a Classic house that counting alone finishes', () => {
    let easy: LampBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawLampCandidate({ size: 9, walls: 21, rules: 'basic', minNumbers: 6, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses walls that do not mirror, or that wall off a room', () => {
    const cells = [...built.puzzle.cells]
    const floor = cells.findIndex((v, i) => v === LAMP_FLOOR && cells[80 - i] === LAMP_FLOOR && i !== 40)
    cells[floor] = LAMP_WALL
    const lopsided: LampPuzzle = { size: 9, cells }
    expect(run({ built: { ...built, puzzle: lopsided, signature: lampSignature(lopsided) } })).toMatch(/mirror/)
  })

  it('refuses a house or a home the book already has', () => {
    const book = parseLampBook([lampPageLabel(home, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseLampBook([lampPageLabel(LAMP_HOMES[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this house/)
  })

  it('refuses squares below the level’s floor and a house off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, numberSize: 12 } })).toMatch(/below 16 pt/)
  })

  it('catches a drawn page whose walls, numbers or lamps do not match', () => {
    const puzzle = buildLampPuzzle({ built, plan, home, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkLampDrawnPage({ puzzle, built, home })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkLampDrawnPage({ puzzle, built: other, home }).join(' ')
    expect(errors).toMatch(/walls|numbers/)
    expect(errors).toMatch(/lamps|beams/)
    expect(checkLampDrawnPage({ puzzle, built, home: LAMP_HOMES[5]! }).join(' ')).toMatch(/board/)
  })
})
