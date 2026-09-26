import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES, STUDIO_INK } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { clearStudioRecentContent } from '../studio-variety'
import { buildAnswerKeyFromOutputs, harvestAnswers } from '../studio-answer-key'
import { createRng } from '../studio-rng'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { sgVariants } from '../stained-glass/content'
import type { Bounds } from '../stained-glass/geometry'
import { spotTheDifferenceTemplate } from './generate'
import { SD_CONFIG_SCHEMA } from './config'
import {
  SD_DEFAULT_TITLE,
  SD_GROUPS,
  SD_LEVELS,
  SD_PAGE_TOO_SMALL_MESSAGE,
  SD_TEMPLATE_KEY,
  parseSdBook,
  sdInstructionOptions,
  sdLevelSpec,
  sdOverlap,
  sdPageLabel,
  type SdLevel,
} from './content'
import { candidateChanges, checkPair, chooseDifferences, inMark, measureChange, sdPairLines } from './differences'
import { SD_PART_KEY } from './draw'
import { SD_ELEMENTS } from './elements'
import { checkSdDrawnPage, runSdKdpPreflight } from './kdp-preflight'
import { sdCrowdedWarning, sdPrintNote } from './layout'
import { SD_PROPS, sdProp } from './props'
import { SD_RECIPES, dealScene, sdGroupRecipes, sdRecipeById } from './scenes'
import { kindDrawing, partBounds } from './scene'
import { sdSceneEntry } from './variety'

const FONT = 'PT Serif'
const LEVELS = SD_LEVELS.map((l) => l.value)
const saltOf = (n: number) => n.toString(16).padStart(32, '0')

const base: StudioConfig = {
  ...buildDefaultConfig(spotTheDifferenceTemplate),
  showTitle: true,
  title: SD_DEFAULT_TITLE,
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
  return spotTheDifferenceTemplate.generate(config, ctx)
}

const byPart = (objects: readonly StudioFabricObject[], part: string) => objects.find((o) => o.data?.[SD_PART_KEY] === part)
const labelOf = (objects: readonly StudioFabricObject[]) => String(byPart(objects, 'top')?.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '')

function collect(objects: readonly StudioFabricObject[], part: string): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  const walk = (list: readonly StudioFabricObject[]) => {
    for (const o of list) {
      if (o.data?.[SD_PART_KEY] === part) out.push(o)
      if (o.objects) walk(o.objects)
    }
  }
  walk(objects)
  return out
}

/** A book built page by page, each page seeing the ones before it (as the prefetch would). */
function buildBook(pages: number, config: StudioConfig, salt = saltOf(1)) {
  const labels: string[] = []
  for (let i = 0; i < pages; i++) {
    const out = generate({ ...config, seed: 500 + i * 97 }, kdpCtx(6, 9, 500 + i * 97, [...labels], salt))
    const label = labelOf(out[0]!.objects)
    expect(label, `page ${i + 1} has a pair of pictures`).not.toBe('')
    labels.push(label)
  }
  return labels
}

/** A scene and a fair set of differences for the gate tests. */
function pair(level: SdLevel = 'classic', recipeId = 'garden', seed = 5) {
  const fair = sdLevelSpec(level).fairness
  const panel: Bounds = { minX: 0, minY: 0, maxX: 500, maxY: 300 }
  for (let t = 0; t < 30; t++) {
    const rng = createRng(seed + t * 13)
    const scene = dealScene(sdRecipeById(recipeId)!, panel, rng, fair.fullness)
    const differences = chooseDifferences({ scene, rng, fair, count: fair.count })
    if (differences) return { scene, differences, fair, level: sdLevelSpec(level) }
  }
  throw new Error('no pair')
}

// Every page draws and compares two pictures on a grid; the shared contract and entropy checks each
// generate several, which can outlast the default 5 s when the whole suite runs in parallel.
vi.setConfig({ testTimeout: 60_000 })

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(spotTheDifferenceTemplate, {
  expectAnswers: true,
  configOverrides: { showTitle: true, title: SD_DEFAULT_TITLE, showInstructions: true },
})
assertGeneratorEntropy(spotTheDifferenceTemplate, { seeds: 10 })

