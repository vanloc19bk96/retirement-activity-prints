import { STUDIO_TITLE_SIZE } from '@/constants/studio.constants'
import { DPI, type SolutionsPerPage } from '@/types/canvas-settings.types'
import type { StudioFabricObject, StudioMargin } from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'
import { readStudioPageMeta } from './studio-instance-pages'
import { isStudioHeaderTitle } from './studio-layout'
import { unionObjectBounds } from './studio-object-bounds'
import {
  resolveStudioSolutionPageOrder,
  shiftStudioPageJsonX,
  type StudioSolutionPlacement,
} from './studio-solution-placement'

/**
 * Several answer keys printed on one page.
 *
 * A packed page holds each game's key scaled down into a grid cell (1 x 2 for
 * two per page, 2 x 2 for four). Every object on it remembers how it got there
 * in `data.studioSolutionPack`, so the page can be taken apart again: turning
 * packing off, or a new game joining the last page, puts each key back at full
 * size before the pages are laid out anew.
 */
const PACK_DATA_KEY = 'studioSolutionPack'

/** Space between two keys sharing a page. */
const PACK_CELL_GAP = DPI / 4

/** Most space left between a packed key's heading and its answer, at full size. */
const PACK_TITLE_GAP = DPI / 4

interface PackTransform {
  /** Cell the key sits in, 0-based in reading order. */
  slot: number
  /** Cells on the page (the solutions-per-page it was packed for). */
  slots: number
  scale: number
  /**
   * Top-left of the key at full size, on the recto frame. The answer below the
   * heading carries a lower `fromY` than the heading when the gap between them
   * was closed up, so each object still unpacks to where it was.
   */
  fromX: number
  fromY: number
  /** Top-left of the key in its cell. */
  toX: number
  toY: number
}

type RawObject = Record<string, unknown>
type PageJson = { objects?: unknown[] } & Record<string, unknown>

export interface StudioSolutionLayoutPage {
  /** Old index whose row (and snapshot, unless `json` is set) this page keeps; null for a new page. */
  from: number | null
  /** New snapshot for the page; omitted when it keeps `from`'s untouched. */
  json?: object
}

/** One game's answer key, at full size on the recto frame (page 0's safe area). */
interface SolutionUnit {
  instanceId: string | null
  objects: RawObject[]
  /** Snapshot the key came from: background and version for a rebuilt page. */
  base: PageJson
  /** Old index of the page the key has to itself; null when it sits on a packed page. */
  ownPage: number | null
  sourcePage: number
  slot: number
}

type PageEntry =
  | { kind: 'keep'; from: number }
  | { kind: 'unit'; unit: SolutionUnit }
  | { kind: 'pack'; units: SolutionUnit[] }

