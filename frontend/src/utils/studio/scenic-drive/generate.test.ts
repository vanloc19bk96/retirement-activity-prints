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
import { scenicDriveTemplate } from './generate'
import { DRIVE_CONFIG_SCHEMA } from './config'
import {
  DRIVE_DEFAULT_TITLE,
  DRIVE_GENTLE_TIP,
  DRIVE_HOW_TO,
  DRIVE_LEVELS,
  DRIVE_ROUTES,
  DRIVE_SUM_WORD,
  DRIVE_TEMPLATE_KEY,
  DRIVE_TWICE_WORD,
  driveGridRng,
  driveInstruction,
  driveLevelSpec,
  drivePageLabel,
  driveSignText,
  parseDriveBook,
  parseDriveLevel,
  pickDriveRoute,
  type DriveLevel,
} from './content'
import { DRIVE_GRAY_FILL, DRIVE_PART_KEY, buildDrivePuzzle, driveCentre, driveGeometryOf, driveTotalCentre } from './draw'
import { checkDriveDrawnPage, driveBalanced, runDriveKdpPreflight } from './kdp-preflight'
import {
  DRIVE_DIGIT_HEIGHT,
  DRIVE_DIGIT_MIN,
  DRIVE_SIGN_GAP_MIN,
  DRIVE_TOTAL_MIN,
  driveContentBox,
  drivePanelInBody,
  drivePrintNote,
  driveTotalFits,
  driveTotalInkWidth,
  planDrivePage,
} from './layout'
import { buildDriveGrid, drawDriveCandidate, drawDrivePattern, drivePuzzleOf, driveShapeFits, driveSignature, type DriveBuilt } from './puzzle'
import {
  DRIVE_BLANK,
  countDriveSolutions,
  driveAnswerKey,
  driveCombos,
  driveDigits,
  driveFitRun,
  driveKeepsRules,
  drivePatternWellFormed,
  driveRuns,
  driveWellFormed,
  fillDriveGrid,
  solveDrive,
  type DrivePuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many grids: generous room when the whole suite runs at once. */
const SLOW = 180_000
const LEVELS = DRIVE_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: DRIVE_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }
const bit = (v: number) => 1 << (v - 1)
const maskOf = (...digits: number[]) => digits.reduce((m, d) => m | bit(d), 0)

