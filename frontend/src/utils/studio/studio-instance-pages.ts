import {
  STUDIO_GAME_TITLE_PREFIX,
  STUDIO_SOLUTION_TITLE_PREFIX,
} from '@/constants/studio.constants'
import type { StudioFabricObject } from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

export interface StudioPuzzlePage {
  pageIndex: number
  instanceId: string
  objects: StudioFabricObject[]
}

type StoredCanvasJson = {
  objects?: unknown[]
}

function asStudioObject(raw: unknown): StudioFabricObject | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as StudioFabricObject
}

/** Fabric 7 toObject uses PascalCase (`Group`); generators use lowercase (`group`). */
function isFabricType(obj: { type?: string }, type: string): boolean {
  return String(obj.type ?? '').toLowerCase() === type.toLowerCase()
}

function walkStudioObjects(
  objects: unknown[],
  visit: (obj: StudioFabricObject) => void,
): void {
  for (const raw of objects) {
    const obj = asStudioObject(raw)
    if (!obj) continue
    visit(obj)
    if (isFabricType(obj, 'group') && Array.isArray(obj.objects)) {
      walkStudioObjects(obj.objects, visit)
    }
  }
}

/** Top-level objects belonging to one studio instance (groups included whole). */
export function extractInstanceObjects(
  objects: unknown[],
  instanceId: string,
): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const raw of objects) {
    const obj = asStudioObject(raw)
    if (!obj) continue
    if (obj.studioInstanceId === instanceId) {
      out.push(obj)
    }
  }
  return out
}

function pageHasAnswerObjects(objects: StudioFabricObject[]): boolean {
  let found = false
  walkStudioObjects(objects, (obj) => {
    if (found) return
    if (obj.studioRole === 'answer') found = true
  })
  return found
}

/**
 * Find puzzle pages for a template (excludes answer-key pages).
 * One hit per instanceId. For 2-page spreads (study + recall), prefer the
 * page that carries answer objects so answer-key backfill is correct.
 */
export function findStudioPuzzlePages(
  store: CanvasStateStore,
  pageCount: number,
  templateKey: string,
): StudioPuzzlePage[] {
  const bestByInstance = new Map<string, StudioPuzzlePage>()

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const json = store.getSerialized(pageIndex) as StoredCanvasJson | null
    const rawObjects = Array.isArray(json?.objects) ? json.objects : []
    let instanceId: string | null = null

    walkStudioObjects(rawObjects, (obj) => {
      if (instanceId) return
      if (obj.studioTemplateKey !== templateKey) return
      if (obj.studioPageRole === 'answers') return
      if (!obj.studioInstanceId) return
      instanceId = obj.studioInstanceId
    })

    if (!instanceId) continue
    const objects = extractInstanceObjects(rawObjects, instanceId)
    const candidate: StudioPuzzlePage = { pageIndex, instanceId, objects }
    const existing = bestByInstance.get(instanceId)
    if (!existing) {
      bestByInstance.set(instanceId, candidate)
      continue
    }
    // Prefer recall/answer-bearing page over study for the same instance.
    if (!pageHasAnswerObjects(existing.objects) && pageHasAnswerObjects(objects)) {
      bestByInstance.set(instanceId, candidate)
    }
  }

  return [...bestByInstance.values()].sort((a, b) => a.pageIndex - b.pageIndex)
}

/** Instance ids that already have an answers page. */
export function findAnswerInstanceIds(
  store: CanvasStateStore,
  pageCount: number,
  templateKey: string,
): Set<string> {
  const ids = new Set<string>()
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const json = store.getSerialized(pageIndex) as StoredCanvasJson | null
    const objects = Array.isArray(json?.objects) ? json.objects : []
    walkStudioObjects(objects, (obj) => {
      if (obj.studioTemplateKey !== templateKey) return
      if (obj.studioPageRole !== 'answers') return
      if (obj.studioInstanceId) ids.add(obj.studioInstanceId)
    })
  }
  return ids
}

function readPageObjects(
  store: CanvasStateStore,
  pageIndex: number,
): unknown[] {
  const json = store.getSerialized(pageIndex) as StoredCanvasJson | null
  return Array.isArray(json?.objects) ? json.objects : []
}

export function readStudioPageMeta(
  store: CanvasStateStore,
  pageIndex: number,
): { instanceId: string; pageRole: string } | null {
  let meta: { instanceId: string; pageRole: string } | null = null
  walkStudioObjects(readPageObjects(store, pageIndex), (obj) => {
    if (meta) return
    if (!obj.studioInstanceId) return
    meta = {
      instanceId: obj.studioInstanceId,
      pageRole: String(obj.studioPageRole ?? 'single'),
    }
  })
  return meta
}

