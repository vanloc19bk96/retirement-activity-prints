import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { contentBox, drawHeader } from '../studio-layout'
import { pictureLogicTemplate } from './generate'
import { PL_CONFIG_SCHEMA } from './config'
import {
  PL_DEFAULT_TITLE,
  PL_INSTRUCTION,
  PL_LEVELS,
  PL_TEMPLATE_KEY,
  isValidPlDesign,
  parsePlBook,
  parsePlLevel,
  pickPlDesign,
  plBitmap,
  plDesign,
  plDesignLabel,
  plLevelPictures,
  plLevelSpec,
  type PlDesign,
  type PlLevel,
} from './content'
import { PL_PART_KEY, buildPlPuzzle } from './draw'
import { checkPlDrawnPage, runPlKdpPreflight } from './kdp-preflight'
import { PL_CLUE_MIN, plFitWarning, plPanelInBody, plPrintNote, plUnfitPictures, planPlPage } from './layout'
import { PL_PICTURES } from './pictures'
import { EMPTY, FILLED, UNKNOWN, cluesOf, lineClue, solveByLines, solveLine, solvesTo, type Cell } from './solver'

const FONT = 'PT Serif'
const LEVELS = PL_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')

const base: StudioConfig = {
  ...buildDefaultConfig(pictureLogicTemplate),
  showTitle: true,
  title: PL_DEFAULT_TITLE,
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
  return pictureLogicTemplate.generate(config, ctx)
}

function puzzleOf(objects: StudioFabricObject[]): StudioFabricObject | undefined {
  return objects.find((o) => o.data?.[PL_PART_KEY] === 'puzzle')
}

function partsOf(obj: StudioFabricObject, name: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (o: StudioFabricObject) => {
    if (o.data?.[PL_PART_KEY] === name) out.push(o)
    for (const c of o.objects ?? []) walk(c)
  }
  walk(obj)
  return out
}

