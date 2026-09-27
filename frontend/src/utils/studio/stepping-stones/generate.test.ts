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
import { steppingStonesTemplate } from './generate'
import { STONES_CONFIG_SCHEMA } from './config'
import {
  STONES_DEFAULT_TITLE,
  STONES_ENDS_WORD,
  STONES_GENTLE_TIP,
  STONES_LEVELS,
  STONES_NEXT_WORD,
  STONES_TEMPLATE_KEY,
  STONES_WALKS,
  parseStonesBook,
  parseStonesLevel,
  pickStonesWalk,
  stonesHowTo,
  stonesInstruction,
  stonesLevelSpec,
  stonesPageLabel,
  stonesPathRng,
  stonesSignText,
  type StonesLevel,
} from './content'
import { STONES_PART_KEY, STONES_TRAIL_FILL, buildStonesPuzzle, stonesCentre, stonesStoneBox, stonesTrailShapes } from './draw'
import { checkStonesDrawnPage, runStonesKdpPreflight } from './kdp-preflight'
import { STONES_DIGIT_MIN, STONES_SIGN_GAP_MIN, planStonesPage, stonesContentBox, stonesPanelInBody, stonesPrintNote } from './layout'
import {
  buildStonesPath,
  drawStonesCandidate,
  drawStonesWalk,
  stonesClueCount,
  stonesClueRange,
  stonesLongestRun,
  stonesMeetsLevel,
  stonesSignature,
  stonesValuesOf,
  type StonesBuilt,
} from './puzzle'
import {
  STONES_BLANK,
  countStonesSolutions,
  isStonesSolution,
  solveStones,
  stonesAnswerKey,
  stonesIsPath,
  stonesNeighbours,
  stonesPathOrder,
  stonesTouch,
  stonesWellFormed,
  type StonesPuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many paths: generous room when the whole suite runs at once. */
const SLOW = 180_000
const LEVELS = STONES_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: STONES_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(steppingStonesTemplate),
  showTitle: true,
  title: STONES_DEFAULT_TITLE,
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
  return steppingStonesTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[STONES_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[STONES_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: StonesLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(stonesContentBox(ctx), config, tag, stonesInstruction(config, level))
  return stonesPanelInBody(header.body, header.objects.length > 0)
}

/** A path from a picture: rows of numbers, `.` a blank stone. */
function pathFrom(rows: string[]): StonesPuzzle {
  const clues: number[] = []
  for (const row of rows) for (const cell of row.trim().split(/\s+/)) clues.push(cell === '.' ? STONES_BLANK : Number(cell))
  return { size: rows.length, clues }
}

function builtFor(level: StonesLevel, seed = 1): StonesBuilt {
  return buildStonesPath({ ...stonesLevelSpec(level), rng: stonesPathRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/** A small path the rules tests use: a 4 × 4 zigzag, row by row. */
const ZIGZAG = pathFrom(['1 2 3 4', '8 7 6 5', '9 10 11 12', '16 15 14 13'])

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(steppingStonesTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: STONES_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(steppingStonesTemplate, { seeds: 12 })

describe('stepping stones registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === STONES_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(STONES_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(STONES_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(STONES_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(steppingStonesTemplate).level).toBe('classic')
    expect(parseStonesLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseStonesLevel(level)).toBe(level)
  })

  it('names the level’s last number, adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(stonesHowTo('gentle')).toMatch(/1 to 36/)
    expect(stonesHowTo('classic')).toMatch(/1 to 64/)
    expect(stonesHowTo('challenging')).toMatch(/1 to 81/)
    expect(stonesInstruction(base, 'gentle')).toBe(`${stonesHowTo('gentle')} ${STONES_GENTLE_TIP}`)
    expect(stonesInstruction(base, 'classic')).toBe(stonesHowTo('classic'))
    expect(stonesInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the stone and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = stonesPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Stones print 0\.\d\d in, the path \d\.\d\d in across, numbers \d+(\.5)? pt\.$/)
      expect(stonesPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(stonesPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('stepping stones rules and solver', () => {
  it('reads a path picture the way it is drawn, and knows its neighbours', () => {
    expect(ZIGZAG.size).toBe(4)
    expect(ZIGZAG.clues.slice(4, 8)).toEqual([8, 7, 6, 5])
    const nb = stonesNeighbours(4)
    // Stone 5 (row 1, col 1): up 1, right 6, down 9, left 4.
    expect(Array.from(nb.slice(20, 24))).toEqual([1, 6, 9, 4])
    // The top-left corner has no up and no left.
    expect(Array.from(nb.slice(0, 4))).toEqual([-1, 1, 4, -1])
    expect(stonesTouch(4, 3, 4)).toBe(false)
    expect(stonesTouch(4, 3, 7)).toBe(true)
  })

  it('knows a finished path when it sees one, and every way one can be wrong', () => {
    expect(stonesWellFormed(ZIGZAG)).toBe(true)
    expect(stonesIsPath(4, ZIGZAG.clues)).toBe(true)
    expect(isStonesSolution({ size: 4, clues: new Array(16).fill(STONES_BLANK) }, ZIGZAG.clues)).toBe(true)
    // A number twice, a number too large, a jump across a row's end, a diagonal step.
    expect(stonesWellFormed(pathFrom(['1 1', '. .']))).toBe(false)
    expect(stonesWellFormed(pathFrom(['1 5', '. .']))).toBe(false)
    expect(stonesIsPath(4, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])).toBe(false)
    expect(stonesIsPath(2, [1, 3, 4, 2])).toBe(false)
    expect(stonesIsPath(2, [1, 2, 4, 3])).toBe(true)
    // A printed number the answer does not keep.
    expect(isStonesSolution(pathFrom(['1 .', '. 4']), [1, 2, 4, 3])).toBe(false)
    expect(stonesPathOrder(2, [1, 2, 4, 3])).toEqual([0, 1, 3, 2])
  })

  it('solves a proven path step by step, on exactly its walk', () => {
    const built = builtFor('classic')
    const solve = solveStones(built.puzzle, 'link')
    expect(solve.solved).toBe(true)
    expect(solve.broken).toBe(false)
    expect(stonesAnswerKey(solve.values)).toBe(stonesAnswerKey(built.values))
    expect(solve.tally.reach).toBeGreaterThan(0)
    expect(solve.tally.link).toBeGreaterThan(0)
  }, SLOW)

  it('counts the steps: numbers between two on the page fill a walk exactly that long', () => {
    // 1 and 3 printed with one stone between them: 2 can only be that stone.
    const p = pathFrom(['1 . 3', '. . .', '9 . .'])
    const solve = solveStones(p, 'reach')
    expect(solve.values[1]).toBe(2)
    // A walk colours the checkerboard: 1 on a dark stone puts every odd number on a dark stone.
    const full = solveStones(pathFrom(['1 . .', '. . .', '. . 9']), 'reach')
    expect(full.broken).toBe(false)
  })

  it('finds no dead ends: a stone with one way in can only be the start or the finish', () => {
    // The corner stone has one open neighbour once its other neighbour is filled.
    const p = pathFrom(['. 9 8 7', '. . 1 6', '. . . 5', '. . . 4'])
    expect(solveStones(p, 'link').broken).toBe(false)
  })

  it('catches a broken puzzle: printed numbers too far apart to join', () => {
    const solve = solveStones(pathFrom(['1 . .', '. . .', '. . 3']), 'reach')
    expect(solve.solved).toBe(false)
    expect(solve.broken).toBe(true)
    // Wrong colour: 1 and 4 can never be diagonal neighbours two steps apart.
    expect(solveStones(pathFrom(['1 . .', '. 4 .', '. . .']), 'reach').broken).toBe(true)
  })

  it('refuses to guess: a path with several answers is left unfinished at every level', () => {
    // 1 and 16 on stones of different colours, and nothing between: many walks join them.
    const open = pathFrom(['1 . . .', '. . . .', '. . . .', '16 . . .'])
    expect(countStonesSolutions(open, 3)).toBeGreaterThan(1)
    for (const rules of ['reach', 'link', 'probe'] as const) expect(solveStones(open, rules).solved).toBe(false)
  })

  it('needs "no dead ends" at Classic, and "what if" at Challenging', () => {
    for (let seed = 0; seed < 2; seed++) {
      const classic = builtFor('classic', seed)
      expect(solveStones(classic.puzzle, 'reach').solved).toBe(false)
      expect(solveStones(classic.puzzle, 'link').solved).toBe(true)
      const hard = builtFor('challenging', seed)
      expect(solveStones(hard.puzzle, 'link').solved).toBe(false)
      const solve = solveStones(hard.puzzle, 'probe')
      expect(solve.solved).toBe(true)
      expect(solve.tally.probe).toBeGreaterThan(0)
    }
  }, SLOW)

  it('agrees with plain search: every path the solver finishes has exactly one answer', () => {
    let finished = 0
    for (let seed = 0; seed < 60; seed++) {
      const rng = createRng(1000 + seed)
      const n = 4 + (seed % 2)
      const values = stonesValuesOf(n, drawStonesWalk(n, rng))
      // Keep the ends and a random third of the rest.
      const clues = values.map((v) => (v === 1 || v === n * n || rng.chance(0.3) ? v : STONES_BLANK))
      const p = { size: n, clues }
      const solve = solveStones(p, 'probe')
      const count = countStonesSolutions(p, 2)
      expect(count).toBeGreaterThanOrEqual(1)
      if (solve.solved) {
        finished++
        expect(count, `seed ${seed}`).toBe(1)
        expect(stonesAnswerKey(solve.values)).toBe(stonesAnswerKey(values))
      }
      expect(solve.broken).toBe(false)
    }
    expect(finished).toBeGreaterThan(10)
  }, SLOW)

  it('never claims a path with several answers is solved', () => {
    let several = 0
    for (let seed = 0; seed < 60; seed++) {
      const rng = createRng(5000 + seed)
      const n = 5
      const values = stonesValuesOf(n, drawStonesWalk(n, rng))
      const clues = values.map((v) => (v === 1 || v === n * n || rng.chance(0.15) ? v : STONES_BLANK))
      const p = { size: n, clues }
      if (countStonesSolutions(p, 2) < 2) continue
      several++
      for (const rules of ['reach', 'link', 'probe'] as const) expect(solveStones(p, rules).solved, `seed ${seed} ${rules}`).toBe(false)
    }
    expect(several).toBeGreaterThan(10)
  }, SLOW)

  it('walks every stone once, across or down, and bends the zigzag out of recognition', () => {
    for (let seed = 0; seed < 10; seed++) {
      const n = 6 + (seed % 4)
      const walk = drawStonesWalk(n, createRng(seed))
      expect(new Set(walk).size).toBe(n * n)
      expect(stonesIsPath(n, stonesValuesOf(n, walk))).toBe(true)
      // Not the zigzag it started from.
      expect(walk.slice(0, n)).not.toEqual(Array.from({ length: n }, (_, c) => c))
    }
    expect(stonesLongestRun([0, 1, 2, 3, 7, 11])).toBe(4)
    expect(stonesLongestRun([0, 1, 5, 6])).toBe(2)
  })
})

describe('stepping stones levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds paths of the level's size that its own steps finish`, () => {
      const spec = stonesLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 4
      const [fewest, most] = stonesClueRange(spec)
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        const N = spec.size * spec.size
        expect(built.puzzle.size).toBe(spec.size)
        expect(stonesWellFormed(built.puzzle)).toBe(true)
        expect(isStonesSolution(built.puzzle, built.values)).toBe(true)
        expect(stonesMeetsLevel(built.puzzle, built.values, spec)).toBe(true)
        expect(solveStones(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveStones(built.puzzle, spec.beyond).solved).toBe(false)
        expect(stonesClueCount(built.puzzle)).toBeGreaterThanOrEqual(fewest)
        expect(stonesClueCount(built.puzzle)).toBeLessThanOrEqual(most)
        expect(built.puzzle.clues).toContain(1)
        expect(built.puzzle.clues).toContain(N)
        expect(stonesLongestRun(stonesPathOrder(spec.size, built.values)!)).toBeLessThanOrEqual(spec.maxRun)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first path: counting steps finishes it, and it has one answer', () => {
    for (let seed = 0; seed < 4; seed++) {
      const built = builtFor('gentle', seed)
      expect(solveStones(built.puzzle, 'reach').solved).toBe(true)
      expect(countStonesSolutions(built.puzzle, 2)).toBe(1)
    }
  }, SLOW)

  it('knows a path however it is turned, mirrored or walked backwards', () => {
    const a = pathFrom(['1 . .', '. . .', '. 8 9'])
    // Mirrored left to right.
    const mirrored = pathFrom(['. . 1', '. . .', '9 8 .'])
    // Turned a quarter clockwise: (r, c) → (c, 2 − r).
    const turned = pathFrom(['. . 1', '8 . .', '9 . .'])
    // Walked backwards: k → 10 − k.
    const backwards = pathFrom(['9 . .', '. . .', '. 2 1'])
    for (const same of [mirrored, turned, backwards]) expect(stonesSignature(same)).toBe(stonesSignature(a))
    expect(stonesSignature(pathFrom(['1 . .', '. . .', '. 6 9']))).not.toBe(stonesSignature(a))
  })
})

describe('stepping stones walks', () => {
  it('names every walk once, in retirement words, with no brand, drink or money', () => {
    expect(STONES_WALKS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(STONES_WALKS.map((w) => w.id)).size).toBe(STONES_WALKS.length)
    for (const w of STONES_WALKS) {
      expect(w.id).toMatch(/^[a-z0-9-]+$/)
      expect(w.name).not.toMatch(/beer|wine|vineyard|whisk|rum\b|cocktail|margarita|champagne|happy hour|drunk|pension|money|cash|dollar|old age|senior/i)
      expect(stonesSignText(w)).toBe(w.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const dog = STONES_WALKS.find((w) => w.id === 'evening-walk-with-the-dog')!
    expect(stonesSignText(dog, 2)).toBe('Evening Walk\nwith the Dog')
    const rose = STONES_WALKS.find((w) => w.id === 'rose-garden-path')!
    expect(stonesSignText(rose, 2).split('\n')).toHaveLength(2)
    expect(stonesSignText(rose, 2).replace('\n', ' ')).toBe(rose.name)
  })

  it('works through every walk before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < STONES_WALKS.length + 5; page++) {
      const book = parseStonesBook(labels)
      const pick = pickStonesWalk({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.walk)
      labels.push(stonesPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, STONES_WALKS.length).map((l) => l.split('|')[0])).size).toBe(STONES_WALKS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickStonesWalk({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = STONES_WALKS.slice(0, STONES_WALKS.length - 3).map((w) => w.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a walk', () => {
    expect(parseStonesBook(['harbor-walk|gentle|abc', 'nowhere|classic|x', 'dogwood-trail|odd|def', ''])).toEqual([
      { walk: 'harbor-walk', level: 'gentle', signature: 'abc' },
      { walk: 'dogwood-trail', level: null, signature: 'def' },
    ])
  })
})

describe('stepping stones pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print path on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = stonesLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'given').length).toBeGreaterThan(0)
        expect([...partsOf(puzzle!, 'given'), ...partsOf(puzzle!, 'answer')].every((t) => Number(t.fontSize) >= STONES_DIGIT_MIN)).toBe(true)
      }
    }
  }, SLOW)

  it('prints stones as large as the trim allows, never below the level’s floor', () => {
    const big = planStonesPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planStonesPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(stonesLevelSpec('challenging').minCell))
    for (const plan of [big, small]) {
      expect(plan.stone + plan.gap).toBe(plan.cell)
      expect(plan.gap).toBeGreaterThanOrEqual(5)
      // A two-digit number fits its stone with room round it.
      expect(plan.digitSize * 1.3).toBeLessThan(plan.stone)
    }
  })

  it('keeps every number inside its stone, and the trail on the stones’ centres', () => {
    const plan = planStonesPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const puzzle = buildStonesPuzzle({ built, plan, walk: STONES_WALKS[0]!, level: 'challenging', label: 'x', tag, font: FONT })
    // Children sit relative to the group's centre.
    const dx = puzzle.left + puzzle.width! / 2
    const dy = puzzle.top + puzzle.height! / 2
    let checked = 0
    for (const name of ['given', 'answer']) {
      for (const o of partsOf(puzzle, name)) {
        const box = stonesStoneBox(plan, Number(o.data?.row), Number(o.data?.col))
        const w = String(o.text).length * Number(o.fontSize) * 0.6
        const h = Number(o.fontSize)
        expect(o.left + dx - w / 2).toBeGreaterThanOrEqual(box.left)
        expect(o.left + dx + w / 2).toBeLessThanOrEqual(box.left + box.width)
        expect(o.top + dy - h / 2).toBeGreaterThanOrEqual(box.top)
        expect(o.top + dy + h / 2).toBeLessThanOrEqual(box.top + box.height)
        checked++
      }
    }
    expect(checked).toBe(81)
    // The trail's bands join neighbouring centres; its discs sit on centres.
    const order = stonesPathOrder(9, built.values)!
    const shapes = stonesTrailShapes(plan, order)
    const centres = new Set(order.map((s) => stonesCentre(plan, Math.floor(s / 9), s % 9).join(',')))
    const discs = shapes.filter((sh) => sh.length > 4)
    expect(discs.length).toBeGreaterThanOrEqual(2)
    for (const disc of discs) {
      const cx = disc.reduce((sum, [x]) => sum + x, 0) / disc.length
      const cy = disc.reduce((sum, [, y]) => sum + y, 0) / disc.length
      expect(centres.has([Math.round(cx * 100) / 100, Math.round(cy * 100) / 100].join(',')) || [...centres].some((c) => {
        const [x, y] = c.split(',').map(Number)
        return Math.abs(x! - cx) < 0.01 && Math.abs(y! - cy) < 0.01
      })).toBe(true)
    }
    expect(shapes.length - discs.length).toBe(discs.length - 1)
  })

  it('stacks the legend rather than shrinking the path on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 380, height: 1000 }
    const plan = planStonesPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const walk = STONES_WALKS.find((w) => w.id === 'evening-walk-with-the-dog')!
    expect(runStonesKdpPreflight({ built, plan, level: 'gentle', walk, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildStonesPuzzle({ built, plan, walk, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkStonesDrawnPage({ puzzle, built, walk })).toEqual([])
    const [nextWords, endsWords] = partsOf(puzzle, 'legend-text')
    expect(endsWords!.top).toBeGreaterThan(nextWords!.top)
    // The path takes the whole width; only the legend gives way.
    expect(plan.grid.width).toBeLessThanOrEqual(380)
    expect(plan.grid.width).toBeGreaterThan(380 - 6)
  })

  it('keeps the signpost and the legend clear of the path', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planStonesPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(STONES_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planStonesPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runStonesKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', walk: STONES_WALKS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The signpost crowds the path.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the signpost, the stones and the printed numbers, with the walk hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${STONES_TEMPLATE_KEY}:${signature}`)
    const walk = STONES_WALKS.find((w) => w.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(stonesSignText(walk))
    expect(partsOf(puzzle, 'sign')).toHaveLength(2)
    const rows = partsOf(puzzle, 'stones')
    expect(rows).toHaveLength(8)
    expect(rows.every((r) => r.visible !== false && r.fill === 'transparent' && Number(r.data?.stones) === 8)).toBe(true)
    const givens = partsOf(puzzle, 'given')
    expect(givens.length).toBeGreaterThanOrEqual(stonesClueRange(stonesLevelSpec('classic'))[0])
    expect(givens.every((t) => t.visible !== false && t.fill === STUDIO_INK && Number(t.fontWeight) === 700)).toBe(true)
    expect(givens.map((t) => Number(t.text))).toEqual(expect.arrayContaining([1, 64]))
    const answers = partsOf(puzzle, 'answer')
    expect(givens.length + answers.length).toBe(64)
    expect(answers.every((t) => t.visible === false && t.studioRole === 'answer' && Number(t.fontWeight) === 400)).toBe(true)
    const [trail] = partsOf(puzzle, 'trail')
    expect(partsOf(puzzle, 'trail')).toHaveLength(1)
    expect(trail!.visible).toBe(false)
    expect(trail!.studioRole).toBe('answer')
    // The start and finish stones are ringed twice on the puzzle page.
    const ends = partsOf(puzzle, 'end')
    expect(ends).toHaveLength(4)
    expect(ends.every((o) => o.visible !== false)).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual([STONES_NEXT_WORD, STONES_ENDS_WORD])
    expect(['legend-stones', 'legend-end', 'legend-number'].flatMap((name) => partsOf(puzzle, name)).every((o) => o.visible !== false)).toBe(true)
  })

  it('traces the walk as a gray trail on the answer page, every number written in, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const [trail] = partsOf(puzzle, 'trail')
    expect(trail!.visible).toBe(true)
    expect(trail!.fill).toBe(STONES_TRAIL_FILL)
    expect(trail!.strokeWidth).toBe(0)
    const written = partsOf(puzzle, 'answer')
    expect(written.every((t) => t.visible === true && t.fill === STUDIO_INK)).toBe(true)
    // The numbers on the key make one walk that keeps every printed number.
    const n = 8
    const values = new Array<number>(n * n).fill(0)
    for (const t of [...partsOf(puzzle, 'given'), ...written]) values[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    expect(stonesIsPath(n, values)).toBe(true)
    expect(String(trail!.data?.walk)).toBe(stonesPathOrder(n, values)!.join(','))
    // The trail under the stones, the numbers on top.
    const names = puzzle.objects!.map((o) => String(o.data?.[STONES_PART_KEY]))
    expect(names.indexOf('trail')).toBeLessThan(names.indexOf('stones'))
    expect(names.lastIndexOf('stones')).toBeLessThan(names.indexOf('end'))
    expect(names.lastIndexOf('end')).toBeLessThan(Math.min(names.indexOf('given'), names.indexOf('answer')))
    const howTo = stonesHowTo('classic')
    expect(key.some((o) => o.text === howTo)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === howTo)).toBe(true)
  })

  it('builds a book that works through every walk before one returns, never printing a path twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at walks their last one did not use', () => {
    const recent = STONES_WALKS.slice(0, 20).map((w) => w.id)
    rememberStudioContent(studioVarietyKey(STONES_TEMPLATE_KEY, 'walks'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different path for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('stepping stones preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planStonesPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const walk = STONES_WALKS[0]!
  const run = (over: Partial<Parameters<typeof runStonesKdpPreflight>[0]>) =>
    runStonesKdpPreflight({ built, plan, level: 'classic', walk, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven path', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that is not one walk', () => {
    const values = [...built.values]
    const a = values.indexOf(10)
    const b = values.indexOf(40)
    values[a] = 40
    values[b] = 10
    expect(run({ built: { ...built, values } })).toMatch(/one walk/)
  })

  it('refuses a path with several answers', () => {
    // Every number but the start and the finish taken away: the walk is free to wander.
    const bare: StonesPuzzle = { size: 8, clues: built.puzzle.clues.map((v) => (v === 1 || v === 64 ? v : STONES_BLANK)) }
    expect(run({ built: { puzzle: bare, values: built.values, signature: stonesSignature(bare) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic path that counting steps alone finishes', () => {
    let easy: StonesBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawStonesCandidate({ ...stonesLevelSpec('classic'), rules: 'reach', beyond: null, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  }, SLOW)

  it('refuses a path or a walk the book already has', () => {
    const book = parseStonesBook([stonesPageLabel(walk, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseStonesBook([stonesPageLabel(STONES_WALKS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this path/)
  })

  it('refuses stones below the level’s floor, small numbers and a path off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, signSize: 12 } })).toMatch(/below 14 pt/)
    expect(run({ plan: { ...plan, digitSize: 14 } })).toMatch(/below 16 pt/)
  })

  it('catches a drawn page whose numbers or trail do not match', () => {
    const puzzle = buildStonesPuzzle({ built, plan, walk, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkStonesDrawnPage({ puzzle, built, walk })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkStonesDrawnPage({ puzzle, built: other, walk }).join(' ')
    expect(errors).toMatch(/printed numbers/)
    expect(errors).toMatch(/trail|written-in/)
    expect(checkStonesDrawnPage({ puzzle, built, walk: STONES_WALKS[5]! }).join(' ')).toMatch(/name the walk/)
  })
})
