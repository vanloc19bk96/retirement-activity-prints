import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { stainedGlassTemplate } from './generate'
import { SG_CONFIG_SCHEMA } from './config'
import { compositionKey, dealComposition, isValidComposition, type SgComposition } from './composition'
import {
  SG_DEFAULT_TITLE,
  SG_LEVELS,
  SG_PAGE_TOO_SMALL_MESSAGE,
  SG_TEMPLATE_KEY,
  SG_THEMES,
  isValidSgVariant,
  parseSgBook,
  pickSgDesign,
  sgInstructionOptions,
  sgPageLabel,
  sgVariantDrawing,
  sgVariantKey,
  sgVariants,
  themeSubjects,
  type SgBookEntry,
  type SgLevel,
} from './content'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { buildFrame, FRAME_KINDS, BORDER_KINDS } from './frame'
import { pointInRing, ringArea, voronoiEdges, type Pt } from './geometry'
import { checkSgDrawnPanel, runSgKdpPreflight } from './kdp-preflight'
import { sgPrintNote } from './layout'
import { buildMosaic, SG_FILL_FLOOR_INCHES, SG_FLOOR, SG_INK_WIDTH, type SgInkRun, type SgMosaic } from './mosaic'
import { rasterCheck } from './raster'
import { drawingBounds } from './subject-kit'
import { SG_SUBJECTS, sgSubjectById } from './subjects'
import {
  SG_HAND_LIMITS,
  SG_INK_PROFILES,
  applySgHand,
  dealSgHand,
  dealSgStyle,
  easeSgHand,
  parseSgStyleToken,
  sgMosaicStyle,
  sgStyleDistance,
  sgStyleToken,
  sgSubjectFlies,
  type SgHand,
} from './style'

const FONT = 'PT Serif'
const LEVELS = SG_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')

