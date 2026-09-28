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
import { assertGeneratorEntropy, runGeneratorContractTests } from '../studio-generator-test'
import { drawHeader } from '../studio-layout'
import { photoAlbumTemplate } from './generate'
import { PA_CONFIG_SCHEMA } from './config'
import {
  PA_CAPTION_PROMPT,
  PA_DEFAULT_TITLE,
  PA_GENTLE_TIP,
  PA_HOW_TO,
  PA_LEGEND_BLOCK,
  PA_LEGEND_NUMBER,
  PA_LEVELS,
  PA_TEMPLATE_KEY,
  isValidPaDesign,
  paBitmap,
  paDesign,
  paGridRng,
  paInstruction,
  paLevelPictures,
  paLevelSpec,
  paPageLabel,
  parsePaBook,
  parsePaLevel,
  paPictureById,
  pickPaDesign,
  type PaLevel,
} from './content'
import { PA_PICTURES, PA_PICTURES_BY_LEVEL } from './pictures'
import { PA_PART_KEY, buildPaPuzzle, paCornerPoints, paRuns } from './draw'
import { PA_SHADE_MAX, PA_SHADE_MIN, checkPaDrawnPage, runPaKdpPreflight } from './kdp-preflight'
import {
  PA_CORNER_CLEAR,
  PA_DIGIT_MIN,
  PA_LEGEND_GAP,
  PA_NAME_SIZE,
  paContentBox,
  paCornerClearance,
  paDigitAir,
  paDigitAirNeeded,
  paPanelInBody,
  paPrintNote,
  paTextSpec,
  paTextWidth,
  planPaPage,
} from './layout'
import { buildPaGrid, growPaClues, paClueCount, paHardSteps, paSignature, type PaBuilt } from './puzzle'
import { PA_OPEN, PA_SHADED, PaSolver, countPaSolutions, isPaSolution, paBitmapText, paBlock, paCellsText, paCountsOf, paSolutions, paWellFormed, solvePa, type PaPuzzle } from './solver'

const FONT = 'PT Serif'
/** Tests that build many grids: generous room when the whole suite runs at once. */
const SLOW = 180_000
const LEVELS = PA_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')
const tag = { templateKey: PA_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }

