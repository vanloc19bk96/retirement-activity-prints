import { beforeEach, describe, expect, it } from 'vitest'
import { buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { STUDIO_ANSWER_INK_MONO, STUDIO_ANSWER_INK_MONO_TEMPLATES } from '@/constants/studio.constants'
import { DPI } from '@/types/canvas-settings.types'
import type { StudioConfig, StudioFabricObject, StudioGenerateContext, StudioPageOutput } from '@/types/studio-template.types'
import { resetObjectCounter } from '../studio-fabric-builders'
import { assertGeneratorEntropy, assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { contentFingerprint } from '../studio-content-fingerprint'
import { clearStudioRecentContent } from '../studio-variety'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { createRng } from '../studio-rng'
import { hasWall, solveMaze } from '../maze/generator'
import { shapedMazeTemplate } from './generate'
import {
  SM_BUILD_FAILED_MESSAGE,
  SM_LEVELS,
  SM_PAGE_TOO_SMALL_MESSAGE,
  SM_SHAPES,
  SM_STARTS,
  SM_THEMES,
  parseSmBook,
  pickSmDesign,
  smDesignDrawing,
  smShapeVariants,
  smThemeShapes,
  type SmDesign,
} from './content'
import { buildShapeMask, hasPinch, isInside, isSinglePiece, type ShapeMask } from './mask'
import { buildShapedMaze, carveShapedMaze, isPerfectShapedMaze, outlineEdges } from './generator'
import { placementsClear, planSmPage, shapeFault, smDrawField, smPrintNote } from './layout'
import { runSmKdpPreflight } from './kdp-preflight'
import { outlineChains } from './draw'

/** A real KDP interior page: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, seed = 4242): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: { top: 24, right: 24, bottom: 24, left: 36 },
  seed,
  instanceId: 'kdp',
})

const KDP_TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8.5, 11],
]

const base: StudioConfig = { ...buildDefaultConfig(shapedMazeTemplate), fontFamily: 'PT Serif', title: 'Game 1' }

function page(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput {
  resetObjectCounter()
  const [out] = shapedMazeTemplate.generate(config, ctx)
  return out!
}

const mazeGroup = (objects: readonly StudioFabricObject[]) => objects.find((obj) => obj.type === 'group')

const texts = (objects: readonly StudioFabricObject[]): string[] =>
  objects.flatMap((obj) => [...(obj.text ? [String(obj.text).replace(/ /g, ' ')] : []), ...texts(obj.objects ?? [])])

/** A plan and its maze for one design, built the way generate builds them. */
function buildFor(design: SmDesign, ctx: StudioGenerateContext, levelIndex: number, seed: number) {
  const level = SM_LEVELS[levelIndex]!
  const plan = planSmPage({
    drawing: smDesignDrawing(design),
    field: smDrawField(ctx, base, design.instruction),
    level,
    journey: design.journey,
    font: 'PT Serif',
  })
  if (!plan) return null
  const starts = new Map(plan.starts.map((p) => [p.opening, p]))
  const finishes = new Map(plan.finishes.map((p) => [p.opening, p]))
  const puzzle = buildShapedMaze({
    mask: plan.mask,
    profile: level.profile,
    openings: [...new Set([...starts.keys(), ...finishes.keys()])],
    compatible: (a, b) => !!starts.get(a) && !!finishes.get(b) && placementsClear(starts.get(a)!, finishes.get(b)!, plan.metrics.labelGap),
    rng: createRng(seed),
  })
  if (!puzzle) return null
  return { level, plan, puzzle, start: starts.get(puzzle.start)!, finish: finishes.get(puzzle.finish)! }
}

const designFor = (shapeIndex: number, variantIndex = 0): SmDesign => {
  const shape = SM_SHAPES[shapeIndex]!
  const variants = smShapeVariants(shape)
  return {
    shape,
    variant: variants[variantIndex % variants.length]!,
    journey: { start: SM_STARTS[shapeIndex % SM_STARTS.length]!, finish: shape.finishes[0]! },
    instruction: 'Find your way from the Office to the Beach.',
  }
}

beforeEach(() => clearStudioRecentContent())

runGeneratorContractTests(shapedMazeTemplate)
assertGeneratorEntropy(shapedMazeTemplate)

describe('shaped maze form', () => {
  it('is registered next to the Maze, with a black answer key and no manual answer-key fields', () => {
    const registered = getStudioTemplate('shaped-maze')
    expect(registered).toBeDefined()
    expect(registered!.category).toBe('spatial')
    expect(registered!.producesAnswerKey).toBe(true)
    expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has('shaped-maze')).toBe(true)
    const keys = new Set(registered!.configSchema.map((field) => field.key))
    expect(keys.has('includeAnswerKey')).toBe(false)
    expect(keys.has('answerKeyForAll')).toBe(false)
  })

  it('asks two questions — which shapes and how hard — and derives everything else', () => {
    expect(shapedMazeTemplate.configSchema.map((field) => field.key)).toEqual(['theme', 'level'])
    const config = buildDefaultConfig(shapedMazeTemplate)
    expect(config.theme).toBe('mix')
    expect(config.level).toBe('classic')
  })

  it('reports path widths on a real trim and says so when a trim is too small', () => {
    const note = smPrintNote({ level: SM_LEVELS[1]!, page: kdpCtx(6, 9), config: base })
    expect(note).toMatch(/Paths 0\.\d\d–0\.\d\d in wide/)
    const tiny = { pageWidth: 3 * DPI, pageHeight: 4 * DPI, margin: { top: 24, right: 24, bottom: 24, left: 36 } }
    expect(smPrintNote({ level: SM_LEVELS[2]!, page: tiny, config: base })).toMatch(/too small/)
  })

  it('offers every theme a healthy set of shapes', () => {
    for (const theme of SM_THEMES) expect(smThemeShapes(theme.value).length, theme.value).toBeGreaterThanOrEqual(7)
  })
})

describe('shaped maze library', () => {
  it('uses generic, commercially safe names and a positive retirement tone', () => {
    const banned = /\b(death|dying|funeral|illness|sick|pill|hospital|walker|wheelchair|dementia|forget|broke|debt|old age|senior moment|grave)\b/i
    const words = [
      ...SM_STARTS.map((p) => p.label),
      ...SM_SHAPES.flatMap((s) => [s.noun, s.subject.name, ...s.finishes.map((p) => p.label)]),
    ]
    for (const word of words) expect(word, word).not.toMatch(banned)
    // Place names stay short: they sit beside the maze in large print.
    for (const word of [...SM_STARTS.map((p) => p.label), ...SM_SHAPES.flatMap((s) => s.finishes.map((p) => p.label))]) {
      expect(word.length, word).toBeLessThanOrEqual(16)
    }
  })

  it('builds a faithful, playable maze in every shape on a 6 x 9 page', () => {
    const ctx = kdpCtx(6, 9)
    for (let i = 0; i < SM_SHAPES.length; i++) {
      const built = buildFor(designFor(i), ctx, 1, i + 1)
      expect(built, SM_SHAPES[i]!.subject.id).not.toBeNull()
      const { plan, puzzle, level, start, finish } = built!
      expect(shapeFault(plan.mask, plan.quality, level), SM_SHAPES[i]!.subject.id).toBeNull()
      expect(runSmKdpPreflight({ puzzle, plan, level, start, finish }).errors, SM_SHAPES[i]!.subject.id).toEqual([])
    }
  })

  it('keeps the outline a shape, not a rectangle or a strip', () => {
    const ctx = kdpCtx(8.5, 11)
    for (let i = 0; i < SM_SHAPES.length; i++) {
      const built = buildFor(designFor(i, 3), ctx, 1, i + 1)
      expect(built, SM_SHAPES[i]!.subject.id).not.toBeNull()
      const q = built!.plan.quality
      expect(q.fill, SM_SHAPES[i]!.subject.id).toBeLessThanOrEqual(0.86)
      expect(q.iou, SM_SHAPES[i]!.subject.id).toBeGreaterThanOrEqual(0.82)
    }
  })
})

describe('shaped maze masks', () => {
  it('are one piece with no corner pinches, whatever the resolution', () => {
    for (let i = 0; i < SM_SHAPES.length; i++) {
      const drawing = smDesignDrawing(designFor(i, i))
      for (const cell of [20, 26, 34]) {
        const built = buildShapeMask({ drawing, width: 460, height: 560, cell })
        expect(built, SM_SHAPES[i]!.subject.id).not.toBeNull()
        expect(isSinglePiece(built!.mask), `${SM_SHAPES[i]!.subject.id}@${cell}`).toBe(true)
        expect(hasPinch(built!.mask), `${SM_SHAPES[i]!.subject.id}@${cell}`).toBe(false)
      }
    }
  })

  it('refuses a plain block as a shape', () => {
    const block = { pieces: [{ ring: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }] }], strokes: [] }
    const built = buildShapeMask({ drawing: block, width: 460, height: 560, cell: 26 })!
    expect(shapeFault(built.mask, built.quality, SM_LEVELS[1]!)).toBe('reads as a rectangle')
  })
})

