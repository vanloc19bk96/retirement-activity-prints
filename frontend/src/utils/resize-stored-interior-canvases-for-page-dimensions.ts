import type { MarginGuide, PageDimensions } from '@/types/canvas-settings.types'
import type { CanvasLogicalSize } from '@/types/fabric-canvas-item.types'
import { resolveInteriorIsLeftPage, resolveInteriorPageSafeArea } from '@/utils/canvas-template'
import { scaleSerializedCanvasJsonForPageResize } from '@/utils/fabric-canvas-resize'
import { yieldToMainThread } from '@/utils/yield-to-main-thread'

type ResizeStoredInteriorCanvasesOptions = {
  pageCount: number
  previousPageDimensions: PageDimensions
  nextPageDimensions: PageDimensions
  marginGuide: MarginGuide
  getCanvasJson: (pageIndex: number) => Record<string, unknown> | null
  getAuthoringLogicalSize: (pageIndex: number) => CanvasLogicalSize | null
  setCanvasJson: (pageIndex: number, canvasJson: Record<string, unknown>) => void
  setAuthoringLogicalSize: (pageIndex: number, size: CanvasLogicalSize) => void
}

function toLogicalSize(dimensions: PageDimensions): CanvasLogicalSize {
  return {
    width: dimensions.widthPixels,
    height: dimensions.heightPixels,
  }
}

export async function resizeStoredInteriorCanvasesForPageDimensions(
  options: ResizeStoredInteriorCanvasesOptions,
): Promise<{ updatedPageCount: number }> {
  const previousSize = toLogicalSize(options.previousPageDimensions)
  const nextSize = toLogicalSize(options.nextPageDimensions)
  let updatedPageCount = 0

  for (let pageIndex = 0; pageIndex < options.pageCount; pageIndex += 1) {
    const canvasJson = options.getCanvasJson(pageIndex)
    if (!canvasJson) continue

    const authoringSize = options.getAuthoringLogicalSize(pageIndex) ?? previousSize
    if (authoringSize.width === nextSize.width && authoringSize.height === nextSize.height) {
      continue
    }

    const safeArea = resolveInteriorPageSafeArea({
      canvasSize: nextSize,
      marginGuide: options.marginGuide,
      isLeftPage: resolveInteriorIsLeftPage(pageIndex),
    })

    const nextCanvasJson = (await scaleSerializedCanvasJsonForPageResize(
      canvasJson,
      authoringSize,
      nextSize,
      {
        targetArea: safeArea ?? undefined,
        insetMargin: safeArea ? 8 : 0,
      },
    )) as Record<string, unknown>

    options.setCanvasJson(pageIndex, nextCanvasJson)
    options.setAuthoringLogicalSize(pageIndex, nextSize)
    updatedPageCount += 1

    if (pageIndex % 4 === 3) {
      await yieldToMainThread()
    }
  }

  return { updatedPageCount }
}