const base: StudioConfig = {
  ...buildDefaultConfig(photoAlbumTemplate),
  showTitle: true,
  title: PA_DEFAULT_TITLE,
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
  return photoAlbumTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[PA_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[PA_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

const labelOf = (objects: StudioFabricObject[]) => String(puzzleOf(objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])

function panelFor(ctx: StudioGenerateContext, level: PaLevel = 'classic', config: StudioConfig = base) {
  const header = drawHeader(paContentBox(ctx), config, tag, paInstruction(config, level))
  return paPanelInBody(header.body, header.objects.length > 0)
}

/** A grid from rows of numbers and dots ("0.2" …), for hand-made cases. */
function gridFrom(rows: string[]): PaPuzzle {
  return { width: rows[0]!.length, height: rows.length, clues: rows.join('').split('').map((ch) => (ch === '.' ? -1 : Number(ch))) }
}

const bitmapFrom = (rows: string[]) => rows.join('').split('').map((ch) => ch === '#')

function builtFor(level: PaLevel, index = 0, seed = 1): { built: PaBuilt; design: ReturnType<typeof paDesign> } {
  const design = paDesign(paLevelPictures(level)[index]!, false)
  for (let attempt = 0; ; attempt++) {
    const built = buildPaGrid({ ...paLevelSpec(level), bitmap: design.bitmap, width: design.size, height: design.size, rng: paGridRng({ level, seed, ownerSalt: saltOf(1), picture: design.picture.id, attempt }) })
    if (built) return { built, design }
  }
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(photoAlbumTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: PA_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(photoAlbumTemplate, { seeds: 12 })

describe('photo-album registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === PA_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(PA_DEFAULT_TITLE)
    expect(found[0]!.description).toMatch(/retiree/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(PA_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(PA_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(photoAlbumTemplate).level).toBe('classic')
    expect(parsePaLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parsePaLevel(level)).toBe(level)
  })

  it('explains the block of nine, adds the tip at Gentle only, and drops it all when asked', () => {
    expect(PA_HOW_TO).toMatch(/block of nine/)
    expect(PA_HOW_TO).not.toMatch(/—/)
    expect(paInstruction(base, 'gentle')).toBe(`${PA_HOW_TO}\n${PA_GENTLE_TIP}`)
    expect(paInstruction(base, 'classic')).toBe(PA_HOW_TO)
    expect(paInstruction({ ...base, showInstructions: false }, 'gentle')).toBe('')
  })

  it('reports how many snapshots and the square size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = paPrintNote({ page: layout(8.5, 11), config: base, level, font: FONT })
      expect(note).toMatch(new RegExp(`^${paLevelPictures(level).length} hand-drawn snapshots`))
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/Squares print 0\.\d\d in, the grid \d\.\d\d in across, numbers \d+(\.5)? pt\.$/)
      expect(paPrintNote({ page: layout(3, 4), config: base, level, font: FONT })).toMatch(/too small/)
    }
    expect(paPrintNote({ config: base, level: 'classic', font: FONT })).toMatch(/one answer/)
  })

  it('counts its pictures in the description', () => {
    expect(photoAlbumTemplate.description).toMatch(/Forty-nine hand-drawn pictures/)
    expect(PA_PICTURES).toHaveLength(49)
  })
})

describe('photo-album rules and solver', () => {
  it('knows a block of nine, and fewer at the edge', () => {
    expect(paBlock(4, 4, 0)).toEqual([0, 1, 4, 5])
    expect(paBlock(4, 4, 5)).toHaveLength(9)
    expect(paBlock(4, 4, 7)).toHaveLength(6)
  })

  it('counts a picture, and knows an answer when it sees one', () => {
    const bitmap = bitmapFrom(['#..', '##.', '...'])
    expect(paCountsOf(bitmap, 3, 3)).toEqual([3, 3, 1, 3, 3, 1, 2, 2, 1])
    const p: PaPuzzle = { width: 3, height: 3, clues: [3, -1, -1, -1, 3, -1, -1, -1, 1] }
    expect(isPaSolution(p, bitmap)).toBe(true)
    expect(isPaSolution(p, bitmapFrom(['.#.', '##.', '...']))).toBe(true)
    expect(isPaSolution(p, bitmapFrom(['...', '.#.', '...']))).toBe(false)
  })

  it('refuses a badly formed grid', () => {
    expect(paWellFormed(gridFrom(['00', '00']))).toBe(true)
    expect(paWellFormed(gridFrom(['50', '00']))).toBe(false)
    expect(paWellFormed({ width: 2, height: 2, clues: [0, 0, 0] })).toBe(false)
    expect(paWellFormed(gridFrom(['9']))).toBe(false)
  })

  it('takes the first steps: a full block blanks the rest, a block with just enough room shades it', () => {
    // A 0 blanks its corner; the 4 in the corner of a 2 × 2 shades everything.
    expect(paCellsText(solvePa(gridFrom(['0.', '..']), 'basic').cells)).toBe('....')
    expect(paCellsText(solvePa(gridFrom(['4.', '..']), 'basic').cells)).toBe('####')
    const partial = solvePa(gridFrom(['1.', '..']), 'basic')
    expect(partial.solved).toBe(false)
    expect(paCellsText(partial.cells)).toBe('????')
  })

  it('reads two overlapping numbers together where one alone is stuck', () => {
    const p = gridFrom(['..3', '563', '3.2'])
    expect(solvePa(p, 'basic').solved).toBe(false)
    const pairs = solvePa(p, 'pairs')
    expect(pairs.solved).toBe(true)
    expect(pairs.tally.pairs).toBeGreaterThan(0)
    expect(paSolutions(p, 2)).toEqual([paCellsText(pairs.cells)])
  })

  it('tries "what if" where overlapping numbers are stuck too', () => {
    const p = gridFrom(['1.1', '13.', '.1.'])
    expect(solvePa(p, 'pairs').solved).toBe(false)
    const probe = solvePa(p, 'probe')
    expect(probe.solved).toBe(true)
    expect(probe.tally.probe).toBeGreaterThan(0)
    expect(paCellsText(probe.cells)).toBe('#.#.....#')
    expect(paSolutions(p, 2)).toEqual(['#.#.....#'])
  })

  it('refuses to guess: a grid with several answers is left unfinished at every level', () => {
    // A lone 1 in a 2 × 2: any of four squares.
    const p = gridFrom(['1.', '..'])
    expect(countPaSolutions(p, 5)).toBe(4)
    for (const rules of ['basic', 'pairs', 'probe'] as const) expect(solvePa(p, rules).solved).toBe(false)
  })

  it('finds a grid with no answer broken', () => {
    expect(solvePa(gridFrom(['0', '4'].map((r) => r + '.')), 'basic').broken).toBe(true)
    expect(countPaSolutions(gridFrom(['0.', '4.']), 2)).toBe(0)
  })

  it('agrees with a plain search: every grid the solver finishes has exactly one answer', () => {
    const rng = createRng(11)
    let finished = 0
    for (let t = 0; t < 400; t++) {
      const w = rng.int(3, 5)
      const h = rng.int(3, 5)
      const bitmap = Array.from({ length: w * h }, () => rng.chance(0.45))
      const counts = paCountsOf(bitmap, w, h)
      const p: PaPuzzle = { width: w, height: h, clues: counts.map((v) => (rng.chance(0.55) ? v : -1)) }
      const solutions = paSolutions(p, 2)
      for (const rules of ['basic', 'pairs', 'probe'] as const) {
        const s = solvePa(p, rules)
        expect(s.broken).toBe(false)
        if (s.solved) {
          finished++
          expect(solutions).toEqual([paCellsText(s.cells)])
        }
      }
    }
    expect(finished).toBeGreaterThan(100)
  })

  it('never marks a square the answer disagrees with, even when it cannot finish', () => {
    const rng = createRng(5)
    for (let t = 0; t < 200; t++) {
      const bitmap = Array.from({ length: 36 }, () => rng.chance(0.5))
      const counts = paCountsOf(bitmap, 6, 6)
      const p: PaPuzzle = { width: 6, height: 6, clues: counts.map((v) => (rng.chance(0.3) ? v : -1)) }
      const s = solvePa(p, 'probe')
      // Any square the solver marks is forced, so every answer agrees with it.
      for (const answer of paSolutions(p, 3)) {
        for (let i = 0; i < 36; i++) if (s.cells[i] !== PA_OPEN) expect(answer[i]).toBe(s.cells[i] === PA_SHADED ? '#' : '.')
      }
    }
  })

  it('picks up where it stopped when a number is added', () => {
    const answer = bitmapFrom(['#...', '##..', '....', '..##'])
    const counts = paCountsOf(answer, 4, 4)
    const solver = new PaSolver({ width: 4, height: 4, clues: new Array(16).fill(-1) }, 'pairs')
    expect(solver.run()).toBe(false)
    for (let i = 0; i < 16 && !solver.solved; i++) {
      solver.addClue(i, counts[i]!)
      solver.run()
    }
    expect(solver.solved).toBe(true)
    expect(paCellsText(solver.cells)).toBe(paBitmapText(answer))
  })
})

describe('photo-album pictures', () => {
  it('draws every level’s pictures on its own square grid, each with a unique id and name', () => {
    expect(new Set(PA_PICTURES.map((p) => p.id)).size).toBe(PA_PICTURES.length)
    expect(new Set(PA_PICTURES.map((p) => p.name.toLowerCase())).size).toBe(PA_PICTURES.length)
    for (const level of LEVELS) {
      const { size } = paLevelSpec(level)
      expect(PA_PICTURES_BY_LEVEL[level].length).toBeGreaterThanOrEqual(12)
      for (const p of PA_PICTURES_BY_LEVEL[level]) {
        expect(p.art, p.id).toHaveLength(size)
        for (const row of p.art) expect(row, p.id).toMatch(new RegExp(`^[.#]{${size}}$`))
        const shaded = paBitmap(p, false).filter(Boolean).length / (size * size)
        expect(shaded, p.id).toBeGreaterThanOrEqual(PA_SHADE_MIN)
        expect(shaded, p.id).toBeLessThanOrEqual(PA_SHADE_MAX)
        // A picture that reads the same mirrored is marked so, and never printed "the other way round".
        const same = paBitmapText(paBitmap(p, true)) === paBitmapText(paBitmap(p, false))
        expect(p.mirror, p.id).toBe(!same)
      }
    }
  })

  it('names every picture in plain words a reader can write, short enough for the caption line', () => {
    for (const p of PA_PICTURES) {
      expect(p.name).toMatch(/^[A-Z][A-Za-z -]+$/)
      expect(p.name.length).toBeLessThanOrEqual(18)
    }
  })

  it('builds grids the level’s own steps finish for every picture, both ways round', () => {
    for (const level of LEVELS) {
      const spec = paLevelSpec(level)
      for (const picture of paLevelPictures(level)) {
        for (const mirrored of picture.mirror ? [false, true] : [false]) {
          const design = paDesign(picture, mirrored)
          let built: PaBuilt | null = null
          for (let attempt = 0; attempt < 24 && !built; attempt++) {
            built = buildPaGrid({ ...spec, bitmap: design.bitmap, width: design.size, height: design.size, rng: paGridRng({ level, seed: 3, ownerSalt: saltOf(7), picture: `${picture.id}${mirrored ? ':m' : ''}`, attempt }) })
          }
          expect(built, `${level} ${picture.id} ${mirrored}`).not.toBeNull()
          expect(isPaSolution(built!.puzzle, design.bitmap)).toBe(true)
          const s = solvePa(built!.puzzle, spec.rules)
          expect(paCellsText(s.cells)).toBe(paBitmapText(design.bitmap))
        }
      }
    }
  }, SLOW)
})

describe('photo-album levels', () => {
  for (const level of LEVELS) {
    it(`${level}: builds grids of the level's size that its own steps finish, and no easier ones`, () => {
      const spec = paLevelSpec(level)
      for (let k = 0; k < 4; k++) {
        const { built } = builtFor(level, k, 20 + k)
        expect(built.puzzle.width).toBe(spec.size)
        const s = solvePa(built.puzzle, spec.rules)
        expect(s.solved).toBe(true)
        if (spec.beyond) expect(solvePa(built.puzzle, spec.beyond).solved).toBe(false)
        expect(paHardSteps(s.tally, spec.rules)).toBeGreaterThanOrEqual(spec.minHard)
      }
    }, SLOW)
  }

  it('keeps plenty of numbers at Gentle, fewer at Classic, and only what it needs at Challenging', () => {
    const share = (level: PaLevel) => {
      const { built } = builtFor(level, 1, 9)
      return paClueCount(built.puzzle) / (built.puzzle.width * built.puzzle.height)
    }
    const gentle = share('gentle')
    expect(gentle).toBeGreaterThanOrEqual(0.4)
    expect(share('classic')).toBeLessThan(gentle)
    expect(share('challenging')).toBeLessThan(0.45)
  }, SLOW)

  it('grows only the numbers it needs, and never prints one that miscounts', () => {
    const design = paDesign(paLevelPictures('classic')[0]!, false)
    const clues = growPaClues(design.bitmap, 15, 15, 'pairs', createRng(3))!
    expect(clues.some((v) => v < 0)).toBe(true)
    expect(isPaSolution({ width: 15, height: 15, clues }, design.bitmap)).toBe(true)
  })

  it('builds a grid quickly enough for a whole book', () => {
    for (const level of LEVELS) {
      const t0 = performance.now()
      for (let k = 0; k < 3; k++) builtFor(level, k, 40 + k)
      expect((performance.now() - t0) / 3, level).toBeLessThan(2500)
    }
  }, SLOW)

  it('knows a grid however it is turned or mirrored, and not once a number changes', () => {
    const { built } = builtFor('gentle', 2)
    const n = built.puzzle.width
    const rows = Array.from({ length: n }, (_, r) => built.puzzle.clues.slice(r * n, r * n + n))
    const mirrored: PaPuzzle = { width: n, height: n, clues: rows.flatMap((row) => [...row].reverse()) }
    const turned: PaPuzzle = { width: n, height: n, clues: Array.from({ length: n * n }, (_, i) => rows[n - 1 - (i % n)]![Math.floor(i / n)]!) }
    expect(paSignature(mirrored)).toBe(built.signature)
    expect(paSignature(turned)).toBe(built.signature)
    const i = built.puzzle.clues.findIndex((v) => v >= 0)
    const changed: PaPuzzle = { ...built.puzzle, clues: built.puzzle.clues.map((v, k) => (k === i ? -1 : v)) }
    expect(paSignature(changed)).not.toBe(built.signature)
  })
})

describe('photo-album dealing', () => {
  it('shows every picture of the level before one returns, and never twice running', () => {
    const labels: string[] = []
    const pool = paLevelPictures('gentle')
    for (let page = 0; page < pool.length + 3; page++) {
      const design = pickPaDesign({ level: 'gentle', seed: 100 + page, ownerSalt: saltOf(1), book: parsePaBook(labels), recent: [] })!
      labels.push(paPageLabel(design, 'gentle', `g${page}`))
    }
    const ids = labels.map((l) => l.split('|')[0])
    expect(new Set(ids.slice(0, pool.length)).size).toBe(pool.length)
    for (let k = 1; k < ids.length; k++) expect(ids[k]).not.toBe(ids[k - 1])
  })

  it('brings a returning picture back the other way round when it can', () => {
    const picture = paLevelPictures('classic').find((p) => p.mirror)!
    const others = paLevelPictures('classic').filter((p) => p !== picture)
    // Every other snapshot twice, this one once, the plain way.
    const labels = [...others, ...others].map((p) => paPageLabel(paDesign(p, false), 'classic', p.id))
    const book = parsePaBook([paPageLabel(paDesign(picture, false), 'classic', 'x'), ...labels])
    for (let seed = 1; seed < 6; seed++) {
      const design = pickPaDesign({ level: 'classic', seed, ownerSalt: saltOf(1), book, recent: [] })!
      expect(design.picture.id).toBe(picture.id)
      expect(design.mirrored).toBe(true)
      expect(design.repeat).toBe(true)
    }
  })

  it('deals differently for different sellers and leaves what a seller printed lately for later', () => {
    const first = (salt: string) => pickPaDesign({ level: 'classic', seed: 5, ownerSalt: salt, book: [], recent: [] })!.picture.id
    const firsts = new Set(Array.from({ length: 8 }, (_, k) => first(saltOf(k + 1))))
    expect(firsts.size).toBeGreaterThan(2)
    const recent = paLevelPictures('classic').slice(0, 10).map((p) => p.id)
    for (let seed = 0; seed < 10; seed++) expect(recent).not.toContain(pickPaDesign({ level: 'classic', seed, ownerSalt: saltOf(3), book: [], recent })!.picture.id)
  })

  it('reads the book’s labels back, ignoring anything that is not a snapshot', () => {
    const design = paDesign(paLevelPictures('gentle')[0]!, true)
    const book = parsePaBook([paPageLabel(design, 'gentle', 'abc'), 'nonsense|n|gentle|x', ''])
    expect(book).toEqual([{ id: design.picture.id, mirrored: design.mirrored, level: 'gentle', signature: 'abc' }])
    expect(paPictureById(design.picture.id)).toBe(design.picture)
  })

  it('knows a real design from a forged one', () => {
    const design = paDesign(paLevelPictures('classic')[0]!, false)
    expect(isValidPaDesign(design, 'classic')).toBe(true)
    expect(isValidPaDesign(design, 'gentle')).toBe(false)
    expect(isValidPaDesign({ ...design, bitmap: design.bitmap.map((on, i) => (i === 0 ? !on : on)) }, 'classic')).toBe(false)
  })
})

describe('photo-album pages', () => {
  const trims: [number, number][] = [
    [8.5, 11],
    [8, 10],
    [7, 10],
    [6, 9],
  ]

  it('prints a proven, large-print snapshot on every common trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const out = generate({ ...base, level }, kdpCtx(w, h, 77))
        const puzzle = puzzleOf(out[0]!.objects)
        expect(puzzle, `${level} ${w}x${h}`).toBeDefined()
        expect(String(puzzle!.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')[2]).toBe(level)
      }
    }
  }, SLOW)

  it('fits Gentle and Classic on a 5.5 × 8.5 trim, and says Challenging needs a larger page there', () => {
    for (const level of ['gentle', 'classic'] as const) expect(puzzleOf(generate({ ...base, level }, kdpCtx(5.5, 8.5, 3))[0]!.objects), level).toBeDefined()
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(5.5, 8.5, 3))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  }, SLOW)

  it('prints squares as large as the trim allows, never below the level’s floor, numbers with air round them', () => {
    for (const level of LEVELS) {
      for (const [w, h] of trims) {
        const plan = planPaPage(panelFor(kdpCtx(w, h), level), level, FONT)!
        expect(plan.cell, `${level} ${w}x${h}`).toBeGreaterThanOrEqual(Math.ceil(paLevelSpec(level).minCell))
        expect(plan.digitSize).toBeGreaterThanOrEqual(PA_DIGIT_MIN)
        expect(paDigitAir(plan.cell, plan.digitSize)).toBeGreaterThanOrEqual(paDigitAirNeeded(plan.cell))
        expect(paCornerClearance(plan.border, plan.cornerLeg)).toBeGreaterThanOrEqual(PA_CORNER_CLEAR)
        if (plan.legend) expect(plan.legend.box.top - (plan.frame.top + plan.frame.height)).toBeGreaterThanOrEqual(PA_LEGEND_GAP)
        const line = plan.caption.lineRight - plan.caption.lineLeft
        for (const p of paLevelPictures(level)) expect(paTextWidth(p.name, PA_NAME_SIZE, paTextSpec(FONT, 700))).toBeLessThanOrEqual(line)
      }
    }
    // The big trim prints the biggest squares.
    const big = planPaPage(panelFor(kdpCtx(8.5, 11), 'gentle'), 'gentle', FONT)!
    expect(big.cell).toBe(Math.round(0.5 * DPI))
  })

  it('keeps the album corners on the snapshot’s corners and clear of the grid', () => {
    const plan = planPaPage(panelFor(kdpCtx(8.5, 11)), 'classic', FONT)!
    for (const corner of [0, 1, 2, 3] as const) {
      const [a, b, c] = paCornerPoints(plan, corner)
      expect(Math.abs(b!.x - a!.x)).toBe(plan.cornerLeg)
      expect(Math.abs(c!.y - a!.y)).toBe(plan.cornerLeg)
      // The slant passes outside the grid's nearest corner.
      const gx = corner === 1 || corner === 2 ? plan.grid.left + plan.grid.width : plan.grid.left
      const gy = corner >= 2 ? plan.grid.top + plan.grid.height : plan.grid.top
      expect(Math.abs(gx - a!.x) + Math.abs(gy - a!.y)).toBeGreaterThan(plan.cornerLeg)
    }
  })

  it('says plainly when a trim is too small', () => {
    const small = generate({ ...base, level: 'gentle' }, kdpCtx(3.5, 5))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('draws the snapshot, its corners, every number, the caption and legend, and hides the picture and its name', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, way, level, signature] = labelOf(pages[0]!.objects).split('|')
    expect(level).toBe('classic')
    expect(['m', 'n']).toContain(way)
    expect(String(puzzle.data?.studioCanonicalKey)).toBe(`${PA_TEMPLATE_KEY}:${signature}`)
    const picture = paPictureById(id!)!
    expect(partsOf(puzzle, 'frame')).toHaveLength(1)
    expect(partsOf(puzzle, 'corner')).toHaveLength(4)
    expect(partsOf(puzzle, 'corner').every((o) => o.fill === STUDIO_INK)).toBe(true)
    expect(partsOf(puzzle, 'rule')).toHaveLength(32)
    expect(partsOf(puzzle, 'edge')).toHaveLength(4)
    const clues = partsOf(puzzle, 'clue')
    expect(clues.length).toBe(Number(puzzle.data?.numbers))
    expect(clues.every((t) => t.visible !== false && t.studioRole === 'prompt')).toBe(true)
    const answers = partsOf(puzzle, 'answer')
    expect(answers.length).toBeGreaterThan(10)
    expect(answers.every((a) => a.visible === false && a.studioRole === 'answer')).toBe(true)
    expect(partsOf(puzzle, 'caption-prompt')[0]!.text).toBe(PA_CAPTION_PROMPT)
    const name = partsOf(puzzle, 'caption-answer')[0]!
    expect(name.text).toBe(picture.name)
    expect(name.visible).toBe(false)
    expect(partsOf(puzzle, 'legend-shade')).toHaveLength(PA_LEGEND_BLOCK.join('').split('#').length - 1)
    expect(partsOf(puzzle, 'legend-number')[0]!.text).toBe(String(PA_LEGEND_NUMBER))
    // Nothing on the page gives the picture away.
    expect(JSON.stringify(pages[0]!.objects.filter((o) => o.visible !== false).map((o) => o.text ?? ''))).not.toContain(picture.name)
  })

  it('works the legend’s block truthfully', () => {
    expect(PA_LEGEND_BLOCK.join('').split('#').length - 1).toBe(PA_LEGEND_NUMBER)
    expect(PA_LEGEND_BLOCK[1]![1]).toBe('#')
  })

  it('develops the snapshot on the answer page, writes its name in, and drops the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const puzzleGroup = puzzleOf(out[0]!.objects)!
    const hidden = partsOf(puzzleGroup, 'answer').length + 1
    expect(out.flatMap((p) => harvestAnswers(p.objects)).length).toBe(hidden)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const bars = partsOf(puzzle, 'answer')
    expect(bars.every((a) => a.visible === true && a.fill === STUDIO_INK)).toBe(true)
    // The bars read back are exactly the picture.
    const n = 15
    const cells = new Array<boolean>(n * n).fill(false)
    for (const b of bars) for (let k = 0; k < Number(b.data?.length); k++) cells[Number(b.data?.row) * n + Number(b.data?.from) + k] = true
    const [id, way] = labelOf(out[0]!.objects).split('|')
    expect(paBitmapText(cells)).toBe(paBitmapText(paDesign(paPictureById(id!)!, way === 'm').bitmap))
    expect(partsOf(puzzle, 'caption-answer')[0]!.visible).toBe(true)
    expect(key.some((o) => o.text === PA_HOW_TO)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === PA_HOW_TO)).toBe(true)
  })

  it('builds a book that shows every Gentle snapshot before one returns, never printing a grid twice', () => {
    const labels: string[] = []
    const count = paLevelPictures('gentle').length
    for (let page = 0; page < count + 2; page++) {
      const out = generate({ ...base, level: 'gentle', seed: 500 + page }, kdpCtx(8.5, 11, 500 + page, [...labels]))
      labels.push(labelOf(out[0]!.objects))
    }
    expect(new Set(labels.slice(0, count).map((l) => l.split('|')[0])).size).toBe(count)
    expect(new Set(labels.map((l) => l.split('|')[3])).size).toBe(labels.length)
  }, SLOW)

  it('never repeats a grid the book already prints, even when the seed would build it again', () => {
    const first = generate(base, kdpCtx(8.5, 11, 21))
    const label = labelOf(first[0]!.objects)
    const again = generate(base, kdpCtx(8.5, 11, 21, [label]))
    const next = labelOf(again[0]!.objects)
    expect(next.split('|')[3]).not.toBe(label.split('|')[3])
    expect(next.split('|')[0]).not.toBe(label.split('|')[0])
  })

  it('opens a seller’s next book at snapshots their last one did not show', () => {
    const recent = paLevelPictures('classic').slice(0, 10).map((p) => p.id)
    rememberStudioContent(studioVarietyKey(PA_TEMPLATE_KEY, 'pictures'), recent)
    const out = generate(base, kdpCtx(8.5, 11, 3))
    expect(recent).not.toContain(labelOf(out[0]!.objects).split('|')[0])
  })

  it('reprints the same page for the same seller and seed, and different numbers for another seller', () => {
    const label = (salt: string, seed = 9) => {
      clearStudioRecentContent()
      return labelOf(generate(base, kdpCtx(8.5, 11, seed, [], salt))[0]!.objects)
    }
    expect(label(saltOf(1))).toBe(label(saltOf(1)))
    // Even on the same snapshot, two sellers' numbers differ.
    const grids = new Set<string>()
    for (let k = 1; k <= 6; k++) grids.add(label(saltOf(k)).split('|')[3]!)
    expect(grids.size).toBe(6)
  })
})