describe('spot the differences: registry and form', () => {
  it('is registered once, in the spatial tab, with an answer page in black ink', () => {
    const found = STUDIO_TEMPLATES.filter((t) => t.key === SD_TEMPLATE_KEY)
    expect(found).toHaveLength(1)
    expect(found[0]!.category).toBe('spatial')
    expect(found[0]!.producesAnswerKey).toBe(true)
    expect(found[0]!.defaultPageTitle).toBe(SD_DEFAULT_TITLE)
    expect(found[0]!.label).toMatch(/retirement/i)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(SD_TEMPLATE_KEY)).toBe(true)
  })

  it('asks only what kind of scenes and how many differences', () => {
    expect(SD_CONFIG_SCHEMA.map((f) => f.key)).toEqual(['theme', 'level'])
    for (const field of SD_CONFIG_SCHEMA) expect(field.type).toBe('select')
    expect(buildDefaultConfig(spotTheDifferenceTemplate).level).toBe('classic')
    expect(buildDefaultConfig(spotTheDifferenceTemplate).theme).toBe('mix')
  })

  it('names each groupâ€™s scenes', () => {
    const theme = SD_CONFIG_SCHEMA.find((f) => f.key === 'theme')!
    for (const g of SD_GROUPS) {
      const help = theme.helpWhen!({ theme: g.value })
      expect(help).toContain(String(sdGroupRecipes(g.value).length))
      expect(sdGroupRecipes(g.value).length).toBeGreaterThanOrEqual(4)
    }
  })

  it('reports the picture size on the trim, or that the trim is too small', () => {
    const layout = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    expect(sdPrintNote({ page: layout(6, 9), config: base, minExtent: 0.26 })).toMatch(/Each picture prints .* in\. Every difference/)
    expect(sdPrintNote({ page: layout(3, 3.5), config: base, minExtent: 0.26 })).toMatch(/too small/)
  })

  it('gets harder with more, subtler differences â€” never with smaller ones than a fifth of an inch', () => {
    const [relaxed, classic, challenging] = LEVELS.map((l) => sdLevelSpec(l).fairness)
    for (const f of [relaxed!, classic!, challenging!]) {
      expect(f.count[0]).toBeGreaterThanOrEqual(5)
      expect(f.count[1]).toBeLessThanOrEqual(10)
      expect(f.minExtent).toBeGreaterThanOrEqual(0.2)
    }
    expect(relaxed!.count[1]).toBeLessThanOrEqual(classic!.count[1])
    expect(classic!.count[1]).toBeLessThan(challenging!.count[1])
    expect(relaxed!.minExtent).toBeGreaterThan(classic!.minExtent)
    expect(classic!.minExtent).toBeGreaterThan(challenging!.minExtent)
    expect(relaxed!.minLine).toBeGreaterThan(challenging!.minLine)
  })

  it('warns when small pictures are asked for many differences, and only then', () => {
    const small = { w: Math.round(4.2 * DPI), h: Math.round(2.5 * DPI) }
    const roomy = { w: Math.round(5.2 * DPI), h: Math.round(3 * DPI) }
    expect(sdCrowdedWarning(small, 'mix', 'challenging')).toMatch(/small/)
    expect(sdCrowdedWarning(small, 'home', 'classic')).toMatch(/small/)
    expect(sdCrowdedWarning(small, 'mix', 'classic')).toBeNull()
    expect(sdCrowdedWarning(small, 'home', 'relaxed')).toBeNull()
    expect(sdCrowdedWarning(roomy, 'home', 'challenging')).toBeNull()
    const level = SD_CONFIG_SCHEMA.find((f) => f.key === 'level')!
    const page = (w: number, h: number) => ({ pageWidth: w * DPI, pageHeight: h * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } })
    expect(level.warningWhen!({ ...base, level: 'challenging' }, page(5, 8))).toMatch(/small/)
    expect(level.warningWhen!({ ...base, level: 'challenging' }, page(8.5, 11))).toBeNull()
  })

  it('prints no instruction when instructions are off, and one that gives the count when on', () => {
    expect(sdInstructionOptions({ showInstructions: false })).toHaveLength(0)
    for (const line of sdInstructionOptions({}, 7)) expect(line).toMatch(/\b7\b/)
  })
})

