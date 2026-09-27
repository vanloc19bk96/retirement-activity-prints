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
import { tangledYarnTemplate } from './generate'
import { TY_CONFIG_SCHEMA } from './config'
import {
  TY_DEFAULT_TITLE,
  TY_GENTLE_TIP,
  TY_INSTRUCTION,
  TY_LETTERS,
  TY_LEVELS,
  TY_PROJECTS,
  TY_STRAND_WORD,
  TY_TEMPLATE_KEY,
  parseTyBook,
  parseTyLevel,
  pickTyProject,
  tyGridRng,
  tyInstruction,
  tyLetter,
  tyLevelSpec,
  tyPageLabel,
  tySignText,
  type TyLevel,
} from './content'
import { TY_PART_KEY, buildTyPuzzle, tyStrandPoints } from './draw'
import { checkTyDrawnPage, runTyKdpPreflight } from './kdp-preflight'
import { TY_LETTER_MIN, TY_LETTER_ROOM, TY_SIGN_GAP_MIN, planTyPage, tyContentBox, tyLetterReach, tyPanelInBody, tyPrintNote } from './layout'
import { TY_MIN_STRAND, buildTyGrid, draftTyGrid, drawTyCandidate, tyFromStrands, tyRunsClear, tySignature, type TyBuilt } from './puzzle'
import { countTySolutions, isTySolution, pathsOf, solveTy, tyNeighbours, tyPathList, type TyPuzzle } from './solver'

