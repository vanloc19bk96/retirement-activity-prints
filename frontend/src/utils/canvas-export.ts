import { StaticCanvas } from 'fabric'

import { DPI } from '@/types/canvas-settings.types'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { CanvasExportItem } from '@/context/CanvasExportContext'
import type { PageDimensions } from '@/types/canvas-settings.types'
import { collectReferencedFontFamiliesFromFabricCanvasJson } from '@/utils/canvas-state-store'
import { prepareStaticCanvasForImageExport } from '@/utils/canvas-text'
import { staticCanvasToImageBlob, type CanvasImageFormat } from '@/utils/canvas-image-blob'
import {
  applyAnonymousCrossOriginToFabricImageObjects,
  omitFabricCanvasJsonSurfaceFields,
} from '@/utils/canvas-template'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

export type { CanvasImageFormat } from '@/utils/canvas-image-blob'
export { staticCanvasToImageBlob } from '@/utils/canvas-image-blob'

export type ExportImageOptions = {
  format: CanvasImageFormat
  exportDpi?: number
  jpegQuality?: number
  backgroundColor?: string
  baseWidthPixels: number
  baseHeightPixels: number
}

export async function exportCanvasJsonToImageBlob({
  canvasJson,
  options,
}: {
  canvasJson: Record<string, unknown>
  options: ExportImageOptions
}): Promise<Blob> {
  const {
    format,
    exportDpi = 300,
    jpegQuality = 0.92,
    backgroundColor = '#ffffff',
    baseWidthPixels,
    baseHeightPixels,
  } = options

  const exportMultiplier = exportDpi / DPI

  const element = document.createElement('canvas')
  const offscreenCanvas = new StaticCanvas(element, {
    width: baseWidthPixels,
    height: baseHeightPixels,
    backgroundColor,
    renderOnAddRemove: false,
    preserveObjectStacking: true,
  })

  try {
    const corsSafeJson = applyAnonymousCrossOriginToFabricImageObjects(canvasJson)
    const loadJson = omitFabricCanvasJsonSurfaceFields(corsSafeJson as Record<string, unknown>)
    const referencedFontFamilies = collectReferencedFontFamiliesFromFabricCanvasJson(loadJson)
    await Promise.all(referencedFontFamilies.map((fontFamily) => ensureFontFamilyLoaded(fontFamily)))
    await offscreenCanvas.loadFromJSON(loadJson)
    // Re-assert page size — Fabric 7 set(serialized) must not shrink the export surface.
    offscreenCanvas.setDimensions({ width: baseWidthPixels, height: baseHeightPixels })
    offscreenCanvas.backgroundColor = backgroundColor
    offscreenCanvas.setViewportTransform([1, 0, 0, 1, 0, 0])
    await prepareStaticCanvasForImageExport(offscreenCanvas)

    // Must await: bare `return promise` runs `finally` (dispose) before the blob is built.
    return await staticCanvasToImageBlob({
      canvas: offscreenCanvas,
      format,
      exportDpi,
      jpegQuality,
      multiplier: exportMultiplier,
    })
  } finally {
    offscreenCanvas.dispose()
  }
}

export type CanvasImageExportFile = {
  canvasType: 'interior' | 'cover'
  pageIndex: number
  blob: Blob
}

type ImagePageStartInfo = {
  item: CanvasExportItem
  itemIndex: number
  totalItems: number
}

type ImagePageCompleteInfo = {
  item: CanvasExportItem
  completedCount: number
  totalItems: number
}

type ImageProgressLabelInfo = {
  label: string
  completedCount: number
  totalItems: number
}

async function emitImageExportCallback(callback?: () => void | Promise<void>): Promise<void> {
  await Promise.resolve(callback?.())
}

export async function exportCanvasesToImageFiles({
  items,
  format,
  pageDimensions,
  bookCoverDimensions,
  exportDpi = 300,
  jpegQuality = 0.92,
  interiorBackgroundColor = '#ffffff',
  coverBackgroundColor = '#ffffff',
  onPageStart,
  onPageComplete,
  onProgressLabel,
}: {
  items: CanvasExportItem[]
  format: CanvasImageFormat
  pageDimensions: PageDimensions
  bookCoverDimensions: BookCoverDimensions
  exportDpi?: number
  jpegQuality?: number
  interiorBackgroundColor?: string
  coverBackgroundColor?: string
  onPageStart?: (info: ImagePageStartInfo) => void | Promise<void>
  onPageComplete?: (info: ImagePageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: ImageProgressLabelInfo) => void | Promise<void>
}): Promise<CanvasImageExportFile[]> {
  const totalItems = items.length
  const results: CanvasImageExportFile[] = []

  for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
    const item = items[itemIndex]!
    await emitImageExportCallback(() =>
      onPageStart?.({
        item,
        itemIndex: itemIndex + 1,
        totalItems,
      }),
    )

    const isInterior = item.canvas_type === 'interior'
    const baseWidthPixels = isInterior ? pageDimensions.widthPixels : bookCoverDimensions.fullWidthPixels
    const baseHeightPixels = isInterior ? pageDimensions.heightPixels : bookCoverDimensions.fullHeightPixels
    const backgroundColor = isInterior ? interiorBackgroundColor : coverBackgroundColor

    const blob = await exportCanvasJsonToImageBlob({
      canvasJson: item.canvas_data,
      options: {
        format,
        exportDpi,
        jpegQuality,
        backgroundColor,
        baseWidthPixels,
        baseHeightPixels,
      },
    })
    await yieldToMainThread()

    results.push({
      canvasType: item.canvas_type,
      pageIndex: item.page_index,
      blob,
    })

    await emitImageExportCallback(() =>
      onPageComplete?.({
        item,
        completedCount: itemIndex + 1,
        totalItems,
      }),
    )
    await yieldToMainThread()
  }

  await emitImageExportCallback(() =>
    onProgressLabel?.({
      label: 'Finalizing image files...',
      completedCount: totalItems,
      totalItems,
    }),
  )
  await yieldToMainThread()

  return results
}