const base: StudioConfig = {
  ...buildDefaultConfig(stainedGlassTemplate),
  showTitle: true,
  title: SG_DEFAULT_TITLE,
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

const TRIMS = [
  [5, 8],
  [6, 9],
  [8.5, 8.5],
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return stainedGlassTemplate.generate(config, ctx)
}

const panelOf = (objects: StudioFabricObject[]) => objects.find((o) => o.type === 'group' && o.data?.source === SG_TEMPLATE_KEY)
const labelOf = (objects: StudioFabricObject[]) => String(panelOf(objects)?.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '')

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(stainedGlassTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: SG_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(stainedGlassTemplate, { seeds: 24 })

describe('stained-glass registry and form', () => {
  it('is registered once, in the spatial tab, with no answer page', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === SG_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('spatial')
    expect(found[0]!.producesAnswerKey).toBe(false)
    expect(found[0]!.defaultPageTitle).toBe(SG_DEFAULT_TITLE)
  })

  it('asks only for a theme and a piece size', () => {
    expect(SG_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['theme', 'level'])
    for (const field of SG_CONFIG_SCHEMA) expect(field.type).toBe('select')
  })

  it('reports roughly how many pieces each level prints, more for smaller pieces', () => {
    const layout = kdpCtx(8.5, 11)
    const counts = LEVELS.map((level) => {
      const note = sgPrintNote({ page: layout, config: base, level })
      expect(note).toMatch(/^About \d+–\d+ pieces/)
      return Number(/About (\d+)/.exec(note)![1])
    })
    expect(counts[0]).toBeLessThan(counts[1]!)
    expect(counts[1]).toBeLessThan(counts[2]!)
    expect(sgPrintNote({ page: kdpCtx(3, 4), config: base, level: 'classic' })).toMatch(/too small/)
  })

  it('keeps the instruction to one short line', () => {
    for (const line of sgInstructionOptions(base)) expect(line.length).toBeLessThanOrEqual(56)
    expect(sgInstructionOptions({ ...base, showInstructions: false })).toEqual([])
  })
})

describe('stained-glass subject library', () => {
  it('is broad: every theme well stocked, ids and names clean and unique', () => {
    expect(SG_SUBJECTS.length).toBeGreaterThanOrEqual(30)
    for (const theme of SG_THEMES.filter((t) => t.value !== 'mix')) {
      expect(themeSubjects(theme.value).length, theme.value).toBeGreaterThanOrEqual(6)
    }
    const ids = SG_SUBJECTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    const names = SG_SUBJECTS.map((s) => s.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
    for (const s of SG_SUBJECTS) {
      expect(s.id).toMatch(/^[a-z][a-z-]*[a-z]$/)
      expect(s.name).toMatch(/^[A-Z][A-Za-z' -]*[a-z]$/)
      expect(s.name.length).toBeLessThanOrEqual(26)
      expect(/\d/.test(s.name)).toBe(false)
      expect(sgSubjectById(s.id)).toBe(s)
    }
  })

  it('gives every subject real versions: a few knobs, several builds each', () => {
    for (const s of SG_SUBJECTS) {
      const knobs = Object.values(s.knobs)
      expect(knobs.length, s.id).toBeGreaterThanOrEqual(2)
      expect(knobs.every((n) => Number.isInteger(n) && n >= 2 && n <= 4), s.id).toBe(true)
      const variants = sgVariants(s)
      expect(variants.length, s.id).toBeGreaterThanOrEqual(8)
      expect(new Set(variants.map((v) => sgVariantKey(s, v))).size).toBe(variants.length)
      expect(variants.every((v) => isValidSgVariant(s, v))).toBe(true)
    }
  })

  it('draws every version as closed, well-formed shapes', () => {
    for (const s of SG_SUBJECTS) {
      for (const v of sgVariants(s)) {
        const drawing = sgVariantDrawing(s, v)
        expect(drawing.pieces.length, s.id).toBeGreaterThanOrEqual(3)
        for (const piece of drawing.pieces) {
          expect(piece.ring.length).toBeGreaterThanOrEqual(3)
          expect(piece.ring.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
          expect(Math.abs(ringArea(piece.ring)), s.id).toBeGreaterThan(20)
        }
        for (const stroke of drawing.strokes) expect(stroke.pts.length).toBeGreaterThanOrEqual(2)
        const b = drawingBounds(drawing)
        expect(Math.max(b.maxX - b.minX, b.maxY - b.minY), s.id).toBeGreaterThan(60)
      }
    }
  })

  /**
   * Every version of every subject, alone in a plain window at the smallest
   * size any page prints it: no piece of the drawing may be too small or too
   * narrow to color. This is what keeps a hand edit to a drawing honest.
   */
  it.each(SG_SUBJECTS.map((s) => [s.id]))('leaves no uncolorable piece in any version of %s', (id) => {
    const s = sgSubjectById(id)!
    const alone: SgComposition = { frame: 'rect', border: 'none', pattern: 'even', sun: null, scenery: null, halo: false }
    const box = { minX: 0, minY: 0, maxX: 250, maxY: 287 }
    const detail = { cell: 10 * DPI, subjectCell: 10 * DPI, minWidth: SG_FLOOR.minWidth, minArea: SG_FLOOR.minArea }
    const failures: string[] = []
    for (const v of sgVariants(s)) {
      const result = buildMosaic({ box, drawing: sgVariantDrawing(s, v), composition: alone, detail, rng: createRng(1) })
      if (!result.ok) failures.push(`${sgVariantKey(s, v)}: ${result.reason}`)
    }
    expect(failures).toEqual([])
  }, 60_000)
})

describe('stained-glass pages', () => {
  it('fills the page with one valid panel on every trim and level', () => {
    for (const [w, h] of TRIMS) {
      for (const level of LEVELS) {
        for (const seed of [3, 11]) {
          const ctx = kdpCtx(w, h, seed)
          const [page, ...rest] = generate({ ...base, level, seed }, ctx)
          const tag = `${w}x${h} ${level} ${seed}`
          expect(rest, tag).toHaveLength(0)
          const panel = panelOf(page!.objects)
          expect(panel, tag).toBeDefined()
          assertObjectsInSafeMargin(page!.objects, ctx)
          const box = { left: panel!.left, top: panel!.top, width: panel!.width!, height: panel!.height! }
          expect(checkSgDrawnPanel(panel!, box), tag).toEqual([])
          // The panel is the page: it takes most of what the safe area holds,
          // less the even white margin around the window.
          const safeW = ctx.pageWidth - ctx.margin.left - ctx.margin.right
          const safeH = ctx.pageHeight - ctx.margin.top - ctx.margin.bottom
          expect((box.width * box.height) / (safeW * safeH), tag).toBeGreaterThan(0.62)
          expect(parseSgBook([labelOf(page!.objects)]), tag).toHaveLength(1)
        }
      }
    }
  }, 120_000)

  it('prints black lines only: no fills, no grey, no text in the art', () => {
    const [page] = generate(base, kdpCtx(8.5, 11))
    const panel = panelOf(page!.objects)!
    for (const child of panel.objects!) {
      expect(child.type).toBe('path')
      expect(child.stroke).toBe(STUDIO_INK)
      expect(child.fill).toBe('transparent')
      expect(child.strokeWidth).toBeGreaterThanOrEqual(2)
      expect(child.strokeUniform).toBe(true)
    }
    // Only the heading and the instruction are text.
    expect(page!.objects.filter((o) => o.type === 'textbox')).toHaveLength(2)
  })

  it('keeps to the chosen theme', () => {
    for (const theme of SG_THEMES.map((t) => t.value)) {
      const allowed = new Set(themeSubjects(theme).map((s) => s.id))
      for (const seed of [5, 6, 7]) {
        const [page] = generate({ ...base, theme, seed }, kdpCtx(6, 9, seed))
        const [entry] = parseSgBook([labelOf(page!.objects)])
        expect(allowed.has(entry!.subject), `${theme} ${entry?.subject}`).toBe(true)
      }
    }
  }, 60_000)

  it('says plainly when the page is too small, instead of printing a thumbnail', () => {
    const [page] = generate(base, kdpCtx(3, 3.5))
    expect(panelOf(page!.objects)).toBeUndefined()
    expect(page!.objects.some((o) => o.text === SG_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
  })

  it('gives two sellers different pages on the same settings and seed', () => {
    let differ = 0
    for (let seed = 1; seed <= 8; seed++) {
      const a = labelOf(generate({ ...base, seed }, kdpCtx(6, 9, seed, [], saltOf(1)))[0]!.objects)
      clearStudioRecentContent()
      const b = labelOf(generate({ ...base, seed }, kdpCtx(6, 9, seed, [], saltOf(2)))[0]!.objects)
      clearStudioRecentContent()
      if (a !== b) differ++
    }
    expect(differ).toBeGreaterThanOrEqual(7)
  }, 60_000)
})

describe('stained-glass book variety', () => {
  /** Build a book page by page, each run seeing the pages before it, as the Studio does. */
  function buildBook(theme: string, pages: number, trim: readonly [number, number] = [6, 9]): SgBookEntry[] {
    const labels: string[] = []
    for (let i = 0; i < pages; i++) {
      const seed = 9_001 + i * 7_919
      const [page] = generate({ ...base, theme, seed }, kdpCtx(trim[0], trim[1], seed, [...labels]))
      const label = labelOf(page!.objects)
      expect(label, `page ${i}`).not.toBe('')
      labels.push(label)
    }
    return parseSgBook(labels)
  }

  it('never repeats a subject in a book until the theme is used up', () => {
    const book = buildBook('mix', 24)
    expect(new Set(book.map((e) => e.subject)).size).toBe(book.length)
  }, 120_000)

  it('brings a subject back only as a new version in a new window', () => {
    const theme = 'travel'
    const count = themeSubjects(theme).length
    const book = buildBook(theme, count + 4)
    const labels = book.map(sgPageLabel)
    expect(new Set(labels).size).toBe(labels.length)
    // Every subject is used once before any is used twice.
    expect(new Set(book.slice(0, count).map((e) => e.subject)).size).toBe(count)
    for (const entry of book.slice(count)) {
      const earlier = book.slice(0, count).find((e) => e.subject === entry.subject)!
      expect(entry.variant).not.toBe(earlier.variant)
      expect(entry.composition).not.toBe(earlier.composition)
    }
    // Neighbouring pages never share a window design.
    for (let i = 1; i < book.length; i++) expect(book[i]!.composition).not.toBe(book[i - 1]!.composition)
  }, 120_000)

  it('ignores labels it did not write', () => {
    expect(parseSgBook(['', 'teapot', 'nope|a|b', 'rocking-chair|back0.rocker0.arm0|rect.tiles.even.-.-.-'])).toEqual([
      { subject: 'rocking-chair', variant: 'back0.rocker0.arm0', composition: 'rect.tiles.even.-.-.-' },
    ])
  })

  it('reads the book style off a label, and still reads labels printed before styles', () => {
    const label = 'teapot|body0.spout0.lid0|arch.plain.rings.-.-.halo|st01230120120'
    const [entry] = parseSgBook([label])
    expect(entry?.style).toBe('st01230120120')
    expect(sgPageLabel(entry!)).toBe(label)
  })

  it('deals a different subject for an attempt that excluded the first', () => {
    const first = pickSgDesign({ theme: 'mix', seed: 5, ownerSalt: saltOf(3), aspect: 1.3 })!
    const second = pickSgDesign({ theme: 'mix', seed: 5, ownerSalt: saltOf(3), aspect: 1.3, exclude: new Set([first.subject.id]), attempt: 1 })!
    expect(second.subject.id).not.toBe(first.subject.id)
  })
})

describe('stained-glass mosaic', () => {
  const detailFor = (level: SgLevel) => SG_LEVELS.find((l) => l.value === level)!.detail

  it('leaves every region colorable, whatever the composition', () => {
    const rng = createRng(77)
    const subjects = SG_SUBJECTS.filter((_, i) => i % 5 === 0)
    let built = 0
    for (const [i, s] of subjects.entries()) {
      const composition = dealComposition({ subject: s, rng, aspect: 1.35 })
      expect(isValidComposition(composition)).toBe(true)
      const variant = sgVariants(s)[i % sgVariants(s).length]!
      const level = LEVELS[i % LEVELS.length]!
      const result = buildMosaic({
        box: { minX: 40, minY: 120, maxX: 40 + 6.5 * DPI, maxY: 120 + 8.6 * DPI },
        drawing: sgVariantDrawing(s, variant),
        composition,
        detail: detailFor(level),
        rng: createRng(i + 1),
      })
      // A window too cramped for the subject is refused cleanly (the page then deals another).
      if (!result.ok) {
        expect(result.reason, `${s.id} ${compositionKey(composition)}`).toBe('The subject does not fit inside this window.')
        continue
      }
      built++
      const mosaic = result
      expect(mosaic.narrowest).toBeGreaterThanOrEqual(SG_FLOOR.minWidth)
      expect(mosaic.smallest).toBeGreaterThanOrEqual(SG_FLOOR.minArea)
      expect(mosaic.regions).toBeGreaterThanOrEqual(30)
      const design = { subject: s, variant, composition }
      expect(runSgKdpPreflight({ design, mosaic }).errors).toEqual([])
    }
    expect(built).toBeGreaterThanOrEqual(subjects.length - 1)
  }, 60_000)

  it('refuses a page the book already has, and a subject printed too small', () => {
    const s = SG_SUBJECTS[0]!
    const variant = sgVariants(s)[0]!
    const composition: SgComposition = { frame: 'rect', border: 'tiles', pattern: 'even', sun: null, scenery: null, halo: false }
    const result = buildMosaic({
      box: { minX: 0, minY: 0, maxX: 6 * DPI, maxY: 8 * DPI },
      drawing: sgVariantDrawing(s, variant),
      composition,
      detail: detailFor('classic'),
      rng: createRng(4),
    })
    expect(result.ok).toBe(true)
    const mosaic = result as SgMosaic & { ok: true }
    const design = { subject: s, variant, composition }
    const entry = { subject: s.id, variant: sgVariantKey(s, variant), composition: compositionKey(composition) }
    expect(runSgKdpPreflight({ design, mosaic, book: [entry] }).errors).toContain('This book already has this exact design.')
    // The same design in another book's pen is still the same page.
    expect(runSgKdpPreflight({ design, mosaic, book: [{ ...entry, style: 'st00000000000' }] }).errors).toContain(
      'This book already has this exact design.',
    )
    const tiny = { ...mosaic, subject: { minX: 10, minY: 10, maxX: 40, maxY: 40 } }
    expect(runSgKdpPreflight({ design, mosaic: tiny }).ok).toBe(false)
    const sparse = { ...mosaic, regions: 5 }
    expect(runSgKdpPreflight({ design, mosaic: sparse }).ok).toBe(false)
  })

  it('catches grey or filled ink in a drawn panel', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const panel = panelOf(page!.objects)!
    const box = { left: panel.left, top: panel.top, width: panel.width!, height: panel.height! }
    const grey = { ...panel, objects: panel.objects!.map((c, i) => (i === 0 ? { ...c, stroke: '#888888' } : c)) }
    expect(checkSgDrawnPanel(grey, box)).toContain('A line in the panel is not black.')
    const filled = { ...panel, objects: panel.objects!.map((c, i) => (i === 0 ? { ...c, fill: '#000000' } : c)) }
    expect(checkSgDrawnPanel(filled, box)).toContain('A piece of the panel is filled in.')
  })
})

describe('stained-glass geometry', () => {
  it('shares every Voronoi edge between exactly two seeds', () => {
    const seeds: Pt[] = [
      { x: 10, y: 10 },
      { x: 60, y: 15 },
      { x: 35, y: 50 },
      { x: 80, y: 70 },
      { x: 15, y: 85 },
    ]
    const edges = voronoiEdges(seeds, { minX: 0, minY: 0, maxX: 100, maxY: 100 })
    expect(edges.length).toBeGreaterThanOrEqual(5)
    for (const e of edges) {
      const mid = { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }
      const di = Math.hypot(mid.x - seeds[e.i]!.x, mid.y - seeds[e.i]!.y)
      const dj = Math.hypot(mid.x - seeds[e.j]!.x, mid.y - seeds[e.j]!.y)
      expect(Math.abs(di - dj)).toBeLessThan(1e-6)
    }
  })

  it('measures regions the way a printer prints them', () => {
    // A 100 x 100 box split down the middle: two regions ~50 wide.
    const square = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
      { x: 0, y: 0 },
    ]
    const report = rasterCheck(
      [
        { pts: square, width: 2 },
        { pts: [{ x: 50, y: 0 }, { x: 50, y: 100 }], width: 2 },
      ],
      { minX: -2, minY: -2, maxX: 102, maxY: 102 },
    )
    expect(report.regions).toHaveLength(2)
    for (const r of report.regions) {
      expect(r.width).toBeGreaterThan(40)
      expect(r.width).toBeLessThan(52)
      expect(r.area).toBeGreaterThan(4_400)
    }
  })

  it('builds every window and border as a closed band', () => {
    for (const kind of FRAME_KINDS) {
      for (const border of BORDER_KINDS) {
        const bounds = { minX: 0, minY: 0, maxX: 500, maxY: 700 }
        const frame = buildFrame({ kind, border, bounds, band: 25, tile: 90 })
        expect(frame.outer.length).toBeGreaterThan(3)
        const centre = { x: 250, y: 500 }
        expect(pointInRing(centre, frame.outer)).toBe(true)
        expect(pointInRing(centre, frame.inner)).toBe(true)
        if (border === 'none') expect(frame.inner).toBe(frame.outer)
        else expect(Math.abs(ringArea(frame.inner))).toBeLessThan(Math.abs(ringArea(frame.outer)))
        if (border === 'tiles' || border === 'blocks') expect(frame.dividers.length).toBeGreaterThan(8)
      }
    }
  })

  it('prints at the documented weights, in every pen', () => {
    expect(SG_INK_PROFILES[0]).toBe(SG_INK_WIDTH)
    for (const ink of SG_INK_PROFILES) {
      expect(ink.cell).toBeGreaterThanOrEqual(2)
      expect(ink.silhouette).toBeGreaterThan(ink.part)
      expect(ink.frame).toBeGreaterThan(ink.silhouette)
    }
  })
})

/* ------------------------------------------------------------------ *
 * Book styles, page hands, and how far apart two sellers' pages are
 * ------------------------------------------------------------------ */

/** The ink of some runs, stamped on a grid of `cell`-px squares: what a glance at the page takes in. */
function inkMask(runs: readonly SgInkRun[], cell: number, only?: ReadonlySet<string>): Set<string> {
  const out = new Set<string>()
  for (const run of runs) {
    if (only && !only.has(run.ink)) continue
    for (const line of run.lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!
        const b = line[i]!
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)))
        for (let t = 0; t <= n; t++) {
          out.add(`${Math.floor((a.x + ((b.x - a.x) * t) / n) / cell)},${Math.floor((a.y + ((b.y - a.y) * t) / n) / cell)}`)
        }
      }
    }
  }
  return out
}

/** Shared ink over all ink: 1 is the same picture, 0 nothing in common. */
function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let both = 0
  for (const k of a) if (b.has(k)) both++
  return both / (a.size + b.size - both)
}

