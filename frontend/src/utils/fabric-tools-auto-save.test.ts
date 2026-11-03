/**
 * @vitest-environment jsdom
 */
import { Canvas, Path, Rect } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { exportLiveFabricCanvasJson } from '@/utils/canvas-state-store'
import { createFabricCanvasHistoryManager, FABRIC_HISTORY_CHANGED_EVENT } from '@/utils/fabric-canvas-history'
import { attachFabricEraserTool } from '@/utils/fabric-eraser-tool'

type ExportedObject = { type: string; selectable?: boolean; evented?: boolean }

function newCanvas(): Canvas {
  return new Canvas(document.createElement('canvas'), { width: 600, height: 900, renderOnAddRemove: false })
}

function exportedObjects(canvas: Canvas): ExportedObject[] {
  return (exportLiveFabricCanvasJson(canvas) as { objects: ExportedObject[] }).objects
}

describe('what an auto-save can catch mid-tool', () => {
  const canvases: Canvas[] = []
  const track = (canvas: Canvas): Canvas => {
    canvases.push(canvas)
    return canvas
  }

  afterEach(async () => {
    await Promise.all(canvases.splice(0).map((canvas) => canvas.dispose()))
  })

  it('leaves objects as they are while the eraser is on', () => {
    const canvas = track(newCanvas())
    canvas.add(new Rect({ left: 10, top: 10, width: 50, height: 50 }))
    const before = exportLiveFabricCanvasJson(canvas)

    const detach = attachFabricEraserTool(canvas, { getIsActive: () => true, getBrushSize: () => 20 })
    expect(exportLiveFabricCanvasJson(canvas)).toEqual(before)
    expect(canvas.skipTargetFind).toBe(true)

    detach()
    expect(exportLiveFabricCanvasJson(canvas)).toEqual(before)
  })

  it('leaves a pen path in progress out of the page until it is finished', () => {
    const canvas = track(newCanvas())
    const draft = new Path('M 0 0 L 10 10', { excludeFromExport: true })
    canvas.add(draft)
    expect(exportedObjects(canvas)).toEqual([])

    draft.set({ excludeFromExport: false })
    expect(exportedObjects(canvas)).toHaveLength(1)
  })
})

describe('history change event', () => {
  const flushMicrotasks = async (): Promise<void> => {
    await Promise.resolve()
    await Promise.resolve()
  }

  it('fires for a change that only records an undo step, as a toolbar color change does', async () => {
    const canvas = newCanvas()
    const rect = new Rect({ left: 10, top: 10, width: 50, height: 50, fill: '#000000' })
    canvas.add(rect)
    const history = createFabricCanvasHistoryManager(canvas)
    history.start()
    const onChanged = vi.fn()
    window.addEventListener(FABRIC_HISTORY_CHANGED_EVENT, onChanged)

    try {
      rect.set({ fill: '#ff0000' })
      history.recordSnapshot()
      await flushMicrotasks()
      expect(onChanged).toHaveBeenCalledTimes(1)

      history.recordSnapshot()
      await flushMicrotasks()
      expect(onChanged).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(FABRIC_HISTORY_CHANGED_EVENT, onChanged)
      history.dispose()
      await canvas.dispose()
    }
  })

  it('reports an undo as in progress until it lands, then fires', async () => {
    const canvas = newCanvas()
    const rect = new Rect({ left: 10, top: 10, width: 50, height: 50, fill: '#000000' })
    canvas.add(rect)
    const history = createFabricCanvasHistoryManager(canvas)
    history.start()
    rect.set({ fill: '#ff0000' })
    history.recordSnapshot()
    await flushMicrotasks()
    const onChanged = vi.fn()
    window.addEventListener(FABRIC_HISTORY_CHANGED_EVENT, onChanged)

    try {
      const undo = history.undo()
      expect(history.isApplyingSnapshot()).toBe(true)
      expect(onChanged).not.toHaveBeenCalled()

      await undo
      expect(history.isApplyingSnapshot()).toBe(false)
      expect(onChanged).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener(FABRIC_HISTORY_CHANGED_EVENT, onChanged)
      history.dispose()
      await canvas.dispose()
    }
  })
})
