import PptxGenJS from 'pptxgenjs'

import type { CanvasExportItem } from '@/context/CanvasExportContext'
import type { CanvasExportPageSlot, CanvasExportSource } from '@/types/canvas-export-plan.types'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import { DPI, type MarginGuide, type PageDimensions } from '@/types/canvas-settings.types'
import { renderCanvasExportItemToPptSlide } from '@/utils/fabric-canvas-to-ppt'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

async function emitPptExportCallback(callback?: () => void | Promise<void>): Promise<void> {
  await Promise.resolve(callback?.())
}

export type PptFile = {
  fileName: string
  blob: Blob
}

type PptPageStartInfo = {
  item: CanvasExportItem
  itemIndex: number
  totalItems: number
}

type PptPageCompleteInfo = {
  item: CanvasExportItem
  completedCount: number
  totalItems: number
}

type PptProgressLabelInfo = {
  label: string
  completedCount: number
  totalItems: number
}

function pixelsToInches(pixels: number): number {
  return pixels / DPI
}

export async function exportItemsToPptBlob({
  items,
  pageWidthPixels,
  pageHeightPixels,
  backgroundColor,
  totalItems,
  processedOffset,
  onPageStart,
  onPageComplete,
  onProgressLabel,
}: {
  items: CanvasExportItem[]
  pageWidthPixels: number
  pageHeightPixels: number
  backgroundColor: string
  totalItems: number
  processedOffset: number
  onPageStart?: (info: PptPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: PptPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: PptProgressLabelInfo) => void | Promise<void>
}): Promise<Blob> {
  if (items.length === 0) {
    throw new Error('No canvases selected for PPT export')
  }

  const slideWidthInches = pixelsToInches(pageWidthPixels)
  const slideHeightInches = pixelsToInches(pageHeightPixels)
  const layoutName = `BOOK_EDITOR_${pageWidthPixels}x${pageHeightPixels}`

  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: layoutName, width: slideWidthInches, height: slideHeightInches })
  pptx.layout = layoutName

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!
    await emitPptExportCallback(() =>
      onPageStart?.({
        item,
        itemIndex: processedOffset + itemIndex + 1,
        totalItems,
      }),
    )

    const slide = pptx.addSlide()
    slide.background = { color: 'FFFFFF' }

    await renderCanvasExportItemToPptSlide({
      slide,
      item,
      pageWidthPixels,
      pageHeightPixels,
      backgroundColor,
    })
    await yieldToMainThread()

    await emitPptExportCallback(() =>
      onPageComplete?.({
        item,
        completedCount: processedOffset + itemIndex + 1,
        totalItems,
      }),
    )
    await yieldToMainThread()
  }

  await emitPptExportCallback(() =>
    onProgressLabel?.({
      label: 'Finalizing PPT...',
      completedCount: totalItems,
      totalItems,
    }),
  )
  await yieldToMainThread()

  const output = await pptx.write({ outputType: 'blob' })
  if (!(output instanceof Blob)) {
    throw new Error('Failed to generate PPT export blob')
  }

  return output
}

type InteriorPptSlot = Extract<CanvasExportPageSlot, { canvas_type: 'interior' }>

/**
 * Render a PPT chunk by resolving one interior slot at a time.
 * Peak canvas JSON RAM ≈ one page per chunk.
 */
