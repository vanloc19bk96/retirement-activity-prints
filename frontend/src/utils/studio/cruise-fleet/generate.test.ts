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
import { cruiseFleetTemplate } from './generate'
import { CF_CONFIG_SCHEMA } from './config'
import {
  CF_DEFAULT_TITLE,
  CF_GENTLE_TIP,
  CF_HARBORS,
  CF_INSTRUCTION,
  CF_LEVELS,
  CF_TEMPLATE_KEY,
  cfFleetEntries,
  cfHarborRng,
  cfInstruction,
  cfLevelSpec,
  cfPageLabel,
  cfShipWord,
  cfSignText,
  parseCfBook,
  parseCfLevel,
  pickCfHarbor,
  type CfLevel,
} from './content'
import { CF_HULL, CF_PART_KEY, buildCfPuzzle } from './draw'
import { checkCfDrawnPage, runCfKdpPreflight } from './kdp-preflight'
import { CF_COUNT_MIN, CF_SIGN_GAP_MIN, cfContentBox, cfPanelInBody, cfPrintNote, planCfLegend, planCfPage } from './layout'
import { buildCfHarbor, cfMeetsLevel, cfPuzzleOf, cfSignature, drawCfCandidate, drawCfFleet, squaresOf, type CfBuilt } from './puzzle'
import {
  cfCounts,
  cfGridOf,
  cfPieceOf,
  cfShipsOf,
  cfSolutions,
  cfSquareList,
  countCfSolutions,
  isCfFleet,
  isCfSolution,
  solveCf,
  type CfPuzzle,
  type CfShip,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many harbors: generous room when the whole suite runs at once. */
const SLOW = 30_000
const LEVELS = CF_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: CF_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(cruiseFleetTemplate),
  showTitle: true,
  title: CF_DEFAULT_TITLE,
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
  return cruiseFleetTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[CF_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[CF_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: CfLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(cfContentBox(ctx), config, tag, cfInstruction(config, level))
  return cfPanelInBody(header.body, header.objects.length > 0)
}

/** A fleet from a picture: `#` is ship, anything else water. */
function shipsFrom(rows: string[]): CfShip[] {
  const n = rows.length
  const grid = rows.flatMap((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)))
  return cfShipsOf(grid, n)!
}

function builtFor(level: CfLevel, seed = 1): CfBuilt {
  return buildCfHarbor({ ...cfLevelSpec(level), rng: cfHarborRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(cruiseFleetTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: CF_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(cruiseFleetTemplate, { seeds: 12 })

describe('cruise-fleet registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === CF_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(CF_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(CF_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(CF_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(cruiseFleetTemplate).level).toBe('classic')
    expect(parseCfLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseCfLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(cfInstruction(base, 'gentle')).toBe(`${CF_INSTRUCTION} ${CF_GENTLE_TIP}`)
    expect(cfInstruction(base, 'classic')).toBe(CF_INSTRUCTION)
    expect(cfInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = cfPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, numbers \d+(\.5)? pt\.$/)
      expect(cfPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(cfPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })

  it('names the fleet the way a cruise brochure would', () => {
    expect(cfShipWord(4, 1)).toBe('1 cruise ship')
    expect(cfShipWord(3, 2)).toBe('2 ferries')
    expect(cfShipWord(2, 3)).toBe('3 sailboats')
    expect(cfShipWord(1, 4)).toBe('4 rowboats')
    expect(cfFleetEntries([1, 4, 3, 1, 3])).toEqual([
      { length: 4, count: 1 },
      { length: 3, count: 2 },
      { length: 1, count: 2 },
    ])
  })
})

describe('cruise-fleet rules and solver', () => {
  //  # # # . . .      a 6 × 6 harbor: a ferry across the top, a sailboat down
  //  . . . . . #      the right, a sailboat across row 3 and three rowboats.
  //  . . . . . #
  //  . # # . . .
  //  . . . . . .
  //  # . . # . #
  const fleet = [3, 2, 2, 1, 1, 1]
  const ships = shipsFrom(['###...', '.....#', '.....#', '.##...', '......', '#..#.#'])

  it('reads a harbor picture into ships, and every piece of them', () => {
    expect(ships.map((s) => [s.at, s.length, s.across])).toEqual([
      [0, 3, true],
      [11, 2, false],
      [19, 2, true],
      [30, 1, true],
      [33, 1, true],
      [35, 1, true],
    ])
    const grid = cfGridOf(ships, 6)
    expect([0, 1, 2].map((i) => cfPieceOf(grid, 6, i))).toEqual(['left', 'middle', 'right'])
    expect([11, 17].map((i) => cfPieceOf(grid, 6, i))).toEqual(['top', 'bottom'])
    expect(cfPieceOf(grid, 6, 30)).toBe('single')
    expect(cfPieceOf(grid, 6, 3)).toBe('water')
    expect(cfCounts(ships, 6)).toEqual({ rows: [3, 1, 1, 2, 0, 3], cols: [2, 2, 2, 1, 0, 3] })
    // A ship that bends part-way is no ship.
    const bent = ['##....', '.#....', '......', '......', '......', '......'].flatMap((row) => [...row].map((ch) => (ch === '#' ? 1 : 0)))
    expect(cfShipsOf(bent, 6)).toBeNull()
  })

  it('knows a fleet when it sees one, and every way one can be wrong', () => {
    expect(isCfFleet(6, fleet, ships)).toBe(true)
    // Touching corner to corner.
    expect(isCfFleet(6, [3, 1], [ships[0]!, { at: 9, length: 1, across: true }])).toBe(false)
    // The wrong ships.
    expect(isCfFleet(6, [3, 3, 2, 1, 1, 1], ships)).toBe(false)
    // Off the edge.
    expect(isCfFleet(6, [3], [{ at: 4, length: 3, across: true }])).toBe(false)
    const puzzle = cfPuzzleOf(6, fleet, ships, [1, 3])
    expect(isCfSolution(puzzle, ships)).toBe(true)
    expect(isCfSolution({ ...puzzle, rows: [2, 2, 1, 2, 0, 3] }, ships)).toBe(false)
    expect(isCfSolution({ ...puzzle, givens: [{ at: 1, piece: 'left' }] }, ships)).toBe(false)
  })

  it('works a harbor to its answer from the numbers and a few shown squares', () => {
    const puzzle = cfPuzzleOf(6, fleet, ships, [1, 17, 33])
    const solve = solveCf(puzzle, 'fleet')
    expect(solve.solved).toBe(true)
    expect(squaresOf(solve.state)).toBe(cfSquareList(ships, 6))
    expect(countCfSolutions(puzzle, 3)).toBe(1)
  })

  it('refuses to guess: a harbor with several answers is left unfinished at every level', () => {
    //  # . . ?     two rowboats in opposite corners of a 4 × 4 fit
    //  . . . .     the numbers either way round: two answers.
    //  . . . .
    //  ? . . #
    const puzzle: CfPuzzle = { size: 4, fleet: [1, 1], rows: [1, 0, 0, 1], cols: [1, 0, 0, 1], givens: [] }
    expect(countCfSolutions(puzzle, 3)).toBe(2)
    for (const rules of ['basic', 'fleet'] as const) expect(solveCf(puzzle, rules).solved).toBe(false)
  })

  it('needs "where can it go" where marking and counting stop', () => {
    let found = 0
    for (let k = 0; k < 40 && found < 3; k++) {
      const built = drawCfCandidate({ ...cfLevelSpec('classic'), rng: createRng(900 + k) })
      if (!built) continue
      found++
      expect(solveCf(built.puzzle, 'basic').solved).toBe(false)
      expect(solveCf(built.puzzle, 'fleet').tally.fleet).toBeGreaterThanOrEqual(2)
    }
    expect(found).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with brute force: every harbor the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const spec of CF_LEVELS) {
      for (let k = 0; k < 12; k++) {
        const built = drawCfCandidate({ ...spec, rng })
        if (!built) continue
        finished++
        const answers = cfSolutions(built.puzzle, 2)
        expect(answers, `${spec.value} #${k}`).toHaveLength(1)
        expect(cfSquareList(answers[0]!, spec.size)).toBe(cfSquareList(built.ships, spec.size))
      }
    }
    expect(finished).toBeGreaterThan(15)
  }, SLOW)

  it('never claims a harbor with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 300 && ambiguous < 30; k++) {
      // A random fleet and a random handful of shown squares, never trimmed to one answer.
      const rng = createRng(77 + k)
      const spec = CF_LEVELS[k % 2]!
      const ships = drawCfFleet(spec.size, spec.fleet, rng)
      if (!ships) continue
      const shown = rng.sample(Array.from({ length: spec.size * spec.size }, (_, i) => i), rng.int(0, 2))
      const puzzle = cfPuzzleOf(spec.size, spec.fleet, ships, shown)
      if (countCfSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'fleet'] as const) expect(solveCf(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(15)
  }, SLOW)

  it('drops the fleet in with no two ships touching', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const spec of CF_LEVELS) {
        const drawn = drawCfFleet(spec.size, spec.fleet, createRng(seed))
        expect(drawn).not.toBeNull()
        expect(isCfFleet(spec.size, spec.fleet, drawn!)).toBe(true)
      }
    }
  })
})

describe('cruise-fleet levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds harbors of the level's size that its own steps finish`, () => {
      const spec = cfLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 4
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(built.puzzle.fleet).toEqual(spec.fleet)
        expect(isCfSolution(built.puzzle, built.ships)).toBe(true)
        expect(countCfSolutions(built.puzzle, 2)).toBe(1)
        expect(cfMeetsLevel(built.puzzle, built.ships, spec)).toBe(true)
        expect(built.puzzle.givens.length).toBeGreaterThanOrEqual(spec.minGivens)
        const solve = solveCf(built.puzzle, spec.rules)
        expect(solve.solved).toBe(true)
        expect(solve.tally.fleet).toBeGreaterThanOrEqual(spec.minAdvanced)
        if (spec.beyond) expect(solveCf(built.puzzle, spec.beyond).solved).toBe(false)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first harbor: marking and counting finish it', () => {
    for (let seed = 0; seed < 5; seed++) expect(solveCf(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  }, SLOW)

  it('knows a fleet however the harbor is turned or mirrored', () => {
    const a = shipsFrom(['###...', '.....#', '.....#', '.##...', '......', '#..#.#'])
    const mirrored = shipsFrom(['...###', '#.....', '#.....', '...##.', '......', '#.#..#'])
    const turned = shipsFrom(['#....#', '..#..#', '..#..#', '#.....', '......', '#..##.'])
    expect(cfSignature(6, mirrored)).toBe(cfSignature(6, a))
    expect(cfSignature(6, turned)).toBe(cfSignature(6, a))
    expect(cfSignature(6, shipsFrom(['###...', '.....#', '.....#', '.##...', '......', '#.#..#']))).not.toBe(cfSignature(6, a))
  })
})

describe('cruise-fleet harbors', () => {
  it('names every harbor once, in retirement words, with no brand, drink, money or battle', () => {
    expect(CF_HARBORS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(CF_HARBORS.map((h) => h.id)).size).toBe(CF_HARBORS.length)
    for (const h of CF_HARBORS) {
      expect(h.id).toMatch(/^[a-z0-9-]+$/)
      expect(h.name).not.toMatch(/(beer|wine|whisk(e?y)?|rum|cocktail|margarita|happy hour|pension|money|cash|dollar|old age|senior|battle|war|sink|torpedo|navy)/i)
      expect(cfSignText(h)).toBe(h.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const voyage = CF_HARBORS.find((h) => h.id === 'northern-lights-voyage')!
    expect(cfSignText(voyage, 2)).toBe('Northern\nLights Voyage')
    expect(cfSignText(voyage, 2).replace('\n', ' ')).toBe(voyage.name)
  })

  it('works through every harbor before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < CF_HARBORS.length + 5; page++) {
      const book = parseCfBook(labels)
      const pick = pickCfHarbor({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.harbor)
      labels.push(cfPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, CF_HARBORS.length).map((l) => l.split('|')[0])).size).toBe(CF_HARBORS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickCfHarbor({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = CF_HARBORS.slice(0, CF_HARBORS.length - 3).map((h) => h.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a harbor', () => {
    expect(parseCfBook(['anchor-bay|gentle|abc', 'nowhere|classic|x', 'dolphin-cove|odd|def', ''])).toEqual([
      { harbor: 'anchor-bay', level: 'gentle', signature: 'abc' },
      { harbor: 'dolphin-cove', level: null, signature: 'def' },
    ])
  })
})

describe('cruise-fleet pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print harbor on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const spec = cfLevelSpec(level)
        expect(puzzle!.data?.size).toBe(`${spec.size}x${spec.size}`)
        expect(partsOf(puzzle!, 'ship')).toHaveLength(spec.fleet.length)
        expect(partsOf(puzzle!, 'count')).toHaveLength(spec.size * 2)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor, numbers never below 16 pt', () => {
    const big = planCfPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planCfPage(panelFor(kdpCtx(w, h), level), level, FONT)!
        expect(plan.cell, `${level} ${w}x${h}`).toBeGreaterThanOrEqual(Math.ceil(cfLevelSpec(level).minCell))
        expect(plan.countSize).toBeGreaterThanOrEqual(CF_COUNT_MIN)
      }
    }
  })

  it('names the ships where the page has room, and counts them where it is short', () => {
    expect(planCfPage(panelFor(kdpCtx(8.5, 11), 'challenging'), 'challenging', FONT)!.legend.style).toBe('named')
    const narrow = planCfLegend(cfLevelSpec('challenging').fleet, 260, FONT, 'named')!
    expect(narrow.rows.length).toBeGreaterThan(2)
    // Rows as even as they can be: never one long row over a lone entry when a fairer cut fits.
    const wide = planCfLegend(cfLevelSpec('gentle').fleet, 440, FONT, 'named')!
    expect(wide.rows.map((r) => r.items.length)).toEqual([2, 2])
    const counted = planCfLegend(cfLevelSpec('challenging').fleet, 800, FONT, 'counted')!
    expect(counted.entries.map((e) => e.words)).toEqual(['× 1', '× 2', '× 3', '× 4', 'Water'])
  })

  it('keeps the sign and the legend clear of the harbor', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planCfPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        const numbersTop = plan.grid.top - plan.countGap - plan.colCountHeight
        expect(numbersTop - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(CF_SIGN_GAP_MIN)
        expect(plan.legend.top - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(20)
      }
    }
    const plan = planCfPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runCfKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', harbor: CF_HARBORS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The sign crowds the harbor.')
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the sign, the numbers, the shown squares and the fleet hidden on its squares', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${CF_TEMPLATE_KEY}:${signature}`)
    const harbor = CF_HARBORS.find((h) => h.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(cfSignText(harbor))
    expect(partsOf(puzzle, 'rule')).toHaveLength(18)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    expect(partsOf(puzzle, 'count').every((c) => Number(c.fontSize) >= CF_COUNT_MIN)).toBe(true)
    const given = partsOf(puzzle, 'given')
    expect(given.length).toBeGreaterThanOrEqual(cfLevelSpec('classic').minGivens)
    expect(given.every((g) => g.visible !== false && (g.data?.piece === 'water' ? g.fill === 'transparent' : g.fill === STUDIO_INK))).toBe(true)
    const ships = partsOf(puzzle, 'ship')
    expect(ships).toHaveLength(8)
    expect(ships.every((s) => s.visible === false && s.studioRole === 'answer' && s.fill === CF_HULL)).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual(['1 cruise ship', '2 ferries', '2 sailboats', '3 rowboats', 'Open water'])
    expect(partsOf(puzzle, 'legend-ship').every((s) => s.visible !== false)).toBe(true)
  })

  it('sails the whole fleet in on the answer page, in black ink, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    // A hull for each of the eight ships, and portholes on the five longer than a rowboat.
    expect(answers).toHaveLength(13)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const hulls = partsOf(puzzle, 'ship')
    expect(hulls.every((s) => s.visible === true && s.stroke === STUDIO_INK && s.fill === CF_HULL)).toBe(true)
    expect(partsOf(puzzle, 'ship-portholes').every((p) => p.visible === true && p.fill === STUDIO_PAPER)).toBe(true)
    // The hulls are a finished harbor for the page's numbers.
    const n = 8
    const grid = new Int8Array(n * n)
    for (const h of hulls) for (const i of String(h.data?.squares).split('.').map(Number)) grid[i] = 1
    const ships = cfShipsOf(grid, n)!
    const rows = partsOf(puzzle, 'count').filter((c) => String(c.data?.line).startsWith('r')).map((c) => Number(c.text))
    const cols = partsOf(puzzle, 'count').filter((c) => String(c.data?.line).startsWith('c')).map((c) => Number(c.text))
    expect(isCfSolution({ size: n, fleet: cfLevelSpec('classic').fleet, rows, cols, givens: [] }, ships)).toBe(true)
    expect(key.some((o) => o.text === CF_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === CF_INSTRUCTION)).toBe(true)
  })

  it('builds a book that works through every harbor before one returns, never hiding a fleet twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at harbors their last one did not use', () => {
    const recent = CF_HARBORS.slice(0, 20).map((h) => h.id)
    rememberStudioContent(studioVarietyKey(CF_TEMPLATE_KEY, 'harbors'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different fleet for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('cruise-fleet preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planCfPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const harbor = CF_HARBORS[0]!
  const run = (over: Partial<Parameters<typeof runCfKdpPreflight>[0]>) =>
    runCfKdpPreflight({ built, plan, level: 'classic', harbor, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven harbor', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    // A rowboat moved one square along: the numbers no longer match.
    const k = built.ships.findIndex((s) => s.length === 1)
    const moved = built.ships.map((s, j) => (j === k ? { ...s, at: s.at % 8 === 7 ? s.at - 1 : s.at + 1 } : s))
    expect(run({ built: { ...built, ships: moved } })).toMatch(/breaks a rule/)
  })

  it('refuses a harbor with several answers', () => {
    let bare: CfBuilt | null = null
    for (let k = 0; !bare; k++) {
      const ships = drawCfFleet(8, cfLevelSpec('classic').fleet, createRng(40 + k))!
      const puzzle = cfPuzzleOf(8, cfLevelSpec('classic').fleet, ships, [])
      if (countCfSolutions(puzzle, 2) === 2) bare = { puzzle, ships, signature: cfSignature(8, ships) }
    }
    expect(run({ built: bare })).toMatch(/logic alone/)
  })

  it('refuses a Classic harbor that the basic steps alone finish', () => {
    let easy: CfBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawCfCandidate({ ...cfLevelSpec('classic'), rules: 'basic', beyond: null, minAdvanced: 0, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a harbor or a fleet the book already has', () => {
    const book = parseCfBook([cfPageLabel(harbor, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseCfBook([cfPageLabel(CF_HARBORS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this fleet/)
  })

  it('refuses squares below the level’s floor and a harbor off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
  })

  it('catches a drawn page whose numbers, shown squares or ships do not match', () => {
    const puzzle = buildCfPuzzle({ built, plan, harbor, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkCfDrawnPage({ puzzle, built, harbor, plan })).toEqual([])
    expect(checkCfDrawnPage({ puzzle, built: builtFor('classic', 4), harbor, plan }).join(' ')).toMatch(/number|ships|shown/)
    const k = built.ships.findIndex((s) => s.length === 1)
    const moved: CfBuilt = { ...built, ships: built.ships.map((s, j) => (j === k ? { ...s, at: (s.at + 1) % 64 } : s)) }
    expect(checkCfDrawnPage({ puzzle, built: moved, harbor, plan }).join(' ')).toMatch(/off their squares/)
    expect(checkCfDrawnPage({ puzzle, built, harbor: CF_HARBORS[5]!, plan }).join(' ')).toMatch(/sign/)
  })
})
