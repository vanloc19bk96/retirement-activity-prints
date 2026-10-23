/**
 * Page-level design across the interior (Fabric JSON per page, no live canvas): a copy of a page,
 * a background colour behind everything on a page, and objects repeated on many pages (a border,
 * a header, a watermark) that can be taken off every page again in one go. Background and repeated
 * objects are ordinary objects tagged in their Fabric `data`, so every export draws them as they are.
 */
import { Rect } from 'fabric'

import type { CanvasLogicalSize } from '@/types/fabric-canvas-item.types'
import { CUSTOM_OBJECT_PROPS } from '@/utils/canvas-state-store'
import type { LaidOutPage } from '@/utils/page-design-events'

/** Key in a page background's `data`. */
const BACKGROUND_KEY = 'pageBackground'
/** Key in a repeated object's `data` holding the id the copies on every page share. */
const REPEAT_KEY = 'repeatGroup'

/** Pages a change applies to, by their page number (1-based): odd pages are rectos, even pages versos. */
export type PageScope = 'this' | 'all' | 'odd' | 'even'

type ObjectJson = { data?: Record<string, unknown> | null; [key: string]: unknown }
type PageJson = { objects?: unknown; [key: string]: unknown }

const objectsOf = (page: object | null): ObjectJson[] => {
  const objects = (page as PageJson | null)?.objects
  return Array.isArray(objects) ? (objects as ObjectJson[]) : []
}

const pageOrEmpty = (page: object | null): PageJson => (page as PageJson | null) ?? { objects: [] }

/** 0-based indexes of the pages `scope` takes in a book of `pageCount` pages, `current` being the open page. */
export function pagesInScope(scope: PageScope, pageCount: number, current: number): number[] {
  if (scope === 'this') return current >= 0 && current < pageCount ? [current] : []
  const indexes = Array.from({ length: pageCount }, (_, index) => index)
  if (scope === 'all') return indexes
  const wantOdd = scope === 'odd'
  return indexes.filter((index) => ((index + 1) % 2 === 1) === wantOdd)
}

/** A copy of `page` to insert as a new page, deep-copied so the two never share objects. */
export function duplicatePageJson(page: object | null): object {
  return JSON.parse(JSON.stringify(pageOrEmpty(page))) as object
}

export function isPageBackground(obj: { data?: unknown } | null | undefined): boolean {
  return Boolean((obj?.data as Record<string, unknown> | null | undefined)?.[BACKGROUND_KEY])
}

/** The colour of `page`'s background; null when it has none (the paper shows). */
export function pageBackgroundColor(page: object | null): string | null {
  const fill = objectsOf(page).find(isPageBackground)?.fill
  return typeof fill === 'string' ? fill : null
}

/** Fabric JSON of a locked rectangle of `color` covering the whole page, bleed included. */
function backgroundJson(color: string, size: CanvasLogicalSize): ObjectJson {
  const rect = new Rect({
    left: 0,
    top: 0,
    width: size.width,
    height: size.height,
    originX: 'left',
    originY: 'top',
    fill: color,
    strokeWidth: 0,
    selectable: false,
    evented: false,
    hasControls: false,
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
  })
  rect.set({ data: { [BACKGROUND_KEY]: true } })
  return { ...(rect.toObject(CUSTOM_OBJECT_PROPS as never) as unknown as ObjectJson), layerName: 'Page background' }
}

/** `page` with a background of `color` under everything on it (replacing any it had), or none when `color` is null. */
export function withPageBackground(page: object | null, color: string | null, size: CanvasLogicalSize): object {
  const base = pageOrEmpty(page)
  const rest = objectsOf(base).filter((obj) => !isPageBackground(obj))
  return { ...base, objects: color === null ? rest : [backgroundJson(color, size), ...rest] }
}

/** The id the copies of a repeated object share; null for an object placed on one page. */
export function repeatGroupOf(obj: { data?: unknown } | null | undefined): string | null {
  const group = (obj?.data as Record<string, unknown> | null | undefined)?.[REPEAT_KEY]
  return typeof group === 'string' ? group : null
}

export function createRepeatGroupId(): string {
  return `repeat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** `objects` (Fabric JSON) tagged as copies of repeat group `group`. */
export function taggedRepeatObjects(objects: readonly object[], group: string): object[] {
  return objects.map((obj) => {
    const json = obj as ObjectJson
    return { ...json, data: { ...(json.data ?? {}), [REPEAT_KEY]: group } }
  })
}

/**
 * `page` with `objects` (tagged by `taggedRepeatObjects`): where the copies of their group already are,
 * replacing them (so repeating a changed object again updates it on every page), else on top of everything.
 */
export function withRepeatedObjects(page: object | null, group: string, objects: readonly object[]): object {
  const base = pageOrEmpty(page)
  const current = objectsOf(base)
  const first = current.findIndex((obj) => repeatGroupOf(obj) === group)
  const rest = current.filter((obj) => repeatGroupOf(obj) !== group)
  const at = first >= 0 ? current.slice(0, first).filter((obj) => repeatGroupOf(obj) !== group).length : rest.length
  const copies = JSON.parse(JSON.stringify(objects)) as ObjectJson[]
  return { ...base, objects: [...rest.slice(0, at), ...copies, ...rest.slice(at)] }
}

/** `page` without the copies of repeat group `group`; the page itself when it has none. */
export function withoutRepeatedObjects(page: object | null, group: string): object | null {
  const objects = objectsOf(page)
  if (!page || !objects.some((obj) => repeatGroupOf(obj) === group)) return page
  return { ...page, objects: objects.filter((obj) => repeatGroupOf(obj) !== group) }
}

/** Every page kept in place, `change` applied to the pages at `indexes`; `changed` counts the pages it changed. */
export function changedPagesLayout(
  pages: ReadonlyArray<object | null>,
  indexes: Iterable<number>,
  change: (page: object | null, index: number) => object | null,
): { layout: LaidOutPage[]; changed: number } {
  const targets = new Set(indexes)
  let changed = 0
  const layout = pages.map((page, from): LaidOutPage => {
    if (!targets.has(from)) return { from }
    const json = change(page, from)
    if (json === null || json === page) return { from }
    changed += 1
    return { from, json }
  })
  return { layout, changed }
}

/** Every page kept in place, with a copy of page `index` (`duplicatePageJson`) right after it. */
export function duplicatePageLayout(pages: ReadonlyArray<object | null>, index: number): LaidOutPage[] {
  const layout: LaidOutPage[] = pages.map((_, from) => ({ from }))
  layout.splice(index + 1, 0, { json: duplicatePageJson(pages[index] ?? null) })
  return layout
}
