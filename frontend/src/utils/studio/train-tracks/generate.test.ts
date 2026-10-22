import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK, STUDIO_SAFE_AREA_PADDING_X } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { drawHeader } from '../studio-layout'
import { trainTracksTemplate } from './generate'
import { TT_CONFIG_SCHEMA } from './config'
import {
  TT_DEFAULT_TITLE,
  TT_GENTLE_TIP,
  TT_INSTRUCTION,
  TT_LEVELS,
  TT_LINES,
  TT_TEMPLATE_KEY,
  parseTtBook,
  parseTtLevel,
  pickTtLine,
  ttBoardRng,
  ttInstruction,
  ttLevelSpec,
  ttPageLabel,
  ttSignText,
  type TtLevel,
} from './content'
import { TT_PART_KEY, buildTtPuzzle, pieceLines, ttLaidLine } from './draw'
import { checkTtDrawnPage, runTtKdpPreflight } from './kdp-preflight'
import { TT_COUNT_MIN, planTtPage, ttContentBox, ttPanelInBody, ttPrintNote } from './layout'
import { buildTtBoard, drawTtRoute, ttMeetsLevel, ttPuzzleOf, ttSignature, type TtBuilt } from './puzzle'
import {
  TT_PIECES,
  TT_PIECE_DIRS,
  countTtSolutions,
  isTtSolution,
  solveTt,
  ttCounts,
  ttPieceOf,
  ttRouteKey,
  ttRoutePieces,
  type TtPortal,
  type TtPuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many boards: generous room when the whole suite runs at once. */
const SLOW = 60_000
const LEVELS = TT_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: TT_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(trainTracksTemplate),
  showTitle: true,
  title: TT_DEFAULT_TITLE,
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
  return trainTracksTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[TT_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[TT_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: TtLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(ttContentBox(ctx), config, tag, ttInstruction(config, level))
  return ttPanelInBody(header.body, header.objects.length > 0)
}

function builtFor(level: TtLevel, seed = 1): TtBuilt {
  return buildTtBoard({ ...ttLevelSpec(level), rng: ttBoardRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/**
 * A 4 × 4 board by hand: in at the top of column 1, out at the right of row 3.
 *
 *   . # . .
 *   . # # .
 *   . . # .
 *   . . # #
 */
const HAND_ROUTE = [1, 5, 6, 10, 14, 15]
const HAND_PORTALS: [TtPortal, TtPortal] = [
  { at: 1, dir: 0 },
  { at: 15, dir: 1 },
]
const handPuzzle = (shown: number[] = []): TtPuzzle => ttPuzzleOf(4, { route: HAND_ROUTE, portals: HAND_PORTALS }, shown)

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(trainTracksTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: TT_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(trainTracksTemplate, { seeds: 12 })

describe('train-tracks registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === TT_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(TT_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(found[0]!.description).not.toMatch(/—/)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(TT_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(TT_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(trainTracksTemplate).level).toBe('classic')
    expect(parseTtLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseTtLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(ttInstruction(base, 'gentle')).toBe(`${TT_INSTRUCTION} ${TT_GENTLE_TIP}`)
    expect(ttInstruction(base, 'classic')).toBe(TT_INSTRUCTION)
    expect(ttInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
    expect(`${TT_INSTRUCTION} ${TT_GENTLE_TIP}`).not.toMatch(/—/)
  })

  it('reports the square and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24 + STUDIO_SAFE_AREA_PADDING_X, bottom: 24, left: 36 + STUDIO_SAFE_AREA_PADDING_X } })
    for (const level of LEVELS) {
      const note = ttPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, numbers \d+(\.5)? pt\.$/)
      expect(ttPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(ttPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('train-tracks solver', () => {
  it('names every piece by the two sides it joins', () => {
    for (const piece of TT_PIECES) {
      const [a, b] = TT_PIECE_DIRS[piece]
      expect(ttPieceOf(a, b)).toBe(piece)
      expect(ttPieceOf(b, a)).toBe(piece)
    }
    expect(() => ttPieceOf(1, 1)).toThrow()
  })

  it('reads a line’s pieces and numbers', () => {
    const pieces = ttRoutePieces(4, HAND_ROUTE, HAND_PORTALS)
    expect([...pieces.entries()]).toEqual([
      [1, 'v'],
      [5, 'ne'],
      [6, 'sw'],
      [10, 'v'],
      [14, 'ne'],
      [15, 'h'],
    ])
    expect(ttCounts(4, HAND_ROUTE)).toEqual({ rows: [1, 2, 1, 2], cols: [0, 2, 3, 1] })
  })

  it('accepts the answer and refuses lines that break a rule', () => {
    const p = handPuzzle()
    expect(isTtSolution(p, HAND_ROUTE)).toBe(true)
    // Not neighbours, a square twice, the wrong ends, the wrong numbers.
    expect(isTtSolution(p, [1, 5, 10, 14, 15])).toBe(false)
    expect(isTtSolution(p, [1, 5, 6, 5, 6, 10, 14, 15])).toBe(false)
    expect(isTtSolution(p, [5, 6, 10, 14, 15])).toBe(false)
    expect(isTtSolution(p, [1, 2, 6, 10, 14, 15])).toBe(false)
    // A printed piece the line does not run through as printed.
    expect(isTtSolution({ ...p, givens: [...p.givens, { at: 6, piece: 'h' }] }, HAND_ROUTE)).toBe(false)
  })

  it('solves the hand board by logic to its one line, which plain search confirms', () => {
    const p = handPuzzle()
    const solve = solveTt(p, 'loop')
    expect(solve.solved).toBe(true)
    expect(solve.route).toEqual(HAND_ROUTE)
    expect(solve.unsettled).toEqual([])
    expect(countTtSolutions(p, 5)).toBe(1)
  })

  it('never claims a board with two lines is solved', () => {
    // Two ways round a 2 × 2 block, with nothing printed between the ends.
    const route = [0, 1, 5, 4, 8, 9]
    const portals: [TtPortal, TtPortal] = [
      { at: 0, dir: 3 },
      { at: 9, dir: 2 },
    ]
    const p = ttPuzzleOf(4, { route, portals }, [])
    const lines = countTtSolutions(p, 5)
    for (const rules of ['local', 'loop', 'probe'] as const) {
      const solve = solveTt(p, rules)
      if (lines > 1) expect(solve.solved).toBe(false)
      else if (solve.solved) expect(solve.route).toEqual(route)
    }
  })

  it('refuses a board whose printed piece points off the board', () => {
    const p = handPuzzle()
    const broken: TtPuzzle = { ...p, givens: [...p.givens, { at: 4, piece: 'h' }] }
    expect(solveTt(broken, 'probe').solved).toBe(false)
  })

  it(
    'agrees with plain search on every Gentle board: exactly one line',
    () => {
      for (let seed = 1; seed <= 10; seed++) {
        const built = builtFor('gentle', seed)
        expect(countTtSolutions(built.puzzle, 2)).toBe(1)
        expect(ttSolutionsMatch(built)).toBe(true)
      }
    },
    SLOW,
  )
})

/** The plain search's one line is the board's own. */
function ttSolutionsMatch(built: TtBuilt): boolean {
  const solve = solveTt(built.puzzle, 'probe')
  return solve.solved && ttRouteKey(solve.route) === ttRouteKey(built.route)
}

describe('train-tracks levels', () => {
  it(
    'builds every level to its size, its share of the board and its printed pieces',
    () => {
      for (const level of LEVELS) {
        const spec = ttLevelSpec(level)
        for (let seed = 1; seed <= 4; seed++) {
          const built = builtFor(level, seed)
          const { puzzle, route } = built
          expect(puzzle.size).toBe(spec.size)
          expect(route.length).toBeGreaterThanOrEqual(Math.ceil(spec.size ** 2 * spec.fill[0]))
          expect(route.length).toBeLessThanOrEqual(Math.floor(spec.size ** 2 * spec.fill[1]))
          expect(puzzle.givens.length).toBeGreaterThanOrEqual(spec.givens[0])
          expect(puzzle.givens.length).toBeLessThanOrEqual(spec.givens[1])
          // The two ends are always printed, on the board's edge.
          const printed = new Set(puzzle.givens.map((g) => g.at))
          expect(printed.has(puzzle.portals[0].at) && printed.has(puzzle.portals[1].at)).toBe(true)
          expect(puzzle.portals[0].dir).not.toBe(puzzle.portals[1].dir)
          // Every row and column holds track.
          expect(puzzle.rows.every((k) => k > 0) && puzzle.cols.every((k) => k > 0)).toBe(true)
          expect(ttMeetsLevel(puzzle, route, spec)).toBe(true)
        }
      }
    },
    SLOW,
  )

  it(
    'needs the level’s own steps: Classic needs "don’t close it early", Challenging needs "what if"',
    () => {
      for (let seed = 1; seed <= 3; seed++) {
        const classic = builtFor('classic', seed).puzzle
        expect(solveTt(classic, 'local').solved).toBe(false)
        expect(solveTt(classic, 'loop').solved).toBe(true)
        const challenging = builtFor('challenging', seed).puzzle
        expect(solveTt(challenging, 'loop').solved).toBe(false)
        expect(solveTt(challenging, 'probe').solved).toBe(true)
      }
    },
    SLOW,
  )

  it('lays a line that turns often and enters and leaves on different sides', () => {
    const rng = createRng(7)
    for (let k = 0; k < 20; k++) {
      const draw = drawTtRoute(8, 27, 38, rng)
      if (!draw) continue
      expect(new Set(draw.route).size).toBe(draw.route.length)
      expect(draw.portals[0].dir).not.toBe(draw.portals[1].dir)
      expect(draw.route.length).toBeGreaterThanOrEqual(27)
      expect(draw.route.length).toBeLessThanOrEqual(38)
    }
  })

  it('fingerprints a board the same however it is turned', () => {
    // The hand board mirrored left to right.
    const mirror = (i: number) => Math.floor(i / 4) * 4 + (3 - (i % 4))
    const mirrored = HAND_ROUTE.map(mirror)
    const portals: [TtPortal, TtPortal] = [
      { at: mirror(1), dir: 0 },
      { at: mirror(15), dir: 3 },
    ]
    expect(ttSignature(4, mirrored, portals)).toBe(ttSignature(4, HAND_ROUTE, HAND_PORTALS))
    expect(ttSignature(4, [0, 1, 2, 3], [{ at: 0, dir: 3 }, { at: 3, dir: 1 }])).not.toBe(ttSignature(4, HAND_ROUTE, HAND_PORTALS))
  })
})

describe('train-tracks lines', () => {
  it('names every line once, plainly, without dashes', () => {
    expect(new Set(TT_LINES.map((l) => l.id)).size).toBe(TT_LINES.length)
    for (const line of TT_LINES) {
      expect(line.name).not.toMatch(/—|–/)
      expect(ttSignText(line, 2).split('\n').length).toBeLessThanOrEqual(2)
    }
  })

  it('works through every line in a book before one returns, never the same twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < TT_LINES.length; page++) {
      const line = pickTtLine({ level: 'classic', seed: page, ownerSalt: saltOf(2), book: parseTtBook(labels), recent: [] })
      labels.push(ttPageLabel(line, 'classic', `sig${page}`))
    }
    expect(new Set(parseTtBook(labels).map((e) => e.line)).size).toBe(TT_LINES.length)
  })

  it('reads the book back from its labels, skipping strangers', () => {
    const line = TT_LINES[0]!
    expect(parseTtBook([ttPageLabel(line, 'gentle', 'abc'), 'nobody|gentle|x', `${line.id}|odd|y`])).toEqual([
      { line: line.id, level: 'gentle', signature: 'abc' },
      { line: line.id, level: null, signature: 'y' },
    ])
  })
})

describe('train-tracks pages', () => {
  it(
    'prints one board per level on 6 × 9 and 8.5 × 11, every part on the page',
    () => {
      for (const [w, h] of [
        [6, 9],
        [8.5, 11],
      ] as const) {
        for (const level of LEVELS) {
          const ctx = kdpCtx(w, h, 3)
          const pages = generate({ ...base, level }, ctx)
          expect(pages).toHaveLength(1)
          expect(pages[0]!.buildFailed).toBeUndefined()
          assertObjectsInSafeMargin(pages[0]!.objects, ctx)
          const puzzle = puzzleOf(pages[0]!.objects)!
          expect(puzzle.data?.level).toBe(level)
          expect(String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY])).toMatch(new RegExp(`\\|${level}\\|`))
          const size = ttLevelSpec(level).size
          expect(partsOf(puzzle, 'count')).toHaveLength(2 * size)
          expect(partsOf(puzzle, 'legend-piece')).toHaveLength(6)
          for (const count of partsOf(puzzle, 'count')) expect(Number(count.fontSize)).toBeGreaterThanOrEqual(TT_COUNT_MIN)
        }
      }
    },
    SLOW,
  )

  it('says so plainly on a page too small for the level', () => {
    const pages = generate({ ...base, level: 'challenging' }, kdpCtx(4, 6))
    expect(pages[0]!.buildFailed).toMatch(/too small/)
  })

  it(
    'never lays the same board twice in one book',
    () => {
      const labels: string[] = []
      for (let seed = 1; seed <= 6; seed++) {
        const pages = generate({ ...base, level: 'gentle', seed }, kdpCtx(8.5, 11, seed, labels))
        labels.push(String(puzzleOf(pages[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
      }
      const book = parseTtBook(labels)
      expect(new Set(book.map((e) => e.signature)).size).toBe(book.length)
      expect(new Set(book.map((e) => e.line)).size).toBe(book.length)
    },
    SLOW,
  )

  it('draws every piece of track inside its square', () => {
    for (const piece of TT_PIECES) {
      for (const line of pieceLines(piece)) {
        for (const [u, v] of line) {
          expect(u).toBeGreaterThanOrEqual(-1e-9)
          expect(u).toBeLessThanOrEqual(1 + 1e-9)
          expect(v).toBeGreaterThanOrEqual(-1e-9)
          expect(v).toBeLessThanOrEqual(1 + 1e-9)
        }
      }
    }
  })
})

describe('train-tracks answer page', () => {
  it('lays the whole line in black, from the board’s edge to its edge, with the printed pieces on top', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const answers = harvestAnswers(pages[0]!.objects)
    expect(answers).toHaveLength(1)
    expect(answers[0]!.visible).toBe(false)
    const key = buildAnswerKeyFromOutputs(pages, STUDIO_INK, { contentWidth: 700 })
    expect(key.length).toBeGreaterThan(0)

    const puzzle = puzzleOf(pages[0]!.objects)!
    const [laid] = partsOf(puzzle, 'line')
    const givens = partsOf(puzzle, 'given')
    const order = puzzle.objects!.map((o) => o.data?.[TT_PART_KEY])
    expect(order.indexOf('line')).toBeLessThan(order.indexOf('given'))
    expect(givens.length).toBeGreaterThanOrEqual(2)
    expect(laid!.stroke).toBe(STUDIO_INK)
  })

  it('starts and ends the laid line on the board’s edge', () => {
    const built = builtFor('classic')
    const plan = planTtPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const line = ttLaidLine(plan, built.route, built.puzzle.portals)
    const onEdge = ([x, y]: readonly [number, number]) =>
      Math.abs(x - plan.grid.left) < 0.01 ||
      Math.abs(x - (plan.grid.left + plan.grid.width)) < 0.01 ||
      Math.abs(y - plan.grid.top) < 0.01 ||
      Math.abs(y - (plan.grid.top + plan.grid.height)) < 0.01
    expect(onEdge(line[0]!)).toBe(true)
    expect(onEdge(line[line.length - 1]!)).toBe(true)
  })
})

describe('train-tracks preflight', () => {
  it('passes a good page and its drawing', () => {
    const ctx = kdpCtx(8.5, 11)
    const panel = panelFor(ctx)
    const plan = planTtPage(panel, 'classic', FONT)!
    const built = builtFor('classic')
    const line = TT_LINES[0]!
    expect(runTtKdpPreflight({ built, plan, level: 'classic', line, panel, font: FONT }).errors).toEqual([])
    const puzzle = buildTtPuzzle({ built, plan, line, level: 'classic', label: ttPageLabel(line, 'classic', built.signature), tag, font: FONT })
    expect(checkTtDrawnPage({ puzzle, built, line })).toEqual([])
  })

  it('refuses a board with a wrong number, a repeat in the book, or a page planned for another level', () => {
    const ctx = kdpCtx(8.5, 11)
    const panel = panelFor(ctx)
    const plan = planTtPage(panel, 'classic', FONT)!
    const built = builtFor('classic')
    const line = TT_LINES[0]!
    const rows = [...built.puzzle.rows]
    rows[0] = rows[0]! + 1
    const wrong: TtBuilt = { ...built, puzzle: { ...built.puzzle, rows } }
    expect(runTtKdpPreflight({ built: wrong, plan, level: 'classic', line, panel, font: FONT }).ok).toBe(false)
    const book = [{ line: TT_LINES[1]!.id, level: 'classic' as const, signature: built.signature }]
    expect(runTtKdpPreflight({ built, plan, level: 'classic', line, panel, font: FONT, book }).errors).toContain('The book already prints this board.')
    const gentlePlan = planTtPage(panelFor(ctx, 'gentle'), 'gentle', FONT)!
    expect(runTtKdpPreflight({ built, plan: gentlePlan, level: 'classic', line, panel, font: FONT }).ok).toBe(false)
  })

  it('catches a drawing whose answer shows on the puzzle page', () => {
    const ctx = kdpCtx(8.5, 11)
    const plan = planTtPage(panelFor(ctx), 'classic', FONT)!
    const built = builtFor('classic')
    const line = TT_LINES[0]!
    const puzzle = buildTtPuzzle({ built, plan, line, level: 'classic', label: 'x', tag, font: FONT })
    const shown = { ...puzzle, objects: puzzle.objects!.map((o) => (o.data?.[TT_PART_KEY] === 'line' ? { ...o, visible: true } : o)) }
    expect(checkTtDrawnPage({ puzzle: shown, built, line })).toContain('The answer shows on the puzzle page.')
  })
})