describe('photo-album preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const plan = planPaPage(panel, 'classic', FONT)!
  const { built, design } = builtFor('classic', 0, 3)
  const run = (over: Partial<Parameters<typeof runPaKdpPreflight>[0]>) => runPaKdpPreflight({ built, design, plan, level: 'classic', panel, font: FONT, ...over }).errors.join(' ')

  it('passes a proven grid', () => {
    expect(run({})).toBe('')
  })

  it('refuses a number that miscounts its block', () => {
    const i = built.puzzle.clues.findIndex((v) => v >= 0 && v < 9)
    const puzzle: PaPuzzle = { ...built.puzzle, clues: built.puzzle.clues.map((v, k) => (k === i ? v + 1 : v)) }
    expect(run({ built: { ...built, puzzle, signature: paSignature(puzzle) } })).toMatch(/does not count its block/)
  })

  it('refuses a grid with too few numbers to finish', () => {
    const puzzle: PaPuzzle = { ...built.puzzle, clues: built.puzzle.clues.map((v, k) => (k % 3 === 0 ? -1 : v)) }
    expect(run({ built: { ...built, puzzle, signature: paSignature(puzzle) } })).toMatch(/logic alone/)
  })

  it('refuses a Classic grid that the first steps alone finish', () => {
    const full: PaPuzzle = { ...built.puzzle, clues: paCountsOf(design.bitmap, 15, 15) }
    const easy = solvePa(full, 'basic').solved
    if (easy) expect(run({ built: { ...built, puzzle: full, signature: paSignature(full) } })).toMatch(/too easy/)
    else expect(run({ built: { ...built, puzzle: full, signature: paSignature(full) } })).toBe('')
  })

  it('refuses another picture, or one from another level', () => {
    const other = paDesign(paLevelPictures('classic')[1]!, false)
    expect(run({ design: other })).toMatch(/another picture/)
    const gentle = paDesign(paLevelPictures('gentle')[0]!, false)
    expect(run({ design: gentle })).toMatch(/not one of this level/)
  })

  it('refuses a snapshot or a grid the book already has', () => {
    const book = parsePaBook([paPageLabel(design, 'classic', 'other')])
    expect(run({ book })).toMatch(/already shows/)
    const same = parsePaBook([paPageLabel(paDesign(paLevelPictures('classic')[4]!, false), 'classic', built.signature)])
    expect(run({ book: same })).toMatch(/already prints this grid/)
  })

  it('refuses squares below the level’s floor, small numbers, crowded corners and a snapshot off the page', () => {
    expect(run({ plan: { ...plan, cell: 10 } })).toMatch(/smaller than this level allows/)
    expect(run({ plan: { ...plan, digitSize: 10 } })).toMatch(/below 12 pt/)
    expect(run({ plan: { ...plan, digitSize: plan.cell } })).toMatch(/crowd their squares/)
    expect(run({ plan: { ...plan, cornerLeg: plan.border * 4 } })).toMatch(/album corner covers/)
    const off = { ...plan, frame: { ...plan.frame, left: panel.left - 40 } }
    expect(run({ plan: off })).toMatch(/printable area|runs out of the snapshot/)
    const crowded = { ...plan, legend: { ...plan.legend!, box: { ...plan.legend!.box, top: plan.frame.top + plan.frame.height } } }
    expect(run({ plan: crowded })).toMatch(/legend crowds/)
  })

  it('catches a drawn page whose numbers, picture, name or corners do not match', () => {
    const puzzle = buildPaPuzzle({ built, design, plan, level: 'classic', label: 'x', tag, font: FONT })
    expect(checkPaDrawnPage({ puzzle, built, design, plan })).toEqual([])
    const other = builtFor('classic', 1, 3)
    expect(checkPaDrawnPage({ puzzle, built: other.built, design: other.design, plan }).join(' ')).toMatch(/number is missing or wrong|hidden picture/)
    const renamed = { ...design, picture: { ...design.picture, name: 'Something else' } }
    expect(checkPaDrawnPage({ puzzle, built, design: renamed, plan }).join(' ')).toMatch(/name does not wait/)
    const noCorner: StudioFabricObject = { ...puzzle, objects: (puzzle.objects ?? []).filter((o) => o.data?.[PA_PART_KEY] !== 'corner') }
    expect(checkPaDrawnPage({ puzzle: noCorner, built, design, plan }).join(' ')).toMatch(/album corners/)
    const shown: StudioFabricObject = { ...puzzle, objects: (puzzle.objects ?? []).map((o) => (o.data?.[PA_PART_KEY] === 'answer' ? { ...o, visible: true } : o)) }
    expect(checkPaDrawnPage({ puzzle: shown, built, design, plan }).join(' ')).toMatch(/picture shows on the puzzle page/)
    expect(paRuns(design.bitmap, 15).reduce((a, r) => a + r.length, 0)).toBe(design.bitmap.filter(Boolean).length)
  })
})
