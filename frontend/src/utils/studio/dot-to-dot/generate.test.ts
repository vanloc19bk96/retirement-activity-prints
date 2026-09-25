import { describe, it, expect, beforeEach } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { sgVariantKey, sgVariants } from '../stained-glass/content'
import { sgSubjectById } from '../stained-glass/subjects'
import { dotToDotTemplate } from './generate'
import { DTD_CONFIG_SCHEMA } from './config'
import {
  DTD_DEFAULT_TITLE,
  DTD_LEVELS,
  DTD_MIN_MAIN_SHARE,
  DTD_PAGE_TOO_SMALL_MESSAGE,
  DTD_SUBJECTS,
  DTD_TEMPLATE_KEY,
  DTD_THEMES,
  dtdInstructionOptions,
  dtdLevelSpec,
  dtdOutline,
  dtdShapeSignature,
  dtdThemeSubjects,
  parseDtdBook,
  pickDtdDesign,
  type DtdDesign,
  type DtdLevel,
} from './content'
import { DTD_PART_KEY, buildDtdPicture } from './draw'
import { DTD_NUMBER_FLOOR_PX, checkDtdDrawnPage, runDtdKdpPreflight } from './kdp-preflight'
import { dtdPanelInBody, dtdPrintNote } from './layout'
import { traceOutline } from './outline'
import { buildPuzzle, isSimpleLoop, type DtdPuzzle } from './puzzle'
import { DTD_EXTRA_SUBJECTS } from './subjects'
import { contentBox, drawHeader } from '../studio-layout'

const FONT = 'PT Serif'
const LEVELS = DTD_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')

const base: StudioConfig = {
  ...buildDefaultConfig(dotToDotTemplate),
  showTitle: true,
  title: DTD_DEFAULT_TITLE,
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
  return dotToDotTemplate.generate(config, ctx)
}

const pictureOf = (objects: StudioFabricObject[]) => objects.find((o) => o.type === 'group' && o.data?.[DTD_PART_KEY] === 'picture')
const labelOf = (objects: StudioFabricObject[]) => String(pictureOf(objects)?.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '')
const partsOf = (picture: StudioFabricObject, part: string) => (picture.objects ?? []).filter((o) => o.data?.[DTD_PART_KEY] === part)

/** A book built page by page, each page seeing the ones before it (as the prefetch would). */
function buildBook(pages: number, config: StudioConfig, trim: readonly [number, number] = [6, 9], salt = saltOf(1)) {
  const labels: string[] = []
  for (let i = 0; i < pages; i++) {
    const out = generate({ ...config, seed: 500 + i * 97 }, kdpCtx(trim[0], trim[1], 500 + i * 97, [...labels], salt))
    const label = labelOf(out[0]!.objects)
    expect(label, `page ${i + 1} has a picture`).not.toBe('')
    labels.push(label)
  }
  return labels
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(dotToDotTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: DTD_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(dotToDotTemplate, { seeds: 16 })

describe('dot-to-dot registry and form', () => {
  it('is registered once, in the spatial tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === DTD_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('spatial')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(DTD_DEFAULT_TITLE)
    expect(found[0]!.label).toMatch(/retirement/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(DTD_TEMPLATE_KEY)).toBe(true)
  })

  it('asks only what the pictures are about and how many dots', () => {
    expect(DTD_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['theme', 'level'])
    for (const field of DTD_CONFIG_SCHEMA) expect(field.type).toBe('select')
    expect(buildDefaultConfig(dotToDotTemplate).level).toBe('classic')
    expect(buildDefaultConfig(dotToDotTemplate).theme).toBe('mix')
  })

  it('names each theme and how many subjects it holds', () => {
    const theme = DTD_CONFIG_SCHEMA.find((f) => f.key === 'theme')!
    for (const t of DTD_THEMES) {
      const help = theme.helpWhen!({ theme: t.value })
      expect(help).toContain(String(dtdThemeSubjects(t.value).length))
      expect(dtdThemeSubjects(t.value).length).toBeGreaterThanOrEqual(8)
    }
  })

  it('reports the number size and the picture size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    for (const level of LEVELS) {
      const note = dtdPrintNote({ page: layout(6, 9), config: base, level })
      expect(note).toMatch(/pt/)
      expect(note).toMatch(/in\.$/)
      expect(dtdPrintNote({ page: layout(3, 3), config: base, level })).toMatch(/too small/)
    }
  })

  it('never prints numbers below 10 pt, and gets easier with fewer, further-apart dots', () => {
    for (const level of DTD_LEVELS) expect(level.rules.numberSize).toBeGreaterThanOrEqual(DTD_NUMBER_FLOOR_PX)
    const [relaxed, classic, challenging] = LEVELS.map((l) => dtdLevelSpec(l).rules)
    expect(relaxed!.dots.target).toBeLessThan(classic!.dots.target)
    expect(classic!.dots.target).toBeLessThan(challenging!.dots.target)
    expect(relaxed!.minGap).toBeGreaterThan(classic!.minGap)
    expect(relaxed!.numberSize).toBeGreaterThanOrEqual(classic!.numberSize)
  })

  it('prints no instruction when instructions are off, and one that says how to finish when on', () => {
    expect(dtdInstructionOptions({ showInstructions: false })).toHaveLength(0)
    for (const line of dtdInstructionOptions({})) expect(line).toMatch(/\b1\b/)
  })
})