/** An eighth of an inch: finer than a glance resolves, coarser than a hand's wobble. */
const GLANCE = DPI / 8
const SUBJECT_INK = new Set(['silhouette', 'part'])

describe('stained-glass book style', () => {
  it('writes a style as a token and reads it back, refusing tokens it did not write', () => {
    for (let n = 1; n <= 20; n++) {
      const style = dealSgStyle({ ownerSalt: saltOf(n), seed: n })
      expect(parseSgStyleToken(sgStyleToken(style))).toEqual(style)
    }
    for (const bad of [undefined, '', 'st', 'st123', 'xx01230120120', 'st9999999999', 'st0123012012a']) {
      expect(parseSgStyleToken(bad), String(bad)).toBeNull()
    }
  })

  it("deals each seller, and each of a seller's books, its own style", () => {
    const bySeller = new Set(Array.from({ length: 60 }, (_, n) => sgStyleToken(dealSgStyle({ ownerSalt: saltOf(n + 1), seed: 7 }))))
    expect(bySeller.size).toBeGreaterThanOrEqual(58)
    const byBook = new Set(Array.from({ length: 30 }, (_, n) => sgStyleToken(dealSgStyle({ ownerSalt: saltOf(1), seed: 100 + n }))))
    expect(byBook.size).toBeGreaterThanOrEqual(29)
  })

  it("keeps a seller's new book far from the looks they printed lately", () => {
    const recent: string[] = []
    for (let book = 0; book < 8; book++) {
      const style = dealSgStyle({ ownerSalt: saltOf(5), seed: 1_000 + book, recent })
      for (const past of recent) expect(sgStyleDistance(style, parseSgStyleToken(past)!)).toBeGreaterThanOrEqual(5)
      recent.unshift(sgStyleToken(style))
    }
  })

  it("prints a whole book in one style, and the seller's next book in another", () => {
    const book = (first: number) => {
      const labels: string[] = []
      for (let i = 0; i < 4; i++) {
        const seed = first + i * 104_729
        const [page] = generate({ ...base, seed }, kdpCtx(6, 9, seed, [...labels], saltOf(9)))
        labels.push(labelOf(page!.objects))
      }
      return parseSgBook(labels)
    }
    const first = book(11)
    const styles = new Set(first.map((e) => e.style))
    expect(styles.size).toBe(1)
    expect(parseSgStyleToken([...styles][0])).not.toBeNull()
    const second = book(12)
    expect(new Set(second.map((e) => e.style)).size).toBe(1)
    expect(sgStyleDistance(parseSgStyleToken(first[0]!.style)!, parseSgStyleToken(second[0]!.style)!)).toBeGreaterThanOrEqual(5)
  }, 120_000)

  it('adopts the style of a book whose pages already carry one', () => {
    const [page] = generate(base, kdpCtx(6, 9, 42, ['teapot|body0.spout0.lid0|arch.plain.rings.-.-.halo|st21302121021']))
    expect(parseSgBook([labelOf(page!.objects)])[0]!.style).toBe('st21302121021')
  })
})

