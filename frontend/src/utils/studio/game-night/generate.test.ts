import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK, STUDIO_SAFE_AREA_PADDING_X } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent, rememberStudioContent, studioVarietyKey } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { drawHeader } from '../studio-layout'
import { gameNightTemplate } from './generate'
import { GN_CONFIG_SCHEMA } from './config'
import {
  GN_DEFAULT_TITLE,
  GN_GENTLE_TIP,
  GN_LEVELS,
  GN_NIGHTS,
  GN_TEMPLATE_KEY,
  gnClueText,
  gnGridRng,
  gnHowTo,
  gnInstruction,
  gnLegendEntries,
  gnLevelSpec,
  gnPageLabel,
  gnSignText,
  parseGnBook,
  parseGnLevel,
  pickGnNight,
  type GnLevel,
} from './content'
import { GN_PART_KEY, buildGnPuzzle, gnWallRuns } from './draw'
import { GN_CLUE_AIR, checkGnDrawnPage, runGnKdpPreflight } from './kdp-preflight'
import {
  GN_CLUE_MIN,
  GN_DIGIT_MIN,
  GN_LEGEND_ROW_GAP,
  GN_SIGN_GAP_MIN,
  gnClueDigitAir,
  gnClueInk,
  gnClueRoom,
  gnContentBox,
  gnLegendRowHeight,
  gnPanelInBody,
  gnPrintNote,
  gnWidestClue,
  planGnPage,
} from './layout'
import { GN_MAX_PRODUCT, buildGnGrid, drawGnBoxes, drawGnCandidate, drawGnLatin, gnBoxesFit, gnGivenCount, gnMeetsLevel, gnSignature, gnSignsFor, type GnBuilt } from './puzzle'
import { GN_MAX_CAGE, countGnSolutions, gnCageHolds, gnSolutions, gnValuesText, gnWellFormed, isGnSolution, solveGn, type GnCage, type GnPuzzle } from './solver'

