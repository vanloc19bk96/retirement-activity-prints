import jsPDF from 'jspdf'
import 'svg2pdf.js'

import type { CanvasExportItem } from '@/context/CanvasExportContext'
import type { CanvasExportPageSlot, CanvasExportSource } from '@/types/canvas-export-plan.types'
import type { BookCoverDimensions } from '@/types/book-cover.types'
import type { PageDimensions } from '@/types/canvas-settings.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { renderCanvasJsonToSvgElement } from '@/utils/canvas-export-to-svg'
import { releaseExportChunkMemory } from '@/utils/canvas-export-memory'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

/** Yield + GC hint after each page — image-dense PDFs spike RAM inside svg2pdf. */
const PDF_PAGE_MEMORY_YIELD_INTERVAL = 1

async function emitPdfExportCallback(callback?: () => void | Promise<void>): Promise<void> {
  await Promise.resolve(callback?.())
}

export type PdfFile = {
  fileName: string
  blob: Blob
}

type PdfPageStartInfo = {
  item: CanvasExportItem
  itemIndex: number
  totalItems: number
}

type PdfPageCompleteInfo = {
  item: CanvasExportItem
  completedCount: number
  totalItems: number
}

type PdfProgressLabelInfo = {
  label: string
  completedCount: number
  totalItems: number
}

// Canvas pixels are authored at DPI; PostScript points are 72 per inch. Mapping
// px->pt 1:1 made the PDF page 1.333x too large (e.g. 816x1056pt instead of
// 612x792pt for 8.5x11"), breaking KDP trim size and forcing a softening rescale.
const PIXELS_TO_POINTS = PDF_POINTS_PER_INCH / DPI

function getPdfSizeFromPixels(widthPixels: number, heightPixels: number): { pdfWidthPt: number; pdfHeightPt: number } {
  return {
    pdfWidthPt: widthPixels * PIXELS_TO_POINTS,
    pdfHeightPt: heightPixels * PIXELS_TO_POINTS,
  }
}

function mountSvgForPdfExport(svgElement: SVGSVGElement): { cleanup: () => void } {
  const container = document.createElement('div')
  container.setAttribute('aria-hidden', 'true')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.style.width = '0'
  container.style.height = '0'
  container.style.overflow = 'hidden'
  container.style.pointerEvents = 'none'
  container.appendChild(svgElement)
  document.body.appendChild(container)

  return {
    cleanup: () => {
      container.remove()
    },
  }
}

async function renderSvgPageToPdf({
  pdf,
  svgElement,
  pdfWidthPt,
  pdfHeightPt,
}: {
  pdf: jsPDF
  svgElement: SVGSVGElement
  pdfWidthPt: number
  pdfHeightPt: number
}): Promise<void> {
  const { cleanup } = mountSvgForPdfExport(svgElement)
  try {
    await pdf.svg(svgElement, {
      x: 0,
      y: 0,
      width: pdfWidthPt,
      height: pdfHeightPt,
    })
  } finally {
    cleanup()
  }
}

function pdfBlobFromDocument(pdf: jsPDF): Blob {
  try {
    return pdf.output('blob') as Blob
  } catch {
    const arrayBuffer = pdf.output('arraybuffer') as ArrayBuffer
    return new Blob([arrayBuffer], { type: 'application/pdf' })
  }
}

export async function exportInteriorPdfBlob({
  interiorItems,
  pageWidthPixels,
  pageHeightPixels,
  backgroundColor,
  totalItems,
  processedOffset,
  onPageStart,
  onPageComplete,
  onProgressLabel,
}: {
  interiorItems: CanvasExportItem[]
  pageWidthPixels: number
  pageHeightPixels: number
  backgroundColor: string
  totalItems: number
  processedOffset: number
  onPageStart?: (info: PdfPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: PdfPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: PdfProgressLabelInfo) => void | Promise<void>
}): Promise<Blob> {
  const { pdfWidthPt, pdfHeightPt } = getPdfSizeFromPixels(pageWidthPixels, pageHeightPixels)
  const orientation = pdfWidthPt > pdfHeightPt ? 'l' : 'p'
  const pdf = new jsPDF(orientation, 'pt', [pdfWidthPt, pdfHeightPt], true)

  for (let docPageIndex = 0; docPageIndex < interiorItems.length; docPageIndex += 1) {
    const item = interiorItems[docPageIndex]!
    await emitPdfExportCallback(() =>
      onPageStart?.({
        item,
        itemIndex: processedOffset + docPageIndex + 1,
        totalItems,
      }),
    )

    if (docPageIndex > 0) {
      pdf.addPage([pdfWidthPt, pdfHeightPt])
    }

    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, pdfWidthPt, pdfHeightPt, 'F')

    const svgElement = await renderCanvasJsonToSvgElement({
      canvasJson: item.canvas_data,
      baseWidthPixels: pageWidthPixels,
      baseHeightPixels: pageHeightPixels,
      backgroundColor,
    })
    await yieldToMainThread()

    await renderSvgPageToPdf({ pdf, svgElement, pdfWidthPt, pdfHeightPt })

    await emitPdfExportCallback(() =>
      onPageComplete?.({
        item,
        completedCount: processedOffset + docPageIndex + 1,
        totalItems,
      }),
    )
    await yieldToMainThread()
  }

  await emitPdfExportCallback(() =>
    onProgressLabel?.({
      label: 'Finalizing PDF...',
      completedCount: totalItems,
      totalItems,
    }),
  )
  await yieldToMainThread()

  return pdfBlobFromDocument(pdf)
}

type InteriorPdfSlot = Extract<CanvasExportPageSlot, { canvas_type: 'interior' }>

