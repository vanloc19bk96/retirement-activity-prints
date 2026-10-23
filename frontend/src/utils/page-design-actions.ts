/**
 * Page tools started from the open page's live canvas: they read what is selected there, then ask the
 * editor to rewrite the interior (page-design-events.ts) with the pure page changes of page-design.ts.
 */
import type { Canvas } from 'fabric'

import { exportLiveFabricCanvasJson } from '@/utils/canvas-state-store'
import { getActiveSelectionTargets } from '@/utils/canvas-selection'
import {
  changedPagesLayout,
  createRepeatGroupId,
  pageBackgroundColor,
  pagesInScope,
  repeatGroupOf,
  withoutRepeatedObjects,
  withPageBackground,
  withRepeatedObjects,
  type PageScope,
} from '@/utils/page-design'
import { requestInteriorPagesRewrite } from '@/utils/page-design-events'

/** Give the pages in `scope` a background of `color`, or take it off when `color` is null; resolves with the pages changed. */
export function setPagesBackground(scope: PageScope, color: string | null): Promise<number> {
  return requestInteriorPagesRewrite((pages, { activePageIndex, size }) => {
    const indexes = pagesInScope(scope, pages.length, activePageIndex)
    const { layout, changed } = changedPagesLayout(pages, indexes, (page) =>
      pageBackgroundColor(page) === color ? page : withPageBackground(page, color, size),
    )
    return changed ? { layout } : null
  })
}

/** The repeat group every selected object belongs to; null when they belong to none or to different ones. */
export function selectionRepeatGroup(canvas: Canvas): string | null {
  const groups = new Set(getActiveSelectionTargets(canvas).map((target) => repeatGroupOf(target as { data?: unknown })))
  const [group] = groups
  return groups.size === 1 ? (group ?? null) : null
}

/**
 * Put copies of the selection on every page in `scope`, at the same place. The selection joins a repeat
 * group (its own when it already is one), so repeating it again after a change updates every copy, and
 * `removeRepeatedObjects` takes them all off. Resolves with the pages changed.
 */
export function repeatSelectionOnPages(canvas: Canvas, scope: PageScope): Promise<number> {
  const targets = getActiveSelectionTargets(canvas)
  if (targets.length === 0) return Promise.resolve(0)
  const group = selectionRepeatGroup(canvas) ?? createRepeatGroupId()
  // Out of the selection, each object is saved where it is on the page, not relative to the selection.
  canvas.discardActiveObject()
  for (const target of targets) {
    const data = (target as { data?: Record<string, unknown> }).data
    target.set('data', { ...data, repeatGroup: group })
  }
  canvas.requestRenderAll()
  const objects = ((exportLiveFabricCanvasJson(canvas) as { objects?: unknown[] }).objects ?? []).filter(
    (obj): obj is object => repeatGroupOf(obj as { data?: unknown }) === group,
  )
  return requestInteriorPagesRewrite((pages, { activePageIndex }) => {
    const indexes = pagesInScope(scope, pages.length, activePageIndex)
    const { layout, changed } = changedPagesLayout(pages, indexes, (page) => withRepeatedObjects(page, group, objects))
    return changed ? { layout } : null
  })
}

/** Take every copy of repeat group `group` off every page; resolves with the pages changed. */
export function removeRepeatedObjects(group: string): Promise<number> {
  return requestInteriorPagesRewrite((pages) => {
    const { layout, changed } = changedPagesLayout(pages, pages.keys(), (page) => withoutRepeatedObjects(page, group))
    return changed ? { layout } : null
  })
}