function panelFor(ctx: StudioGenerateContext, config: StudioConfig = base) {
  const header = drawHeader(contentBox(ctx), config, { templateKey: PL_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' }, PL_INSTRUCTION)
  return plPanelInBody(header.body, header.objects.length > 0)
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(pictureLogicTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: PL_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(pictureLogicTemplate, { seeds: 12 })

describe('picture-logic registry and form', () => {
  it('is registered once, in the logic tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === PL_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('logic')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(PL_DEFAULT_TITLE)
    expect(found[0]!.label).toMatch(/retirement/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(PL_TEMPLATE_KEY)).toBe(true)
  })

  it('asks one question — the level — and defaults to Classic', () => {
    expect(PL_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['level'])
    expect(buildDefaultConfig(pictureLogicTemplate).level).toBe('classic')
    expect(parsePlLevel('nonsense')).toBe('classic')
    for (const level of LEVELS) expect(parsePlLevel(level)).toBe(level)
  })

  it('reports square and number sizes on the trim, how many pictures fit, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = plPrintNote({ page: layout(8.5, 11), config: base, level })
      expect(note).toContain(String(plLevelPictures(level).length))
      expect(note).toMatch(/no guessing/)
      expect(note).toMatch(/pt or larger\.$/)
      expect(plPrintNote({ page: layout(3, 4), config: base, level })).toMatch(/too small/)
    }
    // A Challenging grid needs a large trim; on 7 × 10 most, not all, pictures fit.
    expect(plPrintNote({ page: layout(7, 10), config: base, level: 'challenging' })).toMatch(/of 14 pictures fit/)
    expect(plFitWarning({ page: layout(8.5, 11), config: base, level: 'challenging' })).toBeNull()
    expect(plFitWarning({ page: layout(6, 9), config: base, level: 'challenging' })).toMatch(/pages will repeat/)
  })
})

describe('picture-logic solver', () => {
  const cells = (s: string): Cell[] => [...s].map((c) => (c === '#' ? FILLED : c === '.' ? EMPTY : UNKNOWN))
  const show = (line: Cell[] | null) => (line ? line.map((c) => (c === FILLED ? '#' : c === EMPTY ? '.' : '?')).join('') : null)

  it('reads a line’s runs', () => {
    expect(lineClue([true, true, false, true])).toEqual([2, 1])
    expect(lineClue([false, false])).toEqual([])
  })

  it('finds the squares every placement agrees on — and no more', () => {
    expect(show(solveLine(cells('??????????'), [8]))).toBe('??######??')
    expect(show(solveLine(cells('?????'), [5]))).toBe('#####')
    expect(show(solveLine(cells('?????'), []))).toBe('.....')
    expect(show(solveLine(cells('?????'), [2, 2]))).toBe('##.##')
    expect(show(solveLine(cells('??????'), [2, 2]))).toBe('?#??#?')
    expect(show(solveLine(cells('#????'), [2, 1]))).toBe('##.??')
    expect(show(solveLine(cells('???#?'), [1]))).toBe('...#.')
  })

  it('reports a contradiction instead of guessing', () => {
    expect(solveLine(cells('#.#'), [3])).toBeNull()
    expect(solveLine(cells('###'), [1])).toBeNull()
  })

  it('solves a fair picture and refuses one that needs a guess', () => {
    const fair = ['.#.', '###', '.#.'].map((r) => [...r].map((c) => c === '#'))
    expect(solvesTo(cluesOf(fair), fair)).toBe(true)
    // Two diagonals: the clues fit either one, so a reader would have to guess.
    const ambiguous = ['#.', '.#'].map((r) => [...r].map((c) => c === '#'))
    const result = solveByLines(cluesOf(ambiguous))
    expect(result.solved).toBe(false)
    expect(solvesTo(cluesOf(ambiguous), ambiguous)).toBe(false)
  })
})

describe('picture-logic library', () => {
  it('holds a real library at every level', () => {
    expect(plLevelPictures('gentle').length).toBeGreaterThanOrEqual(18)
    expect(plLevelPictures('classic').length).toBeGreaterThanOrEqual(15)
    expect(plLevelPictures('challenging').length).toBeGreaterThanOrEqual(12)
    expect(new Set(PL_PICTURES.map((p) => p.id)).size).toBe(PL_PICTURES.length)
  })

  it('draws every picture as a clean rectangle of # and .', () => {
    for (const p of PL_PICTURES) {
      const width = p.art[0]!.length
      for (const row of p.art) {
        expect(row.length, p.id).toBe(width)
        expect(row, p.id).toMatch(/^[#.]+$/)
      }
    }
  })

  for (const level of ['gentle', 'classic', 'challenging'] as PlLevel[]) {
    it(`proves every ${level} picture, both ways round, solves line by line to itself`, () => {
      const spec = plLevelSpec(level)
      const shapes = new Set<string>()
      const names = new Set<string>()
      for (const picture of plLevelPictures(level)) {
        names.add(picture.name)
        for (const mirrored of picture.mirror ? [false, true] : [false]) {
          const design = plDesign(picture, mirrored)
          expect(design.width, picture.id).toBeLessThanOrEqual(spec.maxSide)
          expect(design.height, picture.id).toBeLessThanOrEqual(spec.maxSide)
          expect(Math.max(design.width, design.height), picture.id).toBeGreaterThanOrEqual(spec.maxSide - 2)
          // Trimmed to its ink: no border row or column prints a "0".
          expect(design.clues.rows[0]!.length, picture.id).toBeGreaterThan(0)
          expect(design.clues.rows.at(-1)!.length, picture.id).toBeGreaterThan(0)
          expect(design.clues.cols[0]!.length, picture.id).toBeGreaterThan(0)
          expect(design.clues.cols.at(-1)!.length, picture.id).toBeGreaterThan(0)
          const shaded = design.bitmap.flat().filter(Boolean).length / (design.width * design.height)
          expect(shaded, picture.id).toBeGreaterThanOrEqual(0.2)
          expect(shaded, picture.id).toBeLessThanOrEqual(0.8)
          expect(solvesTo(design.clues, design.bitmap), `${picture.id}${mirrored ? ' (mirrored)' : ''}`).toBe(true)
          shapes.add(JSON.stringify(design.bitmap))
        }
        if (picture.mirror) {
          // A picture that may face either way must actually look different mirrored.
          expect(JSON.stringify(plBitmap(picture, true)), picture.id).not.toBe(JSON.stringify(plBitmap(picture, false)))
        }
      }
      expect(names.size).toBe(plLevelPictures(level).length)
      expect(shapes.size).toBe(plLevelPictures(level).reduce((n, p) => n + (p.mirror ? 2 : 1), 0))
    })
  }
})

describe('picture-logic dealing', () => {
  it('walks the whole level before a picture returns, never twice running, and turns returning pictures round', () => {
    for (const level of LEVELS) {
      const pool = plLevelPictures(level)
      const labels: string[] = []
      for (let page = 0; page < pool.length * 2; page++) {
        const design = pickPlDesign({ level, seed: 900 + page, ownerSalt: saltOf(3), book: parsePlBook(labels), recent: [] })!
        const prev = parsePlBook(labels).at(-1)
        if (prev) expect(design.picture.id).not.toBe(prev.id)
        if (page < pool.length) expect(design.repeat).toBe(false)
        else {
          expect(design.repeat).toBe(true)
          if (design.picture.mirror) {
            const first = parsePlBook(labels).find((e) => e.id === design.picture.id)!
            expect(design.mirrored).toBe(!first.mirrored)
          }
        }
        labels.push(plDesignLabel(design))
      }
      const firstRound = labels.slice(0, pool.length).map((l) => l.split('|')[0])
      expect(new Set(firstRound).size).toBe(pool.length)
    }
  })

  it('deals differently for different sellers on the same seed, and the same for the same seller', () => {
    const pick = (salt: number) => plDesignLabel(pickPlDesign({ level: 'classic', seed: 5, ownerSalt: saltOf(salt), book: [], recent: [] })!)
    expect(pick(1)).toBe(pick(1))
    const seen = new Set(Array.from({ length: 12 }, (_, i) => pick(i + 1)))
    expect(seen.size).toBeGreaterThan(4)
  })

  it('leaves what the seller printed lately for later', () => {
    const pool = plLevelPictures('gentle')
    const recent = pool.slice(0, pool.length - 3).map((p) => p.id)
    for (let seed = 0; seed < 10; seed++) {
      const design = pickPlDesign({ level: 'gentle', seed, ownerSalt: saltOf(7), book: [], recent })!
      expect(recent).not.toContain(design.picture.id)
    }
  })

  it('reads the book’s labels back, ignoring anything that is not a picture', () => {
    expect(parsePlBook(['teacup|m', 'nope|n', 'house|n', ''])).toEqual([
      { id: 'teacup', mirrored: true },
      { id: 'house', mirrored: false },
    ])
  })
})

describe('picture-logic pages', () => {
  const trims: [number, number][] = [[8.5, 11], [8, 10], [7, 10], [6, 9], [5.5, 8.5]]

  it('prints a proven, large-print puzzle on every common trim at Gentle and Classic', () => {
    for (const level of ['gentle', 'classic'] as PlLevel[]) {
      for (const [w, h] of trims) {
        for (const seed of [1, 2, 3]) {
          const ctx = kdpCtx(w, h, seed)
          const pages = generate({ ...base, level, seed }, ctx)
          expect(pages).toHaveLength(1)
          const puzzle = puzzleOf(pages[0]!.objects)
          expect(puzzle, `${level} ${w}x${h} seed ${seed}`).toBeDefined()
          assertObjectsInSafeMargin(pages[0]!.objects, ctx)
          const clues = partsOf(puzzle!, 'clue')
          expect(clues.every((c) => (c.fontSize ?? 0) >= PL_CLUE_MIN)).toBe(true)
        }
      }
    }
  })

  it('prints Challenging on large trims, and says plainly when a trim is too small', () => {
    for (const [w, h] of [[8.5, 11], [8, 10]] as [number, number][]) {
      const pages = generate({ ...base, level: 'challenging' }, kdpCtx(w, h))
      expect(puzzleOf(pages[0]!.objects)).toBeDefined()
    }
    const small = generate({ ...base, level: 'challenging' }, kdpCtx(5, 8))
    expect(puzzleOf(small[0]!.objects)).toBeUndefined()
    expect(small[0]!.objects.some((o) => /too small/.test(String(o.text ?? '')))).toBe(true)
  })

  it('never prints a picture too big for the trim, even when the level holds some', () => {
    const ctx = kdpCtx(7, 10)
    const unfit = plUnfitPictures('challenging', panelFor(ctx))
    expect(unfit.size).toBeGreaterThan(0)
    for (let seed = 0; seed < 12; seed++) {
      const puzzle = puzzleOf(generate({ ...base, level: 'challenging', seed }, { ...ctx, seed })[0]!.objects)!
      const [id] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
      expect(unfit.has(id!)).toBe(false)
    }
  })

  it('draws every clue once in its line, and hides exactly the picture for the answer page', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const puzzle = puzzleOf(pages[0]!.objects)!
    const [id, way] = String(puzzle.data?.[STUDIO_CONTENT_LABEL_KEY]).split('|')
    const design = plDesign(PL_PICTURES.find((p) => p.id === id)!, way === 'm')
    expect(checkPlDrawnPage({ puzzle, design })).toEqual([])
    const bars = partsOf(puzzle, 'answer')
    expect(bars.every((b) => b.visible === false && b.studioRole === 'answer')).toBe(true)
    const name = partsOf(puzzle, 'mystery-answer')[0]!
    expect(name.text).toBe(design.picture.name)
    expect(name.visible).toBe(false)
    expect(partsOf(puzzle, 'mystery-prompt')[0]!.text).toMatch(/picture/)
  })

  it('reveals the picture and its name on the answer page, in black, without the how-to line', () => {
    const out = generate(base, kdpCtx(8.5, 11))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers.length).toBeGreaterThan(1)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const puzzle = puzzleOf(key)!
    const bars = partsOf(puzzle, 'answer')
    expect(bars.length).toBeGreaterThan(0)
    expect(bars.every((b) => b.visible === true && b.fill === STUDIO_INK)).toBe(true)
    expect(partsOf(puzzle, 'mystery-answer')[0]!.visible).toBe(true)
    expect(key.some((o) => o.text === PL_INSTRUCTION)).toBe(false)
    expect(out[0]!.objects.some((o) => o.text === PL_INSTRUCTION)).toBe(true)
  })

  it('builds a book that walks the level before repeating, reading back its own pages', () => {
    const labels: string[] = []
    const pool = plLevelPictures('classic')
    for (let page = 0; page < pool.length; page++) {
      const out = generate({ ...base, seed: 100 + page }, kdpCtx(8.5, 11, 100 + page, [...labels]))
      labels.push(String(puzzleOf(out[0]!.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    expect(new Set(labels.map((l) => l.split('|')[0])).size).toBe(pool.length)
  })

  it('stamps each puzzle with its picture and which way round it is', () => {
    const a = puzzleOf(generate(base, kdpCtx(8.5, 11, 9))[0]!.objects)!
    clearStudioRecentContent()
    const b = puzzleOf(generate(base, kdpCtx(8.5, 11, 9))[0]!.objects)!
    expect(a.data?.studioCanonicalKey).toBe(b.data?.studioCanonicalKey)
    expect(String(a.data?.studioCanonicalKey)).toBe(`${PL_TEMPLATE_KEY}:${a.data?.[STUDIO_CONTENT_LABEL_KEY]}`)
  })
})

describe('picture-logic preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const panel = panelFor(ctx)
  const design = plDesign(plLevelPictures('classic').find((p) => p.id === 'owl')!, false)
  const plan = planPlPage(design, panel, 'classic')!

  it('passes a proven puzzle', () => {
    expect(runPlKdpPreflight({ design, plan, level: 'classic', panel }).errors).toEqual([])
    expect(isValidPlDesign(design, 'classic')).toBe(true)
  })

  it('refuses clues that do not match the picture', () => {
    const rows = design.clues.rows.map((r) => [...r])
    rows[0] = [...rows[0]!, 1]
    const bad: PlDesign = { ...design, clues: { ...design.clues, rows } }
    expect(runPlKdpPreflight({ design: bad, plan, level: 'classic', panel }).errors.join(' ')).toMatch(/do not match/)
  })

  it('refuses a picture that would need a guess', () => {
    const bitmap = design.bitmap.map((r) => [...r])
    // A 2 × 2 checker swap somewhere inside makes the clues fit two pictures.
    bitmap[0]![0] = true
    bitmap[0]![1] = false
    bitmap[1]![0] = false
    bitmap[1]![1] = true
    const tampered: PlDesign = { ...design, bitmap, clues: cluesOf(bitmap) }
    const errors = runPlKdpPreflight({ design: tampered, plan, level: 'classic', panel }).errors.join(' ')
    expect(errors).toMatch(/not a picture of this level|cannot be solved/)
  })

  it('refuses a picture the book already prints while others are unused', () => {
    const book = [{ id: 'owl', mirrored: false }]
    expect(runPlKdpPreflight({ design, plan, level: 'classic', panel, book }).errors.join(' ')).toMatch(/already has/)
  })

  it('refuses squares below the level’s size and a puzzle off the page', () => {
    expect(runPlKdpPreflight({ design, plan: { ...plan, cell: 10 }, level: 'classic', panel }).ok).toBe(false)
    const off = { ...plan, block: { ...plan.block, left: panel.left - 40 } }
    expect(runPlKdpPreflight({ design, plan: off, level: 'classic', panel }).errors.join(' ')).toMatch(/printable area/)
  })

  it('catches a drawn page whose clues or answer do not match', () => {
    const tag = { templateKey: PL_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }
    const puzzle = buildPlPuzzle({ design, plan, tag, font: FONT })
    expect(checkPlDrawnPage({ puzzle, design })).toEqual([])
    const other = plDesign(plLevelPictures('classic').find((p) => p.id === 'trophy')!, false)
    expect(checkPlDrawnPage({ puzzle, design: other }).length).toBeGreaterThan(0)
  })
})