function isRecord(value: unknown): value is RawObject {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** Keeps a pack / unpack round trip from drifting a scale of 1 to 0.9999999. */
function round(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function readPack(obj: RawObject): PackTransform | null {
  const data = obj.data
  if (!isRecord(data)) return null
  const pack = data[PACK_DATA_KEY]
  if (!isRecord(pack)) return null
  const keys = ['slot', 'slots', 'scale', 'fromX', 'fromY', 'toX', 'toY'] as const
  if (!keys.every((key) => typeof pack[key] === 'number' && Number.isFinite(pack[key]))) return null
  if ((pack.scale as number) <= 0) return null
  return pack as unknown as PackTransform
}

function pageObjects(json: PageJson | null): RawObject[] {
  return Array.isArray(json?.objects) ? json.objects.filter(isRecord) : []
}

function isPackedPage(json: PageJson | null): boolean {
  return pageObjects(json).some((obj) => readPack(obj) != null)
}

function packObject(obj: RawObject, t: PackTransform): RawObject {
  return {
    ...obj,
    left: round(t.toX + (num(obj.left, 0) - t.fromX) * t.scale),
    top: round(t.toY + (num(obj.top, 0) - t.fromY) * t.scale),
    scaleX: round(num(obj.scaleX, 1) * t.scale),
    scaleY: round(num(obj.scaleY, 1) * t.scale),
    data: { ...(isRecord(obj.data) ? obj.data : {}), [PACK_DATA_KEY]: { ...t } },
  }
}

function unpackObject(obj: RawObject, t: PackTransform): RawObject {
  const next: RawObject = {
    ...obj,
    left: round(t.fromX + (num(obj.left, 0) - t.toX) / t.scale),
    top: round(t.fromY + (num(obj.top, 0) - t.toY) / t.scale),
    scaleX: round(num(obj.scaleX, t.scale) / t.scale),
    scaleY: round(num(obj.scaleY, t.scale) / t.scale),
  }
  const { [PACK_DATA_KEY]: _pack, ...data } = isRecord(obj.data) ? obj.data : {}
  if (Object.keys(data).length > 0) next.data = data
  else delete next.data
  return next
}

/** Same as shiftStudioPageJsonX, for a packed page: keys and their cell anchors move together. */
function shiftPackedPageJsonX(json: PageJson, dx: number): PageJson {
  if (dx === 0 || !Array.isArray(json.objects)) return json
  const objects = json.objects.map((raw) => {
    if (!isRecord(raw)) return raw
    const pack = readPack(raw)
    if (!pack && !raw.studioInstanceId) return raw
    const shifted: RawObject = { ...raw, left: num(raw.left, 0) + dx }
    if (pack) {
      shifted.data = { ...(raw.data as RawObject), [PACK_DATA_KEY]: { ...pack, toX: pack.toX + dx } }
    }
    return shifted
  })
  return { ...json, objects }
}

function findInstanceId(objects: unknown[]): string | null {
  for (const raw of objects) {
    if (!isRecord(raw)) continue
    if (typeof raw.studioInstanceId === 'string' && raw.studioInstanceId) return raw.studioInstanceId
    if (Array.isArray(raw.objects)) {
      const nested = findInstanceId(raw.objects)
      if (nested) return nested
    }
  }
  return null
}

/** The keys on a packed page, unscaled. Objects added after packing go with the first key. */
function unpackPage(json: PageJson, pageIndex: number): SolutionUnit[] {
  const bySlot = new Map<number, { transform: PackTransform; objects: RawObject[] }>()
  const loose: RawObject[] = []
  for (const obj of pageObjects(json)) {
    const pack = readPack(obj)
    if (!pack) {
      loose.push(obj)
      continue
    }
    const entry = bySlot.get(pack.slot) ?? { transform: pack, objects: [] }
    entry.objects.push(unpackObject(obj, pack))
    bySlot.set(pack.slot, entry)
  }
  const slots = [...bySlot.entries()].sort((a, b) => a[0] - b[0])
  if (slots.length > 0 && loose.length > 0) {
    const [, first] = slots[0]!
    first.objects.push(...loose.map((obj) => unpackObject(obj, first.transform)))
  }
  return slots.map(([slot, { objects }]) => ({
    instanceId: findInstanceId(objects),
    objects,
    base: json,
    ownPage: null,
    sourcePage: pageIndex,
    slot,
  }))
}

/** "Solution Game N" heading; the size check covers sheets from before the tag. */
function isUnitTitle(obj: RawObject): boolean {
  const studioObj = obj as unknown as StudioFabricObject
  if (isStudioHeaderTitle(studioObj)) return true
  return obj.studioRole === 'decoration' && obj.fontSize === STUDIO_TITLE_SIZE
}

/**
 * How far the answer can move up under its heading. An answer page drops the
 * puzzle's how-to line but keeps the grid where the puzzle had it, and once
 * scaled into a cell that empty band reads as the heading floating away.
 */
function titleGapToClose(objects: RawObject[]): number {
  const titles = objects.filter(isUnitTitle)
  const body = objects.filter((obj) => !isUnitTitle(obj))
  if (titles.length === 0 || body.length === 0) return 0
  const titleBounds = unionObjectBounds(titles as unknown as StudioFabricObject[])
  const bodyBounds = unionObjectBounds(body as unknown as StudioFabricObject[])
  if (!titleBounds || !bodyBounds) return 0
  const gap = bodyBounds.top - (titleBounds.top + titleBounds.height)
  return Math.max(0, gap - PACK_TITLE_GAP)
}

function sameUnits(a: SolutionUnit[], b: SolutionUnit[]): boolean {
  return a.length === b.length && a.every((unit, i) => unit === b[i])
}

export interface ResolveStudioSolutionLayoutOptions {
  store: CanvasStateStore
  pageCount: number
  placement: StudioSolutionPlacement
  /** Only used with `end`: keys after their own game always get a page each. */
  perPage: SolutionsPerPage
  pageWidth: number
  pageHeight: number
  marginFor: (pageIndex: number) => StudioMargin
}

/**
 * The book's interior with studio solution pages where `placement` and
 * `perPage` want them, or null when it already is.
 *
 * Without packing on either side this is resolveStudioSolutionPageOrder's
 * reorder. Otherwise every key is taken off its page — packed or not — and the
 * solution pages are rebuilt: at the end, `perPage` keys to a page in game
 * order; after their games, one key per page. A packed page that would come
 * out holding the same keys is kept as it is, edits included.
 */
export function resolveStudioSolutionLayout(
  options: ResolveStudioSolutionLayoutOptions,
): StudioSolutionLayoutPage[] | null {
  const { store, pageCount, placement, pageWidth, pageHeight, marginFor } = options
  const perPage = placement === 'end' ? options.perPage : 1

  const jsonAt = (pageIndex: number): PageJson | null =>
    store.getSerialized(pageIndex) as PageJson | null

  /** A page moving between verso and recto follows the new slot's gutter. */
  const movedPage = (from: number, newIndex: number): StudioSolutionLayoutPage => {
    if (from === newIndex) return { from }
    const json = jsonAt(from)
    const dx = marginFor(newIndex).left - marginFor(from).left
    if (!json || dx === 0) return { from }
    const shifted = isPackedPage(json) ? shiftPackedPageJsonX(json, dx) : shiftStudioPageJsonX(json, dx)
    return shifted === json ? { from } : { from, json: shifted }
  }

  const packedPages: number[] = []
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    if (isPackedPage(jsonAt(pageIndex))) packedPages.push(pageIndex)
  }

  if (packedPages.length === 0 && perPage === 1) {
    const order = resolveStudioSolutionPageOrder(store, pageCount, placement)
    return order ? order.map((from, newIndex) => movedPage(from, newIndex)) : null
  }

  // Sort every page into game pages, keys on their own page, and packed pages.
  const rectoLeft = marginFor(0).left
  const puzzlePages = new Map<string, number[]>()
  const unitsByPage = new Map<number, SolutionUnit[]>()
  const pageKinds: Array<'other' | 'answer' | 'packed'> = []
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const json = jsonAt(pageIndex)
    if (json && packedPages.includes(pageIndex)) {
      pageKinds.push('packed')
      unitsByPage.set(pageIndex, unpackPage(json, pageIndex))
      continue
    }
    const meta = readStudioPageMeta(store, pageIndex)
    if (json && meta?.pageRole === 'answers') {
      pageKinds.push('answer')
      const rectoJson = shiftStudioPageJsonX(json, rectoLeft - marginFor(pageIndex).left)
      unitsByPage.set(pageIndex, [
        {
          instanceId: meta.instanceId,
          objects: pageObjects(rectoJson),
          base: json,
          ownPage: pageIndex,
          sourcePage: pageIndex,
          slot: 0,
        },
      ])
      continue
    }
    pageKinds.push('other')
    if (meta) puzzlePages.set(meta.instanceId, [...(puzzlePages.get(meta.instanceId) ?? []), pageIndex])
  }
  const allUnits = [...unitsByPage.values()].flat()

  const entries: PageEntry[] = []
  const pushUnit = (unit: SolutionUnit): void => {
    entries.push(unit.ownPage != null ? { kind: 'keep', from: unit.ownPage } : { kind: 'unit', unit })
  }

  if (placement === 'end') {
    pageKinds.forEach((kind, pageIndex) => {
      if (kind === 'other') entries.push({ kind: 'keep', from: pageIndex })
    })
    // "Solution Game 1" leads: keys follow their games' order.
    const sortKey = (unit: SolutionUnit): number => {
      const puzzle = unit.instanceId ? puzzlePages.get(unit.instanceId) : undefined
      return puzzle?.length ? Math.min(...puzzle) : unit.sourcePage
    }
    const sorted = [...allUnits].sort(
      (a, b) => sortKey(a) - sortKey(b) || a.sourcePage - b.sourcePage || a.slot - b.slot,
    )
    if (perPage === 1) {
      sorted.forEach(pushUnit)
    } else {
      for (let i = 0; i < sorted.length; i += perPage) {
        entries.push({ kind: 'pack', units: sorted.slice(i, i + perPage) })
      }
    }
  } else {
    // A key goes right after its game when it was packed or drifted away from
    // it; keys whose game is gone stay where they are.
    const unitsByInstance = new Map<string, SolutionUnit[]>()
    for (const unit of allUnits) {
      if (!unit.instanceId) continue
      unitsByInstance.set(unit.instanceId, [...(unitsByInstance.get(unit.instanceId) ?? []), unit])
    }
    const isDetached = (instanceId: string | null): boolean => {
      if (!instanceId) return false
      const puzzle = puzzlePages.get(instanceId)
      const units = unitsByInstance.get(instanceId) ?? []
      if (!puzzle?.length || units.length === 0) return false
      if (units.some((unit) => unit.ownPage == null)) return true
      const all = [...puzzle, ...units.map((unit) => unit.ownPage!)]
      return Math.max(...all) - Math.min(...all) + 1 !== all.length
    }
    pageKinds.forEach((kind, pageIndex) => {
      if (kind !== 'other') {
        for (const unit of unitsByPage.get(pageIndex) ?? []) {
          if (!isDetached(unit.instanceId)) pushUnit(unit)
        }
        return
      }
      entries.push({ kind: 'keep', from: pageIndex })
      const instanceId = readStudioPageMeta(store, pageIndex)?.instanceId ?? null
      if (!instanceId || !isDetached(instanceId)) return
      if (pageIndex !== Math.max(...puzzlePages.get(instanceId)!)) return
      ;(unitsByInstance.get(instanceId) ?? []).forEach(pushUnit)
    })
  }

  const pages = entries.map((entry, newIndex): StudioSolutionLayoutPage => {
    if (entry.kind === 'keep') return movedPage(entry.from, newIndex)
    if (entry.kind === 'unit') {
      const { unit } = entry
      const json = shiftStudioPageJsonX(
        { ...unit.base, objects: unit.objects },
        marginFor(newIndex).left - rectoLeft,
      )
      return { from: null, json }
    }
    const source = entry.units[0]!.sourcePage
    const kept =
      entry.units[0]!.ownPage == null &&
      sameUnits(entry.units, unitsByPage.get(source) ?? []) &&
      pageObjects(jsonAt(source)).every((obj) => (readPack(obj)?.slots ?? perPage) === perPage)
    if (kept) return movedPage(source, newIndex)
    return {
      from: null,
      json: composePackedPage(entry.units, perPage, marginFor(newIndex), pageWidth, pageHeight),
    }
  })

  const unchanged =
    pages.length === pageCount &&
    pages.every((page, newIndex) => page.from === newIndex && page.json === undefined)
  return unchanged ? null : pages
}

