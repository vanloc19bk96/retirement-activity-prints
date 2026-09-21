import type { CanvasExportItem } from '@/context/CanvasExportContext'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { CanvasType } from '@/types/canvases.types'
import type { PageDimensions } from '@/types/canvas-settings.types'
import {
  renderCanvasJsonToSvgElement,
  serializeSvgElementToString,
} from '@/utils/canvas-export-to-svg'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

export type SvgExportFile = {
  canvasType: CanvasType
  pageIndex: number
  blob: Blob
}

type SvgPageStartInfo = {
  item: CanvasExportItem
  itemIndex: number
  totalItems: number
}

type SvgPageCompleteInfo = {
  item: CanvasExportItem
  completedCount: number
  totalItems: number
}

type SvgProgressLabelInfo = {
  label: string
  completedCount: number
  totalItems: number
}

async function emitSvgExportCallback(callback?: () => void | Promise<void>): Promise<void> {
  await Promise.resolve(callback?.())
}

function getCanvasBaseDimensions({
  canvasType,
  pageDimensions,
  bookCoverDimensions,
}: {
  canvasType: CanvasType
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
}): { baseWidthPixels: number; baseHeightPixels: number } {
  if (canvasType === 'interior') {
    return {
      baseWidthPixels: pageDimensions.widthPixels,
      baseHeightPixels: pageDimensions.heightPixels,
    }
  }
  return {
    baseWidthPixels: bookCoverDimensions.fullWidthPixels,
    baseHeightPixels: bookCoverDimensions.fullHeightPixels,
  }
}

/**
 * Export each canvas to a standalone, true-vector SVG file. Mirrors the editor
 * (Fabric) rendering used by the PDF pipeline, so output matches the on-screen
 * canvas. Text is converted to outlines for font-independent fidelity.
 */
export async function exportCanvasesToSvgFiles({
  items,
  pageDimensions,
  bookCoverDimensions,
  backgroundColor = '#ffffff',
  onPageStart,
  onPageComplete,
  onProgressLabel,
}: {
  items: CanvasExportItem[]
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  backgroundColor?: string
  onPageStart?: (info: SvgPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: SvgPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: SvgProgressLabelInfo) => void | Promise<void>
}): Promise<SvgExportFile[]> {
  const results: SvgExportFile[] = []
  const totalItems = items.length

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!
    await emitSvgExportCallback(() =>
      onPageStart?.({
        item,
        itemIndex: itemIndex + 1,
        totalItems,
      }),
    )

    const { baseWidthPixels, baseHeightPixels } = getCanvasBaseDimensions({
      canvasType: item.canvas_type,
      pageDimensions,
      bookCoverDimensions,
    })

    const svgElement = await renderCanvasJsonToSvgElement({
      canvasJson: item.canvas_data,
      baseWidthPixels,
      baseHeightPixels,
      backgroundColor,
    })
    await yieldToMainThread()

    const svgString = serializeSvgElementToString(svgElement)
    results.push({
      canvasType: item.canvas_type,
      pageIndex: item.page_index,
      blob: new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }),
    })

    await emitSvgExportCallback(() =>
      onPageComplete?.({
        item,
        completedCount: itemIndex + 1,
        totalItems,
      }),
    )
    await yieldToMainThread()
  }

  await emitSvgExportCallback(() =>
    onProgressLabel?.({
      label: 'Finalizing SVG files...',
      completedCount: totalItems,
      totalItems,
    }),
  )
  await yieldToMainThread()

  return results
}
