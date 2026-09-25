import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { sgVariantDrawing, sgVariants } from '../stained-glass/content'
import { drawingBounds } from '../stained-glass/subject-kit'
import { SG_SUBJECTS } from '../stained-glass/subjects'
import { colorByNumberTemplate, buildCbnArt } from './generate'
import { CBN_CONFIG_SCHEMA } from './config'
import {
  CBN_DEFAULT_TITLE,
  CBN_LEVELS,
  CBN_PAGE_TOO_SMALL_MESSAGE,
  CBN_TEMPLATE_KEY,
  CBN_THEMES,
  cbnInstructionOptions,
  cbnLevelSpec,
  cbnPageLabel,
  cbnThemeSubjects,
  parseCbnBook,
  pickCbnDesign,
  type CbnLevel,
} from './content'
import { CBN_PART_KEY } from './draw'
import { CBN_MIN_SCENE_DISTANCE, CBN_NUMBER_FLOOR_PX, checkCbnDrawnPage, runCbnKdpPreflight } from './kdp-preflight'
import { cbnPrintNote } from './layout'
import { CBN_INK_WIDTH, cbnDrawingScaleFloor, cbnNumberRadius, clearanceAt } from './paint'
import {
  CBN_COLORS,
  CBN_MAX_COLORS,
  CBN_MIN_COLORS,
  CBN_PALETTES,
  CBN_PIECE_HINTS,
  CBN_SUBJECT_HUES,
  cbnColor,
  colorUnits,
  isCbnColorId,
  type CbnColorId,
  type CbnRole,
} from './palette'
import {
  compositionDistance,
  compositionKey,
  compositionRoles,
  dealComposition,
  isTabletop,
  isValidComposition,
  parseCompositionKey,
  settingFor,
} from './scene'

const FONT = 'PT Serif'
const LEVELS = CBN_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')

const base: StudioConfig = {
  ...buildDefaultConfig(colorByNumberTemplate),
  showTitle: true,
  title: CBN_DEFAULT_TITLE,
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
  return colorByNumberTemplate.generate(config, ctx)
}

const sceneOf = (objects: StudioFabricObject[]) => objects.find((o) => o.type === 'group' && o.data?.[CBN_PART_KEY] === 'scene')
const keyOf = (objects: StudioFabricObject[]) => objects.find((o) => o.type === 'group' && o.data?.[CBN_PART_KEY] === 'key')
const labelOf = (objects: StudioFabricObject[]) => String(sceneOf(objects)?.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '')
const numbersOf = (scene: StudioFabricObject) => (scene.objects ?? []).filter((o) => o.type === 'textbox')
const legendOf = (objects: StudioFabricObject[]) => (keyOf(objects)?.data?.legend ?? []) as CbnColorId[]

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(colorByNumberTemplate, {
  expectAnswers: false,
  configOverrides: { showTitle: true, title: CBN_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(colorByNumberTemplate, { seeds: 16 })

describe('color-by-number registry and form', () => {
  it('is registered once, in the spatial tab, with no answer page', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === CBN_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('spatial')
    expect(found[0]!.producesAnswerKey).toBe(false)
    expect(found[0]!.defaultPageTitle).toBe(CBN_DEFAULT_TITLE)
    expect(found[0]!.label).toMatch(/retirement/i)
  })

  it('asks only for scenes, detail and how the key prints', () => {
    expect(CBN_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['theme', 'level', 'keyStyle'])
    for (const field of CBN_CONFIG_SCHEMA) expect(field.type).toBe('select')
    expect(buildDefaultConfig(colorByNumberTemplate).keyStyle).toBe('names')
  })

  it('names each theme and how many subjects it holds', () => {
    const theme = CBN_CONFIG_SCHEMA.find((f) => f.key === 'theme')!
    for (const t of CBN_THEMES) {
      const help = theme.helpWhen!({ theme: t.value })
      expect(help).toContain(String(cbnThemeSubjects(t.value).length))
      expect(cbnThemeSubjects(t.value).length).toBeGreaterThanOrEqual(8)
    }
  })

  it('reports the number size and the scene size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = cbnPrintNote({ page: layout(6, 9), config: base, level, keyStyle: 'names' })
      expect(note).toMatch(/Numbers print at \d+(\.5)? pt/)
      expect(note).toMatch(/scene is about/)
    }
    expect(cbnPrintNote({ page: layout(3, 4), config: base, level: 'classic', keyStyle: 'names' })).toMatch(/too small/)
  })

  it('offers short instructions, and none when instructions are off', () => {
    for (const line of cbnInstructionOptions(base)) expect(line.length).toBeLessThanOrEqual(72)
    expect(cbnInstructionOptions({ ...base, showInstructions: false })).toEqual([])
  })
})