function pageHasInstance(
  store: CanvasStateStore,
  pageIndex: number,
  instanceId: string,
): boolean {
  let found = false
  walkStudioObjects(readPageObjects(store, pageIndex), (obj) => {
    if (found) return
    if (obj.studioInstanceId === instanceId) found = true
  })
  return found
}

/** True when the page is a studio answer-key page (not the puzzle). */
export function isStudioAnswerKeyPage(
  store: CanvasStateStore,
  pageIndex: number,
): boolean {
  return readStudioPageMeta(store, pageIndex)?.pageRole === 'answers'
}

/**
 * How many consecutive pages belong to the studio instance at `startPageIndex`.
 * Replace must only reuse these slots — never following games.
 */
export function resolveStudioInstancePageSpan(options: {
  store: CanvasStateStore
  startPageIndex: number
  interiorPageCount: number
}): number {
  const { store, startPageIndex, interiorPageCount } = options
  if (startPageIndex < 0 || startPageIndex >= interiorPageCount) return 1
  const meta = readStudioPageMeta(store, startPageIndex)
  if (!meta) return 1
  let last = startPageIndex
  for (let i = startPageIndex + 1; i < interiorPageCount; i++) {
    if (!pageHasInstance(store, i, meta.instanceId)) break
    last = i
  }
  return last - startPageIndex + 1
}

/** First page index that carries `instanceId`, or -1 if none. */
export function findStudioInstanceStartPageIndex(
  store: CanvasStateStore,
  pageCount: number,
  instanceId: string,
): number {
  for (let i = 0; i < pageCount; i++) {
    if (pageHasInstance(store, i, instanceId)) return i
  }
  return -1
}

/** Last page index that still carries `instanceId`, or -1 if none. */
export function findStudioInstanceEndPageIndex(
  store: CanvasStateStore,
  pageCount: number,
  instanceId: string,
): number {
  let last = -1
  for (let i = 0; i < pageCount; i++) {
    if (pageHasInstance(store, i, instanceId)) last = i
  }
  return last
}

/**
 * Unique studio puzzle instances in the book (excludes answer-key pages).
 * Study + recall share one instanceId → count as one game.
 */
export function countStudioPuzzleInstances(
  store: CanvasStateStore,
  pageCount: number,
): number {
  const ids = new Set<string>()
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    walkStudioObjects(readPageObjects(store, pageIndex), (obj) => {
      if (!obj.studioInstanceId) return
      if (obj.studioPageRole === 'answers') return
      ids.add(obj.studioInstanceId)
    })
  }
  return ids.size
}

/** Format a default Page title, e.g. "Game 3". */
export function formatStudioGameTitle(ordinal: number): string {
  return `${STUDIO_GAME_TITLE_PREFIX} ${ordinal}`
}

/** Format a solution / answer-key Page title, e.g. "Solution Game 3". */
export function formatStudioSolutionTitle(ordinal: number): string {
  return `${STUDIO_SOLUTION_TITLE_PREFIX} ${formatStudioGameTitle(ordinal)}`
}

/**
 * Puzzle title → solution-page title.
 * “Game 3” → “Solution Game 3”; already-prefixed titles stay stable.
 */
export function toStudioSolutionTitle(puzzleTitle: string): string {
  const trimmed = puzzleTitle.trim()
  if (!trimmed) return trimmed

  const game = new RegExp(
    `^(?:${STUDIO_SOLUTION_TITLE_PREFIX}\\s+)?${STUDIO_GAME_TITLE_PREFIX}\\s+(\\d+)$`,
    'i',
  ).exec(trimmed)
  if (game?.[1]) return formatStudioSolutionTitle(Number(game[1]))

  if (/^\d+$/.test(trimmed)) return formatStudioSolutionTitle(Number(trimmed))

  if (new RegExp(`^${STUDIO_SOLUTION_TITLE_PREFIX}\\s+`, 'i').test(trimmed)) {
    return trimmed
  }
  return `${STUDIO_SOLUTION_TITLE_PREFIX} ${trimmed}`
}

/**
 * 1-based game ordinal for the puzzle slot at `pageIndex`.
 * Counts unique puzzle instances on earlier pages (answer keys ignored).
 */
export function studioGameOrdinalAtPageIndex(
  store: CanvasStateStore,
  pageIndex: number,
): number {
  if (pageIndex <= 0) return 1
  const ids = new Set<string>()
  for (let i = 0; i < pageIndex; i++) {
    walkStudioObjects(readPageObjects(store, i), (obj) => {
      if (!obj.studioInstanceId) return
      if (obj.studioPageRole === 'answers') return
      ids.add(obj.studioInstanceId)
    })
  }
  return ids.size + 1
}