describe('spot the differences: scenes', () => {
  it('keeps the scenes broad, respectful and on-theme', () => {
    expect(SD_RECIPES.length).toBeGreaterThanOrEqual(12)
    expect(new Set(SD_RECIPES.map((r) => r.id)).size).toBe(SD_RECIPES.length)
    const banned = /(death|funeral|grave|pill|medic|wheelchair|walker|cane|hospital|nurse|brand|logo|debt|bill)/i
    for (const r of SD_RECIPES) expect(`${r.id} ${r.name}`).not.toMatch(banned)
    for (const p of SD_PROPS) expect(`${p.id} ${p.label}`).not.toMatch(banned)
    // This game's own drawings never collide with a library drawing's id.
    for (const e of SD_ELEMENTS) expect(e.id.startsWith('sd-')).toBe(true)
  })

  it('deals only things the catalogue knows, wholly inside the frame, and plenty of them', () => {
    const panel: Bounds = { minX: 0, minY: 0, maxX: 480, maxY: 290 }
    for (const recipe of SD_RECIPES) {
      let total = 0
      for (let seed = 0; seed < 6; seed++) {
        const scene = dealScene(recipe, panel, createRng(seed * 31 + 7), 1)
        total += scene.parts.length
        for (const part of scene.parts) {
          expect(sdProp(part.kind), `${recipe.id}: ${part.kind}`).toBeDefined()
          const b = partBounds(part)
          expect(b.minX).toBeGreaterThanOrEqual(0)
          expect(b.minY).toBeGreaterThanOrEqual(0)
          expect(b.maxX).toBeLessThanOrEqual(panel.maxX)
          expect(b.maxY).toBeLessThanOrEqual(panel.maxY)
        }
      }
      expect(total / 6, recipe.id).toBeGreaterThanOrEqual(8)
    }
  })

  it('keeps every standing element on its feet whatever its knobs', () => {
    for (const e of SD_ELEMENTS) {
      if (['sd-hanging', 'sd-pendant', 'sd-sun', 'sd-cloud', 'sd-birds', 'sd-kite', 'sd-picture', 'sd-clock', 'sd-shelf', 'sd-window'].includes(e.id)) continue
      const kind = sdProp(e.id)!
      const feet = new Set(sgVariants(e).filter((v) => !v.mirrored).map((v) => Math.round(kindDrawing(kind, v.knobs).bounds.maxY)))
      expect(Math.max(...feet) - Math.min(...feet), e.id).toBeLessThanOrEqual(3)
    }
  })
})