describe('color-by-number palettes', () => {
  it('uses only plain pencil names, each once', () => {
    const names = CBN_COLORS.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
    for (const c of CBN_COLORS) {
      expect(c.name).toMatch(/^[A-Z][a-z]+( [A-Z][a-z]+)?$/)
      expect(c.hex).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('colors every role its settings draw, from known colors only', () => {
    for (const palette of CBN_PALETTES) {
      const needed: CbnRole[] =
        palette.setting === 'indoor'
          ? ['wall', 'wallLow', 'trim', 'floor', 'floorAlt', 'rug', 'rugBorder', 'sky', 'hillNear', 'sun', 'curtain', 'wood', 'cloth']
          : ['sky', 'sun', 'cloud', 'mountain', 'hillFar', 'hillNear', 'foliage', 'trunk', 'path', 'fence', 'petal', 'flowerCenter', 'water', 'waterLight', 'sand']
      for (const role of needed) expect(palette.roles[role]?.length, `${palette.id}.${role}`).toBeGreaterThan(0)
      for (const list of [...Object.values(palette.roles), palette.accents]) for (const id of list!) expect(isCbnColorId(id)).toBe(true)
      expect(palette.accents.length).toBeGreaterThanOrEqual(4)
    }
  })

  it('gives every subject its own natural colors', () => {
    for (const s of SG_SUBJECTS) {
      const hues = CBN_SUBJECT_HUES[s.id]
      expect(hues, s.id).toBeDefined()
      for (const id of hues!) expect(isCbnColorId(id)).toBe(true)
    }
  })

  it('settles the key at six to eight colors with no two touching parts alike', () => {
    const palette = CBN_PALETTES[0]!
    const units = [
      { id: 'sky', role: 'sky' as const, area: 900, spaces: 1 },
      { id: 'hillFar', role: 'hillFar' as const, area: 500, spaces: 1 },
      { id: 'hillNear', role: 'hillNear' as const, area: 400, spaces: 1 },
      ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, area: 100 - i, spaces: 1 })),
    ]
    const touching = new Map<string, Set<string>>()
    const link = (a: string, b: string) => {
      touching.set(a, new Set([...(touching.get(a) ?? []), b]))
      touching.set(b, new Set([...(touching.get(b) ?? []), a]))
    }
    link('sky', 'hillFar')
    link('hillFar', 'hillNear')
    for (let i = 0; i < 6; i++) {
      link(`s${i}`, 'sky')
      if (i > 0) link(`s${i}`, `s${i - 1}`)
    }
    const result = colorUnits({ units, touching, palette, subjectId: 'teapot' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const { colors, legend } = result.coloring
    expect(legend.length).toBeGreaterThanOrEqual(CBN_MIN_COLORS)
    expect(legend.length).toBeLessThanOrEqual(CBN_MAX_COLORS)
    expect(new Set(legend).size).toBe(legend.length)
    for (const [a, set] of touching) for (const b of set) expect(colors.get(a)).not.toBe(colors.get(b))
    // Pencil-box order: the key never lists blue before yellow.
    const order = legend.map((id) => CBN_COLORS.findIndex((c) => c.id === id))
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('refuses rather than pads a key the scene cannot fill', () => {
    const palette = CBN_PALETTES[0]!
    const units = [
      { id: 'sky', role: 'sky' as const, area: 900, spaces: 1 },
      { id: 's0', area: 100, spaces: 1 },
    ]
    const result = colorUnits({ units, touching: new Map(), palette, subjectId: 'teapot' })
    expect(result.ok).toBe(false)
  })
})

describe('color-by-number piece hints', () => {
  const centre = (ring: readonly { x: number; y: number }[]) => ({
    x: ring.reduce((t, p) => t + p.x, 0) / ring.length,
    y: ring.reduce((t, p) => t + p.y, 0) / ring.length,
  })

  it('names real colors for real pieces of every version it covers', () => {
    for (const [id, hint] of Object.entries(CBN_PIECE_HINTS)) {
      const subject = SG_SUBJECTS.find((s) => s.id === id)
      expect(subject, id).toBeDefined()
      for (const variant of sgVariants(subject!)) {
        const drawing = sgVariantDrawing(subject!, variant)
        const n = drawing.pieces.length
        for (let i = 0; i < n; i++) for (const c of hint(i, n, variant.knobs) ?? []) expect(isCbnColorId(c)).toBe(true)
      }
    }
  })

  it('finds the steam at the top of every drawing that has it', () => {
    for (const id of ['coffee-mug', 'teacup', 'fresh-pie', 'steam-train']) {
      const subject = SG_SUBJECTS.find((s) => s.id === id)!
      for (const variant of sgVariants(subject)) {
        const drawing = sgVariantDrawing(subject, variant)
        const b = drawingBounds(drawing)
        const n = drawing.pieces.length
        drawing.pieces.forEach((piece, i) => {
          if (CBN_PIECE_HINTS[id]!(i, n, variant.knobs)?.[0] !== 'lightGray') return
          expect(centre(piece.ring).y, `${id} piece ${i}`).toBeLessThan(b.minY + (b.maxY - b.minY) * 0.45)
        })
      }
    }
  })

  it('puts the pot at the bottom of the potted flowers and the petals round the sunflower disk', () => {
    const pot = SG_SUBJECTS.find((s) => s.id === 'flower-pot')!
    for (const variant of sgVariants(pot)) {
      const drawing = sgVariantDrawing(pot, variant)
      const b = drawingBounds(drawing)
      const n = drawing.pieces.length
      for (const i of [n - 2, n - 1]) expect(centre(drawing.pieces[i]!.ring).y).toBeGreaterThan(b.minY + (b.maxY - b.minY) * 0.6)
    }
    const sunflower = SG_SUBJECTS.find((s) => s.id === 'sunflower')!
    for (const variant of sgVariants(sunflower)) {
      const drawing = sgVariantDrawing(sunflower, variant)
      const n = drawing.pieces.length
      const petals = variant.knobs.petals === 1 ? 10 : 13
      const disk = centre(drawing.pieces[3 + petals]!.ring)
      for (let i = 3; i < 3 + petals; i++) {
        const c = centre(drawing.pieces[i]!.ring)
        expect(Math.hypot(c.x - disk.x, c.y - disk.y)).toBeLessThan(40)
        expect(CBN_PIECE_HINTS.sunflower!(i, n, variant.knobs)?.[0]).toBe('yellow')
      }
    }
  })
})

describe('color-by-number compositions', () => {
  it('deals only compositions the builder can draw, round-tripping through their key', () => {
    const rng = createRng(11)
    for (const subject of SG_SUBJECTS) {
      for (const palette of CBN_PALETTES.filter((p) => p.setting === (settingFor(subject) === 'room' ? 'indoor' : 'outdoor'))) {
        for (const level of CBN_LEVELS) {
          const c = dealComposition({ subject, palette, rng, richness: level.richness, budget: level.budget, aspect: 1 })
          expect(isValidComposition(c), `${subject.id} ${compositionKey(c)}`).toBe(true)
          expect(c.setting).toBe(settingFor(subject))
          expect(parseCompositionKey(compositionKey(c))).toEqual(c)
          for (const role of compositionRoles(c, isTabletop(subject))) expect(palette.roles[role]?.length, role).toBeGreaterThan(0)
        }
      }
    }
  })

  it('steers clear of compositions it is asked to avoid', () => {
    const subject = SG_SUBJECTS.find((s) => s.id === 'motorhome')!
    const palette = CBN_PALETTES[0]!
    const rng = createRng(3)
    const first = dealComposition({ subject, palette, rng, richness: 1, budget: 5, aspect: 1 })
    let total = 0
    for (let i = 0; i < 20; i++) total += compositionDistance(first, dealComposition({ subject, palette, rng, richness: 1, budget: 5, aspect: 1, avoid: [first] }))
    expect(total / 20).toBeGreaterThanOrEqual(CBN_MIN_SCENE_DISTANCE + 1)
  })
})

describe('color-by-number subjects', () => {
  it('measures every subject drawing, and none needs more than a 4-inch scene to number cleanly', () => {
    const rules = cbnLevelSpec('classic').rules
    for (const subject of SG_SUBJECTS) {
      for (const variant of sgVariants(subject).slice(0, 2)) {
        const drawing = sgVariantDrawing(subject, variant)
        const k = cbnDrawingScaleFloor(drawing, rules)
        expect(Number.isFinite(k) && k > 0, subject.id).toBe(true)
        const raw = drawingBounds(drawing)
        expect((Math.max(raw.maxX - raw.minX, raw.maxY - raw.minY) * k) / DPI, subject.id).toBeLessThan(4)
      }
    }
  })
})

describe('color-by-number pages', () => {
  it('prints a complete, readable page on every KDP trim and level', () => {
    for (const [w, h] of TRIMS) {
      for (const level of LEVELS) {
        clearStudioRecentContent()
        const ctx = kdpCtx(w, h, 7 + w * 3 + h)
        const [page] = generate({ ...base, level }, ctx)
        const objects = page!.objects
        const scene = sceneOf(objects)
        const key = keyOf(objects)
        expect(scene, `${w}x${h} ${level}`).toBeDefined()
        expect(key).toBeDefined()
        assertObjectsInSafeMargin(objects, ctx)

        const legend = legendOf(objects)
        expect(legend.length).toBeGreaterThanOrEqual(CBN_MIN_COLORS)
        expect(legend.length).toBeLessThanOrEqual(CBN_MAX_COLORS)
        const numbers = numbersOf(scene!)
        expect(numbers.length).toBeGreaterThanOrEqual(cbnLevelSpec(level).spaces.min)
        const used = new Set(numbers.map((n) => Number(n.text)))
        expect([...used].sort((a, b) => a - b)).toEqual(legend.map((_, i) => i + 1))
        for (const n of numbers) {
          expect(n.fill).toBe(STUDIO_INK)
          expect(n.fontFamily).toBe(STUDIO_DIGIT_FONT)
          expect(n.fontSize!).toBeGreaterThanOrEqual(CBN_NUMBER_FLOOR_PX)
        }
        // Nothing in the scene is filled: the page works printed in black ink.
        for (const child of scene!.objects!) {
          if (child.type === 'path') {
            expect(child.stroke).toBe(STUDIO_INK)
            expect(child.fill).toBe('transparent')
            expect(Object.values(CBN_INK_WIDTH)).toContain(child.strokeWidth)
          }
        }
        const box = { left: scene!.left, top: scene!.top, width: scene!.width!, height: scene!.height! }
        const keyBox = { left: key!.left, top: key!.top, width: key!.width!, height: key!.height! }
        expect(checkCbnDrawnPage({ scene: scene!, key: key!, box, keyBox, legend })).toEqual([])
        // The key sits below the scene, never over it.
        expect(key!.top).toBeGreaterThanOrEqual(scene!.top + scene!.height!)
      }
    }
  })

  it('prints key names for black-and-white books, and filled swatches only when asked', () => {
    const [plain] = generate(base, kdpCtx(6, 9))
    const rects = (keyOf(plain!.objects)?.objects ?? []).filter((o) => o.type === 'rect')
    expect(rects.every((r) => !r.fill || r.fill === 'transparent')).toBe(true)
    const names = (keyOf(plain!.objects)?.objects ?? []).filter((o) => o.data?.[CBN_PART_KEY] === 'name')
    expect(names.map((o) => o.text)).toEqual(legendOf(plain!.objects).map((id) => cbnColor(id).name))

    clearStudioRecentContent()
    const [color] = generate({ ...base, keyStyle: 'swatches' }, kdpCtx(6, 9))
    const legend = legendOf(color!.objects)
    const fills = (keyOf(color!.objects)?.objects ?? []).filter((o) => o.type === 'rect' && o.fill && o.fill !== 'transparent').map((o) => o.fill)
    expect(fills).toEqual(legend.map((id) => cbnColor(id).hex))
  })

  it('places every number with clear paper round it, re-measured against the lines', () => {
    const level = cbnLevelSpec('classic')
    const box = { minX: 40, minY: 150, maxX: 40 + 5.3 * DPI, maxY: 150 + 5.2 * DPI }
    let built = 0
    for (let seed = 1; seed <= 12; seed++) {
      const design = pickCbnDesign({ theme: 'mix', level, seed, ownerSalt: saltOf(seed), aspect: 1 })!
      const art = buildCbnArt({ design, level, box, seed, ownerSalt: saltOf(seed), attempt: 0 })
      if (!art.ok) continue
      built++
      for (const label of art.labels) {
        expect(clearanceAt({ x: label.x, y: label.y }, art.runs)).toBeGreaterThanOrEqual(cbnNumberRadius(label.size) - 1e-6)
      }
      expect(runCbnKdpPreflight({ design: { ...design, composition: art.composition }, art, level }).errors).toEqual([])
      expect(isValidComposition(art.composition)).toBe(true)
    }
    expect(built).toBeGreaterThanOrEqual(8)
  })

  it('says plainly when the page is too small for a scene', () => {
    const [page] = generate(base, kdpCtx(3, 4))
    expect(sceneOf(page!.objects)).toBeUndefined()
    expect(page!.objects.some((o) => o.text === CBN_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
  })

  it('prints fuller scenes as the level rises', () => {
    const counts: Record<CbnLevel, number> = { relaxed: 0, classic: 0, detailed: 0 }
    for (const level of LEVELS) {
      for (let seed = 1; seed <= 6; seed++) {
        clearStudioRecentContent()
        const [page] = generate({ ...base, level, seed }, kdpCtx(8.5, 11, seed))
        counts[level] += numbersOf(sceneOf(page!.objects)!).length
      }
    }
    expect(counts.relaxed).toBeLessThan(counts.detailed)
    const sizes = (level: CbnLevel) => {
      clearStudioRecentContent()
      const [page] = generate({ ...base, level }, kdpCtx(8.5, 11))
      return numbersOf(sceneOf(page!.objects)!).map((n) => n.fontSize!)
    }
    expect(Math.max(...sizes('relaxed'))).toBeGreaterThan(Math.max(...sizes('detailed')))
  })
})

describe('color-by-number uniqueness', () => {
  it('never repeats a page in a book, and spreads its subjects', () => {
    const book: string[] = []
    for (let i = 0; i < 12; i++) {
      const [page] = generate({ ...base, seed: 100 + i }, kdpCtx(6, 9, 100 + i, book, saltOf(5)))
      const label = labelOf(page!.objects)
      expect(label).not.toBe('')
      expect(book).not.toContain(label)
      book.push(label)
    }
    const subjects = parseCbnBook(book).map((e) => e.subject)
    expect(new Set(subjects).size).toBe(subjects.length)
  })

  it('brings a returning subject back as a different drawing in a different scene', () => {
    const book: string[] = []
    for (let i = 0; i < 12; i++) {
      const [page] = generate({ ...base, theme: 'hobbies', seed: 300 + i }, kdpCtx(6, 9, 300 + i, book, saltOf(9)))
      const label = labelOf(page!.objects)
      if (label) book.push(label)
    }
    const entries = parseCbnBook(book)
    expect(entries.length).toBe(12)
    for (let i = 0; i < entries.length; i++) {
      for (let j = 0; j < i; j++) {
        if (entries[i]!.subject !== entries[j]!.subject) continue
        expect(entries[i]!.variant).not.toBe(entries[j]!.variant)
        const a = parseCompositionKey(entries[i]!.composition)!
        const b = parseCompositionKey(entries[j]!.composition)!
        expect(compositionDistance(a, b)).toBeGreaterThanOrEqual(CBN_MIN_SCENE_DISTANCE)
      }
    }
    // Moods rotate too: no page shares its mood with the page before it.
    for (let i = 1; i < entries.length; i++) {
      const sameSetting = (settingFor(SG_SUBJECTS.find((s) => s.id === entries[i]!.subject)!) === 'room') === (settingFor(SG_SUBJECTS.find((s) => s.id === entries[i - 1]!.subject)!) === 'room')
      if (sameSetting) expect(entries[i]!.palette).not.toBe(entries[i - 1]!.palette)
    }
  })

  it('gives two sellers on the same settings different pages', () => {
    const labels = new Set<string>()
    for (let n = 1; n <= 6; n++) {
      clearStudioRecentContent()
      const [page] = generate(base, kdpCtx(6, 9, 42, [], saltOf(n)))
      labels.add(labelOf(page!.objects))
    }
    expect(labels.size).toBe(6)
  })

  it('reads its own labels back and ignores anything else', () => {
    const [page] = generate(base, kdpCtx(6, 9))
    const label = labelOf(page!.objects)
    expect(parseCbnBook([label, 'nonsense', 'teapot|x', 'ghost|a|b|summer'])).toHaveLength(1)
    const entry = parseCbnBook([label])[0]!
    expect(cbnPageLabel(entry)).toBe(label)
    expect(isValidComposition(parseCompositionKey(entry.composition)!)).toBe(true)
  })
})

describe('color-by-number painter', () => {
  it('refuses a scene whose spaces are too small to number', () => {
    const level = cbnLevelSpec('classic')
    const design = pickCbnDesign({ theme: 'garden', level, seed: 5, ownerSalt: saltOf(1), aspect: 1 })!
    const tiny = { minX: 0, minY: 0, maxX: 2.2 * DPI, maxY: 2.2 * DPI }
    const art = buildCbnArt({ design, level, box: tiny, seed: 5, ownerSalt: saltOf(1), attempt: 0 })
    expect(art.ok).toBe(false)
  })
})
