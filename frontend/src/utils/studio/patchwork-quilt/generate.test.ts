import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK, STUDIO_PAPER, STUDIO_SAFE_AREA_PADDING_X } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent, rememberStudioContent, studioVarietyKey } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { drawHeader } from '../studio-layout'
import { patchworkQuiltTemplate } from './generate'
import { PQ_CONFIG_SCHEMA } from './config'
import {
  PQ_DEFAULT_TITLE,
  PQ_GENTLE_TIP,
  PQ_INSTRUCTION,
  PQ_LEVELS,
  PQ_QUILTS,
  PQ_TEMPLATE_KEY,
  parsePqBook,
  parsePqLevel,
  pickPqQuilt,
  pqInstruction,
  pqLevelSpec,
  pqPageLabel,
  pqQuiltRng,
  pqSignText,
  type PqLevel,
} from './content'
import { PQ_FABRICS, PQ_PART_KEY, buildPqPuzzle, pqButtonRadius, pqPatchFabrics, pqSeamRuns } from './draw'
import { checkPqDrawnPage, runPqKdpPreflight } from './kdp-preflight'
import { PQ_NUMBER_MIN, PQ_SIGN_GAP_MIN, planPqPage, pqContentBox, pqPanelInBody, pqPrintNote } from './layout'
import { PQ_MIN_PATCH, buildPqQuilt, drawPqCandidate, drawPqPatches, pqFromPatches, pqMeetsLevel, pqPatchMap, pqSignature, type PqBuilt } from './puzzle'
import { countPqSolutions, isPqSolution, pqAnswerKey, pqRectSquares, pqWaysFor, pqWellFormed, solvePq, type PqPuzzle, type PqRect } from './solver'

const FONT = 'PT Serif'
/** Tests that piece many quilts: generous room when the whole suite runs at once. */
const SLOW = 60_000
const LEVELS = PQ_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: PQ_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(patchworkQuiltTemplate),
  showTitle: true,
  title: PQ_DEFAULT_TITLE,
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
  return patchworkQuiltTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[PQ_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[PQ_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: PqLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(pqContentBox(ctx), config, tag, pqInstruction(config, level))
  return pqPanelInBody(header.body, header.objects.length > 0)
}

/**
 * A quilt from a picture: each letter is a patch, and the number in `numbers`
 * (a digit, or `.` for none) prints in that square.
 */
function quiltFrom(patchRows: string[], numberRows: string[]): { puzzle: PqPuzzle; patches: PqRect[] } {
  const n = patchRows.length
  const boxes = new Map<string, PqRect>()
  patchRows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const box = boxes.get(ch)
      if (!box) boxes.set(ch, { row: r, col: c, height: 1, width: 1 })
      else {
        box.height = Math.max(box.height, r - box.row + 1)
        box.width = Math.max(box.width, c - box.col + 1)
      }
    }),
  )
  const ats: number[] = []
  const patches: PqRect[] = []
  numberRows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (ch === '.') return
      patches.push(boxes.get(patchRows[r]![c]!)!)
      ats.push(r * n + c)
    }),
  )
  return pqFromPatches(n, patches, ats)
}