/** Default Page title when replacing the puzzle at `pageIndex`. */
export function studioGameTitleAtPageIndex(
  store: CanvasStateStore,
  pageIndex: number,
): string {
  return formatStudioGameTitle(studioGameOrdinalAtPageIndex(store, pageIndex))
}

/** Default Page title: next game ordinal (1-based), skipping solution pages. */
export function nextStudioGameTitle(
  store: CanvasStateStore,
  pageCount: number,
): string {
  return formatStudioGameTitle(countStudioPuzzleInstances(store, pageCount) + 1)
}

/**
 * Advance “Game N” / bare “N” titles after a successful add.
 * Returns null when the title was customized.
 */
export function bumpStudioGameTitle(title: unknown): string | null {
  const trimmed = String(title ?? '').trim()
  const prefixed = new RegExp(
    `^${STUDIO_GAME_TITLE_PREFIX}\\s+(\\d+)$`,
    'i',
  ).exec(trimmed)
  const raw = prefixed?.[1] ?? (/^\d+$/.test(trimmed) ? trimmed : null)
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  return formatStudioGameTitle(n + 1)
}

/** Advance a Game N title by `steps` (0 = unchanged). */
export function advanceStudioGameTitle(startTitle: string, steps: number): string {
  let title = startTitle
  for (let i = 0; i < steps; i++) {
    title = bumpStudioGameTitle(title) ?? title
  }
  return title
}

/**
 * Bulk title preview: “Game 3” or “Game 3 – Game 12”.
 * `count` is the number of puzzle instances (not pages).
 */
export function formatStudioBulkTitleRange(startTitle: string, count: number): string {
  const start = startTitle.trim()
  if (!start || count < 1) return start
  if (count === 1) return start
  const end = advanceStudioGameTitle(start, count - 1)
  if (end === start) return start
  return `${start} – ${end}`
}

/**
 * Replace must target the first page of the studio spread.
 * Covers answer-key pages and the recall page of 2-page activities.
 */
export function resolveStudioReplaceStartPageIndex(options: {
  store: CanvasStateStore
  currentPageIndex: number
  templatePageCount: number
}): number {
  const { store, currentPageIndex, templatePageCount } = options
  if (currentPageIndex <= 0) return 0

  const meta = readStudioPageMeta(store, currentPageIndex)
  if (!meta) return currentPageIndex

  // Already on the first activity page (or a one-page puzzle).
  if (meta.pageRole === 'single' || meta.pageRole === 'study') {
    return currentPageIndex
  }

  // Answer key / recall → walk back to the earliest page of this instance.
  if (meta.pageRole === 'answers' || meta.pageRole === 'recall') {
    for (let i = 0; i < currentPageIndex; i++) {
      if (!pageHasInstance(store, i, meta.instanceId)) continue
      const earlier = readStudioPageMeta(store, i)
      if (earlier?.pageRole === 'answers') continue
      return i
    }
    const span =
      meta.pageRole === 'answers'
        ? Math.max(1, templatePageCount)
        : 1
    return Math.max(0, currentPageIndex - span)
  }

  return currentPageIndex
}

/**
 * Insert must land after the last page of the current studio instance.
 * Avoids splitting study+recall (or puzzle+answer-key) spreads.
 */
export function resolveStudioInsertStartPageIndex(options: {
  store: CanvasStateStore
  currentPageIndex: number
  interiorPageCount: number
}): number {
  const { store, currentPageIndex, interiorPageCount } = options
  const fallback = currentPageIndex + 1
  const meta = readStudioPageMeta(store, currentPageIndex)
  if (!meta) return fallback

  let last = currentPageIndex
  for (let i = currentPageIndex + 1; i < interiorPageCount; i++) {
    if (!pageHasInstance(store, i, meta.instanceId)) break
    last = i
  }
  return last + 1
}

/** True when the page has no canvas objects (blank slot). */
export function isStudioPageEmpty(
  store: CanvasStateStore,
  pageIndex: number,
): boolean {
  return readPageObjects(store, pageIndex).length === 0
}

/**
 * Where to place a new studio generate.
 * Empty page 1 → fill it in place; otherwise append after the last book page.
 */
export function resolveStudioGeneratePlacement(options: {
  store: CanvasStateStore
  interiorPageCount: number
}): { startPageIndex: number; mode: 'insert' | 'replace' } {
  if (options.interiorPageCount > 0 && isStudioPageEmpty(options.store, 0)) {
    return { startPageIndex: 0, mode: 'replace' }
  }
  return {
    startPageIndex: options.interiorPageCount,
    mode: 'insert',
  }
}
