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
import { skylineTourTemplate } from './generate'
import { SKY_CONFIG_SCHEMA } from './config'
import {
  SKY_CITIES,
  SKY_DEFAULT_TITLE,
  SKY_GENTLE_TIP,
  SKY_LEVELS,
  SKY_TEMPLATE_KEY,
  parseSkyBook,
  parseSkyLevel,
  pickSkyCity,
  skyCityRng,
  skyInstruction,
  skyInstructionFor,
  skyLevelSpec,
  skyPageLabel,
  skySignText,
  type SkyLevel,
} from './content'
import { SKY_PART_KEY, buildSkyPuzzle } from './draw'
import { checkSkyDrawnPage, runSkyKdpPreflight } from './kdp-preflight'
import { SKY_DIGIT_MIN, SKY_SIGN_GAP_MIN, planSkyPage, skyContentBox, skyPanelInBody, skyPrintNote } from './layout'
import { buildSkyCity, drawSkyAnswer, drawSkyCandidate, skyCluesPerSide, skyMeetsLevel, skyPicture, skySignature, type SkyBuilt } from './puzzle'
import {
  countSkySolutions,
  isSkySolution,
  skyAnswerKey,
  skyClueCells,
  skyCluesFor,
  skySeen,
  skyWellFormed,
  solveSky,
  type SkyPuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many cities: generous room when the whole suite runs at once. */
const SLOW = 120_000
const LEVELS = SKY_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: SKY_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(skylineTourTemplate),
  showTitle: true,
  title: SKY_DEFAULT_TITLE,
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
  return skylineTourTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[SKY_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[SKY_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: SkyLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(skyContentBox(ctx), config, tag, skyInstruction(config, level))
  return skyPanelInBody(header.body, header.objects.length > 0)
}

/** The city from its square picture: clues on the border, givens inside (the inverse of `skyPicture`). */
function fromPicture(pic: number[][]): SkyPuzzle {
  const n = pic.length - 2
  const clues = new Array<number>(4 * n).fill(0)
  const givens = new Array<number>(n * n).fill(0)
  for (let j = 0; j < n; j++) {
    clues[j] = pic[0]![j + 1]!
    clues[n + j] = pic[j + 1]![n + 1]!
    clues[2 * n + j] = pic[n + 1]![j + 1]!
    clues[3 * n + j] = pic[j + 1]![0]!
  }
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) givens[r * n + c] = pic[r + 1]![c + 1]!
  return { size: n, clues, givens }
}

/** The picture turned a quarter clockwise: (r, c) → (c, last − r). */
const turn = (pic: number[][]) => pic.map((row, r) => row.map((_, c) => pic[pic.length - 1 - c]![r]!))
/** The picture mirrored left to right. */
const mirror = (pic: number[][]) => pic.map((row) => [...row].reverse())

function builtFor(level: SkyLevel, seed = 1): SkyBuilt {
  return buildSkyCity({ ...skyLevelSpec(level), rng: skyCityRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/** The toy city the rules tests use: a 4 × 4, every clue up. */
const TOY_GRID = [2, 1, 4, 3, 4, 3, 2, 1, 1, 4, 3, 2, 3, 2, 1, 4]
const TOY: SkyPuzzle = { size: 4, clues: skyCluesFor(4, TOY_GRID), givens: new Array(16).fill(0) }

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(skylineTourTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: SKY_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(skylineTourTemplate, { seeds: 12 })

describe('skyline tour registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === SKY_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(SKY_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(SKY_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(SKY_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(skylineTourTemplate).level).toBe('classic')
    expect(parseSkyLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseSkyLevel(level)).toBe(level)
  })

  it('names the level’s heights in the how-to, adds the starting tip at Gentle only, and drops it when asked', () => {
    expect(skyInstruction(base, 'gentle')).toBe(`${skyInstructionFor(5)} ${SKY_GENTLE_TIP}`)
    expect(skyInstruction(base, 'classic')).toBe(skyInstructionFor(6))
    expect(skyInstruction(base, 'challenging')).toMatch(/1 to 7 floors/)
    expect(skyInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the plot and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = skyPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Plots print 0\.\d\d in, the city \d\.\d\d in across with its clues, numbers \d+(\.5)? pt\.$/)
      expect(skyPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(skyPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('skyline tour rules and solver', () => {
  it('counts the buildings seen, the taller hiding the shorter', () => {
    expect(skySeen([1, 2, 3, 4])).toBe(4)
    expect(skySeen([4, 1, 2, 3])).toBe(1)
    expect(skySeen([2, 1, 4, 3])).toBe(2)
    expect(skySeen([3, 1, 2, 5, 4])).toBe(2)
  })

  it('looks along each row and column from its own side, nearest plot first', () => {
    // Top clue 1 looks down column 1; right clue 0 looks left along row 0; bottom clue 2 looks up column 2; left clue 3 looks right along row 3.
    expect(skyClueCells(4, 1)).toEqual([1, 5, 9, 13])
    expect(skyClueCells(4, 4)).toEqual([3, 2, 1, 0])
    expect(skyClueCells(4, 10)).toEqual([14, 10, 6, 2])
    expect(skyClueCells(4, 15)).toEqual([12, 13, 14, 15])
    expect(TOY.clues).toEqual([2, 3, 1, 2, 2, 4, 3, 1, 2, 2, 3, 1, 2, 1, 2, 2])
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    expect(skyWellFormed(TOY)).toBe(true)
    expect(isSkySolution(TOY, TOY_GRID)).toBe(true)
    // Two of a height in a row.
    expect(isSkySolution(TOY, [2, 2, 4, 3, ...TOY_GRID.slice(4)])).toBe(false)
    // Two rows swapped: still a Latin square, but the clues see otherwise.
    const swapped = [...TOY_GRID.slice(4, 8), ...TOY_GRID.slice(0, 4), ...TOY_GRID.slice(8)]
    expect(isSkySolution(TOY, swapped)).toBe(false)
    expect(isSkySolution({ ...TOY, clues: new Array(16).fill(0) }, swapped)).toBe(true)
    // A given plot not kept.
    expect(isSkySolution({ ...TOY, givens: [3, ...new Array(15).fill(0)] }, TOY_GRID)).toBe(false)
    expect(skyWellFormed({ ...TOY, clues: [5, ...TOY.clues.slice(1)] })).toBe(false)
  })

  it('solves a proven city step by step, on exactly its answer', () => {
    const built = builtFor('gentle', 3)
    const solve = solveSky(built.puzzle, 'basic')
    expect(solve.solved).toBe(true)
    expect(skyAnswerKey(solve.grid)).toBe(skyAnswerKey(built.grid))
    const probed = solveSky(built.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(skyAnswerKey(probed.grid)).toBe(skyAnswerKey(built.grid))
  })

  it('refuses to guess: a city with several answers is left unfinished at every level', () => {
    // No clues at all: every Latin square is an answer.
    const bare: SkyPuzzle = { size: 4, clues: new Array(16).fill(0), givens: new Array(16).fill(0) }
    expect(countSkySolutions(bare, 2)).toBe(2)
    for (const rules of ['basic', 'line', 'probe'] as const) expect(solveSky(bare, rules).solved).toBe(false)
  })

  it('needs "try the orders" at Classic, and "what if" at Challenging', () => {
    const classic = builtFor('classic', 2)
    expect(solveSky(classic.puzzle, 'basic').solved).toBe(false)
    const lined = solveSky(classic.puzzle, 'line')
    expect(lined.solved).toBe(true)
    expect(lined.tally.line).toBeGreaterThan(0)
    const challenging = builtFor('challenging', 2)
    expect(solveSky(challenging.puzzle, 'line').solved).toBe(false)
    const probed = solveSky(challenging.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(probed.tally.probe).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with plain search: every city the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, rules] of [[4, 'basic'], [5, 'basic'], [5, 'line'], [5, 'probe'], [6, 'line'], [6, 'probe']] as const) {
      for (let k = 0; k < 12; k++) {
        const built = drawSkyCandidate({ size, rules, maxGivens: 99, minCluesPerSide: 0, rng })
        if (!built) continue
        finished++
        expect(countSkySolutions(built.puzzle, 2), `${size} × ${size} ${rules} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(50)
  }, SLOW)

  it('never claims a city with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 400 && ambiguous < 30; k++) {
      // An answer, then clues and givens kept at random with no check.
      const rng = createRng(77 + k)
      const size = rng.int(4, 6)
      const grid = drawSkyAnswer(size, rng)
      const puzzle: SkyPuzzle = {
        size,
        clues: skyCluesFor(size, grid).map((c) => (rng.chance(0.5) ? c : 0)),
        givens: grid.map((v) => (rng.chance(0.08) ? v : 0)),
      }
      if (countSkySolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'line', 'probe'] as const) expect(solveSky(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(20)
  }, SLOW)

  it('lays answers that hold every height once in every row and column, and not always the same way', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 30; seed++) {
      const grid = drawSkyAnswer(6, createRng(seed + 1))
      expect(isSkySolution({ size: 6, clues: new Array(24).fill(0), givens: new Array(36).fill(0) }, grid)).toBe(true)
      seen.add(grid.join(''))
    }
    expect(seen.size).toBe(30)
  })
})

describe('skyline tour levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds cities of the level's size that its own steps finish`, () => {
      const spec = skyLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 4
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(skyWellFormed(built.puzzle)).toBe(true)
        expect(isSkySolution(built.puzzle, built.grid)).toBe(true)
        if (spec.size <= 6) expect(countSkySolutions(built.puzzle, 2)).toBe(1)
        expect(skyMeetsLevel(built.puzzle, built.grid, spec)).toBe(true)
        expect(solveSky(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveSky(built.puzzle, spec.beyond).solved).toBe(false)
        expect(built.puzzle.givens.filter((v) => v > 0).length).toBeLessThanOrEqual(spec.maxGivens)
        expect(Math.min(...skyCluesPerSide(built.puzzle))).toBeGreaterThanOrEqual(spec.minCluesPerSide)
        // Clues are rubbed out until each one counts: never the full set.
        expect(built.puzzle.clues.filter((c) => c > 0).length).toBeLessThan(4 * spec.size)
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first city: the edge count, singles and the last two plots finish it', () => {
    for (let seed = 0; seed < 5; seed++) expect(solveSky(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  }, SLOW)

  it('knows a city however it is turned or mirrored', () => {
    const built = builtFor('gentle', 7)
    const pic = skyPicture(built.puzzle)
    expect(fromPicture(pic)).toEqual({ size: 5, clues: [...built.puzzle.clues], givens: [...built.puzzle.givens] })
    for (const moved of [turn(pic), turn(turn(pic)), mirror(pic), mirror(turn(pic))]) {
      const other = fromPicture(moved)
      expect(skySignature(other)).toBe(built.signature)
      // Turned with its clues, the city is still a puzzle with one answer.
      expect(countSkySolutions(other, 2)).toBe(1)
    }
    const changed = { ...built.puzzle, clues: built.puzzle.clues.map((c, k) => (k === built.puzzle.clues.findIndex((v) => v > 0) ? 0 : c)) }
    expect(skySignature(changed)).not.toBe(built.signature)
  })
})

describe('skyline tour cities', () => {
  it('names every skyline once, in travel words, with no brand, drink, money or gambling', () => {
    expect(SKY_CITIES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(SKY_CITIES.map((c) => c.id)).size).toBe(SKY_CITIES.length)
    for (const c of SKY_CITIES) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/)
      expect(c.name).not.toMatch(/beer|wine|whisk|rum\b|cocktail|margarita|happy hour|drunk|pension|money|cash|dollar|old age|senior|vegas|casino|reno\b|atlantic city|macau/i)
      expect(skySignText(c)).toBe(c.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const quarter = SKY_CITIES.find((c) => c.id === 'new-orleans-french-quarter')!
    expect(skySignText(quarter, 2)).toBe('New Orleans\nFrench Quarter')
    const blocks = SKY_CITIES.find((c) => c.id === 'grandkids-block-city')!
    expect(skySignText(blocks, 2).split('\n')).toHaveLength(2)
    expect(skySignText(blocks, 2).replace('\n', ' ')).toBe(blocks.name)
  })

  it('works through every skyline before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < SKY_CITIES.length + 5; page++) {
      const book = parseSkyBook(labels)
      const pick = pickSkyCity({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.city)
      labels.push(skyPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, SKY_CITIES.length).map((l) => l.split('|')[0])).size).toBe(SKY_CITIES.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickSkyCity({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = SKY_CITIES.slice(0, SKY_CITIES.length - 3).map((c) => c.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a skyline', () => {
    expect(parseSkyBook(['chicago-lakefront|gentle|abc', 'atlantis|classic|x', 'paris-left-bank|odd|def', ''])).toEqual([
      { city: 'chicago-lakefront', level: 'gentle', signature: 'abc' },
      { city: 'paris-left-bank', level: null, signature: 'def' },
    ])
  })
})

describe('skyline tour pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print city on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        assertObjectsInSafeMargin(pages[0]!.answerSourceObjects!, ctx)
        const size = skyLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        const clues = partsOf(puzzle!, 'clue')
        expect(clues.length).toBeGreaterThanOrEqual(4)
        expect([...clues, ...partsOf(puzzle!, 'given'), ...partsOf(puzzle!, 'height')].every((t) => Number(t.fontSize) >= SKY_DIGIT_MIN)).toBe(true)
      }
    }
  }, SLOW)

  it('prints plots as large as the trim allows, never below the level’s floor', () => {
    const big = planSkyPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planSkyPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(skyLevelSpec('challenging').minCell))
    expect(small.digitSize).toBeGreaterThanOrEqual(SKY_DIGIT_MIN)
    // The clues always have their band, clear of the frame.
    expect(small.band).toBeGreaterThanOrEqual(small.digitSize + 14)
  })

  it('centres every height in its plot, as large as the clues', () => {
    const plan = planSkyPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const puzzle = buildSkyPuzzle({ built, plan, city: SKY_CITIES[0]!, level: 'challenging', label: 'x', tag, font: FONT })
    // Children sit relative to the group's centre.
    const dx = puzzle.left + puzzle.width! / 2
    const dy = puzzle.top + puzzle.height! / 2
    const digits = [...partsOf(puzzle, 'height'), ...partsOf(puzzle, 'given')]
    expect(digits).toHaveLength(49)
    for (const o of digits) {
      expect(o.left + dx).toBeCloseTo(plan.grid.left + (Number(o.data?.col) + 0.5) * plan.cell, 1)
      expect(o.top + dy).toBeCloseTo(plan.grid.top + (Number(o.data?.row) + 0.5) * plan.cell, 1)
      expect(o.fontSize).toBe(plan.digitSize)
    }
  })

  it('stacks the legend rather than shrinking the city on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 360, height: 1000 }
    const plan = planSkyPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const city = SKY_CITIES.find((c) => c.id === 'new-orleans-french-quarter')!
    expect(runSkyKdpPreflight({ built, plan, level: 'gentle', city, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildSkyPuzzle({ built, plan, city, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkSkyDrawnPage({ puzzle, built, city })).toEqual([])
    const [heightsWords, sampleWords] = partsOf(puzzle, 'legend-text')
    expect(sampleWords!.top).toBeGreaterThan(heightsWords!.top)
    // The city takes the whole width; only the legend gives way.
    expect(plan.city.width).toBeLessThanOrEqual(360)
    expect(plan.city.width).toBeGreaterThan(360 - plan.cell)
  })

  it('keeps the name board and the legend clear of the clues', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planSkyPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.city.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(SKY_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.city.top + plan.city.height)).toBeGreaterThanOrEqual(18)
        expect(plan.grid.left - plan.city.left).toBe(plan.band)
      }
    }
    const plan = planSkyPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runSkyKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', city: SKY_CITIES[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The name board crowds the clues.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the board, the ruled plots, the givens and clues in a frame, and the answer’s heights hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${SKY_TEMPLATE_KEY}:${signature}`)
    const city = SKY_CITIES.find((c) => c.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(skySignText(city))
    expect(partsOf(puzzle, 'sign')).toHaveLength(2)
    expect(partsOf(puzzle, 'rule')).toHaveLength(14)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    const shown = [...partsOf(puzzle, 'clue'), ...partsOf(puzzle, 'given')]
    expect(shown.every((t) => t.visible !== false && t.fontWeight === 700 && t.fill === STUDIO_INK)).toBe(true)
    const hidden = partsOf(puzzle, 'height')
    expect(hidden.every((o) => o.visible === false && o.studioRole === 'answer' && o.fontWeight === 'normal')).toBe(true)
    expect(hidden.length + partsOf(puzzle, 'given').length).toBe(36)
    // Nothing on the plots but the rules and the digits: no drawings.
    expect(puzzle.objects!.filter((o) => o.type === 'path').every((o) => String(o.data?.[SKY_PART_KEY]).startsWith('legend-'))).toBe(true)
    const texts = partsOf(puzzle, 'legend-text').map((t) => t.text)
    expect(texts).toEqual(['Heights 1 to 6', '= 3 buildings seen from here'])
    // The legend's skyline and sample are on show; only the answer's heights wait for the answer page.
    expect([...partsOf(puzzle, 'legend-skyline'), ...partsOf(puzzle, 'legend-arrow'), ...partsOf(puzzle, 'legend-clue')].every((o) => o.visible !== false)).toBe(true)
  })

  it('fills every plot with its height on the answer page, in plain black digits, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    // Every plot shows its height in its middle: the answer's plain, the given ones bold as on the puzzle page.
    expect(partsOf(puzzle, 'height').every((t) => t.fontWeight === 'normal')).toBe(true)
    expect(partsOf(puzzle, 'given').every((t) => t.fontWeight === 700)).toBe(true)
    const n = 6
    const grid = new Array<number>(n * n).fill(0)
    for (const t of [...partsOf(puzzle, 'height'), ...partsOf(puzzle, 'given')]) {
      expect(t.visible).not.toBe(false)
      expect(t.fill).toBe(STUDIO_INK)
      grid[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    }
    const clues = new Array<number>(4 * n).fill(0)
    for (const t of partsOf(puzzle, 'clue')) clues[Number(t.data?.k)] = Number(t.text)
    expect(isSkySolution({ size: n, clues, givens: new Array(n * n).fill(0) }, grid)).toBe(true)
    // The rules run under the heights, and the frame over them.
    const names = puzzle.objects!.map((o) => String(o.data?.[SKY_PART_KEY]))
    expect(names.lastIndexOf('rule')).toBeLessThan(names.indexOf('height'))
    expect(names.lastIndexOf('height')).toBeLessThan(names.indexOf('frame'))
    expect(names.some((name) => ['building', 'windows', 'door', 'spire'].includes(name))).toBe(false)
    expect(key.some((o) => o.text === skyInstruction(base, 'classic'))).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === skyInstruction(base, 'classic'))).toBe(true)
  })

  it('builds a book that works through every skyline before one returns, never printing a city twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at skylines their last one did not use', () => {
    const recent = SKY_CITIES.slice(0, 20).map((c) => c.id)
    rememberStudioContent(studioVarietyKey(SKY_TEMPLATE_KEY, 'cities'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different city for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('skyline tour preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planSkyPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const city = SKY_CITIES[0]!
  const run = (over: Partial<Parameters<typeof runSkyKdpPreflight>[0]>) =>
    runSkyKdpPreflight({ built, plan, level: 'classic', city, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven city', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    const grid = [...built.grid]
    ;[grid[0], grid[1]] = [grid[1]!, grid[0]!]
    expect(run({ built: { ...built, grid } })).toMatch(/breaks a rule/)
  })

  it('refuses a city with several answers', () => {
    // Every clue but one rubbed out: the heights are free to move.
    const first = built.puzzle.clues.findIndex((c) => c > 0)
    const bare: SkyPuzzle = { ...built.puzzle, clues: built.puzzle.clues.map((c, k) => (k === first ? c : 0)) }
    expect(countSkySolutions(bare, 2)).toBe(2)
    const errors = run({ built: { puzzle: bare, grid: built.grid, signature: skySignature(bare) } })
    expect(errors).toMatch(/logic alone/)
    expect(errors).toMatch(/no clue/)
  })

  it('refuses a Classic city that the Gentle steps alone finish, and one that hands over too much', () => {
    let easy: SkyBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawSkyCandidate({ size: 6, rules: 'basic', maxGivens: 3, minCluesPerSide: 1, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
    const generous: SkyPuzzle = { ...built.puzzle, givens: built.grid.map((v, i) => (i < 8 ? v : 0)) }
    expect(run({ built: { puzzle: generous, grid: built.grid, signature: skySignature(generous) } })).toMatch(/too many plots/)
  }, SLOW)

  it('refuses a city or a skyline the book already has', () => {
    const book = parseSkyBook([skyPageLabel(city, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseSkyBook([skyPageLabel(SKY_CITIES[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this city/)
  })

  it('refuses plots below the level’s floor, a city off the page, and print too small', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, city: { ...plan.city, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, digitSize: 12 } })).toMatch(/below 16 pt/)
  })

  it('catches a drawn page whose clues, givens or heights do not match', () => {
    const puzzle = buildSkyPuzzle({ built, plan, city, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkSkyDrawnPage({ puzzle, built, city })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkSkyDrawnPage({ puzzle, built: other, city }).join(' ')
    expect(errors).toMatch(/clues/)
    expect(errors).toMatch(/heights|given plots/)
    expect(checkSkyDrawnPage({ puzzle, built, city: SKY_CITIES[5]! }).join(' ')).toMatch(/board/)
  })
})
