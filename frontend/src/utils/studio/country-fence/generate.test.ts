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
import { countryFenceTemplate } from './generate'
import { FENCE_CONFIG_SCHEMA } from './config'
import {
  FENCE_DEFAULT_TITLE,
  FENCE_GENTLE_TIP,
  FENCE_INSTRUCTION,
  FENCE_LEVELS,
  FENCE_LOOP_WORD,
  FENCE_PASTURES,
  FENCE_SAMPLE_WORD,
  FENCE_TEMPLATE_KEY,
  fenceFieldRng,
  fenceInstruction,
  fenceLevelSpec,
  fencePageLabel,
  fenceSignText,
  parseFenceBook,
  parseFenceLevel,
  pickFencePasture,
  type FenceLevel,
} from './content'
import { FENCE_MEADOW_FILL, FENCE_PART_KEY, buildFencePuzzle, fencePostPoint, fenceRing } from './draw'
import { checkFenceDrawnPage, runFenceKdpPreflight } from './kdp-preflight'
import { FENCE_DIGIT_MIN, FENCE_SIGN_GAP_MIN, fenceContentBox, fencePanelInBody, fencePrintNote, planFencePage } from './layout'
import { buildFenceField, drawFenceCandidate, drawFencePasture, fenceClueCount, fenceMeetsLevel, fenceOutline, fenceSignature, type FenceBuilt } from './puzzle'
import {
  FENCE_BLANK,
  countFenceSolutions,
  fenceAnswerKey,
  fenceCounts,
  fenceGeometry,
  fenceInside,
  fenceLoopOrder,
  fenceRailBetween,
  fenceWellFormed,
  isFenceSolution,
  solveFence,
  type FencePuzzle,
} from './solver'