const FONT = 'PT Serif'
/** Tests that build many grids: generous room when the whole suite runs at once. */
const SLOW = 120_000
const LEVELS = GN_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: GN_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(gameNightTemplate),
  showTitle: true,
  title: GN_DEFAULT_TITLE,
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
  return gameNightTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[GN_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[GN_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: GnLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(gnContentBox(ctx), config, tag, gnInstruction(config, level))
  return gnPanelInBody(header.body, header.objects.length > 0)
}

/** A grid from its rows of box letters and each box's clue ("A:3-" …): a lone number is "B:4". */
function gridFrom(rows: string[], clues: Record<string, string>): GnPuzzle {
  const n = rows.length
  const cells = new Map<string, number[]>()
  rows.join('').split('').forEach((ch, i) => cells.set(ch, [...(cells.get(ch) ?? []), i]))
  const cages: GnCage[] = [...cells.entries()].map(([ch, list]) => {
    const m = /^(\d+)([-+*/]?)$/.exec(clues[ch]!)!
    return { cells: list, target: Number(m[1]), op: (m[2] || '=') as GnCage['op'] }
  })
  return { size: n, cages: cages.sort((a, b) => a.cells[0]! - b.cells[0]!) }
}

const valuesFrom = (rows: string[]) => rows.join('').split('').map(Number)

function builtFor(level: GnLevel, seed = 1): GnBuilt {
  return buildGnGrid({ ...gnLevelSpec(level), rng: gnGridRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(gameNightTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: GN_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(gameNightTemplate, { seeds: 12 })

describe('game-night registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === GN_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(GN_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retiree/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(GN_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(GN_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(gameNightTemplate).level).toBe('classic')
    expect(parseGnLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseGnLevel(level)).toBe(level)
  })

  it('names the level’s numbers and signs in the how-to, adds the tip at Gentle only, and drops it all when asked', () => {
    expect(gnHowTo('gentle')).toMatch(/1 to 5/)
    expect(gnHowTo('gentle')).not.toMatch(/÷/)
    expect(gnHowTo('classic')).toMatch(/1 to 6/)
    expect(gnHowTo('challenging')).toMatch(/1 to 7/)
    expect(gnInstruction(base, 'gentle')).toBe(`${gnHowTo('gentle')}\n${GN_GENTLE_TIP}`)
    expect(gnInstruction(base, 'classic')).toBe(gnHowTo('classic'))
    expect(gnInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square and clue sizes on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24 + STUDIO_SAFE_AREA_PADDING_X, bottom: 24, left: 36 + STUDIO_SAFE_AREA_PADDING_X } })
    for (const level of LEVELS) {
      const note = gnPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the grid \d\.\d\d in across, clues \d+(\.5)? pt\.$/)
      expect(gnPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(gnPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })

  it('prints true minus, times and divide signs, and a lone number bare', () => {
    expect(gnClueText({ op: '+', target: 12 })).toBe('12+')
    expect(gnClueText({ op: '-', target: 3 })).toBe('3−')
    expect(gnClueText({ op: '*', target: 30 })).toBe('30×')
    expect(gnClueText({ op: '/', target: 2 })).toBe('2÷')
    expect(gnClueText({ op: '=', target: 4 })).toBe('4')
  })

  it('works a legend box for every sign the level prints, each sum true', () => {
    expect(gnLegendEntries('gentle').map((e) => e.op)).toEqual(['+', '-'])
    expect(gnLegendEntries('classic').map((e) => e.op)).toEqual(['+', '-', '*', '/'])
    for (const e of gnLegendEntries('challenging')) {
      expect(gnCageHolds(e.op, e.target, e.values)).toBe(true)
      expect(e.words.replace(/ /g, ' ')).toBe(`${e.values[0]} ${gnClueText({ op: e.op, target: 0 }).slice(1)} ${e.values[1]} = ${e.target}`)
      expect(e.words).not.toMatch(/ /)
    }
  })
})

describe('game-night rules and solver', () => {
  // A 4 × 4 grid: a lone 1, sums, a difference, a product and a quotient.
  const rows = ['AABC', 'DEBC', 'DEFF', 'GGHH']
  const clues = { A: '5+', B: '4*', C: '1-', D: '3-', E: '2/', F: '6*', G: '7+', H: '3+' }
  const grid = gridFrom(rows, clues)
  const answer = valuesFrom(['2314', '1243', '4132', '3421'])

  it('knows the signs', () => {
    expect(gnCageHolds('+', 7, [3, 4])).toBe(true)
    expect(gnCageHolds('*', 24, [2, 3, 4])).toBe(true)
    expect(gnCageHolds('-', 2, [1, 3])).toBe(true)
    expect(gnCageHolds('-', 2, [3, 1])).toBe(true)
    expect(gnCageHolds('/', 3, [2, 6])).toBe(true)
    expect(gnCageHolds('/', 2, [3, 5])).toBe(false)
    expect(gnCageHolds('=', 4, [4])).toBe(true)
    expect(gnCageHolds('-', 2, [1, 3, 5])).toBe(false)
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    expect(gnWellFormed(grid)).toBe(true)
    expect(isGnSolution(grid, answer)).toBe(true)
    // Two numbers swapped in a row: the rows still hold 1 to 4, but a column and a box do not.
    expect(isGnSolution(grid, valuesFrom(['3214', '1243', '4132', '3421']))).toBe(false)
    // A box that misses its number.
    const off = gridFrom(rows, { ...clues, A: '6+' })
    expect(isGnSolution(off, answer)).toBe(false)
    expect(isGnSolution(grid, answer.slice(0, 15))).toBe(false)
  })

  it('refuses a badly formed grid', () => {
    // A box in two pieces.
    expect(gnWellFormed(gridFrom(['ABAC', 'DEBC', 'DEFF', 'GGHH'], { A: '5+', B: '6*', C: '1-', D: '3-', E: '5+', F: '3/', G: '3-', H: '5+' }))).toBe(false)
    // − on a box of three.
    expect(gnWellFormed(gridFrom(['AAAC', 'DEBC', 'DEFF', 'GGHH'], { A: '1-', B: '6', C: '1-', D: '3-', E: '5+', F: '3/', G: '3-', H: '5+' }))).toBe(false)
    // A lone number with a sign.
    expect(gnWellFormed(gridFrom(['AABC', 'DEFC', 'DEGG', 'HHII'], { A: '5+', B: '6+', C: '1-', D: '3-', E: '5+', F: '3', G: '3/', H: '3-', I: '5+' }))).toBe(false)
    // A box of five.
    expect(gnWellFormed(gridFrom(['AAAA', 'ABCC', 'DBEE', 'DFFG'], { A: '10+', B: '5+', C: '5+', D: '5+', E: '5+', F: '5+', G: '1' }))).toBe(false)
    // A square left out.
    expect(gnWellFormed({ size: 4, cages: grid.cages.slice(1) })).toBe(false)
  })

  it('solves a small grid step by step, on exactly its answer, and brute force agrees', () => {
    expect(countGnSolutions(grid, 3)).toBe(1)
    const solve = solveGn(grid, 'probe')
    expect(solve.solved).toBe(true)
    expect(gnValuesText(solve.values)).toBe(gnValuesText(answer))
  })

  it('takes the first steps: boxes, taken and only place', () => {
    // A 3− box in 1 to 4 can only hold 1 and 4; a lone 3 is given outright.
    const p = gridFrom(['ABCC', 'ADEE', 'FDGG', 'FHHI'], { A: '3+', B: '3', C: '3-', D: '2/', E: '7+', F: '7+', G: '5+', H: '2/', I: '1' })
    expect(isGnSolution(p, answer)).toBe(true)
    const s = solveGn(p, 'basic')
    expect(s.values[1]).toBe(3)
    expect(s.values[15]).toBe(1)
    expect(s.masks[2]! & ~((1 << 1) | (1 << 4))).toBe(0)
  })

  it('refuses to guess: a grid with several answers is left unfinished at every level', () => {
    // Every box a plain sum of a whole row: any Latin square fits.
    const loose = gridFrom(['AAAA', 'BBBB', 'CCCC', 'DDDD'], { A: '10+', B: '10+', C: '10+', D: '10+' })
    expect(countGnSolutions(loose, 5)).toBeGreaterThan(1)
    for (const rules of ['basic', 'lines', 'probe'] as const) expect(solveGn(loose, rules).solved).toBe(false)
  })

  it('finds a grid with no answer broken', () => {
    // Two lone 1s in the top row.
    const none = gridFrom(['ABCC', 'DDEE', 'FFGG', 'HHII'], { A: '1', B: '1', C: '7+', D: '3+', E: '7+', F: '3+', G: '7+', H: '3+', I: '7+' })
    expect(countGnSolutions(none, 2)).toBe(0)
    for (const rules of ['basic', 'lines', 'probe'] as const) expect(solveGn(none, rules).solved).toBe(false)
  })

  it('agrees with brute force: every grid the solver finishes has exactly one answer', () => {
    let finished = 0
    for (const [size, rules, ops] of [
      [4, 'basic', ['+', '-']],
      [5, 'basic', ['+', '-']],
      [5, 'lines', ['+', '-', '*', '/']],
      [6, 'basic', ['+', '-', '*', '/']],
      [6, 'lines', ['+', '-', '*', '/']],
      [6, 'probe', ['+', '-', '*', '/']],
    ] as const) {
      const rng = createRng(2024 + size)
      for (let k = 0; k < 20; k++) {
        const built = drawGnCandidate({ size, rules, ops, mix: [0, 5, 3.5, 1.5], maxGivens: 2, rng })
        if (!built) continue
        finished++
        expect(countGnSolutions(built.puzzle, 2), `${size} × ${size} ${rules} #${k}`).toBe(1)
        expect(gnValuesText(gnSolutions(built.puzzle, 1)[0]!)).toBe(gnValuesText(built.values))
      }
    }
    expect(finished).toBeGreaterThan(40)
  }, SLOW)

  it('never claims a grid with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 300 && ambiguous < 30; k++) {
      // A proper grid with one box's sign swapped for a plain sum: many then have several answers.
      const rng = createRng(77 + k)
      const size = rng.pick([4, 5])
      const values = drawGnLatin(size, rng)!
      const boxes = drawGnBoxes(size, values, [0, 3, 4, 3], 1, rng)
      if (!boxes) continue
      const cages = boxes.map((cells) => {
        const sum = cells.reduce((a, i) => a + values[i]!, 0)
        return cells.length === 1 ? { cells, op: '=' as const, target: values[cells[0]!]! } : { cells, op: '+' as const, target: sum }
      })
      const puzzle = { size, cages }
      if (countGnSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'lines', 'probe'] as const) expect(solveGn(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(15)
  }, SLOW)
})

describe('game-night building', () => {
  it('draws Latin squares, and boxes that cover every square once, joined, never holding a number twice', () => {
    const rng = createRng(5)
    for (let k = 0; k < 20; k++) {
      const n = rng.pick([5, 6, 7])
      const values = drawGnLatin(n, rng)!
      for (let a = 0; a < n; a++) {
        expect(new Set(values.slice(a * n, a * n + n)).size).toBe(n)
        expect(new Set(Array.from({ length: n }, (_, r) => values[r * n + a])).size).toBe(n)
      }
      const boxes = drawGnBoxes(n, values, [0, 5, 3.5, 1.5], 2, rng)
      if (!boxes) continue
      expect(boxes.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: n * n }, (_, i) => i))
      for (const box of boxes) {
        expect(box.length).toBeLessThanOrEqual(GN_MAX_CAGE)
        expect(new Set(box.map((i) => values[i])).size).toBe(box.length)
      }
      expect(boxes.filter((b) => b.length === 1).length).toBeLessThanOrEqual(2)
    }
  })

  it('offers only the signs the level prints, with products that fit a corner', () => {
    expect(gnSignsFor([4], ['+']).map((s) => s.op)).toEqual(['='])
    expect(gnSignsFor([2, 6], ['+', '-', '*', '/'])).toEqual([
      { op: '+', target: 8 },
      { op: '*', target: 12 },
      { op: '-', target: 4 },
      { op: '/', target: 3 },
    ])
    expect(gnSignsFor([2, 5], ['+', '-', '*', '/']).map((s) => s.op)).not.toContain('/')
    expect(gnSignsFor([1, 2, 3], ['+', '-']).map((s) => s.op)).toEqual(['+'])
    expect(gnSignsFor([9, 8, 7, 6], ['+', '*']).map((s) => s.op)).toEqual(['+'])
  })
})

