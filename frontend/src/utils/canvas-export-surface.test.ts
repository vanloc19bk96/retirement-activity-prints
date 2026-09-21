/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { StaticCanvas } from 'fabric'
import { omitFabricCanvasJsonSurfaceFields } from '@/utils/canvas-template'
import { sudokuTemplate } from '@/utils/studio/sudoku/generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '@/utils/studio/studio-fabric-builders'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX: StudioGenerateContext = {
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 24, right: 24, bottom: 24, left: 36 },
  seed: 42,
  instanceId: 'export-surface',
}

describe('canvas export surface size', () => {
  it('omits width/height/viewport so loadFromJSON cannot shrink the canvas', () => {
    const stripped = omitFabricCanvasJsonSurfaceFields({
      version: '6.0.0',
      width: 100,
      height: 200,
      viewportTransform: [0.5, 0, 0, 0.5, 0, 0],
      clipPath: { type: 'rect' },
      objects: [],
      background: '#fff',
    })
    expect(stripped).toEqual({
      version: '6.0.0',
      objects: [],
      background: '#fff',
    })
  })

  it('keeps a studio grid inside the page when JSON has zoom-scaled size', async () => {
    resetObjectCounter()
    const [page] = sudokuTemplate.generate(
      {
        ...buildDefaultConfig(sudokuTemplate),
        seed: 42,
        fontFamily: 'Inter',
      },
      CTX,
    )

    const zoom = 0.5
    const canvasJson = {
      version: '6.0.0',
      objects: page!.objects,
      background: '#ffffff',
      width: Math.round(CTX.pageWidth * zoom),
      height: Math.round(CTX.pageHeight * zoom),
      viewportTransform: [zoom, 0, 0, zoom, 0, 0],
    }

    // Without omit: Fabric 7 set(serialized) shrinks the export surface and clips ink.
    const elBad = document.createElement('canvas')
    const bad = new StaticCanvas(elBad, {
      width: CTX.pageWidth,
      height: CTX.pageHeight,
      renderOnAddRemove: false,
    })
    await bad.loadFromJSON(canvasJson)
    expect(bad.getWidth()).toBe(Math.round(CTX.pageWidth * zoom))
    bad.dispose()

    const el = document.createElement('canvas')
    const canvas = new StaticCanvas(el, {
      width: CTX.pageWidth,
      height: CTX.pageHeight,
      renderOnAddRemove: false,
    })
    await canvas.loadFromJSON(omitFabricCanvasJsonSurfaceFields(canvasJson))
    canvas.setDimensions({ width: CTX.pageWidth, height: CTX.pageHeight })
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0])

    expect(canvas.getWidth()).toBe(CTX.pageWidth)
    expect(canvas.getHeight()).toBe(CTX.pageHeight)

    const grid = canvas.getObjects().find((o) => o.type === 'group')!
    const bounds = grid.getBoundingRect()
    expect(bounds.left + bounds.width).toBeLessThanOrEqual(CTX.pageWidth - CTX.margin.right + 2)
    expect(bounds.top + bounds.height).toBeLessThanOrEqual(CTX.pageHeight - CTX.margin.bottom + 2)

    canvas.dispose()
  }, 30_000)
})
