import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import {
  STUDIO_ANSWER_INK_MONO,
  STUDIO_ANSWER_INK_MONO_TEMPLATES,
  STUDIO_PAPER,
} from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { contentFingerprint } from '../studio-content-fingerprint'
import {
  assertGeneratorEntropy,
  assertObjectsInSafeMargin,
  runGeneratorContractTests,
} from '../studio-generator-test'
import { officeRelicsTemplate } from './generate'
import { RELIC_ART, RELIC_DRAWINGS, type RelicDrawing, type RelicDrawingId } from './drawings'
import {
  MAX_PER_CATEGORY,
  OFFICE_RELICS,
  OR_BOOK_FULL_MESSAGE,
  OR_DEFAULT_TITLE,
  OR_LEVELS,
  OR_PAGE_TOO_SMALL_MESSAGE,
  bookRelicIds,
  nameKey,
  orInstructionOptions,
  parseOrLevel,
  pickRelics,
  relicById,
  relicFaults,
  relicsClash,
  type OfficeRelicsLevel,
  type PlacedRelic,
} from './content'
import {
  ANSWER_FONT_MIN,
  MAX_ITEMS_PER_PAGE,
  MIN_ITEMS_PER_PAGE,
  PICTURE_MIN_H,
  PICTURE_MIN_W,
  orPrintNote,
  orWorstCasePlan,
  pxToIn,
} from './layout'
import { checkOrDrawnPage, runOrKdpPreflight } from './kdp-preflight'
import { buildRelicPicture, elementPathData, mergedRuns, relicInkBox } from './picture'
import { parseOrRemoteData } from './prefetch'
import { OR_BANK_LABELS, OR_FRAME_STYLES, OR_NUMBER_STYLES, orHouseStyle } from './style'
import {
  artLabel,
  isValidVariant,
  mirrorPathData,
  referenceVariant,
  relicArtDrawing,
  relicVariants,
  variantKey,
  type RelicVariant,
} from './variants'

const FONT = 'PT Serif'
const LEVELS = OR_LEVELS.map((level) => level.value)

const base: StudioConfig = {
  ...buildDefaultConfig(officeRelicsTemplate),
  showTitle: true,
  title: OR_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A seller's 128-bit puzzle salt, as the session delivers it. */
const saltOf = (n: number) => n.toString(16).padStart(32, '0')

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 42, bookIds: string[] = [], ownerSalt?: string): StudioGenerateContext => ({
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
  remoteData: { bookIds },
  ownerSalt,
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8, 10],
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return officeRelicsTemplate.generate(config, ctx)
}

const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')
const isPicture = (o: StudioFabricObject) => o.data?.source === 'office-relic'
const isNumber = (o: StudioFabricObject) => /^\d[.)]$/.test(clean(o.text))
const isBankLabel = (text: string) => OR_BANK_LABELS.includes(text)

/** One salt per house-style option, so every frame and label is laid out on every trim. */
const STYLE_SALTS = (() => {
  const wanted = new Map<string, string>()
  for (let n = 1; n < 2000 && wanted.size < OR_FRAME_STYLES.length + OR_NUMBER_STYLES.length; n++) {
    const style = orHouseStyle(saltOf(n))
    for (const key of [`frame:${style.frame}`, `number:${style.number}`]) if (!wanted.has(key)) wanted.set(key, saltOf(n))
  }
  return [...new Set(wanted.values())]
})()
const pictureIds = (objects: StudioFabricObject[]) =>
  objects.filter(isPicture).map((o) => String(o.data?.[STUDIO_CONTENT_LABEL_KEY]))