describe('game-night levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds grids of the level's size that its own steps finish`, () => {
      const spec = gnLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 5
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(gnWellFormed(built.puzzle)).toBe(true)
        expect(isGnSolution(built.puzzle, built.values)).toBe(true)
        expect(gnBoxesFit(built.puzzle, built.values, spec)).toBe(true)
        expect(gnGivenCount(built.puzzle)).toBeLessThanOrEqual(spec.maxGivens)
        expect(countGnSolutions(built.puzzle, 2)).toBe(1)
        expect(gnMeetsLevel(built.puzzle, built.values, spec)).toBe(true)
        expect(solveGn(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveGn(built.puzzle, spec.beyond).solved).toBe(false)
        for (const cage of built.puzzle.cages) {
          if (cage.op !== '=') expect(spec.ops).toContain(cage.op)
          if (cage.op === '*') expect(cage.target).toBeLessThanOrEqual(GN_MAX_PRODUCT)
        }
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first grid: sums and differences only, the first steps finish it', () => {
    for (let seed = 0; seed < 5; seed++) {
      const built = builtFor('gentle', seed)
      expect(solveGn(built.puzzle, 'basic').solved).toBe(true)
      expect(built.puzzle.cages.every((c) => c.op === '+' || c.op === '-' || c.op === '=')).toBe(true)
    }
  })

  it('makes Classic need "must be here" and Challenging need "what if"', () => {
    const classic = builtFor('classic', 7)
    expect(solveGn(classic.puzzle, 'basic').solved).toBe(false)
    expect(solveGn(classic.puzzle, 'lines').tally.lines).toBeGreaterThanOrEqual(2)
    const hard = builtFor('challenging', 7)
    expect(solveGn(hard.puzzle, 'lines').solved).toBe(false)
    expect(solveGn(hard.puzzle, 'probe').tally.probe).toBeGreaterThanOrEqual(2)
  }, SLOW)

  it('builds a grid quickly enough for a whole book', () => {
    for (const level of LEVELS) {
      const start = performance.now()
      for (let seed = 0; seed < 6; seed++) builtFor(level, 100 + seed)
      expect((performance.now() - start) / 6, level).toBeLessThan(1500)
    }
  }, SLOW)

  it('knows a grid however it is turned or mirrored, and not once a clue changes', () => {
    const built = builtFor('classic', 2)
    const { puzzle } = built
    const n = puzzle.size
    const mapCells = (f: (i: number) => number): GnPuzzle => ({ size: n, cages: puzzle.cages.map((c) => ({ ...c, cells: c.cells.map(f).sort((a, b) => a - b) })) })
    const mirrored = mapCells((i) => Math.floor(i / n) * n + (n - 1 - (i % n)))
    const turned = mapCells((i) => (i % n) * n + (n - 1 - Math.floor(i / n)))
    expect(gnSignature(mirrored)).toBe(built.signature)
    expect(gnSignature(turned)).toBe(built.signature)
    const changed: GnPuzzle = { size: n, cages: puzzle.cages.map((c, k) => (k === 0 ? { ...c, target: c.target + 1 } : c)) }
    expect(gnSignature(changed)).not.toBe(built.signature)
  })
})

describe('game-night nights', () => {
  it('names every night once, in retirement words, with no brand, betting, drink or age joke', () => {
    expect(GN_NIGHTS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(GN_NIGHTS.map((s) => s.id)).size).toBe(GN_NIGHTS.length)
    for (const s of GN_NIGHTS) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/)
      expect(s.name).not.toMatch(/beer|wine|whisk|rum\b|cocktail|happy hour|poker|casino|bet\b|gambl|money|cash|dollar|old age|senior|scrabble|monopoly|yahtzee|rummikub|pictionary|uno\b/i)
      expect(gnSignText(s)).toBe(s.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const night = GN_NIGHTS.find((s) => s.id === 'pinochle-with-the-neighbors')!
    expect(gnSignText(night, 2)).toBe('Pinochle with\nthe Neighbors')
    expect(gnSignText(night, 2).replace('\n', ' ')).toBe(night.name)
  })

  it('works through every night before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < GN_NIGHTS.length + 5; page++) {
      const book = parseGnBook(labels)
      const pick = pickGnNight({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.night)
      labels.push(gnPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, GN_NIGHTS.length).map((l) => l.split('|')[0])).size).toBe(GN_NIGHTS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickGnNight({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = GN_NIGHTS.slice(0, GN_NIGHTS.length - 3).map((s) => s.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a night', () => {
    expect(parseGnBook(['mahjong-mornings|gentle|abc', 'nowhere|classic|x', 'rummy-on-the-porch|odd|def', ''])).toEqual([
      { night: 'mahjong-mornings', level: 'gentle', signature: 'abc' },
      { night: 'rummy-on-the-porch', level: null, signature: 'def' },
    ])
  })
})

describe('game-night pages', () => {
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
        const size = gnLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'answer')).toHaveLength(size * size)
        expect(partsOf(puzzle!, 'clue')).toHaveLength(Number(puzzle!.data?.boxes))
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor, with clues that fit their corners', () => {
    const big = planGnPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planGnPage(panelFor(kdpCtx(w, h), level), level, FONT)!
        expect(plan.cell, `${level} ${w}x${h}`).toBeGreaterThanOrEqual(Math.ceil(gnLevelSpec(level).minCell))
        expect(plan.clueSize).toBeGreaterThanOrEqual(GN_CLUE_MIN)
        expect(plan.digitSize).toBeGreaterThanOrEqual(GN_DIGIT_MIN)
        // The widest clue the level can print fits inside its square.
        expect(gnClueInk(gnWidestClue(level), plan.clueSize)).toBeLessThanOrEqual(gnClueRoom(plan.cell) + 0.5)
        expect(gnClueDigitAir(plan.cell, plan.clueSize, plan.digitSize)).toBeGreaterThanOrEqual(GN_CLUE_AIR)
      }
    }
  })

  it('keeps the legend clear of the grid, on one row where it fits and two where it does not', () => {
    for (const [w, h] of trims) expect(planGnPage(panelFor(kdpCtx(w, h), 'gentle'), 'gentle', FONT)!.legendRows, `gentle ${w}x${h}`).toBe(1)
    expect(planGnPage(panelFor(kdpCtx(5.5, 8.5), 'classic'), 'classic', FONT)!.legendRows).toBe(2)
    const panel = panelFor(kdpCtx(8.5, 11), 'classic')
    const flat = planGnPage(panel, 'classic', FONT)!
    const plan = { ...flat, legendRows: 2 as const, legendHeight: gnLegendRowHeight() * 2 + GN_LEGEND_ROW_GAP }
    const built = builtFor('classic')
    const night = GN_NIGHTS[0]!
    const puzzle = buildGnPuzzle({ built, plan, night, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkGnDrawnPage({ puzzle, built, night, level: 'classic' })).toEqual([])
    const words = partsOf(puzzle, 'legend-text')
    expect(words).toHaveLength(4)
    expect(words[2]!.top).toBeGreaterThan(words[0]!.top)
    expect(words[2]!.left).toBe(words[0]!.left)
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const p = planGnPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(p.grid.top - (p.signBand.top + p.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(GN_SIGN_GAP_MIN)
        expect(p.legendTop - (p.grid.top + p.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, the walls round every box, a clue in each box’s corner, and the answer hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${GN_TEMPLATE_KEY}:${signature}`)
    const night = GN_NIGHTS.find((s) => s.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(gnSignText(night))
    expect(partsOf(puzzle, 'rule')).toHaveLength(14)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    expect(partsOf(puzzle, 'wall').length).toBeGreaterThan(8)
    expect(partsOf(puzzle, 'wall').every((o) => o.fill === STUDIO_INK)).toBe(true)
    const clues = partsOf(puzzle, 'clue')
    expect(clues.every((t) => t.visible !== false && t.studioRole === 'prompt' && t.fontWeight === 700)).toBe(true)
    const answers = partsOf(puzzle, 'answer')
    expect(answers).toHaveLength(36)
    expect(answers.every((a) => a.visible === false && a.studioRole === 'answer')).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual(gnLegendEntries('classic').map((e) => e.words))
  })

  it('writes every number in on the answer page, without the how-to line, and the grid read back keeps every rule', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const puzzleGroup = puzzleOf(out[0]!.objects)!
    const hidden = partsOf(puzzleGroup, 'answer').length
    expect(out.flatMap((p) => harvestAnswers(p.objects)).length).toBe(hidden)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const answers = partsOf(puzzle, 'answer')
    expect(answers).toHaveLength(hidden)
    expect(answers.every((a) => a.visible === true)).toBe(true)
    expect(partsOf(puzzle, 'clue').every((t) => t.visible !== false)).toBe(true)
    const n = 6
    const values = new Array<number>(n * n).fill(0)
    for (const o of answers) values[Number(o.data?.row) * n + Number(o.data?.col)] = Number(o.text)
    for (let a = 0; a < n; a++) {
      expect(new Set(values.slice(a * n, a * n + n)).size).toBe(n)
      expect(new Set(Array.from({ length: n }, (_, r) => values[r * n + a])).size).toBe(n)
    }
    const howTo = gnHowTo('classic')
    expect(key.some((o) => o.text === howTo)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === howTo)).toBe(true)
  })

  it('builds a book that works through every night before one returns, never printing a grid twice', () => {
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

  it('opens a seller’s next book at nights their last one did not use', () => {
    const recent = GN_NIGHTS.slice(0, 20).map((s) => s.id)
    rememberStudioContent(studioVarietyKey(GN_TEMPLATE_KEY, 'nights'), recent)
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

describe('game-night preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planGnPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const night = GN_NIGHTS[0]!
  const run = (over: Partial<Parameters<typeof runGnKdpPreflight>[0]>) => runGnKdpPreflight({ built, plan, level: 'classic', night, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven grid', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    const values = [...built.values]
    ;[values[0], values[1]] = [values[1]!, values[0]!]
    expect(run({ built: { ...built, values } })).toMatch(/breaks a rule/)
  })

  it('refuses a grid with several answers', () => {
    // Every box a plain sum: the answer still holds, but on most grids is no longer the only one.
    let loose: GnBuilt | null = null
    for (let seed = 3; !loose; seed++) {
      const b = builtFor('classic', seed)
      const puzzle: GnPuzzle = {
        size: b.puzzle.size,
        cages: b.puzzle.cages.map((c) => (c.cells.length > 1 ? { ...c, op: '+' as const, target: c.cells.reduce((a, i) => a + b.values[i]!, 0) } : c)),
      }
      if (countGnSolutions(puzzle, 2) === 2) loose = { ...b, puzzle, signature: gnSignature(puzzle) }
    }
    expect(isGnSolution(loose.puzzle, loose.values)).toBe(true)
    expect(run({ built: loose })).toMatch(/logic alone/)
  }, SLOW)

  it('refuses a Classic grid that the first steps alone finish', () => {
    let easy: GnBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawGnCandidate({ ...gnLevelSpec('classic'), rules: 'basic', beyond: null, minHard: 0, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a sign the level does not print', () => {
    const gentle = builtFor('gentle', 2)
    const gentlePlan = planGnPage(panelFor(ctx, 'gentle'), 'gentle', FONT)!
    const i = gentle.puzzle.cages.findIndex((c) => c.cells.length === 2)
    const cage = gentle.puzzle.cages[i]!
    const product = cage.cells.reduce((a, j) => a * gentle.values[j]!, 1)
    const puzzle: GnPuzzle = { size: 5, cages: gentle.puzzle.cages.map((c, k) => (k === i ? { ...c, op: '*' as const, target: product } : c)) }
    const errors = runGnKdpPreflight({ built: { ...gentle, puzzle, signature: gnSignature(puzzle) }, plan: gentlePlan, level: 'gentle', night, panel: panelFor(ctx, 'gentle'), font: FONT }).errors.join(' ')
    expect(errors).toMatch(/not one this level prints/)
  })

  it('refuses a grid or a night the book already has', () => {
    const book = parseGnBook([gnPageLabel(night, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseGnBook([gnPageLabel(GN_NIGHTS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this grid/)
  })

  it('refuses squares below the level’s floor, small clues, a clue that crowds its number, and a grid off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    expect(run({ plan: { ...plan, clueSize: 10 } })).toMatch(/below 12 pt/)
    expect(run({ plan: { ...plan, digitSize: plan.cell } })).toMatch(/crowds the number/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    expect(run({ plan: crowded })).toMatch(/sign crowds the grid/)
  })

  it('catches a drawn page whose clues, answers, walls or sign do not match', () => {
    const puzzle = buildGnPuzzle({ built, plan, night, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkGnDrawnPage({ puzzle, built, night, level: 'classic' })).toEqual([])
    const other = builtFor('classic', 4)
    expect(checkGnDrawnPage({ puzzle, built: other, night, level: 'classic' }).join(' ')).toMatch(/answer is missing or wrong|clue is missing or wrong/)
    expect(checkGnDrawnPage({ puzzle, built, night: GN_NIGHTS[5]!, level: 'classic' }).join(' ')).toMatch(/sign does not name/)
    expect(checkGnDrawnPage({ puzzle, built, night, level: 'gentle' }).join(' ')).toMatch(/legend does not show every sign/)
    const walls = gnWallRuns(built.puzzle).length
    const fewer: StudioFabricObject = { ...puzzle, objects: (puzzle.objects ?? []).filter((o, k, all) => !(o.data?.[GN_PART_KEY] === 'wall' && all.findIndex((x) => x.data?.[GN_PART_KEY] === 'wall') === k)) }
    expect(walls).toBeGreaterThan(0)
    expect(checkGnDrawnPage({ puzzle: fewer, built, night, level: 'classic' }).join(' ')).toMatch(/walls between boxes/)
  })
})