/** Lay `units` into the page's safe area: 1 x 2 cells for two per page, 2 x 2 for four. */
function composePackedPage(
  units: SolutionUnit[],
  perPage: SolutionsPerPage,
  margin: StudioMargin,
  pageWidth: number,
  pageHeight: number,
): PageJson {
  const cols = perPage === 4 ? 2 : 1
  const rows = Math.ceil(perPage / cols)
  const areaWidth = pageWidth - margin.left - margin.right
  const areaHeight = pageHeight - margin.top - margin.bottom
  const cellWidth = (areaWidth - PACK_CELL_GAP * (cols - 1)) / cols
  const cellHeight = (areaHeight - PACK_CELL_GAP * (rows - 1)) / rows

  const objects = units.flatMap((unit, slot) => {
    const drawn = unit.objects.filter((obj) => obj.visible !== false)
    const measured = drawn.length > 0 ? drawn : unit.objects
    const bounds = unionObjectBounds(measured as unknown as StudioFabricObject[])
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return []
    const lift = titleGapToClose(measured)
    const height = bounds.height - lift
    const scale = Math.min(1, cellWidth / bounds.width, cellHeight / height)
    const cellLeft = margin.left + (slot % cols) * (cellWidth + PACK_CELL_GAP)
    const cellTop = margin.top + Math.floor(slot / cols) * (cellHeight + PACK_CELL_GAP)
    const transform: PackTransform = {
      slot,
      slots: perPage,
      scale: round(scale),
      fromX: round(bounds.left),
      fromY: round(bounds.top),
      // Centred across the cell; keys in one row share a top edge.
      toX: round(cellLeft + (cellWidth - bounds.width * scale) / 2),
      toY: round(cellTop),
    }
    return unit.objects.map((obj) =>
      packObject(
        obj,
        lift > 0 && !isUnitTitle(obj) ? { ...transform, fromY: round(bounds.top + lift) } : transform,
      ),
    )
  })
  return { ...units[0]!.base, objects }
}