const FONT = 'PT Serif'
const LEVELS = TY_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: TY_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(tangledYarnTemplate),
  showTitle: true,
  title: TY_DEFAULT_TITLE,
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
  return tangledYarnTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[TY_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[TY_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, level: TyLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(tyContentBox(ctx), config, tag, tyInstruction(config, level))
  return tyPanelInBody(header.body, header.objects.length > 0)
}

/**
 * Parse a picture of an answer: each letter is a strand, drawn through the
 * squares it fills. A strand is read from one end (a square with one
 * neighbour of its own letter) to the other.
 */
function gridFrom(rows: string[]): TyBuilt {
  const cols = rows[0]!.length
  const byLetter = new Map<string, number[]>()
  rows.forEach((row, r) => [...row].forEach((ch, c) => byLetter.set(ch, [...(byLetter.get(ch) ?? []), r * cols + c])))
  const strands = [...byLetter.values()].map((cells) => {
    const own = new Set(cells)
    const degree = (i: number) => cells.filter((j) => tyNeighbours(i, j, cols)).length
    const start = cells.find((i) => degree(i) === 1) ?? cells[0]!
    const path = [start]
    while (path.length < cells.length) {
      const next = cells.find((j) => own.has(j) && !path.includes(j) && tyNeighbours(path[path.length - 1]!, j, cols))
      if (next === undefined) break
      path.push(next)
    }
    return path
  })
  const { puzzle, paths } = tyFromStrands(rows.length, cols, strands)
  return { puzzle, paths, signature: tySignature(puzzle) }
}

/** A grid of balls alone: each letter marks a pair's two balls, `.` an open square. */
function ballsFrom(rows: string[]): TyPuzzle {
  const cols = rows[0]!.length
  const numbers = new Map<string, number>()
  const ends: number[] = []
  rows.forEach((row) =>
    [...row].forEach((ch) => {
      if (ch === '.') return ends.push(0)
      if (!numbers.has(ch)) numbers.set(ch, numbers.size + 1)
      ends.push(numbers.get(ch)!)
    }),
  )
  return { rows: rows.length, cols, ends }
}

function builtFor(level: TyLevel, seed = 1): TyBuilt {
  return buildTyGrid({ ...tyLevelSpec(level), rng: tyGridRng({ level, seed, ownerSalt: saltOf(1), attempt: 0 }) })!
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(tangledYarnTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: TY_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(tangledYarnTemplate, { seeds: 12 })

describe('tangled-yarn registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === TY_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(TY_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retire/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(TY_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(TY_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(tangledYarnTemplate).level).toBe('classic')
    expect(parseTyLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parseTyLevel(level)).toBe(level)
  })

  it('adds the starting tip at Gentle only, and drops the how-to when asked', () => {
    expect(tyInstruction(base, 'gentle')).toBe(`${TY_INSTRUCTION} ${TY_GENTLE_TIP}`)
    expect(tyInstruction(base, 'classic')).toBe(TY_INSTRUCTION)
    expect(tyInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('letters every pair a level can hold, with no letter that reads as a digit or another letter', () => {
    const most = Math.max(...TY_LEVELS.map((l) => l.maxPairs))
    expect(TY_LETTERS.length).toBeGreaterThanOrEqual(most)
    expect(new Set(TY_LETTERS).size).toBe(TY_LETTERS.length)
    expect(TY_LETTERS).not.toMatch(/[IOQMW]/)
    expect(tyLetter(1)).toBe('A')
  })

  it('reports square, ball and letter sizes on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = tyPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, yarn balls 0\.\d\d in across, letters at \d+(\.5)? pt\.$/)
      expect(tyPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(tyPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })
})

describe('tangled-yarn rules and solver', () => {
  // A solved 4 × 4: four strands, every square filled.
  const solved = gridFrom(['aaab', 'cccb', 'dbbb', 'dddd'])

  it('reads an answer picture the way it is drawn', () => {
    expect(solved.paths).toHaveLength(4)
    expect(solved.puzzle.ends.filter((k) => k > 0)).toHaveLength(8)
    expect(solved.paths.map((p) => p.length).sort()).toEqual([3, 3, 5, 5])
  })

  it('knows an answer when it sees one, and every way one can be wrong', () => {
    const { puzzle, paths } = solved
    expect(isTySolution(puzzle, paths)).toBe(true)
    // Squares left empty: B takes the short way round.
    const open = ballsFrom(['a.a', 'b..', '..b'])
    expect(isTySolution(open, [[0, 1, 2], [3, 6, 7, 4, 5, 8]])).toBe(true)
    expect(isTySolution(open, [[0, 1, 2], [3, 4, 5, 8]])).toBe(false)
    // Two strands in one square.
    expect(isTySolution(puzzle, paths.map((p, i) => (i === 0 ? [0, 1, 5, 6, 2] : p)))).toBe(false)
    // A strand that jumps a square.
    expect(isTySolution(puzzle, paths.map((p, i) => (i === 0 ? [p[0]!, p[2]!] : p)))).toBe(false)
    // A strand through another pair's ball.
    expect(isTySolution(puzzle, paths.map((p, i) => (i === 0 ? [0, 4, 5, 1, 2] : p)))).toBe(false)
    // A strand that stops short of its partner.
    expect(isTySolution(puzzle, paths.map((p, i) => (i === 0 ? p.slice(0, -1) : p)))).toBe(false)
  })

  it('solves a proven grid step by step, on exactly its answer', () => {
    const result = solveTy(solved.puzzle, 'probe')
    expect(result.solved).toBe(true)
    expect(tyPathList(pathsOf(solved.puzzle, result.state))).toBe(tyPathList(solved.paths))
  })

  it('refuses to guess: a grid with several answers is left unfinished at every level', () => {
    // One pair in opposite corners of a 3 × 3: many ways to fill the rest.
    const corners = ballsFrom(['a..', '...', '..a'])
    expect(countTySolutions(corners, 5)).toBeGreaterThan(1)
    for (const rules of ['basic', 'reach', 'probe'] as const) expect(solveTy(corners, rules).solved).toBe(false)
  })

  it('follows a yarn where counting cannot, and asks "what if" where following cannot', () => {
    let byReach = 0
    let byProbe = 0
    for (let k = 0; k < 400 && (byReach < 3 || byProbe < 3); k++) {
      const draft = draftTyGrid({ rows: 8, cols: 8, minPairs: 8, maxPairs: 11, rng: createRng(31 + k) })
      if (!draft || solveTy(draft.puzzle, 'basic').solved) continue
      const reach = solveTy(draft.puzzle, 'reach')
      if (reach.solved) {
        byReach++
        expect(reach.tally.reach).toBeGreaterThan(0)
      } else {
        const probe = solveTy(draft.puzzle, 'probe')
        if (!probe.solved) continue
        byProbe++
        expect(probe.tally.probe).toBeGreaterThan(0)
      }
    }
    expect(byReach).toBeGreaterThan(0)
    expect(byProbe).toBeGreaterThan(0)
  })

  it('agrees with brute force: every grid the solver finishes has exactly one answer', () => {
    const rng = createRng(2024)
    let finished = 0
    for (const [size, minPairs, maxPairs, rules] of [[5, 4, 6, 'basic'], [6, 5, 7, 'reach'], [6, 5, 7, 'probe'], [7, 6, 9, 'probe']] as const) {
      for (let k = 0; k < 60; k++) {
        const built = drawTyCandidate({ rows: size, cols: size, minPairs, maxPairs, rules, rng })
        if (!built) continue
        finished++
        expect(countTySolutions(built.puzzle, 2), `${size} × ${size} #${k}`).toBe(1)
      }
    }
    expect(finished).toBeGreaterThan(100)
  })

  it('never claims a grid with several answers is solved', () => {
    let ambiguous = 0
    for (let k = 0; k < 2000 && ambiguous < 25; k++) {
      // Balls scattered at random on a small grid.
      const rng = createRng(77 + k)
      const size = rng.int(3, 5)
      const cells = rng.shuffle(Array.from({ length: size * size }, (_, i) => i))
      const pairs = rng.int(1, Math.min(4, Math.floor((size * size) / 4)))
      const ends = new Array<number>(size * size).fill(0)
      for (let p = 0; p < pairs; p++) {
        ends[cells[2 * p]!] = p + 1
        ends[cells[2 * p + 1]!] = p + 1
      }
      const puzzle: TyPuzzle = { rows: size, cols: size, ends }
      if (countTySolutions(puzzle, 2) < 2) continue
      ambiguous++
      for (const rules of ['basic', 'reach', 'probe'] as const) expect(solveTy(puzzle, rules).solved).toBe(false)
    }
    expect(ambiguous).toBeGreaterThan(5)
  })
})

describe('tangled-yarn levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds grids of the level's size and pairs that its own steps finish`, () => {
      const spec = tyLevelSpec(level)
      const signatures = new Set<string>()
      for (let seed = 0; seed < 6; seed++) {
        const built = builtFor(level, seed)
        expect(built.puzzle.rows).toBe(spec.size)
        expect(built.puzzle.cols).toBe(spec.size)
        expect(built.paths.length).toBeGreaterThanOrEqual(spec.minPairs)
        expect(built.paths.length).toBeLessThanOrEqual(spec.maxPairs)
        expect(isTySolution(built.puzzle, built.paths)).toBe(true)
        expect(solveTy(built.puzzle, spec.rules).solved).toBe(true)
        if (spec.beyond) expect(solveTy(built.puzzle, spec.beyond).solved).toBe(false)
        for (const path of built.paths) {
          // No pair of balls side by side, and no strand running beside itself.
          expect(path.length).toBeGreaterThanOrEqual(TY_MIN_STRAND)
          expect(tyNeighbours(path[0]!, path[path.length - 1]!, spec.size)).toBe(false)
          expect(tyRunsClear(path, spec.size)).toBe(true)
        }
        signatures.add(built.signature)
      }
      expect(signatures.size).toBe(6)
    })
  }

  it('makes Gentle a reader’s first grid: counting alone finishes it', () => {
    for (let seed = 0; seed < 6; seed++) expect(solveTy(builtFor('gentle', seed).puzzle, 'basic').solved).toBe(true)
  })

  it('knows a grid however it is turned or mirrored', () => {
    const a = gridFrom(['aaab', 'cccb', 'dbbb', 'dddd'])
    // Mirrored, and flipped corner to corner: the pairs renumber, the fingerprint does not.
    expect(tySignature(gridFrom(['baaa', 'bccc', 'bbbd', 'dddd']).puzzle)).toBe(a.signature)
    expect(tySignature(gridFrom(['acdd', 'acbd', 'acbd', 'bbbd']).puzzle)).toBe(a.signature)
    expect(tySignature(gridFrom(['aaab', 'cccb', 'cbbb', 'dddd']).puzzle)).not.toBe(a.signature)
  })
})

describe('tangled-yarn projects', () => {
  it('names every project once, in retirement words, with no brand, drink or money', () => {
    expect(TY_PROJECTS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(TY_PROJECTS.map((p) => p.id)).size).toBe(TY_PROJECTS.length)
    for (const p of TY_PROJECTS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/)
      expect(p.name).not.toMatch(/beer|wine|whisk|rum|cocktail|margarita|happy hour|pension|money|cash|dollar|old age|senior/i)
      expect(tySignText(p)).toBe(p.name)
    }
  })

  it('breaks a long name between words, as evenly as it can', () => {
    const scarf = TY_PROJECTS.find((p) => p.id === 'sunday-morning-scarf')!
    expect(tySignText(scarf, 2)).toBe('Sunday\nMorning Scarf')
    const market = TY_PROJECTS.find((p) => p.id === 'farmers-market-tote')!
    expect(tySignText(market, 2).split('\n')).toHaveLength(2)
    expect(tySignText(market, 2).replace('\n', ' ')).toBe(market.name)
  })

  it('works through every project before one returns, and never twice running', () => {
    const labels: string[] = []
    for (let page = 0; page < TY_PROJECTS.length + 5; page++) {
      const book = parseTyBook(labels)
      const pick = pickTyProject({ level: 'classic', seed: 300 + page, ownerSalt: saltOf(4), book, recent: [] })
      if (book.length > 0) expect(pick.id).not.toBe(book.at(-1)!.project)
      labels.push(tyPageLabel(pick, 'classic', `sig${page}`))
    }
    expect(new Set(labels.slice(0, TY_PROJECTS.length).map((l) => l.split('|')[0])).size).toBe(TY_PROJECTS.length)
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const pick = (salt: number, recent: string[] = []) => pickTyProject({ level: 'gentle', seed: 5, ownerSalt: saltOf(salt), book: [], recent }).id
    expect(pick(1)).toBe(pick(1))
    expect(new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1))).size).toBeGreaterThan(5)
    const recent = TY_PROJECTS.slice(0, TY_PROJECTS.length - 3).map((p) => p.id)
    for (let salt = 0; salt < 8; salt++) expect(recent).not.toContain(pick(salt, recent))
  })

  it('reads the book’s labels back, ignoring anything that is not a project', () => {
    expect(parseTyBook(['snow-day-mittens|gentle|abc', 'nowhere|classic|x', 'teatime-cozy|odd|def', ''])).toEqual([
      { project: 'snow-day-mittens', level: 'gentle', signature: 'abc' },
      { project: 'teatime-cozy', level: null, signature: 'def' },
    ])
  })
})

describe('tangled-yarn pages', () => {
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
        const letters = partsOf(puzzle!, 'ball-letter')
        expect(letters).toHaveLength(Number(puzzle!.data?.pairs) * 2)
        expect(letters.every((n) => (n.fontSize ?? 0) >= TY_LETTER_MIN)).toBe(true)
        expect(puzzle!.data?.size).toBe(`${tyLevelSpec(level).size}x${tyLevelSpec(level).size}`)
      }
    }
  })

  it('prints squares as large as the trim allows, never below the level’s floor, with room round every letter', () => {
    const big = planTyPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    const small = planTyPage(panelFor(kdpCtx(5.5, 8.5), 'challenging'), 'challenging', FONT)!
    expect(big.cell).toBe(Math.round(0.8 * DPI))
    expect(small.cell).toBeGreaterThanOrEqual(Math.ceil(tyLevelSpec('challenging').minCell))
    for (const plan of [big, small]) {
      expect(tyLetterReach(plan.letterSize)).toBeLessThanOrEqual(plan.ballRadius * TY_LETTER_ROOM)
      expect(plan.ballRadius * 2).toBeLessThan(plan.cell)
    }
  })

  it('breaks the tag between words, and stacks the legend, rather than shrinking the grid on a narrow panel', () => {
    const narrow = { left: 0, top: 0, width: 330, height: 1000 }
    const plan = planTyPage(narrow, 'gentle', FONT)!
    expect(plan.legendRows).toBe(2)
    const built = builtFor('gentle')
    const project = TY_PROJECTS.find((p) => p.id === 'farmers-market-tote')!
    expect(runTyKdpPreflight({ built, plan, level: 'gentle', project, panel: narrow, font: FONT }).errors).toEqual([])
    const puzzle = buildTyPuzzle({ built, plan, project, level: 'gentle', label: 'x', tag, font: FONT })
    expect(checkTyDrawnPage({ puzzle, built, project })).toEqual([])
    const [ballWords, strandWords] = partsOf(puzzle, 'legend-text')
    expect(strandWords!.top).toBeGreaterThan(ballWords!.top)
    const tight = planTyPage({ left: 0, top: 0, width: 230, height: 1000 }, 'gentle', FONT)
    if (tight) expect(tight.signLines === 2 || tight.signSize < plan.signSize).toBe(true)
  })

  it('keeps the tag and the legend clear of the grid', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planTyPage(panelFor(kdpCtx(w, h, 11), level), level, FONT)!
        expect(plan.grid.top - (plan.signBand.top + plan.signBand.height), `${level} ${w}x${h}`).toBeGreaterThanOrEqual(TY_SIGN_GAP_MIN)
        expect(plan.legendTop - (plan.grid.top + plan.grid.height)).toBeGreaterThanOrEqual(18)
      }
    }
    const plan = planTyPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    const crowded = { ...plan, signBand: { ...plan.signBand, top: plan.signBand.top + plan.signGap - 4 } }
    const errors = runTyKdpPreflight({ built: builtFor('classic'), plan: crowded, level: 'classic', project: TY_PROJECTS[0]!, panel: panelFor(kdpCtx(8.5, 11)), font: FONT }).errors
    expect(errors).toContain('The tag crowds the grid.')
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the tag, every ball with its letter and tail, the grid, and a hidden strand for every pair', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, level, signature] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    expect(level).toBe('classic')
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${TY_TEMPLATE_KEY}:${signature}`)
    const project = TY_PROJECTS.find((p) => p.id === id)!
    expect(partsOf(puzzle, 'sign-text')[0]!.text).toBe(tySignText(project))
    const pairs = Number(puzzle.data?.pairs)
    expect(partsOf(puzzle, 'ball')).toHaveLength(pairs * 2)
    expect(partsOf(puzzle, 'ball-tail')).toHaveLength(pairs * 2)
    expect(partsOf(puzzle, 'rule')).toHaveLength(18)
    const letters = partsOf(puzzle, 'ball-letter').map((t) => String(t.text))
    for (let k = 1; k <= pairs; k++) expect(letters.filter((l) => l === tyLetter(k))).toHaveLength(2)
    const strands = partsOf(puzzle, 'strand')
    expect(strands).toHaveLength(pairs)
    expect(strands.every((s) => s.visible === false && s.studioRole === 'answer')).toBe(true)
    expect(partsOf(puzzle, 'legend-strand')[0]!.visible).not.toBe(false)
    expect(partsOf(puzzle, 'legend-text').map((t) => t.text)).toEqual([`Yarn ball (${pairs} pairs)`, TY_STRAND_WORD])
  })

  it('draws every strand on the answer page in black, ball to ball, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThanOrEqual(tyLevelSpec('classic').minPairs)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const strands = partsOf(puzzle, 'strand')
    expect(strands.length).toBe(answers.length)
    expect(strands.every((s) => s.visible === true && s.stroke === STUDIO_INK && s.fill === 'transparent')).toBe(true)
    // Every square is filled: the strands' squares, together, are the whole grid once over.
    const cells = strands.flatMap((s) => String(s.data?.cells).split('.').map(Number))
    expect(cells).toHaveLength(64)
    expect(new Set(cells).size).toBe(64)
    expect(key.some((o) => o.text === TY_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === TY_INSTRUCTION)).toBe(true)
  })

  it('draws a strand through its corners only, from its first ball to its last', () => {
    const plan = planTyPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    // Across two squares, down two, across one: four corners in all.
    const points = tyStrandPoints(plan, 8, [0, 1, 2, 10, 18, 19])
    expect(points).toHaveLength(4)
    expect(points[0]).toEqual([plan.grid.left + plan.cell / 2, plan.grid.top + plan.cell / 2])
  })

  it('builds a book that works through every project before one returns, never printing a grid twice', () => {
    const labels: string[] = []
    for (let page = 0; page < 12; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(12)
    expect(new Set(labels.map((l) => l.split('|')[2])).size).toBe(12)
  })

  it('opens a seller’s next book at projects their last one did not use', () => {
    const recent = TY_PROJECTS.slice(0, 20).map((p) => p.id)
    rememberStudioContent(studioVarietyKey(TY_TEMPLATE_KEY, 'projects'), recent)
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

describe('tangled-yarn preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planTyPage(panel, 'classic', FONT)!
  const built = builtFor('classic', 3)
  const project = TY_PROJECTS[0]!
  const run = (over: Partial<Parameters<typeof runTyKdpPreflight>[0]>) =>
    runTyKdpPreflight({ built, plan, level: 'classic', project, panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven grid', () => {
    expect(run({})).toBe('')
  })

  it('refuses balls that do not match the answer', () => {
    const ends = [...built.puzzle.ends]
    const a = ends.indexOf(1)
    const open = ends.indexOf(0)
    ends[open] = 1
    ends[a] = 0
    expect(run({ built: { ...built, puzzle: { ...built.puzzle, ends } } })).toMatch(/do not match/)
  })

  it('refuses a grid with several answers', () => {
    // Two strands snaking through halves of the grid: each half can be filled many ways.
    const snake = (from: number) =>
      Array.from({ length: 4 }, (_, r) => Array.from({ length: 8 }, (_, c) => (from + r) * 8 + (r % 2 === 0 ? c : 7 - c))).flat()
    const { puzzle, paths } = tyFromStrands(8, 8, [snake(0), snake(4)])
    expect(countTySolutions(puzzle, 2)).toBe(2)
    expect(run({ built: { puzzle, paths, signature: tySignature(puzzle) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic grid that counting alone finishes', () => {
    let easy: TyBuilt | null = null
    for (let k = 0; !easy; k++) {
      easy = drawTyCandidate({ rows: 8, cols: 8, minPairs: 8, maxPairs: 11, rules: 'basic', rng: createRng(5 + k) })
    }
    expect(run({ built: easy })).toMatch(/too easy/)
  })

  it('refuses a project or a grid the book already has', () => {
    const book = parseTyBook([tyPageLabel(project, 'classic', 'other')])
    expect(run({ book })).toMatch(/already uses/)
    const same = parseTyBook([tyPageLabel(TY_PROJECTS[1]!, 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this grid/)
  })

  it('refuses squares below the level’s floor, letters too big for their balls, and a grid off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    expect(run({ plan: { ...plan, ballRadius: 10 } })).toMatch(/too big for their yarn balls/)
    const off = { ...plan, grid: { ...plan.grid, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area/)
  })

  it('catches a drawn page whose balls, letters or strands do not match', () => {
    const puzzle = buildTyPuzzle({ built, plan, project, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkTyDrawnPage({ puzzle, built, project })).toEqual([])
    expect(checkTyDrawnPage({ puzzle, built: builtFor('classic', 4), project }).length).toBeGreaterThan(0)
    const rerouted: TyBuilt = { ...built, paths: built.paths.map((p, i) => (i === 0 ? [...p].reverse() : p)) }
    expect(checkTyDrawnPage({ puzzle, built: rerouted, project }).join(' ')).toMatch(/off its squares/)
    expect(checkTyDrawnPage({ puzzle, built, project: TY_PROJECTS[5]! }).join(' ')).toMatch(/tag/)
  })
})