describe('dot-to-dot subjects', () => {
  it('keeps the library broad, original and on-theme', () => {
    expect(DTD_SUBJECTS.length).toBeGreaterThanOrEqual(40)
    expect(new Set(DTD_SUBJECTS.map((s) => s.id)).size).toBe(DTD_SUBJECTS.length)
    const banned = /(death|funeral|grave|pill|medic|wheelchair|walker|cane|hospital|nurse|brand|logo)/i
    for (const s of DTD_SUBJECTS) expect(`${s.id} ${s.name}`).not.toMatch(banned)
    // This game's own subjects never collide with the shared library's.
    for (const s of DTD_EXTRA_SUBJECTS) expect(sgSubjectById(s.id)).toBeUndefined()
  })

  it('traces every version of its own subjects to one clear outline', () => {
    for (const s of DTD_EXTRA_SUBJECTS) {
      for (const v of sgVariants(s).filter((x) => !x.mirrored)) {
        const o = traceOutline(s.draw(v.knobs))
        expect(o, `${s.id} ${sgVariantKey(s, v)}`).not.toBeNull()
        expect(o!.mainShare, `${s.id} ${sgVariantKey(s, v)}`).toBeGreaterThanOrEqual(DTD_MIN_MAIN_SHARE)
        expect(isSimpleLoop(o!.contour), `${s.id} ${sgVariantKey(s, v)}`).toBe(true)
      }
    }
  }, 60_000)

  it('gives nearly every subject several genuinely different outlines', () => {
    let total = 0
    let single = 0
    for (const s of DTD_SUBJECTS) {
      const shapes = new Set<string>()
      for (const v of sgVariants(s).filter((x) => !x.mirrored)) {
        const o = dtdOutline(s, v)
        if (o) shapes.add(dtdShapeSignature(o))
      }
      expect(shapes.size, s.id).toBeGreaterThanOrEqual(1)
      if (shapes.size === 1) single++
      total += shapes.size
    }
    // Counted by outline, not by drawing: a flipped or re-patterned version is not a new puzzle.
    expect(total).toBeGreaterThanOrEqual(200)
    expect(single).toBeLessThanOrEqual(3)
  }, 60_000)

  it('treats a mirrored or re-patterned version as the same shape, not a new puzzle', () => {
    const mug = sgSubjectById('coffee-mug')!
    const plain = { knobs: { steam: 1, body: 0, band: 0 }, mirrored: false }
    const a = dtdShapeSignature(dtdOutline(mug, plain)!)
    expect(dtdShapeSignature(dtdOutline(mug, { ...plain, mirrored: true })!)).toBe(a)
    expect(dtdShapeSignature(dtdOutline(mug, { ...plain, knobs: { ...plain.knobs, band: 1 } })!)).toBe(a)
    expect(dtdShapeSignature(dtdOutline(mug, { ...plain, knobs: { ...plain.knobs, steam: 2 } })!)).not.toBe(a)
  })

  it('refuses a drawing of two separate objects', () => {
    const fishing = sgSubjectById('fishing')!
    expect(dtdOutline(fishing, sgVariants(fishing)[0]!)).toBeNull()
    expect(DTD_SUBJECTS.some((s) => s.id === 'fishing')).toBe(false)
  })
})