function builtFor(level: PqLevel, seed = 1): PqBuilt {
  return buildPqQuilt({ ...pqLevelSpec(level), rng: pqQuiltRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

/** The toy quilt the rules tests use: five patches on a 4 × 4, one answer. */
const TOY = quiltFrom(['AABB', 'CCBB', 'CCDD', 'EEDD'], ['2..4', '....', '4...', '...4'])

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(patchworkQuiltTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: PQ_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(patchworkQuiltTemplate, { seeds: 12 })

describe('patchwork-quilt registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === PQ_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(PQ_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(PQ_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(PQ_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(patchworkQuiltTemplate).level).toBe('classic')
    expect(parsePqLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parsePqLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(pqInstruction(base, 'gentle')).toBe(`${PQ_INSTRUCTION} ${PQ_GENTLE_TIP}`)
    expect(pqInstruction(base, 'classic')).toBe(PQ_INSTRUCTION)
    expect(pqInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports the square and number size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24 + STUDIO_SAFE_AREA_PADDING_X, bottom: 24, left: 36 + STUDIO_SAFE_AREA_PADDING_X } })
    for (const level of LEVELS) {
      const note = pqPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the quilt \d\.\d\d in across, numbers \d+(\.5)? pt\.$/)
      expect(pqPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(pqPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('patchwork-quilt rules and solver', () => {
  it('reads a quilt picture the way it is drawn', () => {
    expect(TOY.puzzle.size).toBe(4)
    expect(TOY.puzzle.clues.map((c) => c.size)).toEqual([2, 4, 4, 4])
    // E has no number in the picture: the numbers add up short.
    expect(pqWellFormed(TOY.puzzle)).toBe(false)
    const whole = quiltFrom(['AABB', 'CCBB', 'CCDD', 'EEDD'], ['2..4', '....', '4...', '2..4'])
    expect(pqWellFormed(whole.puzzle)).toBe(true)
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    const { puzzle, patches } = quiltFrom(['AABB', 'CCBB', 'CCDD', 'EEDD'], ['2..4', '....', '4...', '2..4'])
    expect(isPqSolution(puzzle, patches)).toBe(true)
    // A patch the wrong size for its number.
    expect(isPqSolution(puzzle, patches.map((p, k) => (k === 0 ? { ...p, width: 1 } : p)))).toBe(false)
    // Two patches overlapping (and a square left bare).
    expect(isPqSolution(puzzle, patches.map((p, k) => (k === 0 ? { row: 0, col: 1, height: 1, width: 2 } : p)))).toBe(false)
    // A patch that misses its own number.
    const swapped = quiltFrom(['AABB', 'CCBB', 'CCDD', 'EEDD'], ['2..4', '....', '4...', '2..4'])
    expect(isPqSolution(swapped.puzzle, [swapped.patches[1]!, swapped.patches[0]!, ...swapped.patches.slice(2)])).toBe(false)
    // A patch holding a second number.
    const crowded: PqPuzzle = { size: 2, clues: [{ at: 0, size: 2 }, { at: 1, size: 2 }] }
    expect(isPqSolution(crowded, [{ row: 0, col: 0, height: 1, width: 2 }, { row: 1, col: 0, height: 1, width: 2 }])).toBe(false)
  })

  it('lists every way a number’s patch can lie round it, holding no other number', () => {
    const { puzzle } = quiltFrom(['AABB', 'CCBB', 'CCDD', 'EEDD'], ['2..4', '....', '4...', '2..4'])
    // The 2 in the corner: across or down.
    expect(pqWaysFor(puzzle, 0)).toHaveLength(2)
    for (let k = 0; k < puzzle.clues.length; k++) {
      for (const way of pqWaysFor(puzzle, k)) {
        const squares = pqRectSquares(way, puzzle.size)
        expect(squares).toContain(puzzle.clues[k]!.at)
        expect(squares).toHaveLength(puzzle.clues[k]!.size)
        expect(puzzle.clues.filter((c, j) => j !== k && squares.includes(c.at))).toEqual([])
      }
    }
  })

  it('solves a proven quilt step by step, on exactly its answer', () => {
    const built = drawPqCandidate({ size: 7, maxPatch: 8, maxSide: 4, rules: 'basic', rng: createRng(3) }) ?? builtFor('gentle', 3)
    const result = solvePq(built.puzzle, 'block')
    expect(result.solved).toBe(true)
    expect(pqAnswerKey(result.rects as PqRect[])).toBe(pqAnswerKey(built.patches))
  })

  it('refuses to guess: a quilt with several answers is left unfinished at every level', () => {
    // Two 2s side by side on a 2 × 2: both across or both down.
    const square: PqPuzzle = { size: 2, clues: [{ at: 0, size: 2 }, { at: 3, size: 2 }] }
    expect(countPqSolutions(square, 5)).toBe(2)
    for (const rules of ['basic', 'reach', 'block'] as const) expect(solvePq(square, rules).solved).toBe(false)
  })

  it('needs "only one number reaches it" at Classic, and "would it block" at Challenging', () => {
    const classic = builtFor('classic', 2)
    expect(solvePq(classic.puzzle, 'basic').solved).toBe(false)
    const reached = solvePq(classic.puzzle, 'reach')
    expect(reached.solved).toBe(true)
    expect(reached.tally.reach).toBeGreaterThan(0)
    const challenging = builtFor('challenging', 2)
    expect(solvePq(challenging.puzzle, 'reach').solved).toBe(false)
    const blocked = solvePq(challenging.puzzle, 'block')
    expect(blocked.solved).toBe(true)
    expect(blocked.tally.block).toBeGreaterThan(0)
  }, SLOW)

  it('agrees with brute force: every quilt the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, maxPatch, rules] of [[5, 6, 'basic'], [6, 8, 'reach'], [7, 8, 'block'], [8, 12, 'reach'], [9, 12, 'block']] as const) {
      for (let k = 0; k < 30; k++) {
        const built = drawPqCandidate({ size, maxPatch, maxSide: 6, rules, rng })
        if (!built) continue
        finished++
        expect(countPqSolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(60)
  }, SLOW)

  it('never claims a quilt with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 600 && ambiguous < 40; k++) {
      // Patches cut at random, numbers dropped at random, never moved to one answer.
      const rng = createRng(77 + k)
      const size = rng.int(4, 8)
      const patches = drawPqPatches(size, rng, 9, 5)
      if (!patches) continue
      const ats = patches.map((rect) => (rect.row + rng.int(0, rect.height - 1)) * size + rect.col + rng.int(0, rect.width - 1))
      const { puzzle } = pqFromPatches(size, patches, ats)
      if (countPqSolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'reach', 'block'] as const) expect(solvePq(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(20)
  }, SLOW)

  it('cuts the whole quilt into patches of two squares or more, within the level’s limits', () => {
    for (let seed = 0; seed < 30; seed++) {
      const patches = drawPqPatches(9, createRng(seed), 12, 6)
      if (!patches) continue
      const map = pqPatchMap(9, patches)
      expect(map.includes(-1)).toBe(false)
      expect(patches.reduce((sum, p) => sum + p.height * p.width, 0)).toBe(81)
      for (const p of patches) {
        expect(p.height * p.width).toBeGreaterThanOrEqual(PQ_MIN_PATCH)
        expect(p.height * p.width).toBeLessThanOrEqual(12)
        expect(Math.max(p.height, p.width)).toBeLessThanOrEqual(6)
      }
    }
  })
})

describe('patchwork-quilt levels', () => {
  for (const level of LEVELS) {
    it(`${level}: pieces quilts of the level's size that its own steps finish`, () => {
      const spec = pqLevelSpec(level)
      const signatures = new Set<string>()
      const seeds = 5
      for (let seed = 0; seed < seeds; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.size).toBe(spec.size)
        expect(pqWellFormed(built.puzzle)).toBe(true)
        expect(isPqSolution(built.puzzle, built.patches)).toBe(true)
        expect(countPqSolutions(built.puzzle, 2)).toBe(1)
        expect(pqMeetsLevel(built.puzzle, built.patches, spec)).toBe(true)
        expect(solvePq(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solvePq(built.puzzle, spec.beyond).solved).toBe(false)
        for (const clue of built.puzzle.clues) {
          expect(clue.size).toBeGreaterThanOrEqual(PQ_MIN_PATCH)
          expect(clue.size).toBeLessThanOrEqual(spec.maxPatch)
        }
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(seeds)
    }, SLOW)
  }

  it('makes Gentle a reader’s first quilt: laying one number at a time finishes it', () => {
    for (let seed = 0; seed < 5; seed++) expect(solvePq(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  }, SLOW)

  it('knows a quilt however it is turned or mirrored', () => {
    const a: PqPuzzle = { size: 3, clues: [{ at: 0, size: 3 }, { at: 5, size: 2 }, { at: 7, size: 4 }] }
    // Mirrored left to right: (r, c) → (r, 2 − c).
    const mirrored: PqPuzzle = { size: 3, clues: [{ at: 2, size: 3 }, { at: 3, size: 2 }, { at: 7, size: 4 }] }
    // Turned a quarter clockwise: (r, c) → (c, 2 − r).
    const turned: PqPuzzle = { size: 3, clues: [{ at: 2, size: 3 }, { at: 7, size: 2 }, { at: 3, size: 4 }] }
    expect(pqSignature(mirrored)).toBe(pqSignature(a))
    expect(pqSignature(turned)).toBe(pqSignature(a))
    expect(pqSignature({ size: 3, clues: [{ at: 0, size: 3 }, { at: 4, size: 2 }, { at: 7, size: 4 }] })).not.toBe(pqSignature(a))
  })
})

describe('patchwork-quilt quilts', () => {
  it('names every quilt once, in retirement words, with no brand, drink or money', () => {
    expect(PQ_QUILTS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(PQ_QUILTS.map((q) => q.id)).size).toBe(PQ_QUILTS.length)
    for (const q of PQ_QUILTS) {
      expect(q.id).toMatch(/^[a-z0-9-]+$/)
      expect(q.name).not.toMatch(/beer|wine|whisk|rum\b|cocktail|margarita|happy hour|drunk|pension|money|cash|dollar|old age|senior/i)
      expect(pqSignText(q)).toBe(q.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const party = PQ_QUILTS.find((q) => q.id === 'farewell-party-quilt')!
    expect(pqSignText(party, 2)).toBe('Farewell\nParty Quilt')
    const world = PQ_QUILTS.find((q) => q.id === 'trip-around-the-world')!
    expect(pqSignText(world, 2).split('\n')).toHaveLength(2)
    expect(pqSignText(world, 2).replace('\n', ' ')).toBe(world.name)
  })

  it('works through every quilt before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < PQ_QUILTS.length + 5; page++) {
      const book = parsePqBook(labels)
      const pick = pickPqQuilt({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.quilt)
      labels.push(pqPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, PQ_QUILTS.length).map((l) => l.split('|')[0])).size).toBe(PQ_QUILTS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickPqQuilt({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = PQ_QUILTS.slice(0, PQ_QUILTS.length - 3).map((q) => q.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a quilt', () => {
    expect(parsePqBook(['log-cabin-quilt|gentle|abc', 'nowhere|classic|x', 'memory-quilt|odd|def', ''])).toEqual([
      { quilt: 'log-cabin-quilt', level: 'gentle', signature: 'abc' },
      { quilt: 'memory-quilt', level: null, signature: 'def' },
    ])
  })
})

describe('patchwork-quilt pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print quilt on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const ctx = kdpCtx(w, h, 11)
        const pages = generate({ ...base, level, seed: 11 }, ctx)
        expect(pages).toHaveLength(1)
        const puzzle = puzzleOf(pages[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(pages[0]!.objects, ctx)
        const size = pqLevelSpec(level).size
        expect(puzzle!.data?.size).toBe(`${size}x${size}`)
        const numbers = partsOf(puzzle!, 'number')
        expect(numbers.length).toBe(partsOf(puzzle!, 'fabric').length)
        expect(numbers.every((t) => Number(t.fontSize) >= PQ_NUMBER_MIN)).toBe(true)
      }
    }
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor', () => {
    const big = planPqPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planPqPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(pqLevelSpec('challenging').minCell))
    expect(small.numberSize).toBeGreaterThanOrEqual(PQ_NUMBER_MIN)
  })

  it('keeps a two-digit number and its button inside its square at the smallest squares', () => {
    const plan = planPqPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(pqButtonRadius(18, plan.numberSize, plan.cell) * 2).toBeLessThan(plan.cell)
    expect(pqButtonRadius(18, plan.numberSize, plan.cell) * 2).toBeGreaterThan(plan.numberSize)
  })

  it('stacks the legend rather than shrinking the quilt on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 340, height: 1000 }
    const plan = planPqPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const quilt = PQ_QUILTS.find((q) => q.id === 'farewell-party-quilt')!
    expect(runPqKdpPreflight({ built, plan, level: 'gentle', quilt, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildPqPuzzle({ built, plan, quilt, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkPqDrawnPage({ puzzle, built, quilt })).toEqual([])
    const [sampleWords, patchWords] = partsOf(puzzle, 'legend-text')
    expect(patchWords!.top).toBeGreaterThan(sampleWords!.top)
    // The quilt takes the whole width; only the legend gives way.
    expect(plan.cell).toBe(Math.floor(340 / 7))
  })

  it('keeps the label and the legend clear of the quilt', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planPqPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(PQ_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planPqPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runPqKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', quilt: PQ_QUILTS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The label crowds the quilt.')
  }, SLOW)

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the label, the ruled quilt in its binding, the numbers, and the sewn quilt hidden', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${PQ_TEMPLATE_KEY}:${signature}`)
    const quilt = PQ_QUILTS.find((q) => q.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(pqSignText(quilt))
    // The label's inner rule is a running stitch.
    expect(partsOf(puzzle, 'sign').some((s) => Array.isArray(s.strokeDashArray))).toBe(true)
    expect(partsOf(puzzle, 'rule')).toHaveLength(20)
    expect(partsOf(puzzle, 'frame')).toHaveLength(4)
    const numbers = partsOf(puzzle, 'number')
    expect(numbers.every((t) => t.visible !== false && t.fontWeight === 700)).toBe(true)
    const hidden = ['fabric', 'seam', 'button'].flatMap((name) => partsOf(puzzle, name))
    expect(hidden.length).toBeGreaterThan(numbers.length * 2)
    expect(hidden.every((o) => o.visible === false && o.studioRole === 'answer' && o.type === 'path')).toBe(true)
    expect(partsOf(puzzle, 'fabric').every((f) => PQ_FABRICS.some((fabric) => fabric.fill === f.fill && fabric.name === f.data?.fabric))).toBe(true)
    // Plain fabrics only: no prints or stitching on the answer page.
    expect(partsOf(puzzle, 'print')).toHaveLength(0)
    expect(partsOf(puzzle, 'stitch')).toHaveLength(0)
    const texts = partsOf(puzzle, 'legend-text').map((t) => t.text)
    expect(texts).toEqual(['= 2 squares', `${numbers.length} patches`])
  })

  it('seams every stretch where two patches meet, and cuts no two neighbours from one fabric', () => {
    //  A A B
    //  C C B
    //  C C B
    const patches: PqRect[] = [
      { row: 0, col: 0, height: 1, width: 2 },
      { row: 0, col: 2, height: 3, width: 1 },
      { row: 1, col: 0, height: 2, width: 2 },
    ]
    const { across, down } = pqSeamRuns(3, pqPatchMap(3, patches))
    // [line, from, to]: column line 2 seams all three rows; row line 1 seams the first two columns.
    expect(down).toEqual([[2, 0, 3]])
    expect(across).toEqual([[1, 0, 2]])
    for (let seed = 0; seed < 5; seed++) {
      const { puzzle, patches: sewn } = builtFor('classic', seed)
      const n = puzzle.size
      const fabrics = pqPatchFabrics(n, sewn)
      const map = pqPatchMap(n, sewn)
      for (let i = 0; i < n * n; i++) {
        if (i % n < n - 1 && map[i] !== map[i + 1]) expect(fabrics[map[i]!]).not.toBe(fabrics[map[i + 1]!])
        if (i + n < n * n && map[i] !== map[i + n]) expect(fabrics[map[i]!]).not.toBe(fabrics[map[i + n]!])
      }
      expect(Math.max(...fabrics)).toBeLessThan(PQ_FABRICS.length)
      expect(new Set(fabrics).size).toBeGreaterThanOrEqual(3)
    }
  }, SLOW)

  it('sews the whole quilt on the answer page in black and grays, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(0)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const fabrics = partsOf(puzzle, 'fabric')
    const numbers = partsOf(puzzle, 'number')
    expect(fabrics.length).toBe(numbers.length)
    // Fabrics keep their grays (a revealed rect would have been inked solid black).
    expect(fabrics.every((f) => f.visible === true && PQ_FABRICS.some((fabric) => fabric.fill === f.fill))).toBe(true)
    expect(partsOf(puzzle, 'seam').every((s) => s.visible === true && s.fill === STUDIO_INK)).toBe(true)
    expect(partsOf(puzzle, 'button').every((b) => b.visible === true && b.fill === STUDIO_PAPER && b.stroke === STUDIO_INK)).toBe(true)
    // The patches on the key are a finished quilt for the page's numbers.
    const n = 9
    const clues = numbers
      .map((t) => ({ at: Number(t.data?.row) * n + Number(t.data?.col), size: Number(t.text) }))
      .sort((a, b) => a.at - b.at)
    const rects = fabrics.map((f) => ({ row: Number(f.data?.row), col: Number(f.data?.col), height: Number(f.data?.height), width: Number(f.data?.width) }))
    const ordered = clues.map((c) => rects.find((r) => pqRectSquares(r, n).includes(c.at))!)
    expect(isPqSolution({ size: n, clues }, ordered)).toBe(true)
    // Every number prints on top of its own button.
    const children = puzzle.objects!
    children.forEach((o, i) => {
      if (o.data?.[PQ_PART_KEY] !== 'number') return
      const under = children[i - 1]!
      expect(under.data?.[PQ_PART_KEY]).toBe('button')
      expect([under.data?.row, under.data?.col]).toEqual([o.data?.row, o.data?.col])
    })
    expect(key.some((o) => o.text === PQ_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === PQ_INSTRUCTION)).toBe(true)
  })

  it('builds a book that works through every quilt before one returns, never printing a quilt twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  }, SLOW)

  it('opens a seller’s next book at quilts their last one did not use', () => {
    const recent = PQ_QUILTS.slice(0, 20).map((q) => q.id)
    rememberStudioContent(studioVarietyKey(PQ_TEMPLATE_KEY, 'quilts'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    const [id] = String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(recent).not.toContain(id)
  })

  it('reprints the same page for the same seller and seed, and a different quilt for another seller', () => {
    const label = (salt?: string) => {
      clearStudioRecentContent()
      return String(puzzleOf(generate(base, kdpCtx(8.5, 11, 9, [], salt))[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    expect(label(saltOf(1)).split('|')[2]).not.toBe(label(saltOf(2)).split('|')[2])
  })
})

describe('patchwork-quilt preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planPqPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const quilt = PQ_QUILTS[0]!
  const run = (over: Partial<Parameters<typeof runPqKdpPreflight>[0]>) =>
    runPqKdpPreflight({ built, plan, level: 'classic', quilt, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven quilt', () => {
    expect(run({})).toBe('')
  })

  it('refuses an answer that breaks a rule', () => {
    // Two patches swapped: each misses its own number.
    const patches = [built.patches[1]!, built.patches[0]!, ...built.patches.slice(2)]
    expect(run({ built: { ...built, patches } })).toMatch(/breaks a rule/)
  })

  it('refuses a quilt with several answers', () => {
    // Pairs of 2s corner to corner in every 2 × 2 block: each pair lies across or down.
    const size = 9
    const patches: PqRect[] = [{ row: 0, col: 8, height: 8, width: 1 }, { row: 8, col: 0, height: 1, width: 9 }]
    const ats: number[] = [8, 72]
    for (let r = 0; r < 8; r += 2) {
      for (let c = 0; c < 8; c += 2) {
        patches.push({ row: r, col: c, height: 1, width: 2 }, { row: r + 1, col: c, height: 1, width: 2 })
        ats.push(r * size + c, (r + 1) * size + c + 1)
      }
    }
    const made = pqFromPatches(size, patches, ats)
    expect(countPqSolutions(made.puzzle, 2)).toBe(2)
    expect(run({ built: { ...made, signature: pqSignature(made.puzzle) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic quilt that laying one number at a time finishes', () => {
    let easy: PqBuilt | null = null
    for (let k = 0; !easy; k++) easy = drawPqCandidate({ size: 9, maxPatch: 12, maxSide: 6, rules: 'basic', rng: createRng(5 + k) })
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a patch of one square', () => {
    const size = 9
    const patches: PqRect[] = [{ row: 0, col: 0, height: 1, width: 1 }, { row: 0, col: 1, height: 1, width: 8 }]
    const ats = [0, 1]
    for (let r = 1; r < size; r++) {
      patches.push({ row: r, col: 0, height: 1, width: 9 })
      ats.push(r * size)
    }
    const made = pqFromPatches(size, patches, ats)
    expect(run({ built: { ...made, signature: pqSignature(made.puzzle) } })).toMatch(/single square/)
  })

  it('refuses a quilt or a name the book already has', () => {
    const book = parsePqBook([pqPageLabel(quilt, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parsePqBook([pqPageLabel(PQ_QUILTS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this quilt/)
  })

  it('refuses squares below the level’s floor and a quilt off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
    expect(run({ plan: { ...plan, numberSize: 12 } })).toMatch(/below 16 pt/)
  })

  it('catches a drawn page whose numbers, patches or seams do not match', () => {
    const puzzle = buildPqPuzzle({ built, plan, quilt, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkPqDrawnPage({ puzzle, built, quilt })).toEqual([])
    const other = builtFor('classic', 4)
    const errors = checkPqDrawnPage({ puzzle, built: other, quilt }).join(' ')
    expect(errors).toMatch(/numbers/)
    expect(errors).toMatch(/seams|patches/)
    expect(checkPqDrawnPage({ puzzle, built, quilt: PQ_QUILTS[5]! }).join(' ')).toMatch(/label/)
  })
})