const texts = (objects: StudioFabricObject[]) => objects.map((o) => clean(o.text)).filter(Boolean)

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(officeRelicsTemplate, {
  // Answers live only on the answer-page source; the puzzle page carries none.
  expectAnswers: false,
  configOverrides: { showTitle: true, title: OR_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(officeRelicsTemplate, { seeds: 60 })

describe('office-relics registry', () => {
  it('is registered once, in the word tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === 'office-relics')
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('word')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('office-relics')).toBe(true)
  })

  it('asks one question — the level — on top of the shared fields', () => {
    expect(officeRelicsTemplate.configSchema.map((f) => f.key)).toEqual(['level'])
    expect(parseOrLevel(undefined)).toBe('classic')
    expect(parseOrLevel('nonsense')).toBe('classic')
  })
})

/* ------------------------------------------------------------------ *
 * Catalog
 * ------------------------------------------------------------------ */

describe('office-relics catalog', () => {
  it('holds a broad, valid catalog', () => {
    expect(OFFICE_RELICS.length).toBeGreaterThanOrEqual(45)
    for (const r of OFFICE_RELICS) expect(relicFaults(r), r.id).toEqual([])
    expect(new Set(OFFICE_RELICS.map((r) => r.id)).size).toBe(OFFICE_RELICS.length)
    expect(new Set(OFFICE_RELICS.map((r) => nameKey(r.name))).size).toBe(OFFICE_RELICS.length)
    // Every tier and every category is represented, across several decades.
    expect(new Set(OFFICE_RELICS.map((r) => r.tier))).toEqual(new Set([1, 2, 3]))
    expect(new Set(OFFICE_RELICS.map((r) => r.category)).size).toBeGreaterThanOrEqual(8)
    expect(new Set(OFFICE_RELICS.map((r) => r.decade)).size).toBeGreaterThanOrEqual(5)
    // Every level can fill several pages from its first-choice tiers alone.
    for (const level of OR_LEVELS) {
      const first = OFFICE_RELICS.filter((r) => level.tierRank[r.tier] === 0)
      expect(first.length, level.value).toBeGreaterThanOrEqual(20)
    }
  })

  it('uses every drawing, and every drawing belongs to one object', () => {
    const used = OFFICE_RELICS.flatMap((r) => r.drawings)
    expect(new Set(used).size).toBe(used.length)
    expect(new Set(used)).toEqual(new Set(Object.keys(RELIC_DRAWINGS)))
  })

  it('never lets one name answer two pictures that could share a page', () => {
    const owners = new Map<string, string[]>()
    for (const r of OFFICE_RELICS) {
      for (const name of [r.name, ...r.aliases]) {
        const key = nameKey(name)
        owners.set(key, [...(owners.get(key) ?? []), r.id])
      }
    }
    for (const [name, ids] of owners) {
      if (ids.length < 2) continue
      const [first, ...rest] = ids.map((id) => relicById(id)!)
      // A shared alias ("Telephone") is fine only inside a lookalike group,
      // which never shares a page.
      for (const other of rest) expect(relicsClash(first!, other), `"${name}" is shared by ${ids}`).toBe(true)
    }
    // An answer is never another object's alias.
    for (const r of OFFICE_RELICS) {
      const others = OFFICE_RELICS.filter((o) => o.id !== r.id).flatMap((o) => o.aliases.map(nameKey))
      expect(others, r.id).not.toContain(nameKey(r.name))
    }
  })

  it('names kinds of object, never makers or model numbers', () => {
    const brands = /\b(ibm|xerox|kodak|dymo|olivetti|smith corona|remington|olympia|royal|underwood|motorola|nokia|apple|commodore|dictaphone|bic|parker|sheaffer|scotch|post-it|thermos|tupperware|polaroid)\b/i
    for (const r of OFFICE_RELICS) {
      expect(r.name, r.id).not.toMatch(brands)
      expect(r.name, r.id).not.toMatch(/\d/)
      // A genericised trade name may be *accepted*, never printed as the answer.
      expect(r.name).not.toMatch(/rolodex|ditto|carousel/i)
    }
  })

  it('reads book labels back to objects, ignoring anything else', () => {
    expect(bookRelicIds(['typewriter', ' safe ', 'not-a-relic', ''])).toEqual(['typewriter', 'safe'])
    expect(parseOrRemoteData({ bookIds: ['a', 3, null] })).toEqual({ bookIds: ['a'] })
    expect(parseOrRemoteData(undefined)).toEqual({ bookIds: [] })
  })
})

/* ------------------------------------------------------------------ *
 * Drawings
 * ------------------------------------------------------------------ */

describe('office-relics drawings', () => {
  // Every version of every drawing: each one prints somewhere.
  const entries = (Object.keys(RELIC_ART) as RelicDrawingId[]).flatMap((id) =>
    relicVariants(id).map((variant): [string, RelicDrawing] => [`${id}@${variantKey(id, variant)}`, relicArtDrawing(id, variant)]),
  )

  it('keeps its ink on its own canvas, in a shape that prints well in a card', () => {
    for (const [id, drawing] of entries) {
      const ink = relicInkBox(drawing)
      // The ink box carries a 2-unit pad; the ink itself stays on the canvas.
      expect(ink.left + 2, id).toBeGreaterThanOrEqual(0)
      expect(ink.top + 2, id).toBeGreaterThanOrEqual(0)
      expect(ink.left + ink.width - 2, id).toBeLessThanOrEqual(drawing.width)
      expect(ink.top + ink.height - 2, id).toBeLessThanOrEqual(drawing.height)
      expect(ink.width / ink.height, id).toBeGreaterThan(0.3)
      expect(ink.width / ink.height, id).toBeLessThan(2.2)
    }
  })

  it('is line art: known shapes, finite numbers, no text, little solid ink', () => {
    const shapes = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'])
    for (const [id, drawing] of entries) {
      expect(drawing.elements.length, id).toBeGreaterThanOrEqual(4)
      for (const [shape, attrs] of drawing.elements) {
        expect(shapes.has(shape), `${id}: ${shape}`).toBe(true)
        expect(Object.keys(attrs).some((k) => /text|font|href|image/i.test(k)), id).toBe(false)
        for (const [key, value] of Object.entries(attrs)) {
          if (typeof value === 'number') expect(Number.isFinite(value), `${id}.${key}`).toBe(true)
        }
        expect(elementPathData([shape, attrs]).length, id).toBeGreaterThan(0)
      }
      // Solid ink is for a handful of small marks, not shading.
      const ink = drawing.elements.filter(([, a]) => a.fill === 'ink')
      expect(ink.length <= 2 || id.startsWith('punch-card@'), id).toBe(true)
      // Absolute path commands only, so every version mirrors exactly.
      for (const [shape, attrs] of drawing.elements) {
        if (shape === 'path') expect(String(attrs.d), id).not.toMatch(/[mlhvqcaz]/)
      }
    }
  })

  it('merges same-style runs into few paths, keeping paper shapes separate and in order', () => {
    const typewriter = mergedRuns(RELIC_DRAWINGS.typewriter)
    expect(typewriter.length).toBeLessThan(RELIC_DRAWINGS.typewriter.elements.length / 3)
    const spike = mergedRuns(RELIC_DRAWINGS['memo-spike'])
    const papers = RELIC_DRAWINGS['memo-spike'].elements.filter(([, a]) => a.fill === 'paper').length
    expect(spike.filter((run) => run.style === 'paper')).toHaveLength(papers)
    // The spike is drawn before the slips that cover it.
    expect(spike[0]!.style).toBe('main')
  })

  it('builds a monochrome group pinned to its design frame and fitted to its box', () => {
    const tag = { templateKey: 'office-relics', instanceId: 't', pageRole: 'single' as const }
    // Every version is proved against the design rules above; building every
    // one as a Fabric group is slow, so the reference drawings stand in here.
    for (const [id, drawing] of Object.entries(RELIC_DRAWINGS) as [RelicDrawingId, RelicDrawing][]) {
      const picture = buildRelicPicture(
        drawing,
        { centerX: 200, centerY: 150, boxWidth: 180, boxHeight: 120, stroke: 2.6, fineStroke: 1.7 },
        tag,
        { [STUDIO_CONTENT_LABEL_KEY]: id },
      )
      const ink = relicInkBox(drawing)
      expect(picture.width, id).toBeCloseTo(ink.width, 3)
      expect(picture.height, id).toBeCloseTo(ink.height, 3)
      expect(picture.width! * picture.scaleX!, id).toBeLessThanOrEqual(180)
      expect(picture.height! * picture.scaleY!, id).toBeLessThanOrEqual(120)
      const [frame, ...children] = picture.objects!
      // The frame sits dead centre: the picture is placed by its drawing, not by how far a stroke reaches.
      expect(frame!.left, id).toBeCloseTo(0, 3)
      expect(frame!.top, id).toBeCloseTo(0, 3)
      expect(picture.left).toBe(200)
      expect(picture.top).toBe(150)
      for (const child of children) {
        expect(String(child.type).toLowerCase(), id).toBe('path')
        expect(child.stroke, id).toBe('#000000')
        expect([2.6, 1.7]).toContain(child.strokeWidth)
        expect(['transparent', '#000000', STUDIO_PAPER]).toContain(child.fill)
      }
      expect(picture.data?.[STUDIO_CONTENT_LABEL_KEY]).toBe(id)
      expect(picture.studioRole).toBe('prompt')
    }
  })
})

/* ------------------------------------------------------------------ *
 * Choosing objects
 * ------------------------------------------------------------------ */

function assertFairPage(items: readonly PlacedRelic[]) {
  items.forEach((item, i) => {
    for (const earlier of items.slice(0, i)) expect(relicsClash(earlier.relic, item.relic)).toBe(false)
  })
  const perCategory = new Map<string, number>()
  for (const { relic } of items) perCategory.set(relic.category, (perCategory.get(relic.category) ?? 0) + 1)
  for (const n of perCategory.values()) expect(n).toBeLessThanOrEqual(MAX_PER_CATEGORY)
}

describe('office-relics selection', () => {
  it('deals fair, varied pages at every level', () => {
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 200; seed++) {
        const items = pickRelics({ count: 9, level, seed: seed * 7919 })
        expect(items).toHaveLength(9)
        assertFairPage(items)
        expect(new Set(items.map((i) => i.relic.category)).size).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('keeps each level to its tiers while they last', () => {
    const tiers = (level: OfficeRelicsLevel) =>
      Array.from({ length: 100 }, (_, s) => pickRelics({ count: 6, level, seed: s + 1 }))
        .flat()
        .map((i) => i.relic.tier)
    expect(new Set(tiers('gentle'))).toEqual(new Set([1]))
    expect(new Set(tiers('classic'))).toEqual(new Set([1, 2]))
    expect(new Set(tiers('challenging'))).toEqual(new Set([2, 3]))
  })

  it('never deals an object the book already shows, and fills a long book from the whole catalog', () => {
    const book: string[] = []
    for (let page = 0; page < 5; page++) {
      const items = pickRelics({ count: 9, level: 'gentle', seed: 100 + page, book })
      expect(items).toHaveLength(9)
      for (const item of items) expect(book).not.toContain(item.relic.id)
      book.push(...items.map((i) => i.relic.id))
    }
    // Five letter pages: every object shown once, gentle included.
    expect(new Set(book).size).toBe(45)
  })

  it('prefers objects this seller has not printed lately', () => {
    const first = pickRelics({ count: 6, level: 'classic', seed: 5 }).map((i) => i.relic.id)
    const next = pickRelics({ count: 6, level: 'classic', seed: 5, recent: first }).map((i) => i.relic.id)
    expect(next.filter((id) => first.includes(id))).toEqual([])
  })

  it('spreads objects evenly across many books', () => {
    const tally = new Map<string, number>()
    for (let s = 1; s <= 1500; s++) {
      for (const { relic } of pickRelics({ count: 6, level: 'classic', seed: s * 104729 })) {
        tally.set(relic.id, (tally.get(relic.id) ?? 0) + 1)
      }
    }
    const counts = OFFICE_RELICS.filter((r) => r.tier < 3).map((r) => tally.get(r.id) ?? 0)
    expect(Math.min(...counts)).toBeGreaterThan(0)
    expect(Math.max(...counts) / Math.min(...counts)).toBeLessThan(4)
  })
})

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

describe('office-relics page', () => {
  it('prints what the form promises on every KDP trim, large and inside the safe area', () => {
    for (const [w, h] of TRIMS) {
      for (const showTitle of [true, false]) {
        for (const level of LEVELS) {
          const config = { ...base, showTitle, title: showTitle ? OR_DEFAULT_TITLE : '', level }
          const ctx = kdpCtx(w, h)
          const plan = orWorstCasePlan({ page: ctx, config, level, instructions: orInstructionOptions(config), font: FONT })
          expect(plan, `${w}x${h} ${level}`).not.toBeNull()
          expect(plan!.count).toBeGreaterThanOrEqual(MIN_ITEMS_PER_PAGE)
          expect(plan!.count).toBeLessThanOrEqual(MAX_ITEMS_PER_PAGE)
          expect(plan!.pictureWidth).toBeGreaterThanOrEqual(PICTURE_MIN_W)
          expect(plan!.pictureHeight).toBeGreaterThanOrEqual(PICTURE_MIN_H)
          expect(plan!.answerFont).toBeGreaterThanOrEqual(ANSWER_FONT_MIN)

          const [page] = generate(config, ctx)
          expect(page!.objects.filter(isPicture), `${w}x${h} ${level}`).toHaveLength(plan!.count)
          expect(page!.objects.filter(isNumber)).toHaveLength(plan!.count)
          const note = orPrintNote({ page: ctx, config, level, instructions: orInstructionOptions(config), font: FONT })
          expect(note).toContain(`${plan!.count} pictures a page`)
          expect(note).toContain(`${pxToIn(plan!.pictureWidth)} x ${pxToIn(plan!.pictureHeight)} in`)

          assertObjectsInSafeMargin(page!.objects, ctx)
          assertObjectsInSafeMargin(page!.answerSourceObjects!, ctx)
        }
      }
    }
  })

  it('fits every house style on every trim, with the same grid for every seller', () => {
    for (const [w, h] of TRIMS) {
      for (const level of LEVELS) {
        const grids = STYLE_SALTS.map((salt) => {
          const ctx = kdpCtx(w, h, 42, [], salt)
          const [page] = generate({ ...base, level }, ctx)
          const pictures = page!.objects.filter(isPicture)
          assertObjectsInSafeMargin(page!.objects, ctx)
          assertObjectsInSafeMargin(page!.answerSourceObjects!, ctx)
          const field = { left: 0, top: 0, width: ctx.pageWidth, height: ctx.pageHeight }
          expect(checkOrDrawnPage(page!.objects, field, pictures.length), `${w}x${h} ${level} ${salt}`).toEqual([])
          expect(checkOrDrawnPage(page!.answerSourceObjects!, field, pictures.length)).toEqual([])
          return pictures.length
        })
        // The plan comes from the trim alone: a seller's style never changes how many pictures print.
        expect(new Set(grids).size, `${w}x${h} ${level}`).toBe(1)
      }
    }
  })

  it('keeps every card frame, stroke included, clear of the bottom safe edge on both pages', () => {
    const frameBottom = (objects: StudioFabricObject[]) =>
      Math.max(
        ...objects
          .filter((o) => o.type?.toLowerCase() === 'rect' && o.studioRole === 'structure' && (!o.fill || o.fill === 'transparent'))
          .map((o) => o.top + (o.height ?? 0) + (o.strokeWidth ?? 0) / 2),
      )
    for (const [w, h] of TRIMS) {
      for (const level of LEVELS) {
        for (const salt of STYLE_SALTS) {
          const ctx = kdpCtx(w, h, 42, [], salt)
          const safeBottom = ctx.pageHeight - ctx.margin.bottom
          const [page] = generate({ ...base, level }, ctx)
          expect(frameBottom(page!.objects), `${w}x${h} ${level} puzzle`).toBeLessThanOrEqual(safeBottom - 4)
          expect(frameBottom(page!.answerSourceObjects!), `${w}x${h} ${level} answers`).toBeLessThanOrEqual(safeBottom - 4)
        }
      }
    }
  })

  it('prefers fewer, larger pictures', () => {
    const count = (w: number, h: number) =>
      orWorstCasePlan({ page: kdpCtx(w, h), config: base, level: 'classic', instructions: orInstructionOptions(base), font: FONT })!
    expect(count(5, 8).count).toBe(4)
    expect(count(6, 9).count).toBe(6)
    expect(count(8.5, 11).count).toBe(9)
    for (const [w, h] of [[6, 9], [7, 10], [8.5, 11]] as const) {
      const plan = count(w, h)
      expect(plan.pictureWidth / DPI, `${w}x${h}`).toBeGreaterThanOrEqual(1.7)
      expect(plan.pictureHeight / DPI, `${w}x${h}`).toBeGreaterThanOrEqual(1.25)
    }
  })

  it('says so instead of printing a squint on a page too small for pictures', () => {
    const tiny: StudioGenerateContext = { ...kdpCtx(4, 5), remoteData: { bookIds: [] } }
    const [page] = generate(base, tiny)
    expect(page!.answerSourceObjects).toBeUndefined()
    expect(texts(page!.objects)).toContain(OR_PAGE_TOO_SMALL_MESSAGE)
  })

  it('keeps every answer off the puzzle page, hidden or not', () => {
    for (const level of LEVELS) {
      const [page] = generate({ ...base, level }, kdpCtx(8.5, 11))
      expect(harvestAnswers(page!.objects)).toHaveLength(0)
      const names = new Set(OFFICE_RELICS.map((r) => r.name))
      const bank = level === 'gentle'
      // Only the gentle word bank may name answers on the puzzle page, and it lists them all.
      const named = texts(page!.objects).filter((t) => names.has(t))
      expect(named).toHaveLength(0)
      expect(texts(page!.objects).some(isBankLabel)).toBe(bank)
    }
  })

  it('answers every picture under its own number, with its other names, on the answer page', () => {
    for (const level of LEVELS) {
      for (const seed of [42, 7, 1234]) {
        for (const [w, h] of TRIMS) {
          const [page] = generate({ ...base, seed, level }, kdpCtx(w, h, seed))
          const puzzleIds = pictureIds(page!.objects)
          const source = page!.answerSourceObjects!
          // Same pictures, same order.
          expect(pictureIds(source)).toEqual(puzzleIds)

          const key = buildAnswerPage(source, STUDIO_ANSWER_INK_MONO)
          expect(key.filter(isNumber).map((o) => clean(o.text))).toEqual(
            page!.objects.filter(isNumber).map((o) => clean(o.text)),
          )
          const pictures = key.filter(isPicture)
          const answers = key.filter((o) => o.studioRole === 'answer' && o.fontWeight === 700)
          expect(answers).toHaveLength(pictures.length)
          answers.forEach((answer, i) => {
            const relic = relicById(String(pictures[i]!.data?.[STUDIO_CONTENT_LABEL_KEY]))!
            expect(clean(answer.text).replace(/\n/g, ' '), `${w}x${h} #${i + 1}`).toBe(relic.name)
            expect(answer.visible).toBe(true)
            // The answer sits in its own picture's card: of every picture above
            // it, its own is the nearest.
            const x = answer.left + (answer.width ?? 0) / 2
            const above = pictures.filter((p) => p.top < answer.top)
            const nearest = above.reduce((best, p) =>
              Math.hypot(p.left - x, p.top - answer.top) < Math.hypot(best.left - x, best.top - answer.top) ? p : best,
            )
            expect(nearest, `${w}x${h} #${i + 1}`).toBe(pictures[i])
          })
          // Every object with other names shows at least the first that fits.
          const aliasTexts = key.filter((o) => o.studioRole === 'answer' && o.fontStyle === 'italic').map((o) => clean(o.text).replace(/\n/g, ' '))
          const withAliases = pictures.filter((p) => relicById(String(p.data?.[STUDIO_CONTENT_LABEL_KEY]))!.aliases.length > 0)
          expect(aliasTexts).toHaveLength(withAliases.length)
          for (const text of aliasTexts) expect(text).toMatch(/^Also: /)
          // The how-to line and the word bank stay on the puzzle page.
          for (const phrasing of orInstructionOptions({ ...base, level })) expect(texts(key)).not.toContain(phrasing)
          expect(texts(key).some(isBankLabel)).toBe(false)
          assertObjectsInSafeMargin(key, kdpCtx(w, h))
        }
      }
    }
  })

  it('lists exactly the page’s answers in the gentle word bank', () => {
    for (const [w, h] of TRIMS) {
      const [page] = generate({ ...base, level: 'gentle' }, kdpCtx(w, h))
      const names = pictureIds(page!.objects).map((id) => relicById(id)!.name).sort((a, b) => a.localeCompare(b))
      const bank = page!.objects.find((_o, i, all) => isBankLabel(clean(all[i - 1]?.text)))!
      expect(clean(bank.text).split(/\s+•\s+|\n/)).toEqual(names)
    }
  })

  it('never repeats an object already in the book, and says so when the book has them all', () => {
    const ctx = kdpCtx(6, 9)
    const [first] = generate(base, ctx)
    const shown = pictureIds(first!.objects)
    const [second] = generate({ ...base, seed: 43 }, { ...kdpCtx(6, 9, 43, shown) })
    for (const id of pictureIds(second!.objects)) expect(shown).not.toContain(id)

    const everything = OFFICE_RELICS.map((r) => r.id)
    const [full] = generate(base, kdpCtx(6, 9, 42, everything))
    expect(full!.answerSourceObjects).toBeUndefined()
    expect(texts(full!.objects)).toContain(OR_BOOK_FULL_MESSAGE)
  })

  it('draws pictures clear of each other and of every writing line', () => {
    for (const [w, h] of TRIMS) {
      for (const level of LEVELS) {
        const ctx = kdpCtx(w, h)
        const [page] = generate({ ...base, level }, ctx)
        const field = { left: 0, top: 0, width: ctx.pageWidth, height: ctx.pageHeight }
        const count = page!.objects.filter(isPicture).length
        expect(checkOrDrawnPage(page!.objects, field, count)).toEqual([])
        expect(checkOrDrawnPage(page!.answerSourceObjects!, field, count)).toEqual([])
      }
    }
  })

  it('stamps each picture with its object, so a later page can refuse it', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    for (const picture of page!.objects.filter(isPicture)) {
      expect(relicById(String(picture.data?.[STUDIO_CONTENT_LABEL_KEY]))).toBeDefined()
      // The fingerprint names the drawing and its version, so two versions are two pictures.
      const id = String(picture.data?.relicDrawing) as RelicDrawingId
      expect(String(picture.data?.studioCanonicalKey)).toBe(`office-relics:picture:${id}:${picture.data?.relicVersion}`)
      expect(relicVariants(id).map((v) => variantKey(id, v))).toContain(picture.data?.relicVersion)
    }
  })
})

/* ------------------------------------------------------------------ *
 * Preflight
 * ------------------------------------------------------------------ */

describe('office-relics preflight', () => {
  const ctx = kdpCtx(8.5, 11)
  const plan = orWorstCasePlan({ page: ctx, config: base, level: 'classic', instructions: orInstructionOptions(base), font: FONT })!
  const items = pickRelics({ count: plan.count, level: 'classic', seed: 42 })
  const run = (list: readonly PlacedRelic[], extra: Partial<Parameters<typeof runOrKdpPreflight>[0]> = {}) =>
    runOrKdpPreflight({ items: list, plan, font: FONT, wordBank: false, ...extra })

  it('passes a clean page', () => {
    expect(run(items)).toMatchObject({ ok: true, errors: [] })
  })

  it('refuses two pictures a reader could confuse', () => {
    const rotary = { relic: relicById('rotary-phone')!, drawing: 'rotary-phone' as const, variant: referenceVariant('rotary-phone') }
    const buttons = {
      relic: relicById('push-button-phone')!,
      drawing: 'push-button-phone' as const,
      variant: referenceVariant('push-button-phone'),
    }
    const result = run([rotary, buttons, ...items.slice(2)])
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/confuse/)
  })

  it('refuses the same object twice, a mismatched drawing, and one already in the book', () => {
    expect(run([items[0]!, items[0]!, ...items.slice(2)]).ok).toBe(false)
    const wrongPicture = { ...items[0]!, drawing: 'safe' as const, variant: referenceVariant('safe') }
    expect(run([wrongPicture, ...items.slice(1)]).ok).toBe(false)
    expect(run(items, { book: [items[3]!.relic.id] }).ok).toBe(false)
  })

  it('refuses a version its drawing does not have', () => {
    const first = items[0]!
    const knobs = Object.keys(first.variant.knobs)
    const outOfRange: RelicVariant = { ...first.variant, knobs: { ...first.variant.knobs, [knobs[0]!]: 99 } }
    expect(run([{ ...first, variant: outOfRange }, ...items.slice(1)]).errors.join(' ')).toMatch(/version/)
    // A typewriter's return lever has a side: it is never printed mirrored.
    expect(isValidVariant('typewriter', { ...referenceVariant('typewriter'), mirrored: true })).toBe(false)
  })

  it('refuses a page with the wrong number of pictures', () => {
    expect(run(items.slice(1)).ok).toBe(false)
  })

  it('catches overlapping pictures on a drawn page', () => {
    const [page] = generate(base, ctx)
    const pictures = page!.objects.filter(isPicture)
    const moved = page!.objects.map((o) => (o === pictures[1] ? { ...o, left: pictures[0]!.left, top: pictures[0]!.top } : o))
    const field = { left: 0, top: 0, width: ctx.pageWidth, height: ctx.pageHeight }
    expect(checkOrDrawnPage(moved, field, pictures.length).join(' ')).toMatch(/overlap/)
  })
})

/* ------------------------------------------------------------------ *
 * Uniqueness across sellers
 * ------------------------------------------------------------------ */

describe('office-relics uniqueness across sellers', () => {
  const ids = Object.keys(RELIC_ART) as RelicDrawingId[]
  const label = (item: PlacedRelic) => artLabel(item.drawing, item.variant)
  const numbers = (d: string) => (d.match(/-?\d*\.?\d+/g) ?? []).map(Number)

  it('draws every object in at least eight distinct versions', () => {
    for (const id of ids) {
      const variants = relicVariants(id)
      expect(variants.length, id).toBeGreaterThanOrEqual(8)
      for (const variant of variants) expect(isValidVariant(id, variant), id).toBe(true)
      // No two versions draw the same lines.
      const drawn = variants.map((v) => mergedRuns(relicArtDrawing(id, v)).map((run) => `${run.style}:${run.d}`).join('|'))
      expect(new Set(drawn).size, id).toBe(variants.length)
      expect(variants.some((v) => v.mirrored), id).toBe(RELIC_ART[id].mirror)
    }
  })

  it('mirrors exactly: twice is the original, and the ink keeps its size', () => {
    for (const id of ids.filter((i) => RELIC_ART[i].mirror)) {
      const reference = referenceVariant(id)
      const plain = relicArtDrawing(id, reference)
      const flipped = relicArtDrawing(id, { ...reference, mirrored: true })
      const a = relicInkBox(plain)
      const b = relicInkBox(flipped)
      expect(b.width, id).toBeCloseTo(a.width, 1)
      expect(b.height, id).toBeCloseTo(a.height, 1)
      expect(b.left, id).toBeCloseTo(plain.width - a.left - a.width, 1)
      for (const element of plain.elements) {
        const d = elementPathData(element)
        const back = mirrorPathData(mirrorPathData(d, plain.width), plain.width)
        expect(back.replace(/[^A-Z]/g, ''), id).toBe(d.replace(/[^A-Z]/g, ''))
        numbers(back).forEach((n, i) => expect(n, id).toBeCloseTo(numbers(d)[i]!, 1))
      }
    }
  })

  it('prints different versions for two sellers on the same seed, and never the same page', () => {
    let same = 0
    let total = 0
    let wholePages = 0
    for (let n = 1; n <= 300; n++) {
      const deal = (salt: string) => pickRelics({ count: 9, level: 'classic', seed: 4242, ownerSalt: salt })
      const a = deal(saltOf(n))
      const b = deal(saltOf(n + 5000))
      // The seed alone picks the objects, so the two pages show the same nine; only the versions can differ.
      expect(b.map((i) => i.relic.id)).toEqual(a.map((i) => i.relic.id))
      const matches = a.filter((item, i) => label(item) === label(b[i]!)).length
      same += matches
      total += a.length
      if (matches === a.length) wholePages++
    }
    expect(same / total).toBeLessThan(0.12)
    expect(wholePages).toBe(0)
  })

  it('reprints a page exactly for the same seller and seed', () => {
    const ctx = kdpCtx(8.5, 11, 77, [], saltOf(5))
    clearStudioRecentContent()
    const first = generate(base, ctx)
    clearStudioRecentContent()
    const again = generate(base, ctx)
    expect(JSON.stringify(again)).toBe(JSON.stringify(first))
  })

  it('passes over the versions this seller printed lately', () => {
    const ownerSalt = saltOf(3)
    const first = pickRelics({ count: 9, level: 'classic', seed: 11, ownerSalt })
    const next = pickRelics({ count: 9, level: 'classic', seed: 11, ownerSalt, recentArt: first.map(label) })
    next.forEach((item, i) => expect(label(item)).not.toBe(label(first[i]!)))
  })

  it('gives each seller a house style of their own, the same on every page', () => {
    const looks = new Set<string>()
    for (let n = 1; n <= 400; n++) looks.add(JSON.stringify(orHouseStyle(saltOf(n))))
    expect(looks.size).toBeGreaterThanOrEqual(40)
    expect(orHouseStyle(saltOf(9))).toEqual(orHouseStyle(saltOf(9)))
    const pages = [42, 43, 44].map((seed) => generate({ ...base, seed }, kdpCtx(6, 9, seed, [], saltOf(9)))[0]!)
    const numbering = pages.map((page) => clean(page.objects.find(isNumber)?.text).slice(1))
    expect(new Set(numbering).size).toBe(1)
  })

  it('fingerprints two sellers’ pages on the same seed as different pages', () => {
    const fingerprint = (salt: string) => {
      clearStudioRecentContent()
      return contentFingerprint(generate(base, kdpCtx(8.5, 11, 42, [], salt))[0]!.objects)
    }
    const prints = [1, 2, 3, 4, 5, 6].map((n) => fingerprint(saltOf(n)))
    expect(new Set(prints).size).toBe(prints.length)
  })
})