/**
 * Render a PDF chunk by resolving one interior slot at a time.
 * Peak canvas JSON RAM ≈ one page instead of the whole chunk array.
 */
export async function exportInteriorPdfBlobForSlots({
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
  interiorSlots: readonly InteriorPdfSlot[]
  pageWidthPixels: number
  pageHeightPixels: number
  backgroundColor: string
  totalItems: number
  processedOffset: number
  onPageStart?: (info: PdfPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: PdfPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: PdfProgressLabelInfo) => void | Promise<void>
}): Promise<Blob> {
  const { pdfWidthPt, pdfHeightPt } = getPdfSizeFromPixels(pageWidthPixels, pageHeightPixels)
  const orientation = pdfWidthPt > pdfHeightPt ? 'l' : 'p'
  const pdf = new jsPDF(orientation, 'pt', [pdfWidthPt, pdfHeightPt], true)

  for (let docPageIndex = 0; docPageIndex < interiorSlots.length; docPageIndex += 1) {
    const slot = interiorSlots[docPageIndex]!
    const item = await source.resolveItem(slot)

    await emitPdfExportCallback(() =>
      onPageStart?.({
        item,
        itemIndex: processedOffset + docPageIndex + 1,
        totalItems,
      }),
    )

    if (docPageIndex > 0) {
      pdf.addPage([pdfWidthPt, pdfHeightPt])
    }

    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, pdfWidthPt, pdfHeightPt, 'F')

    const svgElement = await renderCanvasJsonToSvgElement({
      canvasJson: item.canvas_data,
      baseWidthPixels: pageWidthPixels,
      baseHeightPixels: pageHeightPixels,
      backgroundColor,
    })
    item.canvas_data = {}
    await yieldToMainThread()

    await renderSvgPageToPdf({ pdf, svgElement, pdfWidthPt, pdfHeightPt })
    svgElement.replaceChildren()

    await emitPdfExportCallback(() =>
      onPageComplete?.({
        item,
        completedCount: processedOffset + docPageIndex + 1,
        totalItems,
      }),
    )

    if ((docPageIndex + 1) % PDF_PAGE_MEMORY_YIELD_INTERVAL === 0) {
      await releaseExportChunkMemory()
    }

    await yieldToMainThread()
  }

  await emitPdfExportCallback(() =>
    onProgressLabel?.({
      label: 'Finalizing PDF chunk...',
      completedCount: processedOffset + interiorSlots.length,
      totalItems,
    }),
  )
  await yieldToMainThread()

  return pdfBlobFromDocument(pdf)
}

export async function exportCoverPdfBlob({
  coverItem,
  pageWidthPixels,
  pageHeightPixels,
  backgroundColor,
  totalItems,
  processedOffset,
  onPageStart,
  onPageComplete,
  onProgressLabel,
}: {
  coverItem: CanvasExportItem
  pageWidthPixels: number
  pageHeightPixels: number
  backgroundColor: string
  totalItems: number
  processedOffset: number
  onPageStart?: (info: PdfPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: PdfPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: PdfProgressLabelInfo) => void | Promise<void>
}): Promise<Blob> {
  const { pdfWidthPt, pdfHeightPt } = getPdfSizeFromPixels(pageWidthPixels, pageHeightPixels)
  const orientation = pdfWidthPt > pdfHeightPt ? 'l' : 'p'
  const pdf = new jsPDF(orientation, 'pt', [pdfWidthPt, pdfHeightPt], true)

  await emitPdfExportCallback(() =>
    onPageStart?.({
      item: coverItem,
      itemIndex: processedOffset + 1,
      totalItems,
    }),
  )
  pdf.setFillColor(255, 255, 255)
  pdf.rect(0, 0, pdfWidthPt, pdfHeightPt, 'F')

  const svgElement = await renderCanvasJsonToSvgElement({
    canvasJson: coverItem.canvas_data,
    baseWidthPixels: pageWidthPixels,
    baseHeightPixels: pageHeightPixels,
    backgroundColor,
  })
  await yieldToMainThread()

  await renderSvgPageToPdf({ pdf, svgElement, pdfWidthPt, pdfHeightPt })

  await emitPdfExportCallback(() =>
    onPageComplete?.({
      item: coverItem,
      completedCount: processedOffset + 1,
      totalItems,
    }),
  )
  await yieldToMainThread()

  await emitPdfExportCallback(() =>
    onProgressLabel?.({
      label: 'Finalizing PDF...',
      completedCount: totalItems,
      totalItems,
    }),
  )
  await yieldToMainThread()

  return pdfBlobFromDocument(pdf)
}

export async function exportCanvasesToPdfFiles({
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
  onPageStart?: (info: PdfPageStartInfo) => void | Promise<void>
  onPageComplete?: (info: PdfPageCompleteInfo) => void | Promise<void>
  onProgressLabel?: (info: PdfProgressLabelInfo) => void | Promise<void>
}): Promise<PdfFile[]> {
  const interiorItems = items
    .filter((item) => item.canvas_type === 'interior')
    .sort((left, right) => left.page_index - right.page_index)

  const coverItem = items.find((item) => item.canvas_type === 'cover') ?? null

  const files: PdfFile[] = []
  const totalItems = (coverItem ? 1 : 0) + interiorItems.length
  let processedOffset = 0

  if (coverItem) {
    const blob = await exportCoverPdfBlob({
      coverItem,
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
      fileName: 'book-editor_cover.pdf',
      blob,
    })
  }

  if (interiorItems.length > 0) {
    const blob = await exportInteriorPdfBlob({
      interiorItems,
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
      fileName: 'book-editor_interior.pdf',
      blob,
    })
  }

  if (files.length === 0) throw new Error('No canvases selected for PDF export')
  return files
}