describe('shaped maze generator', () => {
  const ring: ShapeMask = (() => {
    // A doughnut: the hole must never be offered as a way in.
    const rows = 12
    const cols = 12
    const inside = new Uint8Array(rows * cols)
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) inside[r * cols + c] = r >= 4 && r < 8 && c >= 4 && c < 8 ? 0 : 1
    const exterior = new Uint8Array(rows * cols)
    return { rows, cols, inside, exterior, count: rows * cols - 16 }
  })()

  it('carves a spanning tree over exactly the shape', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = carveShapedMaze(ring, 0.5, createRng(seed))
      expect(isPerfectShapedMaze(g, ring, [])).toBe(true)
      // Cells outside the shape are never opened.
      for (let r = 4; r < 8; r++) for (let c = 4; c < 8; c++) for (let d = 0; d < 4; d++) expect(hasWall(g, { r, c }, d)).toBe(true)
    }
  })

  it('never opens onto an enclosed hole', () => {
    for (const edge of outlineEdges(ring)) {
      const { r, c } = edge.cell
      expect(r === 0 || r === 11 || c === 0 || c === 11, `${r},${c},${edge.dir}`).toBe(true)
    }
  })

  it('stores a route that the maze itself confirms, from Start to Finish', () => {
    const ctx = kdpCtx(6, 9)
    for (let i = 0; i < SM_SHAPES.length; i += 3) {
      const built = buildFor(designFor(i, 1), ctx, 2, 100 + i)
      if (!built) continue
      const { puzzle } = built
      const again = solveMaze(puzzle, puzzle.start.cell, puzzle.finish.cell)
      expect(again).toEqual(puzzle.solution)
      for (const cell of puzzle.solution) expect(isInside(puzzle.mask, cell.r, cell.c)).toBe(true)
    }
  })

  it('breaks the outline exactly at Start and Finish', () => {
    const ctx = kdpCtx(7, 10)
    for (let i = 0; i < SM_SHAPES.length; i += 2) {
      const built = buildFor(designFor(i, 2), ctx, 1, 7 + i)
      expect(built, SM_SHAPES[i]!.subject.id).not.toBeNull()
      const open = outlineChains(built!.puzzle).filter((chain) => chain[0] !== chain[chain.length - 1])
      expect(open.length, SM_SHAPES[i]!.subject.id).toBe(2)
    }
  })

  it('gives harder levels longer routes on the same trim', () => {
    const ctx = kdpCtx(8.5, 11)
    const mean = (levelIndex: number) => {
      let total = 0
      let count = 0
      for (let i = 0; i < SM_SHAPES.length; i += 2) {
        const built = buildFor(designFor(i), ctx, levelIndex, 50 + i)
        if (!built) continue
        total += built.puzzle.solution.length
        count++
      }
      return total / count
    }
    const gentle = mean(0)
    const classic = mean(1)
    const challenging = mean(2)
    expect(classic).toBeGreaterThan(gentle)
    expect(challenging).toBeGreaterThan(classic)
  })
})