export async function exportItemsToPptBlobForSlots({
  source,
  interiorSlots,
  pageWidthPixels,
  pageHeightPixels,
  backgroundColor,
  totalItems,
  processedOffset,
  onPageStart,
  onPageComplete,
  onProgressLabel,
}: {
  source: CanvasExportSource
  interiorSlots: readonly InteriorPptSlot[]
  pageWidthPixels: number
  pageHeightPixels: number
  backgroundColor: string
  totalItems: number
  processedOffset: number
  onPageStart?: (info: PptPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: PptPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: PptProgressLabelInfo) => void | Promise<void>
}): Promise<Blob> {
  if (interiorSlots.length === 0) {
    throw new Error('No canvases selected for PPT export')
  }

  const slideWidthInches = pixelsToInches(pageWidthPixels)
  const slideHeightInches = pixelsToInches(pageHeightPixels)
  const layoutName = `BOOK_EDITOR_${pageWidthPixels}x${pageHeightPixels}`

  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: layoutName, width: slideWidthInches, height: slideHeightInches })
  pptx.layout = layoutName

  for (let itemIndex = 0; itemIndex < interiorSlots.length; itemIndex += 1) {
    const slot = interiorSlots[itemIndex]!
    const item = await source.resolveItem(slot)

    await emitPptExportCallback(() =>
      onPageStart?.({
        item,
        itemIndex: processedOffset + itemIndex + 1,
        totalItems,
      }),
    )

    const slide = pptx.addSlide()
    slide.background = { color: 'FFFFFF' }

    await renderCanvasExportItemToPptSlide({
      slide,
      item,
      pageWidthPixels,
      pageHeightPixels,
      backgroundColor,
    })
    item.canvas_data = {}
    await yieldToMainThread()

    await emitPptExportCallback(() =>
      onPageComplete?.({
        item,
        completedCount: processedOffset + itemIndex + 1,
        totalItems,
      }),
    )
    await yieldToMainThread()
  }

  await emitPptExportCallback(() =>
    onProgressLabel?.({
      label: 'Finalizing PPT chunk...',
      completedCount: processedOffset + interiorSlots.length,
      totalItems,
    }),
  )
  await yieldToMainThread()

  const output = await pptx.write({ outputType: 'blob' })
  if (!(output instanceof Blob)) {
    throw new Error('Failed to generate PPT export blob')
  }

  return output
}

/**
 * Export canvases to PowerPoint. Catalog + system text stays editable native
 * text (pptxgenjs writes the catalog face name; it does not embed font files).
 * Unknown custom faces are rasterized for WYSIWYG. Basic shapes
 * (rect/ellipse/line/triangle) become native vector shapes; paths/polygons/
 * images (and unknown-font text) are rasterized. Cover and interior pages are
 * separate decks because PowerPoint supports one slide size per file.
 */
export async function exportCanvasesToPptFiles({
  items,
  pageDimensions,
  bookCoverDimensions,
  onPageStart,
  onPageComplete,
  onProgressLabel,
}: {
  items: CanvasExportItem[]
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  marginGuide?: MarginGuide
  onPageStart?: (info: PptPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: PptPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: PptProgressLabelInfo) => void | Promise<void>
}): Promise<PptFile[]> {
  const interiorItems = items
    .filter((item) => item.canvas_type === 'interior')
    .sort((left, right) => left.page_index - right.page_index)

  const coverItem = items.find((item) => item.canvas_type === 'cover') ?? null

  const files: PptFile[] = []
  const totalItems = (coverItem ? 1 : 0) + interiorItems.length
  let processedOffset = 0

  if (coverItem) {
    const blob = await exportItemsToPptBlob({
      items: [coverItem],
      pageWidthPixels: bookCoverDimensions.fullWidthPixels,
      pageHeightPixels: bookCoverDimensions.fullHeightPixels,
      backgroundColor: '#ffffff',
      totalItems,
      processedOffset,
      onPageStart,
      onPageComplete,
      onProgressLabel,
    })
    processedOffset += 1

    files.push({
      fileName: 'book-editor_cover.pptx',
      blob,
    })
  }

  if (interiorItems.length > 0) {
    const blob = await exportItemsToPptBlob({
      items: interiorItems,
      pageWidthPixels: pageDimensions.widthPixels,
      pageHeightPixels: pageDimensions.heightPixels,
      backgroundColor: '#ffffff',
      totalItems,
      processedOffset,
      onPageStart,
      onPageComplete,
      onProgressLabel,
    })

    files.push({
      fileName: 'book-editor_interior.pptx',
      blob,
    })
  }

  if (files.length === 0) throw new Error('No canvases selected for PPT export')
  return files
}