const base: StudioConfig = {
  ...buildDefaultConfig(scenicDriveTemplate),
  showTitle: true,
  title: DRIVE_DEFAULT_TITLE,
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
  return scenicDriveTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[DRIVE_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[DRIVE_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: DriveLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(driveContentBox(ctx), config, tag, driveInstruction(config, level))
  return drivePanelInBody(header.body, header.objects.length > 0)
}

/**
 * A grid from a picture of its answer: rows of squares, `#` for gray and a
 * digit for a white square holding it. The totals are read off the digits.
 */
function gridFrom(rows: string[]): { puzzle: DrivePuzzle; values: number[] } {
  const n = rows.length
  const cells = rows.flatMap((row) => row.trim().split(/\s+/))
  const open = cells.map((c) => c !== '#')
  const values = cells.map((c) => (c === '#' ? DRIVE_BLANK : Number(c)))
  return { puzzle: drivePuzzleOf(n, open, values), values }
}

function builtFor(level: DriveLevel, seed = 1): DriveBuilt {
  return buildDriveGrid({ ...driveLevelSpec(level), rng: driveGridRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/**
 * A small finished grid the rules tests use (4 × 4, a 3 × 3 of white squares):
 *
 *   #  #  #  #
 *   #  9  8  7      across 24
 *   #  1  3  2      across 6
 *   #  3  1  4      across 8
 *      13 12 13 down
 */
const SMALL = gridFrom(['# # # #', '# 9 8 7', '# 1 3 2', '# 3 1 4'])
/** The smallest grid there is: 3 in two across over 7, and 4 and 6 down. */
const TINY = gridFrom(['# # #', '# 1 2', '# 3 4'])

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(scenicDriveTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: DRIVE_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(scenicDriveTemplate, { seeds: 12 })

describe('scenic drive registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === DRIVE_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(DRIVE_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(found[0]!.description).toMatch(/Kakuro/)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(DRIVE_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(DRIVE_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(scenicDriveTemplate).level).toBe('classic')
    expect(parseDriveLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseDriveLevel(level)).toBe(level)
  })

  it('states both rules and where each total reads, adds the sum-table tip at Gentle only, and drops the how-to when asked', () => {
    expect(DRIVE_HOW_TO).toMatch(/1 to 9/)
    expect(DRIVE_HOW_TO).toMatch(/adds up to its total/)
    expect(DRIVE_HOW_TO).toMatch(/upper number across, lower down/)
    expect(DRIVE_HOW_TO).toMatch(/No repeats in a run/)
    expect(driveInstruction(base, 'gentle')).toBe(`${DRIVE_HOW_TO}\n${DRIVE_GENTLE_TIP}`)
    expect(driveInstruction(base, 'classic')).toBe(DRIVE_HOW_TO)
    expect(driveInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
    // The tip is true: 3 in two and 17 in two can each be made one way only.
    expect(driveCombos(2, 3)).toEqual([maskOf(1, 2)])
    expect(driveCombos(2, 17)).toEqual([maskOf(8, 9)])
  })

  it('reports the square, digit and total size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = drivePrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the grid \d\.\d\d in across, digits \d+(\.5)? pt, totals \d+(\.5)? pt\.$/)
      expect(drivePrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(drivePrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('scenic drive rules and solver', () => {
  it('reads a grid picture the way it is drawn, runs and totals in their gray squares', () => {
    const { puzzle } = SMALL
    expect(puzzle.size).toBe(4)
    expect(driveRuns(puzzle).map((r) => [r.clue, r.dir, r.cells])).toEqual([
      [4, 'across', [5, 6, 7]],
      [8, 'across', [9, 10, 11]],
      [12, 'across', [13, 14, 15]],
      [1, 'down', [5, 9, 13]],
      [2, 'down', [6, 10, 14]],
      [3, 'down', [7, 11, 15]],
    ])
    expect(puzzle.across[4]).toBe(24)
    expect(puzzle.across[8]).toBe(6)
    expect(puzzle.down[1]).toBe(13)
    expect(puzzle.down[2]).toBe(12)
    expect(puzzle.across[0]).toBe(DRIVE_BLANK)
    expect(puzzle.down[0]).toBe(DRIVE_BLANK)
  })

  it('knows the ways of making every total', () => {
    expect(driveCombos(2, 4)).toEqual([maskOf(1, 3)])
    expect(driveCombos(3, 6)).toEqual([maskOf(1, 2, 3)])
    expect(driveCombos(3, 24)).toEqual([maskOf(7, 8, 9)])
    expect(driveCombos(9, 45)).toEqual([maskOf(1, 2, 3, 4, 5, 6, 7, 8, 9)])
    expect(driveCombos(2, 10).map(driveDigits).sort((a, b) => a[0]! - b[0]!)).toEqual([
      [1, 9],
      [2, 8],
      [3, 7],
      [4, 6],
    ])
    expect(driveCombos(2, 2)).toEqual([])
    expect(driveCombos(2, 18)).toEqual([])
  })

  it('knows a finished grid when it sees one, and every way one can be wrong', () => {
    expect(driveWellFormed(SMALL.puzzle)).toBe(true)
    expect(driveKeepsRules(SMALL.puzzle, SMALL.values)).toBe(true)
    // A digit twice in a run (the totals still add up down the columns).
    const twice = [...SMALL.values]
    twice[6] = 9
    expect(driveKeepsRules(SMALL.puzzle, twice)).toBe(false)
    // A total the digits do not make.
    expect(driveKeepsRules({ ...SMALL.puzzle, across: SMALL.puzzle.across.map((t, s) => (s === 4 ? 23 : t)) }, SMALL.values)).toBe(false)
    // A white square alone in a run, a gray border broken, a total missing, a total no run can make, a total on a square that starts no run.
    expect(drivePatternWellFormed(3, [false, false, false, false, true, false, false, true, true])).toBe(false)
    expect(drivePatternWellFormed(3, [false, true, false, false, true, true, false, true, true])).toBe(false)
    expect(driveWellFormed({ ...TINY.puzzle, across: TINY.puzzle.across.map((t, s) => (s === 3 ? DRIVE_BLANK : t)) })).toBe(false)
    expect(driveWellFormed({ ...TINY.puzzle, across: TINY.puzzle.across.map((t, s) => (s === 3 ? 18 : t)) })).toBe(false)
    expect(driveWellFormed({ ...TINY.puzzle, down: TINY.puzzle.down.map((t, s) => (s === 0 ? 5 : t)) })).toBe(false)
    // Runs longer than the level allows.
    expect(drivePatternWellFormed(4, SMALL.puzzle.open, 2)).toBe(false)
    expect(drivePatternWellFormed(4, SMALL.puzzle.open, 3)).toBe(true)
  })

  it('finishes a grid with the sum table: 3 in two is 1 + 2, 4 in two is 1 + 3, so their corner is 1', () => {
    const solve = solveDrive(TINY.puzzle, 'sums')
    expect(solve.solved).toBe(true)
    expect(driveAnswerKey(solve.values)).toBe(driveAnswerKey(TINY.values))
    expect(solve.tally.sums).toBeGreaterThan(0)
  })

  it('makes a run fit its squares: a square that is 1 or 2 leaves 9 or 8 for the other in 10', () => {
    const all = (1 << 9) - 1
    expect(driveFitRun(10, [maskOf(1, 2), all])).toEqual([maskOf(1, 2), maskOf(8, 9)])
    // Three squares making 6 are 1, 2, 3; a square that can only be 3 or 4 is 3.
    expect(driveFitRun(6, [maskOf(3, 4), all, all])).toEqual([maskOf(3), maskOf(1, 2), maskOf(1, 2)])
    // Two squares that can only be 1 cannot make a run.
    expect(driveFitRun(3, [maskOf(1), maskOf(1)])).toBeNull()
  })

  it('needs "make it fit" where the sum table alone stalls', () => {
    let found: DriveBuilt | null = null
    for (let seed = 0; !found && seed < 200; seed++) {
      found = drawDriveCandidate({ size: 6, rules: 'fit', beyond: 'sums', maxRun: 5, blacks: [0.2, 0.36], greed: 0.5, rng: createRng(seed) })
    }
    expect(found).not.toBeNull()
    expect(solveDrive(found!.puzzle, 'sums').solved).toBe(false)
    const solve = solveDrive(found!.puzzle, 'fit')
    expect(solve.solved).toBe(true)
    expect(solve.tally.fit).toBeGreaterThan(0)
    expect(countDriveSolutions(found!.puzzle, 2)).toBe(1)
  }, SLOW)

  it('catches a broken puzzle: totals no digits can make together', () => {
    // 3 in two across over 17 in two: the corner would have to be 1 or 2 and 8 or 9 at once, down 4 and 6.
    const broken: DrivePuzzle = { ...TINY.puzzle, across: TINY.puzzle.across.map((t, s) => (s === 3 ? 17 : t)) }
    const solve = solveDrive(broken, 'probe')
    expect(solve.solved).toBe(false)
    expect(solve.broken).toBe(true)
    expect(countDriveSolutions(broken, 2)).toBe(0)
  })

  it('refuses to guess: a grid with several answers is left unfinished at every level', () => {
    // 2 × 2 of white squares, 10 across and down each way: 1 9 / 9 1 or 9 1 / 1 9, and more.
    const open = gridFrom(['# # #', '# 1 9', '# 9 1'])
    expect(countDriveSolutions(open.puzzle, 3)).toBeGreaterThan(1)
    for (const rules of ['sums', 'fit', 'probe'] as const) expect(solveDrive(open.puzzle, rules).solved).toBe(false)
  })

  it('needs "make it fit" at Classic, and "what if" at Challenging', () => {
    for (let seed = 0; seed < 2; seed++) {
      const classic = builtFor('classic', seed)
      expect(solveDrive(classic.puzzle, 'sums').solved).toBe(false)
      const solve = solveDrive(classic.puzzle, 'fit')
      expect(solve.solved).toBe(true)
      expect(solve.tally.fit).toBeGreaterThan(0)
      const hard = builtFor('challenging', seed)
      expect(solveDrive(hard.puzzle, 'fit').solved).toBe(false)
      const deep = solveDrive(hard.puzzle, 'probe')
      expect(deep.solved).toBe(true)
      expect(deep.tally.probe).toBeGreaterThan(0)
    }
  }, SLOW)

  it('agrees with plain search: every grid the solver finishes has exactly one answer', () => {
    let finished = 0
    let open = 0
    for (let seed = 0; seed < 60; seed++) {
      const rng = createRng(1000 + seed)
      const n = 5 + (seed % 2)
      // Grids the solver was tuned to finish, half of them with one digit changed after.
      const built = drawDriveCandidate({ size: n, rules: 'probe', beyond: null, maxRun: 4, blacks: [0.15, 0.4], greed: 0.5, rng })
      if (!built) continue
      const values = [...built.values]
      if (seed % 2 === 0) {
        const whites = values.flatMap((v, s) => (v === DRIVE_BLANK ? [] : [s]))
        const s = rng.pick(whites)
        const runs = driveRuns(built.puzzle).filter((r) => r.cells.includes(s))
        const taken = new Set(runs.flatMap((r) => r.cells.map((t) => values[t]!)))
        const others = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !taken.has(d))
        if (others.length > 0) values[s] = rng.pick(others)
      }
      const p = drivePuzzleOf(n, built.puzzle.open, values)
      const solve = solveDrive(p, 'probe')
      const count = countDriveSolutions(p, 2)
      expect(count).toBeGreaterThanOrEqual(1)
      if (solve.solved) {
        finished++
        expect(count, `seed ${seed}`).toBe(1)
        expect(driveAnswerKey(solve.values)).toBe(driveAnswerKey(values))
      } else open++
      expect(solve.broken).toBe(false)
    }
    expect(finished).toBeGreaterThan(20)
    expect(open).toBeGreaterThan(3)
  }, SLOW)

  it('never claims a grid with several answers is solved', () => {
    let several = 0
    for (let seed = 0; seed < 80; seed++) {
      const rng = createRng(5000 + seed)
      const open = drawDrivePattern(5, rng, { maxRun: 4, blacks: [0.1, 0.3] })
      if (!open) continue
      const values = fillDriveGrid(5, open, (o) => rng.shuffle(o))!
      const p = drivePuzzleOf(5, open, values)
      if (countDriveSolutions(p, 2) < 2) continue
      several++
      for (const rules of ['sums', 'fit', 'probe'] as const) expect(solveDrive(p, rules).solved, `seed ${seed} ${rules}`).toBe(false)
    }
    expect(several).toBeGreaterThan(10)
  }, SLOW)

  it('draws balanced grids of proper runs, and fills them with no digit twice in a run', () => {
    for (let seed = 0; seed < 12; seed++) {
      const spec = driveLevelSpec(LEVELS[seed % 3]!)
      let open: boolean[] | null = null
      const rng = createRng(seed)
      for (let t = 0; !open && t < 60; t++) open = drawDrivePattern(spec.size, rng, spec)
      expect(open, `seed ${seed}`).not.toBeNull()
      expect(drivePatternWellFormed(spec.size, open!, spec.maxRun)).toBe(true)
      expect(driveShapeFits(spec.size, open!, spec)).toBe(true)
      expect(driveBalanced(spec.size, open!)).toBe(true)
      const values = fillDriveGrid(spec.size, open!, (o) => rng.shuffle(o))!
      expect(driveKeepsRules(drivePuzzleOf(spec.size, open!, values), values)).toBe(true)
    }
  })
})

describe('scenic drive levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds balanced grids of the level's size that its own steps finish`, () => {
      const spec = driveLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 4
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(driveWellFormed(built.puzzle)).toBe(true)
        expect(driveShapeFits(spec.size, built.puzzle.open, spec)).toBe(true)
        expect(driveBalanced(spec.size, built.puzzle.open)).toBe(true)
        expect(driveKeepsRules(built.puzzle, built.values)).toBe(true)
        const solve = solveDrive(built.puzzle, spec.rules)
        expect(solve.solved).toBe(true)
        expect(driveAnswerKey(solve.values)).toBe(driveAnswerKey(built.values))
        if (spec.beyond) expect(solveDrive(built.puzzle, spec.beyond).solved).toBe(false)
        expect(Math.max(...driveRuns(built.puzzle).map((r) => r.cells.length))).toBeLessThanOrEqual(spec.maxRun)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first grid: the sum table finishes it, and it has one answer', () => {
    for (let seed = 0; seed < 4; seed++) {
      const built = builtFor('gentle', seed)
      expect(solveDrive(built.puzzle, 'sums').solved).toBe(true)
      expect(countDriveSolutions(built.puzzle, 2)).toBe(1)
    }
  }, SLOW)

  it('knows a grid however it is flipped across its diagonal', () => {
    const a = gridFrom(['# # # #', '# 9 8 #', '# 1 3 2', '# # 1 4'])
    // The same grid, runs across made runs down.
    const flipped = gridFrom(['# # # #', '# 9 1 #', '# 8 3 1', '# # 2 4'])
    expect(driveSignature(flipped.puzzle)).toBe(driveSignature(a.puzzle))
    expect(driveSignature(gridFrom(['# # # #', '# 9 7 #', '# 1 3 2', '# # 1 4']).puzzle)).not.toBe(driveSignature(a.puzzle))
    expect(driveSignature(SMALL.puzzle)).not.toBe(driveSignature(a.puzzle))
  })
})

describe('scenic drive routes', () => {
  it('names every route once, in retirement words, with no brand, drink or money', () => {
    expect(DRIVE_ROUTES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(DRIVE_ROUTES.map((w) => w.id)).size).toBe(DRIVE_ROUTES.length)
    for (const w of DRIVE_ROUTES) {
      expect(w.id).toMatch(/^[a-z0-9-]+$/)
      expect(w.name).not.toMatch(/beer|wine|vineyard|whisk|rum\b|cocktail|margarita|champagne|happy hour|drunk|pension|money|cash|dollar|old age|senior|route 66|thelma/i)
      expect(driveSignText(w)).toBe(w.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const trip = DRIVE_ROUTES.find((w) => w.id === 'road-trip-to-the-grandkids')!
    expect(driveSignText(trip, 2)).toBe('Road Trip to\nthe Grandkids')
    const ridge = DRIVE_ROUTES.find((w) => w.id === 'blue-ridge-parkway')!
    expect(driveSignText(ridge, 2).split('\n')).toHaveLength(2)
    expect(driveSignText(ridge, 2).replace('\n', ' ')).toBe(ridge.name)
  })

  it('works through every route before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < DRIVE_ROUTES.length + 5; page++) {
      const book = parseDriveBook(labels)
      const pick = pickDriveRoute({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.route)
      labels.push(drivePageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, DRIVE_ROUTES.length).map((l) => l.split('|')[0])).size).toBe(DRIVE_ROUTES.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickDriveRoute({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = DRIVE_ROUTES.slice(0, DRIVE_ROUTES.length - 3).map((w) => w.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a route', () => {
    expect(parseDriveBook(['cabot-trail|gentle|abc', 'nowhere|classic|x', 'lakeshore-loop|odd|def', ''])).toEqual([
      { route: 'cabot-trail', level: 'gentle', signature: 'abc' },
      { route: 'lakeshore-loop', level: null, signature: 'def' },
    ])
  })
})

describe('scenic drive pages', () => {
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
        const size = driveLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'answer').every((t) => Number(t.fontSize) >= DRIVE_DIGIT_MIN)).toBe(true)
        const totals = [...partsOf(puzzle!, 'across-total'), ...partsOf(puzzle!, 'down-total')]
        expect(totals.length).toBeGreaterThan(0)
        expect(totals.every((t) => Number(t.fontSize) >= DRIVE_TOTAL_MIN)).toBe(true)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor, with every total clear of its diagonal', () => {
    const big = planDrivePage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planDrivePage(panelFor(kdpCtx(w, h), level), level, FONT)!
        expect(plan, `${level} ${w}x${h}`).not.toBeNull()
        expect(plan.cell).toBeGreaterThanOrEqual(Math.ceil(driveLevelSpec(level).minCell))
        // The widest total there is, two digits, fits its half of the square.
        for (const total of [3, 17, 38, 45]) expect(driveTotalFits(plan.cell, plan.totalSize, driveTotalInkWidth(total, plan.totalSize)), `${level} ${w}x${h} ${total}`).toBe(true)
        expect(plan.digitSize * 1.3).toBeLessThanOrEqual(plan.cell)
      }
    }
  })

  it('keeps every total in its own half of its gray square, and every digit inside its square', () => {
    const plan = planDrivePage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const puzzle = buildDrivePuzzle({ built, plan, route: DRIVE_ROUTES[0]!, level: 'challenging', label: 'x', tag, font: FONT })
    // Children sit relative to the group's centre.
    const dx = puzzle.left + puzzle.width! / 2
    const dy = puzzle.top + puzzle.height! / 2
    const geo = driveGeometryOf(plan)
    let checked = 0
    for (const dir of ['across', 'down'] as const) {
      for (const o of partsOf(puzzle, `${dir}-total`)) {
        const row = Number(o.data?.row)
        const col = Number(o.data?.col)
        const [cx, cy] = driveTotalCentre(geo, row, col, dir)
        expect(o.left + dx).toBeCloseTo(cx, 1)
        expect(o.top + dy).toBeCloseTo(cy, 1)
        // Measured from the square's corner: across totals above the diagonal, down totals below it.
        const x = cx - (plan.grid.left + col * plan.cell)
        const y = cy - (plan.grid.top + row * plan.cell)
        expect(dir === 'across' ? x > y : y > x).toBe(true)
        const w = driveTotalInkWidth(Number(o.text), plan.totalSize)
        const h = plan.totalSize * DRIVE_DIGIT_HEIGHT
        expect(Math.min(x, y) - (dir === 'across' ? h : w) / 2).toBeGreaterThan(0)
        expect(Math.max(x, y) + (dir === 'across' ? w : h) / 2).toBeLessThan(plan.cell)
        checked++
      }
    }
    expect(checked).toBe(driveRuns(built.puzzle).length)
    for (const o of partsOf(puzzle, 'answer')) {
      const [cx, cy] = driveCentre(geo, Number(o.data?.row), Number(o.data?.col))
      expect(o.left + dx).toBeCloseTo(cx, 1)
      expect(o.top + dy).toBeCloseTo(cy, 1)
      expect(Number(o.fontSize) * 0.75).toBeLessThan(plan.cell / 2)
    }
  })

  it('stacks the legend rather than shrinking the grid on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 420, height: 1000 }
    const plan = planDrivePage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const route = DRIVE_ROUTES.find((w) => w.id === 'road-trip-to-the-grandkids')!
    expect(runDriveKdpPreflight({ built, plan, level: 'gentle', route, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildDrivePuzzle({ built, plan, route, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkDriveDrawnPage({ puzzle, built, route })).toEqual([])
    const [sumWords, twiceWords] = partsOf(puzzle, 'legend-text')
    expect(twiceWords!.top).toBeGreaterThan(sumWords!.top)
    // The grid takes the whole width it may; only the legend gives way.
    expect(plan.cell).toBe(Math.min(Math.round(0.8 * DPI), Math.floor(420 / 7)))
  })

  it('keeps the sign and the legend clear of the grid', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planDrivePage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(DRIVE_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planDrivePage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runDriveKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', route: DRIVE_ROUTES[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the grid.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, the gray squares, their diagonals and the totals, with the answer hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${DRIVE_TEMPLATE_KEY}:${signature}`)
    const route = DRIVE_ROUTES.find((w) => w.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(driveSignText(route))
    expect(partsOf(puzzle, 'sign')).toHaveLength(2)
    const [grays] = partsOf(puzzle, 'grays')
    expect(grays!.visible).not.toBe(false)
    expect(grays!.fill).toBe(DRIVE_GRAY_FILL)
    expect(partsOf(puzzle, 'lines')).toHaveLength(1)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    const totals = [...partsOf(puzzle, 'across-total'), ...partsOf(puzzle, 'down-total')]
    expect(totals).toHaveLength(Number(puzzle.data?.runs))
    expect(totals.every((t) => t.visible !== false && t.fill === STUDIO_INK && Number(t.fontWeight) === 700)).toBe(true)
    const answers = partsOf(puzzle, 'answer')
    const open = String(grays!.data?.open)
    expect(answers).toHaveLength([...open].filter((c) => c === '1').length)
    expect(answers.every((t) => t.visible === false && t.studioRole === 'answer' && Number(t.fontWeight) === 400)).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual([DRIVE_SUM_WORD, DRIVE_TWICE_WORD])
    expect(['legend-gray', 'legend-lines', 'legend-diagonal', 'legend-frame', 'legend-number', 'legend-total', 'legend-cross'].flatMap((name) => partsOf(puzzle, name)).every((o) => o.visible !== false)).toBe(true)
    expect(partsOf(puzzle, 'legend-number').map((t) => Number(t.text))).toEqual([1, 3, 2, 2])
    expect(partsOf(puzzle, 'legend-total').map((t) => Number(t.text))).toEqual([4])
  })

  it('writes every digit in on the answer page, without the how-to line, and the digits add up', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const written = partsOf(puzzle, 'answer')
    expect(written.every((t) => t.visible === true && t.fill === STUDIO_INK)).toBe(true)
    // The digits on the key add up to the totals printed beside them.
    const n = 8
    const open = [...String(partsOf(puzzle, 'grays')[0]!.data?.open)].map((c) => c === '1')
    const values = new Array<number>(n * n).fill(DRIVE_BLANK)
    for (const t of written) values[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    const across = new Array<number>(n * n).fill(DRIVE_BLANK)
    const down = new Array<number>(n * n).fill(DRIVE_BLANK)
    for (const t of partsOf(puzzle, 'across-total')) across[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    for (const t of partsOf(puzzle, 'down-total')) down[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    expect(driveKeepsRules({ size: n, open, across, down }, values)).toBe(true)
    // The gray squares under the lines, the digits on top.
    const names = puzzle.objects!.map((o) => String(o.data?.[DRIVE_PART_KEY]))
    expect(names.indexOf('grays')).toBeLessThan(names.indexOf('lines'))
    expect(names.indexOf('lines')).toBeLessThan(names.indexOf('across-total'))
    expect(names.lastIndexOf('frame')).toBeLessThan(names.indexOf('answer'))
    expect(key.some((o) => o.text === DRIVE_HOW_TO)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === DRIVE_HOW_TO)).toBe(true)
  })

  it('builds a book that works through every route before one returns, never printing a grid twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at routes their last one did not use', () => {
    const recent = DRIVE_ROUTES.slice(0, 20).map((w) => w.id)
    rememberStudioContent(studioVarietyKey(DRIVE_TEMPLATE_KEY, 'routes'), recent)
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

describe('scenic drive preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planDrivePage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const route = DRIVE_ROUTES[0]!
  const run = (over: Partial<Parameters<typeof runDriveKdpPreflight>[0]>) => runDriveKdpPreflight({ built, plan, level: 'classic', route, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven grid', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that does not add up', () => {
    const values = [...built.values]
    const s = values.findIndex((v) => v !== DRIVE_BLANK)
    values[s] = values[s] === 9 ? 8 : 9
    expect(run({ built: { ...built, values } })).toMatch(/does not add up/)
  })

  it('refuses a grid its steps cannot finish', () => {
    // The same road map filled afresh: its totals seldom tell the digits apart.
    const n = built.puzzle.size
    let loose: DriveBuilt | null = null
    for (let seed = 0; !loose; seed++) {
      const rng = createRng(seed)
      const values = fillDriveGrid(n, built.puzzle.open, (o) => rng.shuffle(o))!
      const puzzle = drivePuzzleOf(n, built.puzzle.open, values)
      if (!solveDrive(puzzle, 'fit').solved) loose = { puzzle, values, signature: driveSignature(puzzle) }
    }
    expect(run({ built: loose })).toMatch(/logic alone/)
  })

  it('refuses a Classic grid that the sum table alone finishes', () => {
    let easy: DriveBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawDriveCandidate({ ...driveLevelSpec('classic'), rules: 'sums', beyond: null, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  }, SLOW)

  it('refuses a grid or a route the book already has', () => {
    const book = parseDriveBook([drivePageLabel(route, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseDriveBook([drivePageLabel(DRIVE_ROUTES[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this grid/)
  })

  it('refuses squares below the level’s floor, small digits and totals, crowded diagonals and a grid off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, signSize: 12 } })).toMatch(/below 14 pt/)
    expect(run({ plan: { ...plan, digitSize: 14 } })).toMatch(/below 16 pt/)
    expect(run({ plan: { ...plan, totalSize: 12 } })).toMatch(/below 12 pt/)
    expect(run({ plan: { ...plan, cell: 46, totalSize: 26 } })).toMatch(/crowds the diagonal/)
  })

  it('knows a lopsided grid', () => {
    expect(driveBalanced(4, gridFrom(['# # # #', '# 9 8 #', '# 1 3 2', '# # 1 4']).puzzle.open)).toBe(true)
    expect(driveBalanced(4, gridFrom(['# # # #', '# 9 8 #', '# 1 3 2', '# 3 1 4']).puzzle.open)).toBe(false)
  })

  it('catches a drawn page whose squares or totals do not match', () => {
    const puzzle = buildDrivePuzzle({ built, plan, route, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkDriveDrawnPage({ puzzle, built, route })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkDriveDrawnPage({ puzzle, built: other, route }).join(' ')
    expect(errors).toMatch(/totals/)
    expect(errors).toMatch(/written-in digits/)
    expect(checkDriveDrawnPage({ puzzle, built, route: DRIVE_ROUTES[5]! }).join(' ')).toMatch(/name the route/)
  })
})
