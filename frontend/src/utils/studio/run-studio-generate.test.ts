import { describe, expect, it, vi } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { DPI, calculateMarginGuide } from '@/types/canvas-settings.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

/** One text box pinned to the top-left of the content box, the same every seed. */
const fakeTemplate = {
  key: 'fake-sheet',
  pageCount: 1,
  producesAnswerKey: false,
  generate: (_config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] => [
    {
      pageRole: 'single',
      objects: [
        {
          type: 'textbox',
          left: ctx.margin.left,
          top: ctx.margin.top,
          width: 100,
          text: 'Same puzzle',
          studioRole: 'prompt',
          studioTemplateKey: 'fake-sheet',
          studioInstanceId: ctx.instanceId,
        },
      ],
    },
  ],
}

vi.mock('@/constants/studio-templates', () => ({
  getStudioTemplate: (key: string) => (key === 'fake-sheet' ? fakeTemplate : undefined),
}))
vi.mock('@/utils/font-loader', () => ({
  ensureFontFamilyLoaded: async () => undefined,
}))

const { runStudioGenerateOnce } = await import('./run-studio-generate')

const PAGE_WIDTH = Math.round(6 * DPI)
const PAGE_HEIGHT = Math.round(9 * DPI)
const emptyStore = {
  getSerialized: () => null,
  has: () => false,
} as unknown as CanvasStateStore

async function generateAt(options: {
  startPageIndex: number
  interiorPageCount: number
  projectedPageCount?: number
  usedFingerprints?: Set<string>
}) {
  const writes: Array<{ pageIndex: number; objects: StudioFabricObject[] }> = []
  const result = await runStudioGenerateOnce({
    req: {
      templateKey: 'fake-sheet',
      config: { fontFamily: 'PT Serif' },
      startPageIndex: options.startPageIndex,
      mode: 'insert',
      interiorPageCount: options.interiorPageCount,
    },
    pageWidth: PAGE_WIDTH,
    pageHeight: PAGE_HEIGHT,
    marginGuide: calculateMarginGuide(options.interiorPageCount, false),
    writePage: (pageIndex, objects) => writes.push({ pageIndex, objects }),
    canvasStateStore: emptyStore,
    signal: new AbortController().signal,
    setError: () => undefined,
    usedFingerprints: options.usedFingerprints,
    projectedPageCount: options.projectedPageCount,
  })
  return { result, writes }
}

describe('runStudioGenerateOnce margins', () => {
  it('lays a recto against the gutter of the finished book, not the book so far', async () => {
    // 40 pages today, 200 when the book run is done: KDP wants 0.5in inside.
    const { writes } = await generateAt({
      startPageIndex: 0,
      interiorPageCount: 40,
      projectedPageCount: 200,
    })
    expect(writes[0]!.objects[0]!.left).toBe(Math.round(0.5 * DPI))
  })

  it('keeps the 0.375in gutter while the book stays under 151 pages', async () => {
    const { writes } = await generateAt({ startPageIndex: 0, interiorPageCount: 40 })
    expect(writes[0]!.objects[0]!.left).toBe(Math.round(0.375 * DPI))
  })

  it('widens the gutter when this sheet itself takes the book past 150 pages', async () => {
    const { writes } = await generateAt({ startPageIndex: 0, interiorPageCount: 150 })
    expect(writes[0]!.objects[0]!.left).toBe(Math.round(0.5 * DPI))
  })

  it('puts a verso sheet on its outside margin, gutter on the right', async () => {
    const { writes } = await generateAt({ startPageIndex: 1, interiorPageCount: 40 })
    const obj = writes[0]!.objects[0]!
    expect(writes[0]!.pageIndex).toBe(1)
    expect(obj.left).toBe(Math.round(0.25 * DPI))
  })
})

describe('runStudioGenerateOnce duplicate detection', () => {
  it('flags the same sheet as a repeat whichever side of the spread it lands on', async () => {
    const used = new Set<string>()
    const first = await generateAt({ startPageIndex: 0, interiorPageCount: 40, usedFingerprints: used })
    expect(first.result?.isDuplicate).toBe(false)
    // The recto and verso copies used to fingerprint apart by their left inset.
    const second = await generateAt({ startPageIndex: 1, interiorPageCount: 41, usedFingerprints: used })
    expect(second.result?.isDuplicate).toBe(true)
  })
})
