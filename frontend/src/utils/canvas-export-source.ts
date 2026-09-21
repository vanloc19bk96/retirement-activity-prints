import type { CanvasExportItem, CanvasesExportRequest } from '@/context/CanvasExportContext'
import type { CanvasExportPageSlot, CanvasExportSource } from '@/types/canvas-export-plan.types'

export function buildExportPageSlots(request: CanvasesExportRequest, pageCount: number): CanvasExportPageSlot[] {
  const interiorIndices = Array.from(new Set(request.interiorPageIndices))
    .filter((pageIndex) => pageIndex >= 0 && pageIndex < pageCount)
    .sort((left, right) => left - right)

  const slots: CanvasExportPageSlot[] = interiorIndices.map((pageIndex) => ({
    canvas_type: 'interior',
    page_index: pageIndex,
  }))

  if (request.includeCover) {
    slots.push({ canvas_type: 'cover', page_index: 0 })
  }

  return slots
}

export function createCanvasExportSource({
  request,
  pageCount,
  resolvePage,
}: {
  request: CanvasesExportRequest
  pageCount: number
  resolvePage: (slot: CanvasExportPageSlot) => Promise<CanvasExportItem>
}): CanvasExportSource {
  const slots = buildExportPageSlots(request, pageCount)
  if (slots.length === 0) {
    throw new Error('No canvases selected for export')
  }

  return {
    slots,
    resolveItem: resolvePage,
  }
}

export type InteriorExportPageSlot = Extract<CanvasExportPageSlot, { canvas_type: 'interior' }>

export function getInteriorSlots(source: CanvasExportSource): InteriorExportPageSlot[] {
  return source.slots.filter((slot): slot is InteriorExportPageSlot => slot.canvas_type === 'interior')
}

export function getCoverSlot(source: CanvasExportSource): Extract<CanvasExportPageSlot, { canvas_type: 'cover' }> | null {
  const cover = source.slots.find((slot) => slot.canvas_type === 'cover')
  return cover?.canvas_type === 'cover' ? cover : null
}