describe('spot the differences: pages', () => {
  it('prints a fair pair on every trim at every level', () => {
    for (const level of LEVELS) {
      const fair = sdLevelSpec(level).fairness
      for (const [w, h] of TRIMS) {
        const ctx = kdpCtx(w, h, 1000 + w * 10 + h)
        const out = generate({ ...base, level, seed: ctx.seed }, ctx)
        expect(out).toHaveLength(1)
        const objects = out[0]!.objects
        expect(byPart(objects, 'top'), `${level} ${w}x${h}`).toBeDefined()
        assertObjectsInSafeMargin(objects, ctx)
        assertObjectsInSafeMargin(out[0]!.answerSourceObjects!, ctx)
        const rings = collect([byPart(objects, 'bottom')!], 'ring')
        expect(rings.length).toBeGreaterThanOrEqual(fair.count[0])
        expect(rings.length).toBeLessThanOrEqual(fair.count[1])
        expect(rings.every((r) => r.visible === false)).toBe(true)
        // The count is on the page twice: in the instruction, and as tick circles.
        const instruction = objects.find((o) => typeof o.text === 'string' && /differen|changed/.test(o.text))
        expect(instruction?.text).toContain(String(rings.length))
        expect(collect(objects, 'tick')).toHaveLength(rings.length)
        expect(checkSdDrawnPage({ objects, count: rings.length, tally: true })).toEqual([])
        // The two pictures are the same size.
        const top = byPart(objects, 'top')!
        const bottom = byPart(objects, 'bottom')!
        expect(top.width).toBe(bottom.width)
        expect(top.height).toBe(bottom.height)
        expect((top.height! / DPI)).toBeGreaterThan(1.9)
      }
    }
  }, 120_000)

  it('reveals every ring, number and legend line on the answer page, in black', () => {
    const out = generate(base, kdpCtx(6, 9))
    const answers = out.flatMap((p) => harvestAnswers(p.answerSourceObjects ?? p.objects))
    const n = collect([byPart(out[0]!.objects, 'bottom')!], 'ring').length
    // Two pictures' rings, badges and numbers, and the legend.
    expect(answers.length).toBe(n * 3 * 2 + n)
    const key = buildAnswerKeyFromOutputs(out, STUDIO_INK)
    const rings = collect(key, 'ring')
    expect(rings).toHaveLength(n * 2)
    expect(rings.every((r) => r.visible === true && r.stroke === STUDIO_INK)).toBe(true)
    const legend = collect(key, 'legend')
    expect(legend).toHaveLength(n)
    expect(legend.map((l) => Number(String(l.text).split('.')[0]))).toEqual(Array.from({ length: n }, (_, i) => i + 1))
    // Nothing of the answer shows on the puzzle page.
    expect(collect(out[0]!.objects, 'ring').every((r) => r.visible === false)).toBe(true)
    expect(collect(out[0]!.objects, 'legend')).toHaveLength(0)
  })

  it('says plainly when the page is too small', () => {
    const out = generate(base, kdpCtx(3, 3.5))
    expect(byPart(out[0]!.objects, 'top')).toBeUndefined()
    expect(out[0]!.objects.some((o) => o.text === SD_PAGE_TOO_SMALL_MESSAGE)).toBe(true)
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
    expect(others.size).toBeGreaterThanOrEqual(5)
  })

  it('keeps to the chosen scenes', () => {
    for (const g of SD_GROUPS) {
      const out = generate({ ...base, theme: g.value }, kdpCtx(6, 9, 31))
      const [entry] = parseSdBook([labelOf(out[0]!.objects)], (id) => Boolean(sdRecipeById(id)))
      expect(sdGroupRecipes(g.value).map((r) => r.id)).toContain(entry!.recipe)
    }
  })

  it('varies a book: no scene twice running, scenes dealt round before they return, no repeated pair', () => {
    const labels = buildBook(16, base)
    const book = parseSdBook(labels, (id) => Boolean(sdRecipeById(id)))
    expect(book).toHaveLength(16)
    for (let i = 1; i < book.length; i++) expect(book[i]!.recipe).not.toBe(book[i - 1]!.recipe)
    // Every scene before any returns (one that cannot fill a page may be passed over).
    expect(new Set(book.slice(0, SD_RECIPES.length).map((e) => e.recipe)).size).toBeGreaterThanOrEqual(SD_RECIPES.length - 2)
    for (let i = 0; i < book.length; i++) {
      for (let j = i + 1; j < book.length; j++) {
        const same = book[i]!.recipe === book[j]!.recipe && sdOverlap(book[i]!.kinds, book[j]!.kinds) > 0.8 && sdOverlap(book[i]!.changes, book[j]!.changes) > 0.5
        expect(same, `pages ${i + 1} and ${j + 1}`).toBe(false)
      }
    }
  }, 120_000)

  it('opens a sellerâ€™s next book with other scenes', () => {
    const first = parseSdBook(buildBook(4, base, saltOf(9)), (id) => Boolean(sdRecipeById(id))).map((e) => e.recipe)
    // The browser still remembers the first book; the second starts elsewhere.
    const second = parseSdBook(buildBook(4, base, saltOf(9)), (id) => Boolean(sdRecipeById(id))).map((e) => e.recipe)
    expect(second.filter((r) => first.includes(r)).length).toBeLessThanOrEqual(1)
  }, 60_000)
})