describe('stained-glass page hands', () => {
  const plainWindow: SgComposition = { frame: 'rect', border: 'none', pattern: 'even', sun: null, scenery: null, halo: false }
  /** The smallest size any page prints a subject (as in the library test above), and the tightest floor. */
  const smallestBox = { minX: 0, minY: 0, maxX: 250, maxY: 287 }
  const floorDetail = { cell: 10 * DPI, subjectCell: 10 * DPI, minWidth: SG_FLOOR.minWidth, minArea: SG_FLOOR.minArea }
  const extremes: SgHand[] = [
    { aspect: SG_HAND_LIMITS.aspect[0], taper: SG_HAND_LIMITS.taper[1], tilt: 0, fill: SG_HAND_LIMITS.fill[0] },
    { aspect: SG_HAND_LIMITS.aspect[1], taper: SG_HAND_LIMITS.taper[0], tilt: 0, fill: SG_HAND_LIMITS.fill[0] },
  ]

  it('keeps every dealt hand inside its limits, and tilts only what flies', () => {
    for (let n = 1; n <= 40; n++) {
      const style = dealSgStyle({ ownerSalt: saltOf(n), seed: n })
      const rng = createRng(n)
      for (const s of SG_SUBJECTS) {
        const hand = dealSgHand(style, s, rng)
        expect(hand.aspect).toBeGreaterThanOrEqual(SG_HAND_LIMITS.aspect[0])
        expect(hand.aspect).toBeLessThanOrEqual(SG_HAND_LIMITS.aspect[1])
        expect(Math.abs(hand.taper)).toBeLessThanOrEqual(SG_HAND_LIMITS.taper[1])
        expect(hand.fill).toBeGreaterThanOrEqual(SG_HAND_LIMITS.fill[0])
        expect(hand.fill).toBeLessThanOrEqual(SG_HAND_LIMITS.fill[1])
        if (sgSubjectFlies(s)) expect(Math.abs(hand.tilt)).toBeLessThanOrEqual(SG_HAND_LIMITS.tilt)
        else expect(hand.tilt).toBe(0)
      }
    }
    expect(SG_SUBJECTS.filter(sgSubjectFlies).map((s) => s.id).sort()).toEqual(['butterfly', 'hot-air-balloon', 'songbird'])
  })

  /**
   * The step-down a page takes when its hand pinches a part: half strength at
   * the far corners of the limits, in every pen, at the smallest print size.
   * While this holds, a page never has to give up a subject because of its hand.
   */
  it.each(SG_SUBJECTS.map((s) => [s.id]))('leaves no uncolorable piece in %s at half the strongest hand, in any pen', (id) => {
    const s = sgSubjectById(id)!
    const failures: string[] = []
    const tilts = sgSubjectFlies(s) ? [SG_HAND_LIMITS.tilt, -SG_HAND_LIMITS.tilt] : [0]
    for (const v of sgVariants(s)) {
      for (const [e, extreme] of extremes.entries()) {
        for (const tilt of tilts) {
          const hand = easeSgHand({ ...extreme, tilt }, 0.5)
          for (const [p, ink] of SG_INK_PROFILES.entries()) {
            const result = buildMosaic({
              box: smallestBox,
              drawing: applySgHand(sgVariantDrawing(s, v), hand),
              composition: plainWindow,
              detail: floorDetail,
              rng: createRng(1),
              style: { ink, fill: hand.fill },
            })
            if (!result.ok) failures.push(`${sgVariantKey(s, v)} hand${e} tilt${tilt} pen${p}: ${result.reason}`)
            // The fill floor sits above this size, so a fill never shrinks a subject below what this proves.
            else expect(Math.max(result.subject.maxX - result.subject.minX, result.subject.maxY - result.subject.minY)).toBeLessThan(SG_FILL_FLOOR_INCHES * DPI)
          }
        }
      }
    }
    expect(failures).toEqual([])
  }, 60_000)

  it('builds colorable diamond-quarry and honeycomb backgrounds', () => {
    const detail = SG_LEVELS.find((l) => l.value === 'classic')!.detail
    for (const pattern of ['lattice', 'honeycomb'] as const) {
      for (const [i, s] of SG_SUBJECTS.filter((_, j) => j % 9 === 0).entries()) {
        const composition: SgComposition = { frame: FRAME_KINDS[i % FRAME_KINDS.length]!, border: 'tiles', pattern, sun: null, scenery: null, halo: false }
        const variant = sgVariants(s)[0]!
        const result = buildMosaic({
          box: { minX: 0, minY: 0, maxX: 6 * DPI, maxY: 8.2 * DPI },
          drawing: sgVariantDrawing(s, variant),
          grounded: s.ground !== 'none',
          composition,
          detail,
          rng: createRng(i + 3),
        })
        expect(result.ok, `${pattern} ${s.id} ${result.ok ? '' : result.reason}`).toBe(true)
        const mosaic = result as SgMosaic & { ok: true }
        expect(mosaic.narrowest).toBeGreaterThanOrEqual(SG_FLOOR.minWidth)
        expect(runSgKdpPreflight({ design: { subject: s, variant, composition }, mosaic }).errors).toEqual([])
      }
    }
  }, 60_000)

  it('always finds a page on the smallest trim, whatever the seller and level', () => {
    for (const level of LEVELS) {
      for (let n = 1; n <= 6; n++) {
        const seed = 500 + n
        const [page] = generate({ ...base, level, seed }, kdpCtx(5, 8, seed, [], saltOf(40 + n)))
        expect(panelOf(page!.objects), `${level} seller ${n}`).toBeDefined()
      }
    }
  }, 120_000)
})