describe('dot-to-dot pages', () => {
  it('prints a clean, correctly numbered puzzle on every trim at every level', () => {
    for (const level of LEVELS) {
      for (const [w, h] of TRIMS) {
        for (const seed of [11, 4242]) {
          const ctx = kdpCtx(w, h, seed)
          const out = generate({ ...base, level, seed }, ctx)
          expect(out).toHaveLength(1)
          const objects = out[0]!.objects
          const picture = pictureOf(objects)
          expect(picture, `${level} ${w}x${h} seed ${seed}`).toBeDefined()
          assertObjectsInSafeMargin(objects, ctx)
          const rules = dtdLevelSpec(level).rules
          // Exactly one dot and one number for each of 1..N, N within the level.
          const numbers = partsOf(picture!, 'number').map((o) => Number(o.text))
          const n = numbers.length
          expect(n).toBeGreaterThanOrEqual(rules.dots.min)
          expect(n).toBeLessThanOrEqual(rules.dots.max)
          expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
          expect(partsOf(picture!, 'dot')).toHaveLength(n)
          expect(partsOf(picture!, 'start')).toHaveLength(1)
          for (const t of partsOf(picture!, 'number')) {
            expect(t.fontFamily).toBe(STUDIO_DIGIT_FONT)
            expect(t.fill).toBe(STUDIO_INK)
            expect(t.fontSize).toBe(rules.numberSize)
          }
          // The finished outline is hidden, and joins every dot in order.
          const outline = partsOf(picture!, 'outline')
          expect(outline).toHaveLength(1)
          expect(outline[0]!.visible).toBe(false)
          expect((outline[0]!.path ?? []).filter((c) => c[0] === 'M' || c[0] === 'L')).toHaveLength(n)
        }
      }
    }
  })

  it('reveals the finished outline on the answer page, in black', () => {
    const out = generate(base, kdpCtx(6, 9))
    const answers = out.flatMap((p) => harvestAnswers(p.objects))
    expect(answers).toHaveLength(1)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const find = (objs: StudioFabricObject[]): StudioFabricObject | undefined => {
      for (const o of objs) {
        if (o.data?.[DTD_PART_KEY] === 'outline') return o
        const inner = o.objects ? find(o.objects) : undefined
        if (inner) return inner
      }
      return undefined
    }
    const revealed = find(key)
    expect(revealed?.visible).toBe(true)
    expect(revealed?.stroke).toBe(STUDIO_INK)
  })

  it('says plainly when the page is too small', () => {
    const out = generate(base, kdpCtx(3, 3.5))
    expect(pictureOf(out[0]!.objects)).toBeUndefined()
    expect(out[0]!.objects.some((o) => o.text === DTD_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
  })

  it('reprints the same page for the same seed and seller, and a different one for another seller', () => {
    const a = labelOf(generate(base, kdpCtx(6, 9, 77, [], saltOf(1)))[0]!.objects)
    clearStudioRecentContent()
    const b = labelOf(generate(base, kdpCtx(6, 9, 77, [], saltOf(1)))[0]!.objects)
    expect(a).toBe(b)
    const others = new Set<string>()
    for (let s = 2; s < 8; s++) {
      clearStudioRecentContent()
      others.add(labelOf(generate(base, kdpCtx(6, 9, 77, [], saltOf(s)))[0]!.objects))
    }
    expect(others.size).toBeGreaterThanOrEqual(4)
  })

  it('never repeats a shape within a book, and deals the theme’s subjects before returning to one', () => {
    const labels = buildBook(24, base)
    const book = parseDtdBook(labels)
    expect(new Set(book.map((e) => `${e.subject}|${e.shape}`)).size).toBe(book.length)
    expect(new Set(book.map((e) => e.subject)).size).toBe(book.length)
    for (let i = 1; i < book.length; i++) expect(book[i]!.subject).not.toBe(book[i - 1]!.subject)
  })

  it('brings a subject back as a different shape once a theme has gone round', () => {
    const config = { ...base, theme: 'hobbies', level: 'relaxed' }
    const count = dtdThemeSubjects('hobbies').length
    const labels = buildBook(count + 4, config)
    const book = parseDtdBook(labels)
    expect(new Set(book.map((e) => `${e.subject}|${e.shape}`)).size).toBe(book.length)
  })

  it('opens a seller’s next book with other subjects', () => {
    const first = parseDtdBook(buildBook(6, base, [6, 9], saltOf(9))).map((e) => e.subject)
    // The browser still remembers the first book; the second one starts elsewhere.
    const second = parseDtdBook(buildBook(6, base, [6, 9], saltOf(9))).map((e) => e.subject)
    expect(second.filter((s) => first.includes(s)).length).toBeLessThanOrEqual(1)
  })
})

describe('dot-to-dot quality gates', () => {
  const build = (level: DtdLevel = 'classic', subjectId = 'teapot') => {
    const subject = sgSubjectById(subjectId)!
    const variant = sgVariants(subject)[0]!
    const outline = dtdOutline(subject, variant)!
    const design: DtdDesign = { subject, variant, outline, shape: dtdShapeSignature(outline), repeat: false }
    const ctx = kdpCtx(6, 9)
    const header = drawHeader(contentBox(ctx), base, { templateKey: DTD_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' }, 'Join the dots.')
    const panel = dtdPanelInBody(header.body, true)
    const built = buildPuzzle(outline, panel, dtdLevelSpec(level).rules, createRng(3))
    if (!built.ok) throw new Error(built.reason)
    return { design, puzzle: built.puzzle, panel, level: dtdLevelSpec(level) }
  }

  it('passes a clean puzzle', () => {
    const { design, puzzle, panel, level } = build()
    expect(runDtdKdpPreflight({ design, puzzle, level, panel }).errors).toEqual([])
  })

  it('refuses a numbering mistake', () => {
    const { design, puzzle, panel, level } = build()
    const swapped: DtdPuzzle = { ...puzzle, dots: puzzle.dots.map((d, i) => (i === 3 ? { ...d, n: 5 } : i === 4 ? { ...d, n: 4 } : d)) }
    expect(runDtdKdpPreflight({ design, puzzle: swapped, level, panel }).ok).toBe(false)
    const doubled: DtdPuzzle = { ...puzzle, dots: puzzle.dots.map((d, i) => (i === 7 ? { ...d, n: 7 } : d)) }
    expect(runDtdKdpPreflight({ design, puzzle: doubled, level, panel }).errors.join(' ')).toMatch(/twice|order/)
    const missing: DtdPuzzle = { ...puzzle, dots: puzzle.dots.filter((_, i) => i !== 10) }
    expect(runDtdKdpPreflight({ design, puzzle: missing, level, panel }).ok).toBe(false)
  })

  it('refuses crowded dots, a crossing outline, and a number on a line', () => {
    const { design, puzzle, panel, level } = build()
    const d = puzzle.dots
    const crowded: DtdPuzzle = { ...puzzle, dots: d.map((p, i) => (i === 5 ? { ...p, x: d[4]!.x + 2, y: d[4]!.y } : p)) }
    expect(runDtdKdpPreflight({ design, puzzle: crowded, level, panel }).errors.join(' ')).toMatch(/too close|sits on/)
    const crossed: DtdPuzzle = {
      ...puzzle,
      dots: d.map((p, i) => (i === 2 ? { ...p, x: d[12]!.x, y: d[12]!.y, label: p.label } : i === 12 ? { ...p, x: d[2]!.x, y: d[2]!.y } : p)),
    }
    expect(runDtdKdpPreflight({ design, puzzle: crossed, level, panel }).ok).toBe(false)
    const mid = { x: (d[8]!.x + d[9]!.x) / 2, y: (d[8]!.y + d[9]!.y) / 2 }
    const onLine: DtdPuzzle = { ...puzzle, dots: d.map((p, i) => (i === 20 ? { ...p, label: { ...p.label, ...mid } } : p)) }
    expect(runDtdKdpPreflight({ design, puzzle: onLine, level, panel }).errors.join(' ')).toMatch(/line/)
  })

  it('refuses a shape the book already prints while fresh ones are left', () => {
    const { design, puzzle, panel, level } = build()
    const book = [{ subject: design.subject.id, shape: design.shape, variant: 'x' }]
    expect(runDtdKdpPreflight({ design, puzzle, level, panel, book }).errors.join(' ')).toMatch(/already/)
    expect(runDtdKdpPreflight({ design: { ...design, repeat: true }, puzzle, level, panel, book }).ok).toBe(true)
  })

  it('checks the drawn page against the puzzle', () => {
    const { design, puzzle, panel, level } = build()
    const tag = { templateKey: DTD_TEMPLATE_KEY, instanceId: 't', pageRole: 'single' as const }
    const picture = buildDtdPicture({ puzzle, rules: level.rules, box: panel, tag, label: 'x', canonical: 'x', name: design.subject.name })
    expect(checkDtdDrawnPage({ picture, box: panel, puzzle, numberSize: level.rules.numberSize })).toEqual([])
    const dropped = { ...picture, objects: picture.objects!.filter((o) => !(o.data?.[DTD_PART_KEY] === 'number' && o.text === '9')) }
    expect(checkDtdDrawnPage({ picture: dropped, box: panel, puzzle, numberSize: level.rules.numberSize }).join(' ')).toMatch(/9/)
  })

  it('never offers a subject the picker cannot trace', () => {
    for (let seed = 0; seed < 30; seed++) {
      const design = pickDtdDesign({ theme: 'mix', seed, ownerSalt: saltOf(seed) })
      expect(design).not.toBeNull()
      expect(design!.outline.mainShare).toBeGreaterThanOrEqual(DTD_MIN_MAIN_SHARE)
    }
  })
})