const FONT = 'PT Serif'
/** Tests that build many fields: generous room when the whole suite runs at once. */
const SLOW = 120_000
const LEVELS = FENCE_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: FENCE_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(countryFenceTemplate),
  showTitle: true,
  title: FENCE_DEFAULT_TITLE,
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
  return countryFenceTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[FENCE_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[FENCE_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: FenceLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(fenceContentBox(ctx), config, tag, fenceInstruction(config, level))
  return fencePanelInBody(header.body, header.objects.length > 0)
}

/** A field from a picture: `.` a blank square, a digit a number. */
function fieldFrom(rows: string[]): FencePuzzle {
  const clues: number[] = []
  for (const row of rows) for (const ch of row) clues.push(ch === '.' ? FENCE_BLANK : Number(ch))
  return { size: rows.length, clues }
}

/** The rails joining posts in turn, (row, col) pairs, back to the first. */
function loopThrough(n: number, posts: [number, number][]): number[] {
  const N = n + 1
  const ids = posts.map(([r, c]) => r * N + c)
  return ids.map((a, k) => fenceRailBetween(n, a, ids[(k + 1) % ids.length]!)).sort((a, b) => a - b)
}

/** A patch of squares from a picture: `#` inside. */
const patch = (rows: string[]) => Uint8Array.from(rows.join('').split('').map((ch) => (ch === '#' ? 1 : 0)))

function builtFor(level: FenceLevel, seed = 1): FenceBuilt {
  return buildFenceField({ ...fenceLevelSpec(level), rng: fenceFieldRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/**
 * The toy field the rules tests use: an L-shaped pasture on a 3 × 3 field,
 * its three squares fenced round, with every number shown.
 */
const TOY_PATCH = patch(['##.', '#..', '...'])
const TOY_RAILS = fenceOutline(3, TOY_PATCH)
const TOY = { puzzle: { size: 3, clues: fenceCounts(3, TOY_RAILS) } as FencePuzzle, rails: TOY_RAILS }

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(countryFenceTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: FENCE_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(countryFenceTemplate, { seeds: 12 })

describe('country fence registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === FENCE_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(FENCE_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(FENCE_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(FENCE_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(countryFenceTemplate).level).toBe('classic')
    expect(parseFenceLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseFenceLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(fenceInstruction(base, 'gentle')).toBe(`${FENCE_INSTRUCTION} ${FENCE_GENTLE_TIP}`)
    expect(fenceInstruction(base, 'classic')).toBe(FENCE_INSTRUCTION)
    expect(fenceInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24 + STUDIO_SAFE_AREA_PADDING_X, bottom: 24, left: 36 + STUDIO_SAFE_AREA_PADDING_X } })
    for (const level of LEVELS) {
      const note = fencePrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the field \d\.\d\d in across, numbers \d+(\.5)? pt\.$/)
      expect(fencePrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(fencePrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one fence/)
  })
})

describe('country fence rules and solver', () => {
  it('reads a field picture the way it is drawn', () => {
    const p = fieldFrom(['3.0', '...', '.12'])
    expect(p.size).toBe(3)
    expect(fenceWellFormed(p)).toBe(true)
    expect(p.clues.filter((v) => v !== FENCE_BLANK)).toEqual([3, 0, 1, 2])
    expect(fenceWellFormed({ size: 3, clues: [...p.clues.slice(0, 8), 4] })).toBe(false)
  })

  it('numbers the rails across, then down, and knows each square’s sides and posts', () => {
    const g = fenceGeometry(3)
    // 4 × 3 across and 3 × 4 down.
    expect(g.rails).toBe(24)
    expect(fenceRailBetween(3, 0, 1)).toBe(0)
    expect(fenceRailBetween(3, 1, 0)).toBe(0)
    expect(fenceRailBetween(3, 0, 4)).toBe(12)
    expect(fenceRailBetween(3, 0, 5)).toBe(-1)
    // Square (0, 0): top rail 0, right rail 13, bottom rail 3, left rail 12; posts 0, 1, 5, 4.
    expect(Array.from(g.sides.slice(0, 4))).toEqual([0, 13, 3, 12])
    expect(Array.from(g.corners.slice(0, 4))).toEqual([0, 1, 5, 4])
    // Its top-left post leads away from it nowhere (both past the edge); its bottom-right post leads right and down.
    expect(Array.from(g.away.slice(0, 2))).toEqual([-1, -1])
    expect(Array.from(g.away.slice(4, 6)).sort((a, b) => a - b)).toEqual([4, 17])
  })

  it('walks a fence from its lowest post and knows the land inside', () => {
    const rails = loopThrough(3, [[0, 0], [0, 1], [1, 1], [1, 0]])
    expect(fenceLoopOrder(3, rails)).toEqual([0, 1, 5, 4])
    expect(Array.from(fenceInside(3, rails))).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(Array.from(fenceInside(3, TOY.rails))).toEqual(Array.from(TOY_PATCH))
    // Two separate loops are not one fence.
    const two = [...rails, ...loopThrough(3, [[2, 2], [2, 3], [3, 3], [3, 2]])]
    expect(fenceLoopOrder(3, two)).toBeNull()
  })

  it('knows a fence when it sees one, and every way one can be wrong', () => {
    const { puzzle, rails } = TOY
    expect(puzzle.clues).toEqual(fieldFrom(['231', '320', '100']).clues)
    expect(isFenceSolution(puzzle, rails)).toBe(true)
    // A rail missing: no loop.
    expect(isFenceSolution(puzzle, rails.slice(1))).toBe(false)
    // A loop that gives a number the wrong count.
    const square = loopThrough(3, [[0, 0], [0, 1], [1, 1], [1, 0]])
    expect(isFenceSolution(puzzle, square)).toBe(false)
    expect(isFenceSolution(fieldFrom(['2..', '...', '...']), square)).toBe(false)
    expect(isFenceSolution(fieldFrom(['...', '...', '...']), square)).toBe(true)
  })

  it('solves a proven field step by step, on exactly its fence', () => {
    const result = solveFence(TOY.puzzle, 'local')
    expect(result.solved).toBe(true)
    expect(fenceAnswerKey(result.rails)).toBe(fenceAnswerKey(TOY.rails))
    expect(countFenceSolutions(TOY.puzzle, 5)).toBe(1)
    const built = builtFor('gentle', 3)
    const probed = solveFence(built.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(fenceAnswerKey(probed.rails)).toBe(fenceAnswerKey(built.rails))
  })

  it('reads a number with its corners: a 3 in a corner fences both corner sides, a 1 crosses them', () => {
    const three = solveFence(fieldFrom(['3..', '...', '...']), 'local')
    const g = fenceGeometry(3)
    const top = g.sides[0]!
    const left = g.sides[3]!
    expect(three.rails).toContain(top)
    expect(three.rails).toContain(left)
    // A 1 in the corner: neither corner side can be fence — the corner post would be left with one rail.
    const one = fieldFrom(['1..', '...', '...'])
    for (const rails of [loopThrough(3, [[0, 0], [0, 1], [1, 1], [1, 0]])]) expect(isFenceSolution(one, rails)).toBe(false)
  })

  it('refuses to guess: a field with several fences is left unfinished at every level', () => {
    // A lone 3 in a corner: many fences keep it.
    const loose = fieldFrom(['3..', '...', '...'])
    expect(countFenceSolutions(loose, 10)).toBeGreaterThan(1)
    for (const rules of ['local', 'loop', 'probe'] as const) expect(solveFence(loose, rules).solved).toBe(false)
  })

  it('needs "don’t close it early" at Classic, and "what if" at Challenging', () => {
    const classic = builtFor('classic', 2)
    expect(solveFence(classic.puzzle, 'local').solved).toBe(false)
    const looped = solveFence(classic.puzzle, 'loop')
    expect(looped.solved).toBe(true)
    expect(looped.tally.loop).toBeGreaterThan(0)
    const challenging = builtFor('challenging', 2)
    expect(solveFence(challenging.puzzle, 'loop').solved).toBe(false)
    const probed = solveFence(challenging.puzzle, 'probe')
    expect(probed.solved).toBe(true)
    expect(probed.tally.probe).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with plain search: every field the solver finishes has exactly one fence', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, rules] of [[4, 'local'], [4, 'probe'], [5, 'local'], [5, 'loop'], [5, 'probe'], [6, 'loop']] as const) {
      for (let k = 0; k < 8; k++) {
        const built = drawFenceCandidate({ size, rules, area: [0.35, 0.6], length: 0.9, rng })
        if (!built) continue
        finished++
        expect(countFenceSolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(30)
  }, SLOW)

  it('never claims a field with several fences is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 400 && ambiguous < 25; k++) {
      // A fence and its numbers, then numbers taken away at random with no check.
      const rng = createRng(77 + k)
      const size = rng.int(3, 5)
      const rails = drawFencePasture(size, rng, { area: [0.3, 0.6], length: 0.8 })
      if (!rails) continue
      const puzzle: FencePuzzle = { size, clues: fenceCounts(size, rails).map((v) => (rng.chance(0.65) ? FENCE_BLANK : v)) }
      if (countFenceSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['local', 'loop', 'probe'] as const) expect(solveFence(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(15)
  }, SLOW)

  it('grows pastures whose fence is one loop, long enough, round a fair share of the field', () => {
    for (let seed = 0; seed < 20; seed++) {
      for (const n of [6, 8, 10]) {
        const rails = drawFencePasture(n, createRng(seed), { area: [0.4, 0.6], length: 1 })
        expect(rails, `${n} #${seed}`).not.toBeNull()
        expect(fenceLoopOrder(n, rails!)).not.toBeNull()
        expect(rails!.length).toBeGreaterThanOrEqual(n * n)
        const area = fenceInside(n, rails!).reduce((a, v) => a + v, 0)
        expect(area).toBeGreaterThanOrEqual(Math.round(0.4 * n * n))
        expect(area).toBeLessThanOrEqual(Math.round(0.6 * n * n))
        // The pasture's outline is the fence, and every count it gives is one the fence keeps.
        expect(isFenceSolution({ size: n, clues: fenceCounts(n, rails!) }, rails!)).toBe(true)
      }
    }
    // The outline of one square is the four rails round it.
    expect(fenceOutline(3, patch(['#..', '...', '...']))).toEqual(loopThrough(3, [[0, 0], [0, 1], [1, 1], [1, 0]]))
  })
})

describe('country fence levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds fields of the level's size that its own steps finish`, () => {
      const spec = fenceLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 4
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(fenceWellFormed(built.puzzle)).toBe(true)
        expect(isFenceSolution(built.puzzle, built.rails)).toBe(true)
        expect(fenceMeetsLevel(built.puzzle, built.rails, spec)).toBe(true)
        expect(solveFence(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveFence(built.puzzle, spec.beyond).solved).toBe(false)
        expect(fenceClueCount(built.puzzle)).toBeGreaterThan(0)
        expect(built.rails.length).toBeGreaterThanOrEqual(Math.ceil(spec.length * spec.size * spec.size))
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first field: the numbers and posts finish it, and it has one fence', () => {
    for (let seed = 0; seed < 4; seed++) {
      const built = builtFor('gentle', seed)
      expect(solveFence(built.puzzle, 'local').solved).toBe(true)
      expect(countFenceSolutions(built.puzzle, 2)).toBe(1)
    }
  }, SLOW)

  it('knows a field however it is turned or mirrored', () => {
    const a = fieldFrom(['3..', '.1.', '..2'])
    // Mirrored left to right.
    const mirrored = fieldFrom(['..3', '.1.', '2..'])
    // Turned a quarter clockwise: (r, c) → (c, 2 − r).
    const turned = fieldFrom(['..3', '.1.', '2..'])
    expect(fenceSignature(mirrored)).toBe(fenceSignature(a))
    expect(fenceSignature(turned)).toBe(fenceSignature(a))
    expect(fenceSignature(fieldFrom(['2..', '.1.', '..3']))).toBe(fenceSignature(a))
    expect(fenceSignature(fieldFrom(['3..', '.1.', '..1']))).not.toBe(fenceSignature(a))
  })
})

describe('country fence pastures', () => {
  it('names every pasture once, in retirement words, with no brand, drink or money', () => {
    expect(FENCE_PASTURES.length).toBeGreaterThanOrEqual(40)
    expect(new Set(FENCE_PASTURES.map((p) => p.id)).size).toBe(FENCE_PASTURES.length)
    for (const p of FENCE_PASTURES) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/)
      expect(p.name).not.toMatch(/beer|wine|vineyard|whisk|rum\b|cocktail|margarita|champagne|happy hour|drunk|pension|money|cash|dollar|old age|senior/i)
      expect(fenceSignText(p)).toBe(p.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const kitchen = FENCE_PASTURES.find((p) => p.id === 'grandmas-kitchen-garden')!
    expect(fenceSignText(kitchen, 2)).toBe('Grandma’s\nKitchen Garden')
    const sunny = FENCE_PASTURES.find((p) => p.id === 'sunny-acres-pasture')!
    expect(fenceSignText(sunny, 2).split('\n')).toHaveLength(2)
    expect(fenceSignText(sunny, 2).replace('\n', ' ')).toBe(sunny.name)
  })

  it('works through every pasture before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < FENCE_PASTURES.length + 5; page++) {
      const book = parseFenceBook(labels)
      const pick = pickFencePasture({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.pasture)
      labels.push(fencePageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, FENCE_PASTURES.length).map((l) => l.split('|')[0])).size).toBe(FENCE_PASTURES.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickFencePasture({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = FENCE_PASTURES.slice(0, FENCE_PASTURES.length - 3).map((p) => p.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a pasture', () => {
    expect(parseFenceBook(['pony-paddock|gentle|abc', 'nowhere|classic|x', 'hayfield|odd|def', ''])).toEqual([
      { pasture: 'pony-paddock', level: 'gentle', signature: 'abc' },
      { pasture: 'hayfield', level: null, signature: 'def' },
    ])
  })
})

describe('country fence pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print field on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = fenceLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        expect(partsOf(puzzle!, 'number').length).toBeGreaterThan(0)
        expect(partsOf(puzzle!, 'number').every((t) => Number(t.fontSize) >= FENCE_DIGIT_MIN)).toBe(true)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor', () => {
    const big = planFencePage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planFencePage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(fenceLevelSpec('challenging').minCell))
    // The posts and the answer page's fence stay inside the field's own box.
    for (const plan of [big, small]) {
      expect(plan.pad).toBeGreaterThanOrEqual(plan.dot)
      expect(plan.pad).toBeGreaterThanOrEqual(plan.post / 2)
      expect(plan.grid.left - plan.field.left).toBe(plan.pad)
    }
  })

  it('keeps every number inside its square, and the fence on the posts', () => {
    const plan = planFencePage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    const built = builtFor('challenging')
    const puzzle = buildFencePuzzle({ built, plan, pasture: FENCE_PASTURES[0]!, level: 'challenging', label: 'x', tag, font: FONT })
    // Children sit relative to the group's centre.
    const dx = puzzle.left + puzzle.width! / 2
    const dy = puzzle.top + puzzle.height! / 2
    const numbers = partsOf(puzzle, 'number')
    for (const o of numbers) {
      const cellLeft = plan.grid.left + Number(o.data?.col) * plan.cell
      const cellTop = plan.grid.top + Number(o.data?.row) * plan.cell
      const w = Number(o.fontSize) * 0.7
      const h = Number(o.fontSize)
      expect(o.left + dx - w / 2).toBeGreaterThanOrEqual(cellLeft - 0.5)
      expect(o.left + dx + w / 2).toBeLessThanOrEqual(cellLeft + plan.cell + 0.5)
      expect(o.top + dy - h / 2).toBeGreaterThanOrEqual(cellTop - 0.5)
      expect(o.top + dy + h / 2).toBeLessThanOrEqual(cellTop + plan.cell + 0.5)
    }
    expect(numbers).toHaveLength(fenceClueCount(built.puzzle))
    // The ring runs post to post, one rail at a time.
    const ring = fenceRing(plan, built.rails)
    expect(ring).toHaveLength(built.rails.length)
    ring.forEach(([x, y], k) => {
      const [nx, ny] = ring[(k + 1) % ring.length]!
      expect(Math.abs(nx - x) + Math.abs(ny - y)).toBeCloseTo(plan.cell, 5)
    })
    expect(fencePostPoint(plan, 0)).toEqual([plan.grid.left, plan.grid.top])
  })

  it('stacks the legend rather than shrinking the field on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 340, height: 1000 }
    const plan = planFencePage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const pasture = FENCE_PASTURES.find((p) => p.id === 'grandmas-kitchen-garden')!
    expect(runFenceKdpPreflight({ built, plan, level: 'gentle', pasture, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildFencePuzzle({ built, plan, pasture, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkFenceDrawnPage({ puzzle, built, pasture })).toEqual([])
    const [sampleWords, loopWords] = partsOf(puzzle, 'legend-text')
    expect(loopWords!.top).toBeGreaterThan(sampleWords!.top)
    // The field takes the whole width; only the legend gives way.
    expect(plan.field.width).toBeLessThanOrEqual(340)
    expect(plan.field.width).toBeGreaterThan(340 - 6)
  })

  it('keeps the name board and the legend clear of the field', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planFencePage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.field.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(FENCE_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.field.top + plan.field.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planFencePage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runFenceKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', pasture: FENCE_PASTURES[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The name board crowds the field.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the name board, the posts and the numbers, and the fence hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${FENCE_TEMPLATE_KEY}:${signature}`)
    const pasture = FENCE_PASTURES.find((p) => p.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(fenceSignText(pasture))
    expect(partsOf(puzzle, 'sign')).toHaveLength(2)
    const dots = partsOf(puzzle, 'dots')
    expect(dots).toHaveLength(9)
    expect(dots.every((d) => d.fill === STUDIO_INK && d.visible !== false && Number(d.data?.dots) === 9)).toBe(true)
    const numbers = partsOf(puzzle, 'number')
    expect(numbers.length).toBeGreaterThan(8)
    expect(numbers.every((t) => t.visible !== false && t.fill === STUDIO_INK && /^[0-3]$/.test(String(t.text)))).toBe(true)
    const hidden = ['pasture', 'fence', 'posts'].flatMap((name) => partsOf(puzzle, name))
    expect(partsOf(puzzle, 'fence')).toHaveLength(1)
    expect(partsOf(puzzle, 'pasture')).toHaveLength(1)
    expect(hidden.every((o) => o.visible === false && o.studioRole === 'answer' && o.type === 'path')).toBe(true)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual([FENCE_SAMPLE_WORD, FENCE_LOOP_WORD])
    // The legend is on show; only the fence waits for the answer page.
    expect(['legend-fence', 'legend-posts', 'legend-number'].flatMap((name) => partsOf(puzzle, name)).every((o) => o.visible !== false)).toBe(true)
  })

  it('fences the pasture on the answer page in black and gray, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const [fence] = partsOf(puzzle, 'fence')
    expect(fence!.visible).toBe(true)
    expect(fence!.stroke).toBe(STUDIO_INK)
    expect(fence!.fill).toBe('transparent')
    const [pasture] = partsOf(puzzle, 'pasture')
    expect(pasture!.visible).toBe(true)
    expect(pasture!.fill).toBe(FENCE_MEADOW_FILL)
    expect(pasture!.strokeWidth).toBe(0)
    const [posts] = partsOf(puzzle, 'posts')
    expect(posts!.visible).toBe(true)
    expect(posts!.fill).toBe(STUDIO_INK)
    // Nothing but the gray wash and the numbers inside the fence: no grass.
    expect(partsOf(puzzle, 'tuft')).toHaveLength(0)
    // The fence on the key gives every number on the page its count.
    const n = 8
    const clues = new Array<number>(n * n).fill(FENCE_BLANK)
    for (const t of partsOf(puzzle, 'number')) clues[Number(t.data?.row) * n + Number(t.data?.col)] = Number(t.text)
    const rails = String(fence!.data?.rails).split(',').map(Number)
    expect(isFenceSolution({ size: n, clues }, rails)).toBe(true)
    expect(Number(posts!.data?.posts)).toBe(fenceLoopOrder(n, rails)!.length)
    // The pasture under the posts, the posts over the fence, and every number on top.
    const names = puzzle.objects!.map((o) => String(o.data?.[FENCE_PART_KEY]))
    expect(names.indexOf('pasture')).toBeLessThan(names.indexOf('dots'))
    expect(names.lastIndexOf('dots')).toBeLessThan(names.indexOf('fence'))
    expect(names.indexOf('fence')).toBeLessThan(names.indexOf('posts'))
    expect(names.indexOf('posts')).toBeLessThan(names.indexOf('number'))
    expect(key.some((o) => o.text === FENCE_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === FENCE_INSTRUCTION)).toBe(true)
  })

  it('builds a book that works through every pasture before one returns, never printing a field twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at pastures their last one did not use', () => {
    const recent = FENCE_PASTURES.slice(0, 20).map((p) => p.id)
    rememberStudioContent(studioVarietyKey(FENCE_TEMPLATE_KEY, 'pastures'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different field for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('country fence preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planFencePage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const pasture = FENCE_PASTURES[0]!
  const run = (over: Partial<Parameters<typeof runFenceKdpPreflight>[0]>) =>
    runFenceKdpPreflight({ built, plan, level: 'classic', pasture, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven field', () => {
    expect(run({})).toBe('')
  })

  it('refuses a fence that is not one loop', () => {
    expect(run({ built: { ...built, rails: built.rails.slice(1) } })).toMatch(/one closed loop|count/)
  })

  it('refuses a field with several fences', () => {
    // Every number but two taken away: the fence is free to wander.
    const keep = new Set(built.puzzle.clues.flatMap((v, s) => (v === FENCE_BLANK ? [] : [s])).slice(0, 2))
    const bare: FencePuzzle = { size: 8, clues: built.puzzle.clues.map((v, s) => (keep.has(s) ? v : FENCE_BLANK)) }
    expect(run({ built: { puzzle: bare, rails: built.rails, signature: fenceSignature(bare) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic field the numbers and posts alone finish', () => {
    let easy: FenceBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawFenceCandidate({ size: 8, rules: 'local', area: [0.4, 0.6], length: 1, rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  }, SLOW)

  it('refuses a field or a pasture the book already has', () => {
    const book = parseFenceBook([fencePageLabel(pasture, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseFenceBook([fencePageLabel(FENCE_PASTURES[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this field/)
  })

  it('refuses squares below the level’s floor, small numbers and a field off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, field: { ...plan.field, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, signSize: 12 } })).toMatch(/below 14 pt/)
    expect(run({ plan: { ...plan, digitSize: 14 } })).toMatch(/below 16 pt/)
  })

  it('catches a drawn page whose numbers or fence do not match', () => {
    const puzzle = buildFencePuzzle({ built, plan, pasture, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkFenceDrawnPage({ puzzle, built, pasture })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkFenceDrawnPage({ puzzle, built: other, pasture }).join(' ')
    expect(errors).toMatch(/numbers/)
    expect(errors).toMatch(/fence/)
    expect(checkFenceDrawnPage({ puzzle, built, pasture: FENCE_PASTURES[5]! }).join(' ')).toMatch(/name the pasture/)
  })
})