describe('shaped maze pages', () => {
  it('prints a valid page with a matching key on every common trim and level', () => {
    for (const [w, h] of KDP_TRIMS) {
      for (const level of SM_LEVELS) {
        for (const seed of [11, 12, 13]) {
          const ctx = kdpCtx(w, h, seed)
          const out = page({ ...base, level: level.id }, ctx)
          const label = `${w}x${h} ${level.id} #${seed}`
          const group = mazeGroup(out.objects)
          expect(group, label).toBeDefined()
          assertObjectsInSafeMargin(out.objects, ctx)

          // START / FINISH captions and the journey travel with the maze.
          const words = texts(group!.objects ?? [])
          expect(words, label).toContain('START')
          expect(words, label).toContain('FINISH')

          // Answers hidden on the page, revealed on the key, drawn from the same maze.
          const hidden = harvestAnswers(out.objects)
          expect(hidden.length, label).toBeGreaterThan(0)
          expect(hidden.every((obj) => obj.visible === false), label).toBe(true)
          const key = buildAnswerPage(out.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
          assertObjectsInSafeMargin(key, ctx)
          const shown = harvestAnswers(key)
          expect(shown.length, label).toBe(hidden.length)
          expect(shown.every((obj) => obj.visible === true && obj.stroke === STUDIO_ANSWER_INK_MONO), label).toBe(true)
          const keyGroup = mazeGroup(out.answerSourceObjects!)!
          expect(keyGroup.data?.studioCanonicalKey, label).toBe(group!.data?.studioCanonicalKey)
        }
      }
    }
  })

  it('draws in black ink only — no fills, greys or textures', () => {
    const out = page(base, kdpCtx(6, 9))
    const walk = (list: readonly StudioFabricObject[]): StudioFabricObject[] => list.flatMap((obj) => [obj, ...walk(obj.objects ?? [])])
    for (const obj of walk(mazeGroup(out.objects)!.objects ?? [])) {
      if (obj.type === 'textbox') continue
      if (obj.fill && obj.fill !== 'transparent') expect(obj.fill).toBe('#000000')
      if (obj.studioRole !== 'answer' && obj.stroke && obj.stroke !== 'transparent') expect(obj.stroke).toBe('#000000')
      expect(obj.strokeWidth ?? 2, obj.type).toBeGreaterThanOrEqual(0)
    }
  })

  it('keeps corridors at least a quarter inch wide and walls heavy enough to print', () => {
    for (const [w, h] of KDP_TRIMS) {
      for (let i = 0; i < SM_SHAPES.length; i += 4) {
        const built = buildFor(designFor(i), kdpCtx(w, h), 2, i)
        if (!built) continue
        expect(built.plan.cell).toBeGreaterThanOrEqual(Math.round(0.24 * DPI))
        expect(built.plan.metrics.wallWidth).toBeGreaterThanOrEqual(2)
        expect(built.plan.metrics.borderWidth).toBeGreaterThan(built.plan.metrics.wallWidth)
      }
    }
  })

  it('says so plainly when the page is too small, instead of printing a cramped maze', () => {
    const tiny = { ...kdpCtx(3, 4), seed: 5 }
    const words = texts(page({ ...base, level: 'challenging' }, tiny).objects)
    expect(words).toContain(SM_PAGE_TOO_SMALL_MESSAGE)
    expect(words).not.toContain(SM_BUILD_FAILED_MESSAGE)
  })

  it('stamps the shape and journey so the book can remember them', () => {
    const out = page(base, kdpCtx(6, 9))
    const label = String(mazeGroup(out.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '')
    const [entry] = parseSmBook([label])
    expect(entry).toBeDefined()
    const words = texts(out.objects).join(' ')
    expect(words).toContain(entry!.start)
    expect(words).toContain(entry!.finish)
  })

  it('tells the journey in the instruction, and drops it when instructions are off', () => {
    const out = page(base, kdpCtx(8.5, 11))
    const label = String(mazeGroup(out.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY] ?? '')
    const [entry] = parseSmBook([label])
    const header = out.objects.filter((obj) => obj.type === 'textbox').map((obj) => String(obj.text).replace(/ /g, ' '))
    expect(header.some((text) => text.includes(entry!.start) && text.includes(entry!.finish))).toBe(true)

    const quiet = page({ ...base, showInstructions: false }, kdpCtx(8.5, 11))
    const quietHeader = quiet.objects.filter((obj) => obj.type === 'textbox').map((obj) => String(obj.text).replace(/ /g, ' '))
    expect(quietHeader).toEqual(['Game 1'])
  })
})

describe('shaped maze variety', () => {
  it('does not repeat a shape within a book while others are left', () => {
    const labels: string[] = []
    const shapes: string[] = []
    const pool = smThemeShapes('garden').length
    for (let seed = 1; seed <= pool; seed++) {
      clearStudioRecentContent()
      const out = page({ ...base, theme: 'garden' }, { ...kdpCtx(8.5, 11, seed), remoteData: { bookLabels: [...labels] } })
      const label = String(mazeGroup(out.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY])
      labels.push(label)
      shapes.push(label.split('|')[0]!)
    }
    expect(new Set(shapes).size).toBe(pool)
  })

  it('varies the workday Start across a book', () => {
    const labels: string[] = []
    for (let seed = 1; seed <= 12; seed++) {
      const out = page(base, { ...kdpCtx(8.5, 11, seed), remoteData: { bookLabels: [...labels] } })
      labels.push(String(mazeGroup(out.objects)!.data?.[STUDIO_CONTENT_LABEL_KEY]))
    }
    const starts = parseSmBook(labels).map((entry) => entry.start)
    expect(new Set(starts).size).toBe(starts.length)
  })

  it('gives two sellers different pages on the same settings and seed', () => {
    const a = page(base, { ...kdpCtx(6, 9, 99), ownerSalt: 'a'.repeat(32) })
    const b = page(base, { ...kdpCtx(6, 9, 99), ownerSalt: 'b'.repeat(32) })
    expect(contentFingerprint(a.objects)).not.toBe(contentFingerprint(b.objects))
  })

  it('carves a different maze each time the same shape returns', () => {
    const design = designFor(0)
    const ctx = kdpCtx(6, 9)
    const a = buildFor(design, ctx, 1, 1)!
    const b = buildFor(design, ctx, 1, 2)!
    const walls = (p: typeof a.puzzle) => JSON.stringify([p.hWalls, p.vWalls])
    expect(walls(a.puzzle)).not.toBe(walls(b.puzzle))
  })

  it('picks every design from what the book already holds, not from a global history', () => {
    const shape = SM_SHAPES[0]!
    const book = smShapeVariants(shape).map((v, i) => ({
      shape: shape.subject.id,
      variant: Object.keys(shape.subject.knobs).map((k) => `${k}${v.knobs[k]}`).concat(v.mirrored ? ['m'] : []).join('.'),
      start: SM_STARTS[i % SM_STARTS.length]!.label,
      finish: shape.finishes[0]!.label,
    }))
    const design = pickSmDesign({ config: base, theme: shape.subject.theme, level: SM_LEVELS[1]!, seed: 1, ownerSalt: 'x', book, columnWidth: 500 })
    expect(design!.shape.subject.id).not.toBe(shape.subject.id)
  })
})
