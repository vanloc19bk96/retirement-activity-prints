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
import { stringOfPearlsTemplate } from './generate'
import { PEARL_CONFIG_SCHEMA } from './config'
import {
  PEARL_BLACK_WORD,
  PEARL_DEFAULT_TITLE,
  PEARL_GENTLE_TIP,
  PEARL_INSTRUCTION,
  PEARL_LEVELS,
  PEARL_NECKLACES,
  PEARL_TEMPLATE_KEY,
  PEARL_WHITE_WORD,
  parsePearlBook,
  parsePearlLevel,
  pearlBoardRng,
  pearlInstruction,
  pearlLevelSpec,
  pearlPageLabel,
  pearlSignText,
  pickPearlNecklace,
  type PearlLevel,
} from './content'
import { PEARL_PART_KEY, buildPearlPuzzle, pearlCord } from './draw'
import { checkPearlDrawnPage, runPearlKdpPreflight } from './kdp-preflight'
import { PEARL_SIGN_GAP_MIN, pearlContentBox, pearlPanelInBody, pearlPrintNote, planPearlPage } from './layout'
import { buildPearlBoard, drawPearlCandidate, drawPearlLoop, pearlBare, pearlCounts, pearlMeetsLevel, pearlOutline, pearlSignature, pearlSpots, type PearlBuilt } from './puzzle'
import {
  PEARL_BLACK,
  PEARL_NONE,
  PEARL_WHITE,
  countPearlSolutions,
  isPearl,
  isPearlSolution,
  pearlAnswerKey,
  pearlGeometry,
  pearlLinkBetween,
  pearlLoopOrder,
  pearlWellFormed,
  solvePearl,
  type PearlPuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many boards: generous room when the whole suite runs at once. */
const SLOW = 120_000
const LEVELS = PEARL_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: PEARL_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(stringOfPearlsTemplate),
  showTitle: true,
  title: PEARL_DEFAULT_TITLE,
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
  return stringOfPearlsTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[PEARL_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[PEARL_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: PearlLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(pearlContentBox(ctx), config, tag, pearlInstruction(config, level))
  return pearlPanelInBody(header.body, header.objects.length > 0)
}

/** A board from a picture: `.` an empty square, `o` a white pearl, `x` a black pearl. */
function boardFrom(rows: string[]): PearlPuzzle {
  const cells: number[] = []
  for (const row of rows) for (const ch of row) cells.push(ch === 'o' ? PEARL_WHITE : ch === 'x' ? PEARL_BLACK : PEARL_NONE)
  return { size: rows.length, cells }
}

/** The links joining squares in turn, (row, col) pairs, back to the first. */
function loopThrough(n: number, squares: [number, number][]): number[] {
  const cells = squares.map(([r, c]) => r * n + c)
  return cells.map((a, k) => pearlLinkBetween(n, a, cells[(k + 1) % cells.length]!)).sort((a, b) => a - b)
}

/** The 4 × 4 board's rim, clockwise from the top left. */
const RIM: [number, number][] = [
  [0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0],
]

function builtFor(level: PearlLevel, seed = 1): PearlBuilt {
  return buildPearlBoard({ ...pearlLevelSpec(level), rng: pearlBoardRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/** The toy board the rules tests use: one necklace, the rim, found by the pearls' own rules. */
const TOY = { puzzle: boardFrom(['x.o.', '....', 'o...', '...x']), links: loopThrough(4, RIM) }

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(stringOfPearlsTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: PEARL_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(stringOfPearlsTemplate, { seeds: 12 })

describe('string of pearls registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === PEARL_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(PEARL_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(PEARL_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(PEARL_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(stringOfPearlsTemplate).level).toBe('classic')
    expect(parsePearlLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parsePearlLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(pearlInstruction(base, 'gentle')).toBe(`${PEARL_INSTRUCTION} ${PEARL_GENTLE_TIP}`)
    expect(pearlInstruction(base, 'classic')).toBe(PEARL_INSTRUCTION)
    expect(pearlInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square and pearl size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = pearlPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the board \d\.\d\d in across, pearls 0\.\d\d in wide\.$/)
      expect(pearlPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(pearlPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one necklace/)
  })
})

describe('string of pearls rules and solver', () => {
  it('reads a board picture the way it is drawn', () => {
    expect(TOY.puzzle.size).toBe(4)
    expect(pearlWellFormed(TOY.puzzle)).toBe(true)
    expect(TOY.puzzle.cells.filter(isPearl)).toEqual([PEARL_BLACK, PEARL_WHITE, PEARL_WHITE, PEARL_BLACK])
    expect(pearlWellFormed({ size: 4, cells: [...TOY.puzzle.cells.slice(0, 15), 3] })).toBe(false)
  })

  it('numbers the links across, then down, and walks a loop from its lowest square', () => {
    const g = pearlGeometry(4)
    expect(g.links).toBe(24)
    expect(pearlLinkBetween(4, 0, 1)).toBe(0)
    expect(pearlLinkBetween(4, 1, 0)).toBe(0)
    expect(pearlLinkBetween(4, 0, 4)).toBe(12)
    expect(pearlLinkBetween(4, 0, 5)).toBe(-1)
    expect(pearlLoopOrder(4, TOY.links)).toEqual([0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4])
    // Two separate loops are not one necklace.
    const two = [...loopThrough(4, [[0, 0], [0, 1], [1, 1], [1, 0]]), ...loopThrough(4, [[2, 2], [2, 3], [3, 3], [3, 2]])]
    expect(pearlLoopOrder(4, two)).toBeNull()
  })

  it('knows a necklace when it sees one, and every way one can be wrong', () => {
    const { puzzle, links } = TOY
    expect(isPearlSolution(puzzle, links)).toBe(true)
    // A link missing: no loop.
    expect(isPearlSolution(puzzle, links.slice(1))).toBe(false)
    // A pearl left off the loop.
    const inner = loopThrough(4, [[1, 1], [1, 2], [2, 2], [2, 1]])
    expect(isPearlSolution(puzzle, inner)).toBe(false)
    // A white pearl turned on: the loop dips through (1, 2) and turns at the white pearl on (0, 2).
    const dip: [number, number][] = [[0, 0], [0, 1], [0, 2], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0]]
    expect(isPearlSolution(puzzle, loopThrough(4, dip))).toBe(false)
    // A white pearl with straights on both sides.
    expect(isPearlSolution(boardFrom(['....', '....', '.o..', '....']), links)).toBe(false)
    expect(isPearlSolution(boardFrom(['....', '....', 'o...', '....']), links)).toBe(true)
    // A black pearl the loop runs straight through.
    expect(isPearlSolution(boardFrom(['.x..', '....', '....', '....']), links)).toBe(false)
    // A black pearl whose turn has only one square straight on one side.
    const notch: [number, number][] = [[0, 0], [0, 1], [1, 1], [1, 2], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0]]
    expect(isPearlSolution(boardFrom(['x...', '....', '....', '....']), loopThrough(4, notch))).toBe(false)
  })

  it('solves a proven board step by step, on exactly its necklace', () => {
    const result = solvePearl(TOY.puzzle, 'local')
    expect(result.solved).toBe(true)
    expect(pearlAnswerKey(result.links)).toBe(pearlAnswerKey(TOY.links))
    expect(countPearlSolutions(TOY.puzzle, 5)).toBe(1)
    const built = builtFor('gentle', 3)
    const probed = solvePearl(built.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(pearlAnswerKey(probed.links)).toBe(pearlAnswerKey(built.links))
  })

  it('refuses to guess: a board with several necklaces is left unfinished at every level', () => {
    // Two black pearls in opposite corners: each far corner can be cut or not.
    const loose = boardFrom(['x...', '....', '....', '...x'])
    expect(countPearlSolutions(loose, 10)).toBe(4)
    for (const rules of ['local', 'loop', 'probe'] as const) expect(solvePearl(loose, rules).solved).toBe(false)
  })

  it('needs "don’t close it early" at Classic, and "what if" at Challenging', () => {
    const classic = builtFor('classic', 2)
    expect(solvePearl(classic.puzzle, 'local').solved).toBe(false)
    const looped = solvePearl(classic.puzzle, 'loop')
    expect(looped.solved).toBe(true)
    expect(looped.tally.loop).toBeGreaterThan(0)
    const challenging = builtFor('challenging', 2)
    expect(solvePearl(challenging.puzzle, 'loop').solved).toBe(false)
    const probed = solvePearl(challenging.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(probed.tally.probe).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with plain search: every board the solver finishes has exactly one necklace', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, rules] of [[5, 'local'], [5, 'probe'], [6, 'local'], [6, 'loop'], [6, 'probe']] as const) {
      for (let k = 0; k < 12; k++) {
        const built = drawPearlCandidate({ size, cover: 0.55, rules, minPearls: 0, rng })
        if (!built) continue
        finished++
        expect(countPearlSolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(20)
  }, SLOW)

  it('never claims a board with several necklaces is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 400 && ambiguous < 25; k++) {
      // A loop and its pearls, then pearls taken away at random with no check.
      const rng = createRng(77 + k)
      const size = rng.int(4, 6)
      const links = drawPearlLoop(size, rng, 0.5)
      if (!links) continue
      const puzzle: PearlPuzzle = { size, cells: pearlSpots(size, links).map((v) => (isPearl(v) && rng.chance(0.6) ? PEARL_NONE : v)) }
      if (countPearlSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['local', 'loop', 'probe'] as const) expect(solvePearl(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(15)
  }, SLOW)

  it('grows necklaces that are one loop, cover the board and leave few squares bare', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const n of [6, 8, 10]) {
        const links = drawPearlLoop(n, createRng(seed), 0.6)
        expect(links, `${n} #${seed}`).not.toBeNull()
        const order = pearlLoopOrder(n, links!)!
        expect(order).not.toBeNull()
        expect(order.length).toBeGreaterThanOrEqual(Math.ceil(0.6 * n * n))
        // Every pearl the necklace allows is one it keeps.
        expect(isPearlSolution({ size: n, cells: pearlSpots(n, links!) }, links!)).toBe(true)
      }
    }
    // The outline of one corner square is the four squares round it.
    expect(pearlOutline(3, [1, 0, 0, 0])).toEqual(loopThrough(3, [[0, 0], [0, 1], [1, 1], [1, 0]]))
    // A 2 × 2 patch's outline: every square a corner or next to one, none bare.
    expect(pearlBare(4, Uint8Array.from([1, 1, 0, 1, 1, 0, 0, 0, 0]))).toEqual({ bare: 0, length: 8 })
    // A 1 × 3 strip: its four corners sit on one-square ends, back to back.
    expect(pearlBare(5, Uint8Array.from([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).bare).toBe(4)
    // A 1 × 4 strip: and the middle of each long side is a straight between straights.
    expect(pearlBare(6, Uint8Array.from({ length: 25 }, (_, k) => (k < 4 ? 1 : 0))).bare).toBe(6)
  })

  it('marks black pearls on turns between straights, and white pearls on straights beside a turn', () => {
    const spots = pearlSpots(4, TOY.links)
    // The rim: every corner black, every side square white.
    expect(spots).toEqual(boardFrom(['xoox', 'o..o', 'o..o', 'xoox']).cells)
  })
})

describe('string of pearls levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds boards of the level's size that its own steps finish`, () => {
      const spec = pearlLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 4
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(pearlWellFormed(built.puzzle)).toBe(true)
        expect(isPearlSolution(built.puzzle, built.links)).toBe(true)
        expect(pearlMeetsLevel(built.puzzle, built.links, spec)).toBe(true)
        expect(solvePearl(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solvePearl(built.puzzle, spec.beyond).solved).toBe(false)
        const { white, black } = pearlCounts(built.puzzle)
        expect(white + black).toBeGreaterThanOrEqual(spec.minPearls)
        expect(white).toBeGreaterThan(0)
        expect(black).toBeGreaterThan(0)
        expect(pearlLoopOrder(spec.size, built.links)!.length).toBeGreaterThanOrEqual(Math.ceil(spec.cover * spec.size * spec.size))
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first board: the pearls’ own rules finish it, and it has one necklace', () => {
    for (let seed = 0; seed < 4; seed++) {
      const built = builtFor('gentle', seed)
      expect(solvePearl(built.puzzle, 'local').solved).toBe(true)
      expect(countPearlSolutions(built.puzzle, 2)).toBe(1)
    }
  }, SLOW)

  it('knows a board however it is turned or mirrored', () => {
    const a = boardFrom(['x..', '.o.', '..o'])
    // Mirrored left to right.
    const mirrored = boardFrom(['..x', '.o.', 'o..'])
    // Turned a quarter clockwise: (r, c) → (c, 2 − r).
    const turned = boardFrom(['..x', '.o.', 'o..'])
    expect(pearlSignature(mirrored)).toBe(pearlSignature(a))
    expect(pearlSignature(turned)).toBe(pearlSignature(a))
    expect(pearlSignature(boardFrom(['o..', '.o.', '..o']))).not.toBe(pearlSignature(a))
  })
})

describe('string of pearls necklaces', () => {
  it('names every necklace once, in retirement words, with no brand, drink or money', () => {
    expect(PEARL_NECKLACES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(PEARL_NECKLACES.map((h) => h.id)).size).toBe(PEARL_NECKLACES.length)
    for (const h of PEARL_NECKLACES) {
      expect(h.id).toMatch(/^[a-z0-9-]+$/)
      expect(h.name).not.toMatch(/beer|wine|whisk|rum\b|cocktail|margarita|champagne|happy hour|drunk|pension|money|cash|dollar|old age|senior/i)
      expect(pearlSignText(h)).toBe(h.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const macaroni = PEARL_NECKLACES.find((h) => h.id === 'grandkids-macaroni-necklace')!
    expect(pearlSignText(macaroni, 2)).toBe('Grandkids’\nMacaroni Necklace')
    const golden = PEARL_NECKLACES.find((h) => h.id === 'golden-anniversary-pearls')!
    expect(pearlSignText(golden, 2).split('\n')).toHaveLength(2)
    expect(pearlSignText(golden, 2).replace('\n', ' ')).toBe(golden.name)
  })

  it('works through every necklace before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < PEARL_NECKLACES.length + 5; page++) {
      const book = parsePearlBook(labels)
      const pick = pickPearlNecklace({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.necklace)
      labels.push(pearlPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, PEARL_NECKLACES.length).map((l) => l.split('|')[0])).size).toBe(PEARL_NECKLACES.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickPearlNecklace({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = PEARL_NECKLACES.slice(0, PEARL_NECKLACES.length - 3).map((h) => h.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a necklace', () => {
    expect(parsePearlBook(['birthday-pearls|gentle|abc', 'nowhere|classic|x', 'moonlight-strand|odd|def', ''])).toEqual([
      { necklace: 'birthday-pearls', level: 'gentle', signature: 'abc' },
      { necklace: 'moonlight-strand', level: null, signature: 'def' },
    ])
  })
})

describe('string of pearls pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print board on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = pearlLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'pearl').length).toBeGreaterThanOrEqual(pearlLevelSpec(level).minPearls)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor', () => {
    const big = planPearlPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planPearlPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(pearlLevelSpec('challenging').minCell))
  })

  it('keeps every pearl, its shine and every bead inside its square at the smallest squares', () => {
    const plan = planPearlPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const puzzle = buildPearlPuzzle({ built, plan, necklace: PEARL_NECKLACES[0]!, level: 'challenging', label: 'x', tag, font: FONT })
    // Children sit relative to the group's centre.
    const dx = puzzle.left + puzzle.width! / 2
    const dy = puzzle.top + puzzle.height! / 2
    let checked = 0
    for (const name of ['pearl', 'pearl-shine', 'bead']) {
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
    const pearls = built.puzzle.cells.filter(isPearl).length
    expect(checked).toBe(pearls * 2 + pearlLoopOrder(10, built.links)!.length - pearls)
  })

  it('threads the cord through every square of the loop, rounding each turn inside its square', () => {
    const plan = planPearlPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const { line, stops } = pearlCord(plan, 4, TOY.links)
    expect(stops.map((s) => s.at)).toEqual(pearlLoopOrder(4, TOY.links))
    expect(stops.filter((s) => s.turn).map((s) => s.at)).toEqual([0, 3, 15, 12])
    const { grid, cell } = plan
    for (const [x, y] of line) {
      expect(x).toBeGreaterThanOrEqual(grid.left + cell * 0.5 - 0.01)
      expect(x).toBeLessThanOrEqual(grid.left + cell * 3.5 + 0.01)
      expect(y).toBeGreaterThanOrEqual(grid.top + cell * 0.5 - 0.01)
      expect(y).toBeLessThanOrEqual(grid.top + cell * 3.5 + 0.01)
    }
  })

  it('stacks the legend rather than shrinking the board on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 340, height: 1000 }
    const plan = planPearlPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const necklace = PEARL_NECKLACES.find((h) => h.id === 'grandkids-macaroni-necklace')!
    expect(runPearlKdpPreflight({ built, plan, level: 'gentle', necklace, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildPearlPuzzle({ built, plan, necklace, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkPearlDrawnPage({ puzzle, built, necklace })).toEqual([])
    const [whiteWords, blackWords] = partsOf(puzzle, 'legend-text')
    expect(blackWords!.top).toBeGreaterThan(whiteWords!.top)
    // The board takes the whole width; only the legend gives way.
    expect(plan.cell).toBe(Math.floor(340 / 6))
  })

  it('keeps the name board and the legend clear of the board', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planPearlPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(PEARL_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planPearlPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runPearlKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', necklace: PEARL_NECKLACES[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The name board crowds the grid.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the name board, the ruled squares and the pearls in a frame, and the necklace hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${PEARL_TEMPLATE_KEY}:${signature}`)
    const necklace = PEARL_NECKLACES.find((h) => h.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(pearlSignText(necklace))
    expect(partsOf(puzzle, 'sign')).toHaveLength(2)
    expect(partsOf(puzzle, 'rule')).toHaveLength(18)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    const pearls = partsOf(puzzle, 'pearl')
    expect(pearls.length).toBeGreaterThanOrEqual(pearlLevelSpec('classic').minPearls)
    expect(pearls.every((p) => p.visible !== false && p.stroke === STUDIO_INK)).toBe(true)
    expect(pearls.filter((p) => p.data?.color === 'white').every((p) => p.fill === STUDIO_PAPER)).toBe(true)
    expect(pearls.filter((p) => p.data?.color === 'black').every((p) => p.fill === STUDIO_INK)).toBe(true)
    expect(partsOf(puzzle, 'pearl-shine')).toHaveLength(pearls.length)
    const hidden = ['cord', 'bead'].flatMap((name) => partsOf(puzzle, name))
    expect(partsOf(puzzle, 'cord')).toHaveLength(1)
    expect(hidden.length).toBeGreaterThan(10)
    expect(hidden.every((o) => o.visible === false && o.studioRole === 'answer' && o.type === 'path')).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual([PEARL_WHITE_WORD, PEARL_BLACK_WORD])
    // The legend's pearls are on show; only the necklace waits for the answer page.
    expect(partsOf(puzzle, 'legend-pearl').every((o) => o.visible !== false)).toBe(true)
  })

  it('strings the necklace on the answer page in black and white, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const [cord] = partsOf(puzzle, 'cord')
    expect(cord!.visible).toBe(true)
    expect(cord!.stroke).toBe(STUDIO_INK)
    expect(cord!.fill).toBe('transparent')
    const beads = partsOf(puzzle, 'bead')
    expect(beads.every((b) => b.visible === true && b.fill === STUDIO_PAPER && b.stroke === STUDIO_INK)).toBe(true)
    // The cord on the key threads a finished necklace for the page's pearls.
    const n = 8
    const cells = new Array<number>(n * n).fill(PEARL_NONE)
    for (const p of partsOf(puzzle, 'pearl')) cells[Number(p.data?.row) * n + Number(p.data?.col)] = p.data?.color === 'white' ? PEARL_WHITE : PEARL_BLACK
    const links = String(cord!.data?.links).split(',').map(Number)
    expect(isPearlSolution({ size: n, cells }, links)).toBe(true)
    expect(beads.length + partsOf(puzzle, 'pearl').length).toBe(pearlLoopOrder(n, links)!.length)
    // The rules under the cord, the cord under the beads, and every pearl over the cord.
    const names = puzzle.objects!.map((o) => String(o.data?.[PEARL_PART_KEY]))
    expect(names.lastIndexOf('rule')).toBeLessThan(names.indexOf('cord'))
    expect(names.indexOf('cord')).toBeLessThan(names.indexOf('bead'))
    expect(names.lastIndexOf('bead')).toBeLessThan(names.indexOf('pearl'))
    expect(key.some((o) => o.text === PEARL_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === PEARL_INSTRUCTION)).toBe(true)
  })

  it('builds a book that works through every necklace before one returns, never printing a board twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at necklaces their last one did not use', () => {
    const recent = PEARL_NECKLACES.slice(0, 20).map((h) => h.id)
    rememberStudioContent(studioVarietyKey(PEARL_TEMPLATE_KEY, 'necklaces'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different board for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('string of pearls preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planPearlPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const necklace = PEARL_NECKLACES[0]!
  const run = (over: Partial<Parameters<typeof runPearlKdpPreflight>[0]>) =>
    runPearlKdpPreflight({ built, plan, level: 'classic', necklace, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven board', () => {
    expect(run({})).toBe('')
  })

  it('refuses a necklace that breaks a rule', () => {
    expect(run({ built: { ...built, links: built.links.slice(1) } })).toMatch(/breaks a rule|one closed loop/)
  })

  it('refuses a board with several necklaces', () => {
    // Every pearl but one of each colour taken away: the loop is free to wander.
    const keep = new Set([built.puzzle.cells.indexOf(PEARL_WHITE), built.puzzle.cells.indexOf(PEARL_BLACK)])
    const bare: PearlPuzzle = { size: 8, cells: built.puzzle.cells.map((v, i) => (keep.has(i) ? v : PEARL_NONE)) }
    const errors = run({ built: { puzzle: bare, links: built.links, signature: pearlSignature(bare) } })
    expect(errors).toMatch(/logic alone/)
    expect(errors).toMatch(/too few pearls/)
  })

  it('refuses a Classic board the pearls’ own rules finish', () => {
    let easy: PearlBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawPearlCandidate({ size: 8, cover: 0.6, rules: 'local', minPearls: 8, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  }, SLOW)

  it('refuses a board or a necklace the book already has', () => {
    const book = parsePearlBook([pearlPageLabel(necklace, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parsePearlBook([pearlPageLabel(PEARL_NECKLACES[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this board/)
  })

  it('refuses squares below the level’s floor and a board off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, signSize: 12 } })).toMatch(/below 14 pt/)
  })

  it('catches a drawn page whose pearls or necklace do not match', () => {
    const puzzle = buildPearlPuzzle({ built, plan, necklace, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkPearlDrawnPage({ puzzle, built, necklace })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkPearlDrawnPage({ puzzle, built: other, necklace }).join(' ')
    expect(errors).toMatch(/pearls/)
    expect(errors).toMatch(/cord|beads/)
    expect(checkPearlDrawnPage({ puzzle, built, necklace: PEARL_NECKLACES[5]! }).join(' ')).toMatch(/name the necklace/)
  })
})
