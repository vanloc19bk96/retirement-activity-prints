import { describe, it, expect } from 'vitest'
import { pictureRecognitionTemplate, clampPictureSet } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { assertObjectsInSafeMargin, STUDIO_TEST_CTX } from '../studio-generator-test'
import type { StudioFabricObject, StudioGenerateContext } from '@/types/studio-template.types'
import type { PictureRef, PictureSetResponse } from '@/types/studio-pictures.types'
import { STUDIO_BODY_SIZE, STUDIO_STROKE_HAIRLINE } from '@/constants/studio.constants'
import {
  IMAGE_FIT_RATIO,
  MIN_CELL,
  autoDistractorCount,
  snapTargetCount,
} from './layout'

function flattenStudioObjects(objects: StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((obj) =>
    obj.type === 'group' && obj.objects ? flattenStudioObjects(obj.objects) : [obj],
  )
}

function pic(i: number): PictureRef {
  return {
    id: `pic-${i}`,
    url: `https://example.supabase.co/storage/v1/object/public/outline-library/animals/item-${i}.png`,
    name: `Item ${i}`,
    naturalWidth: 600,
    naturalHeight: 600,
  }
}

function makeRemote(targetCount: number, distractorCount: number): PictureSetResponse {
  const targets = Array.from({ length: targetCount }, (_, i) => pic(i + 1))
  const distractors = Array.from({ length: distractorCount }, (_, i) =>
    pic(targetCount + i + 1),
  )
  const options = [...targets, ...distractors]
  // Deterministic shuffle-like interleave so positions differ from study order.
  const shuffled: PictureRef[] = []
  while (options.length) {
    if (options.length) shuffled.push(options.pop()!)
    if (options.length) shuffled.push(options.shift()!)
  }
  return { targets, options: shuffled }
}

const REMOTE = makeRemote(9, 7)

const CTX = (remote: PictureSetResponse = REMOTE): StudioGenerateContext => ({
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
  remoteData: remote,
})

const config: Record<string, unknown> = {
  ...buildDefaultConfig(pictureRecognitionTemplate),
  seed: 42,
  fontFamily: 'Inter',
  showCellNumbers: true,
}

function imageCells(page: { objects: StudioFabricObject[] }): StudioFabricObject[] {
  return flattenStudioObjects(page.objects).filter((o) => o.type === 'image')
}

function displaySize(img: StudioFabricObject): { width: number; height: number } {
  return {
    width: (img.width ?? 0) * (img.scaleX ?? 1),
    height: (img.height ?? 0) * (img.scaleY ?? 1),
  }
}

function gridShape(page: { objects: StudioFabricObject[] }): {
  cols: number
  rows: number
  images: number
} {
  const images = imageCells(page)
  const bars = flattenStudioObjects(page.objects).filter(
    (o) =>
      o.type === 'rect' &&
      o.studioRole === 'structure' &&
      o.strokeWidth === 0,
  )
  const vBars = bars.filter((b) => (b.width ?? 0) === STUDIO_STROKE_HAIRLINE)
  const hBars = bars.filter((b) => (b.height ?? 0) === STUDIO_STROKE_HAIRLINE)
  return {
    cols: vBars.length - 1,
    rows: hBars.length - 1,
    images: images.length,
  }
}