describe('stained-glass pages across sellers', () => {
  /**
   * The worst case for two sellers: the same subject, the same version and
   * the same window. Before book styles and hands the subject's outline was
   * the same picture on both pages (overlap 1.0); now it must not be.
   */
  it('draws the same subject in the same window differently for different sellers', () => {
    const composition: SgComposition = { frame: 'rect', border: 'tiles', pattern: 'even', sun: null, scenery: null, halo: false }
    const detail = SG_LEVELS.find((l) => l.value === 'classic')!.detail
    const box = { minX: 0, minY: 0, maxX: 5.8 * DPI, maxY: 7.6 * DPI }
    const build = (seller: number, s: (typeof SG_SUBJECTS)[number]) => {
      const ownerSalt = saltOf(seller)
      const rng = createRngFromSeedInput({ ownerSalt, templateKey: SG_TEMPLATE_KEY, configHash: 'test', pageNonce: 1 })
      const style = dealSgStyle({ ownerSalt, seed: 1 })
      const hand = dealSgHand(style, s, rng)
      const drawing = applySgHand(sgVariantDrawing(s, sgVariants(s)[0]!), hand)
      const result = buildMosaic({ box, drawing, grounded: s.ground !== 'none', composition, detail, rng, style: sgMosaicStyle(style, hand) })
      expect(result.ok, `${s.id} seller ${seller}`).toBe(true)
      return (result as SgMosaic & { ok: true }).runs
    }
    const subjectOverlaps: number[] = []
    const pageOverlaps: number[] = []
    for (const s of SG_SUBJECTS.filter((_, i) => i % 6 === 0)) {
      for (let pair = 0; pair < 3; pair++) {
        const a = build(2 * pair + 1, s)
        const b = build(2 * pair + 2, s)
        subjectOverlaps.push(overlap(inkMask(a, GLANCE, SUBJECT_INK), inkMask(b, GLANCE, SUBJECT_INK)))
        pageOverlaps.push(overlap(inkMask(a, GLANCE), inkMask(b, GLANCE)))
      }
    }
    const mean = (xs: number[]) => xs.reduce((t, x) => t + x, 0) / xs.length
    expect(mean(subjectOverlaps)).toBeLessThan(0.6)
    expect(Math.max(...subjectOverlaps)).toBeLessThan(0.85)
    expect(mean(pageOverlaps)).toBeLessThan(0.6)
  }, 120_000)

  it('gives two sellers on the same settings and seed different book styles', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const a = parseSgBook([labelOf(generate({ ...base, seed }, kdpCtx(6, 9, seed, [], saltOf(21)))[0]!.objects)])[0]!
      clearStudioRecentContent()
      const b = parseSgBook([labelOf(generate({ ...base, seed }, kdpCtx(6, 9, seed, [], saltOf(22)))[0]!.objects)])[0]!
      clearStudioRecentContent()
      expect(a.style).not.toBe(b.style)
    }
  }, 60_000)
})