describe('spot the differences: fairness and quality gates', () => {
  it('measures every chosen difference as big enough, alone and in the finished pair', () => {
    for (const level of LEVELS) {
      const { scene, differences, fair } = pair(level)
      for (const d of differences) {
        expect(d.ink).toBeGreaterThanOrEqual(fair.minLine)
        expect(Math.max(d.box.maxX - d.box.minX, d.box.maxY - d.box.minY)).toBeGreaterThanOrEqual(fair.minExtent * DPI)
        // The ring holds the changed ink it was fitted to.
        expect(inMark(d.mark, (d.box.minX + d.box.maxX) / 2, (d.box.minY + d.box.maxY) / 2)).toBe(true)
      }
      expect(checkPair(scene, differences, fair).errors).toEqual([])
    }
  })

  it('never uses a change that does not show', () => {
    const { scene, fair } = pair('classic')
    // A cloud "turned around" or a hidden knob measures as too faint and is never a candidate that passes.
    for (const c of candidateChanges(scene, createRng(1))) {
      const m = measureChange(scene, c, fair)
      if (m) expect(m.ink).toBeGreaterThanOrEqual(fair.minLine)
    }
    expect(candidateChanges(scene, createRng(1)).some((c) => c.kind === 'mirror' && ['sd-cloud', 'sd-sun', 'sd-bush'].includes(scene.parts.find((p) => p.id === c.part)!.kind))).toBe(false)
  })

  it('passes a clean pair', () => {
    const { scene, differences, level } = pair()
    expect(runSdKdpPreflight({ scene, differences, level, group: 'mix' }).errors).toEqual([])
  })

  it('refuses a pair that differs somewhere its answer key does not say', () => {
    const { scene, differences, level } = pair()
    // Draw every change, but leave the last one out of the answer key.
    const drawn = sdPairLines(scene, differences)
    const result = checkPair(scene, differences.slice(0, -1), level.fairness, drawn)
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/outside the answer rings/)
    expect(result.offending.length).toBeGreaterThan(0)
  })

  it('refuses a change hidden behind something else in the finished picture', () => {
    const { scene, differences, level } = pair()
    // Claim a ring where nothing changed: the full check finds no ink there.
    const [first, ...rest] = differences
    const ghost = { ...first!, mark: { ...first!.mark, cx: first!.mark.cx + 1000 } }
    const result = checkPair(scene, [ghost, ...rest], level.fairness, sdPairLines(scene, differences))
    expect(result.errors.join(' ')).toMatch(/barely shows/)
  })

  it('refuses too few differences, crowded rings, and a pair the book already has', () => {
    const { scene, differences, level } = pair()
    expect(runSdKdpPreflight({ scene, differences: differences.slice(0, 2), level, group: 'mix' }).errors.join(' ')).toMatch(/this level hides/)
    const crowded = differences.map((d, i) => (i === 1 ? { ...d, mark: { ...differences[0]!.mark } } : d))
    expect(runSdKdpPreflight({ scene, differences: crowded, level, group: 'mix' }).errors.join(' ')).toMatch(/too close/)
    const book = [sdSceneEntry(scene, differences)]
    expect(runSdKdpPreflight({ scene, differences, level, group: 'mix', book }).errors.join(' ')).toMatch(/already has/)
    expect(runSdKdpPreflight({ scene, differences, level, group: 'mix', book, repeat: true }).ok).toBe(true)
    expect(runSdKdpPreflight({ scene, differences, level, group: 'home' }).errors.join(' ')).toMatch(/not one of the chosen scenes/)
  })

  it('checks the drawn page against the pair', () => {
    const out = generate(base, kdpCtx(6, 9, 12))
    const objects = out[0]!.objects
    const n = collect([byPart(objects, 'bottom')!], 'ring').length
    expect(checkSdDrawnPage({ objects, count: n, tally: true })).toEqual([])
    const bottom = byPart(objects, 'bottom')!
    const dropped = objects.map((o) => (o === bottom ? { ...o, objects: o.objects!.filter((c) => !(c.data?.[SD_PART_KEY] === 'ring' && c.data?.n === 2)) } : o))
    expect(checkSdDrawnPage({ objects: dropped, count: n, tally: true }).join(' ')).toMatch(/rings/)
    const shown = objects.map((o) => (o === bottom ? { ...o, objects: o.objects!.map((c) => (c.data?.[SD_PART_KEY] === 'ring' ? { ...c, visible: true } : c)) } : o))
    expect(checkSdDrawnPage({ objects: shown, count: n, tally: true }).join(' ')).toMatch(/shows on the puzzle page/)
  })

  it('stamps a label the book can read back', () => {
    const out = generate(base, kdpCtx(6, 9, 3))
    const label = labelOf(out[0]!.objects)
    const [entry] = parseSdBook([label], (id) => Boolean(sdRecipeById(id)))
    expect(entry).toBeDefined()
    expect(sdPageLabel(entry!)).toBe(label)
  })
})