describe('picture-recognition', () => {
  it('is deterministic for the same remote data', () => {
    resetObjectCounter()
    const a = pictureRecognitionTemplate.generate(config, CTX())
    resetObjectCounter()
    const b = pictureRecognitionTemplate.generate(config, CTX())
    expect(a).toEqual(b)
  })

  it('produces a study page then a recall page', () => {
    resetObjectCounter()
    const pages = pictureRecognitionTemplate.generate(config, CTX())
    expect(pages.map((p) => p.pageRole)).toEqual(['study', 'recall'])
  })

  it('does not produce a separate answer-key page', () => {
    expect(pictureRecognitionTemplate.producesAnswerKey).toBe(false)
    resetObjectCounter()
    const pages = pictureRecognitionTemplate.generate(config, CTX())
    const answers = pages.flatMap((p) =>
      flattenStudioObjects(p.objects).filter((o) => o.studioRole === 'answer'),
    )
    expect(answers).toHaveLength(0)
  })

  it('the recall page shows every option as a visible image', () => {
    resetObjectCounter()
    const [, recall] = pictureRecognitionTemplate.generate(config, CTX())
    const images = imageCells(recall)
    expect(images.length).toBe(REMOTE.options.length)
    expect(images.every((o) => o.visible !== false)).toBe(true)
  })

  it('never crashes when remoteData is missing', () => {
    resetObjectCounter()
    expect(() =>
      pictureRecognitionTemplate.generate(config, { ...CTX(), remoteData: undefined }),
    ).not.toThrow()
  })

  it('image URLs contain no expiry token', () => {
    resetObjectCounter()
    const pages = pictureRecognitionTemplate.generate(config, CTX())
    for (const page of pages) {
      for (const img of imageCells(page)) {
        expect(img.src).not.toMatch(/token=|expires=|X-Amz-/i)
        expect(img.crossOrigin).toBe('anonymous')
      }
    }
  })

  it('CONFIG: extras are derived (next larger square) — not user-facing', () => {
    expect(autoDistractorCount(4)).toBe(5)
    expect(autoDistractorCount(9)).toBe(7)
    expect(autoDistractorCount(16)).toBe(9)
    expect(snapTargetCount(6)).toBe(4)
    expect(snapTargetCount(10)).toBe(9)
    const schemaKeys = pictureRecognitionTemplate.configSchema.map((f) => f.key)
    expect(schemaKeys).not.toContain('distractorCount')
  })

  it('LAYOUT: cells never fall below the minimum, at any square size', () => {
    for (const [targets, distractors] of [
      [4, 5],
      [9, 7],
      [16, 9],
    ] as const) {
      resetObjectCounter()
      const remote = makeRemote(targets, distractors)
      const [, recall] = pictureRecognitionTemplate.generate(
        { ...config, targetCount: targets, distractorCount: distractors },
        CTX(remote),
      )
      const images = imageCells(recall)
      for (const img of images) {
        const size = displaySize(img)
        expect(size.width).toBeGreaterThanOrEqual(MIN_CELL * IMAGE_FIT_RATIO - 1)
        expect(size.height).toBeGreaterThanOrEqual(MIN_CELL * IMAGE_FIT_RATIO - 1)
      }
    }
  })

  it('LAYOUT: grid fills most of the safe field width', () => {
    resetObjectCounter()
    const [, recall] = pictureRecognitionTemplate.generate(config, CTX())
    const group = recall.objects.find((o) => o.type === 'group')
    expect(group).toBeTruthy()
    // 16 images on a ~2100px content band should not sit in a tiny centered cluster.
    expect(group!.width ?? 0).toBeGreaterThan(1200)
  })

  it('LAYOUT: images preserve aspect ratio (never stretched)', () => {
    resetObjectCounter()
    const remote = makeRemote(4, 5)
    remote.options[0] = { ...remote.options[0], naturalWidth: 800, naturalHeight: 400 }
    const [, recall] = pictureRecognitionTemplate.generate(
      { ...config, targetCount: 4, distractorCount: 5 },
      CTX(remote),
    )
    const img = imageCells(recall).find((o) => o.src === remote.options[0].url)!
    expect(img.scaleX).toBe(img.scaleY)
    const size = displaySize(img)
    expect(size.width / size.height).toBeCloseTo(2, 5)
  })

  it('keeps objects inside the safe margin', () => {
    resetObjectCounter()
    const ctx: StudioGenerateContext = { ...STUDIO_TEST_CTX, remoteData: makeRemote(4, 5) }
    const pages = pictureRecognitionTemplate.generate(
      { ...config, targetCount: 4, distractorCount: 5 },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('keeps max pictures inside the safe margin', () => {
    resetObjectCounter()
    const ctx: StudioGenerateContext = {
      ...STUDIO_TEST_CTX,
      remoteData: makeRemote(16, 9),
    }
    const pages = pictureRecognitionTemplate.generate(
      { ...config, targetCount: 16, distractorCount: 9 },
      ctx,
    )
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
    }
  })

  it('LAYOUT: study and recall pack as filled square grids', () => {
    for (const [targets, distractors] of [
      [4, 5],
      [9, 7],
      [16, 9],
    ] as const) {
      resetObjectCounter()
      const remote = makeRemote(targets, distractors)
      const [study, recall] = pictureRecognitionTemplate.generate(
        { ...config, targetCount: targets, distractorCount: distractors },
        CTX(remote),
      )
      const studyGrid = gridShape(study)
      const recallGrid = gridShape(recall)
      expect(studyGrid.cols).toBe(studyGrid.rows)
      expect(studyGrid.cols * studyGrid.rows).toBe(studyGrid.images)
      expect(recallGrid.cols).toBe(recallGrid.rows)
      expect(recallGrid.cols * recallGrid.rows).toBe(recallGrid.images)
      expect(studyGrid.images).toBe(targets)
      expect(recallGrid.images).toBe(targets + distractors)
    }
  })

  it('draws even-weight grid bars like grid-copy (not per-cell strokes)', () => {
    resetObjectCounter()
    const [, recall] = pictureRecognitionTemplate.generate(config, CTX())
    const bars = flattenStudioObjects(recall.objects).filter(
      (o) =>
        o.type === 'rect' &&
        o.studioRole === 'structure' &&
        o.strokeWidth === 0 &&
        o.fill &&
        o.fill !== 'transparent',
    )
    expect(bars.length).toBeGreaterThan(0)
    expect(
      bars.every(
        (b) => b.width === STUDIO_STROKE_HAIRLINE || b.height === STUDIO_STROKE_HAIRLINE,
      ),
    ).toBe(true)
  })

  function findRecallLegend(page: { objects: StudioFabricObject[] }) {
    return flattenStudioObjects(page.objects).find(
      (o) =>
        o.type === 'textbox' &&
        typeof o.text === 'string' &&
        o.text.replace(/\u00a0/g, ' ').includes('of these were on the previous page'),
    )
  }

  it('uses a smaller legend than body text on the recall page', () => {
    resetObjectCounter()
    const [, recall] = pictureRecognitionTemplate.generate(config, CTX())
    const legend = findRecallLegend(recall)
    expect(legend).toBeTruthy()
    expect(legend!.fontSize ?? 0).toBeLessThan(STUDIO_BODY_SIZE)
    expect(legend!.fontSize ?? 0).toBeLessThanOrEqual(18)
  })

  it('LAYOUT: legend stays on one line (NBSP, full content width)', () => {
    resetObjectCounter()
    const remote = makeRemote(4, 5)
    const [, recall] = pictureRecognitionTemplate.generate(
      { ...config, targetCount: 4, distractorCount: 5 },
      CTX(remote),
    )
    const legend = findRecallLegend(recall)
    expect(legend).toBeTruthy()
    expect(legend!.text).toMatch(/\u00a0/)
    expect(legend!.text).not.toMatch(/ /)
    // Must not be clamped to a single cell — that caused per-word wrap.
    expect(legend!.width ?? 0).toBeGreaterThan(MIN_CELL * 1.5)
  })

  it('clampPictureSet drops distractors before targets', () => {
    const remote = makeRemote(9, 7)
    const clamped = clampPictureSet(remote, 12)
    expect(clamped.targets.length).toBe(9)
    expect(clamped.options.length).toBe(12)
    const ids = new Set(clamped.options.map((o) => o.id))
    expect(clamped.targets.every((t) => ids.has(t.id))).toBe(true)
  })
})
