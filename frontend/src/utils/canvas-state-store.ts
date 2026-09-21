import type { Canvas } from 'fabric'

import type { CanvasLogicalSize } from '@/types/fabric-canvas-item.types'
import {
  getCanvasLogicalSize,
  normalizeFabricCanvasJsonToLogicalSize,
  omitFabricCanvasJsonSurfaceFields,
} from '@/utils/canvas-template'
import { remeasureAllFabricEditableTextOnCanvas, upgradeInteractiveTextToTextbox } from '@/utils/canvas-text'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'

export const CUSTOM_OBJECT_PROPS: string[] = [
  'originalImageUrl',
  // Icon groups (Lucide/Phosphor): frame + duotone layer markers.
  'data',
  // Persist lock state explicitly so lock survives save/reload.
  'lockMovementX',
  'lockMovementY',
  'lockScalingX',
  'lockScalingY',
  'lockRotation',
  'hasControls',
  'selectable',
  'editable',
  'objectId',
  // Eraser: stroke records baked into image pixel buffer at runtime.
  'eraserStrokes',
  'eraserSourceCrop',
  // Legacy eraser format (paths on canvas) — kept so old saved JSON can be migrated.
  'isEraserPath',
  'linkedImageId',
  'eraserBrushWidth',
  'studioTemplateKey',
  'studioRole',
  'studioInstanceId',
  'studioPageRole',
  'studioContentHash',
  // Fabric omits this from toObject(), but a cached group rasterises into a
  // canvas the size of its own bounds and crops whatever a child draws past
  // them. Studio groups ship with caching off for that reason; without it here
  // the flag is lost on save and glyph tails come back cropped after reload.
  'objectCaching',
]

const DATA_URL_PREFIX = 'data:'
const BLOB_URL_PREFIX = 'blob:'

function normalizeFabricImageUrlCandidate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.startsWith(DATA_URL_PREFIX) || trimmed.startsWith(BLOB_URL_PREFIX)) return null
  return trimmed.split('?')[0]
}

function hasEraserStrokes(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0
}

function readEraserSourceCrop(value: unknown):
  | { cropX: number; cropY: number; width: number; height: number }
  | null {
  if (!value || typeof value !== 'object') return null
  const crop = value as Record<string, unknown>
  const cropX = crop.cropX
  const cropY = crop.cropY
  const width = crop.width
  const height = crop.height
  if (
    typeof cropX !== 'number' ||
    typeof cropY !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number'
  ) {
    return null
  }
  return { cropX, cropY, width, height }
}

export function prepareCanvasJsonForPersistence<T>(canvasJson: T): T {
  const normalize = (value: unknown): unknown => {
    if (value == null) return value
    if (Array.isArray(value)) return value.map(normalize)
    if (typeof value !== 'object') return value

    const input = value as Record<string, unknown>
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(input)) {
      output[key] = normalize(child)
    }

    if (output.type !== 'image' || !hasEraserStrokes(output.eraserStrokes)) return output

    const originalImageUrl =
      normalizeFabricImageUrlCandidate(output.originalImageUrl) ??
      normalizeFabricImageUrlCandidate(output.src)
    const sourceCrop = readEraserSourceCrop(output.eraserSourceCrop)
    if (!originalImageUrl || !sourceCrop) return output

    output.src = originalImageUrl
    output.originalImageUrl = originalImageUrl
    output.cropX = sourceCrop.cropX
    output.cropY = sourceCrop.cropY
    output.width = sourceCrop.width
    output.height = sourceCrop.height

    return output
  }

  return normalize(canvasJson) as T
}

export function exportLiveFabricCanvasJson(canvas: Canvas): object {
  const canvasJson = canvas.toObject(CUSTOM_OBJECT_PROPS as unknown as string[])
  const logicalSize = getCanvasLogicalSize(canvas)
  const normalized = logicalSize
    ? normalizeFabricCanvasJsonToLogicalSize(canvasJson, logicalSize)
    : canvasJson
  return prepareCanvasJsonForPersistence(normalized)
}

function visitFabricCanvasNode(node: unknown, into: Set<string>): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) visitFabricCanvasNode(item, into)
    return
  }
  if (typeof node !== 'object') return

  const obj = node as Record<string, unknown>
  const nested = obj.objects
  if (Array.isArray(nested)) {
    for (const child of nested) visitFabricCanvasNode(child, into)
  }

  if (obj.type === 'image') {
    const src = normalizeFabricImageUrlCandidate(obj.src)
    if (src) into.add(src)
    const original = normalizeFabricImageUrlCandidate(obj.originalImageUrl)
    if (original) into.add(original)
  }
}

/** Collect `src` from Fabric image objects (including nested groups). */
export function collectReferencedSupabaseImagePublicUrlsFromFabricCanvasJson(
  canvasJson: unknown,
): string[] {
  const into = new Set<string>()
  if (!canvasJson || typeof canvasJson !== 'object') return []
  const objects = (canvasJson as Record<string, unknown>).objects
  if (!Array.isArray(objects)) return []
  for (const item of objects) visitFabricCanvasNode(item, into)
  return Array.from(into)
}

function normalizeFontFamily(fontFamily: string): string {
  const first = fontFamily
    .split(',')[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
  return first ?? fontFamily.trim()
}

function visitFabricCanvasNodeForFonts(node: unknown, into: Set<string>): void {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) visitFabricCanvasNodeForFonts(item, into)
    return
  }
  if (typeof node !== 'object') return

  const obj = node as Record<string, unknown>
  const rawFontFamily = obj.fontFamily
  if (typeof rawFontFamily === 'string' && rawFontFamily.trim()) {
    into.add(normalizeFontFamily(rawFontFamily))
  }

  const styles = obj.styles
  if (styles && typeof styles === 'object') {
    visitFabricCanvasNodeForFonts(styles, into)
  }

  const nested = obj.objects
  if (Array.isArray(nested)) {
    for (const child of nested) visitFabricCanvasNodeForFonts(child, into)
  }
}

export function collectReferencedFontFamiliesFromFabricCanvasJson(canvasJson: unknown): string[] {
  const into = new Set<string>()
  if (!canvasJson || typeof canvasJson !== 'object') return []
  const objects = (canvasJson as Record<string, unknown>).objects
  if (!Array.isArray(objects)) return []
  for (const item of objects) visitFabricCanvasNodeForFonts(item, into)
  return Array.from(into)
}

export function mergeReferencedSupabaseImagePublicUrlsFromManyCanvases(
  canvasJsonList: unknown[],
): string[] {
  const into = new Set<string>()
  for (const json of canvasJsonList) {
    for (const url of collectReferencedSupabaseImagePublicUrlsFromFabricCanvasJson(json)) {
      into.add(url)
    }
  }
  return Array.from(into)
}

export class CanvasStateStore {
  private store = new Map<number, object>()
  // Snapshot dùng để so sánh "dirty" so với dữ liệu đã preload từ backend (lúc load project)
  private baselineSerialized = new Map<number, string>()
  private saveSuspensionDepth = 0
  /** After preload, Fabric `toObject()` is unsafe until `loadFromJSON` completes; then we mark trusted. */
  private fabricLiveTrusted = new Set<number>()
  /** Logical page size each snapshot was authored for (used to rescale on trim/bleed changes). */
  private authoringLogicalSizeByIndex = new Map<number, CanvasLogicalSize>()
  /**
   * Pages baselined from store JSON before Fabric mounted. After loadFromJSON the
   * live export can differ from the stored snapshot; reconcile once on first trust.
   */
  private pendingFabricBaselineReconcile = new Set<number>()

  private serializeForComparison(value: unknown): string {
    const normalize = (v: unknown): unknown => {
      if (v === null) return null
      const t = typeof v
      if (t !== 'object') return v

      if (Array.isArray(v)) return v.map(normalize)

      const record = v as Record<string, unknown>
      const keys = Object.keys(record).sort()
      const out: Record<string, unknown> = {}
      for (const key of keys) {
        out[key] = normalize(record[key])
      }
      return out
    }

    return JSON.stringify(normalize(prepareCanvasJsonForPersistence(value)))
  }

  clear(): void {
    this.store.clear()
    this.baselineSerialized.clear()
    this.fabricLiveTrusted.clear()
    this.authoringLogicalSizeByIndex.clear()
    this.pendingFabricBaselineReconcile.clear()
  }

  getAuthoringLogicalSize(index: number): CanvasLogicalSize | null {
    return this.authoringLogicalSizeByIndex.get(index) ?? null
  }

  setAuthoringLogicalSize(index: number, size: CanvasLogicalSize): void {
    if (size.width <= 0 || size.height <= 0) return
    this.authoringLogicalSizeByIndex.set(index, size)
  }

  /** When `has(index)` is false, there is no server snapshot — live Fabric is the source of truth once mounted. */
  isFabricLiveTrusted(index: number): boolean {
    if (!this.has(index)) return true
    return this.fabricLiveTrusted.has(index)
  }

  markFabricLiveTrusted(index: number): void {
    this.fabricLiveTrusted.add(index)
  }

  markPendingFabricBaselineReconcile(index: number): void {
    this.pendingFabricBaselineReconcile.add(index)
  }

  /**
   * Align dirty baseline with the first live Fabric export after preload restore.
   * Skips pages the user has already edited (not pending reconcile).
   */
  reconcileFabricBaselineIfPending(index: number, canvas: Canvas): boolean {
    if (!this.pendingFabricBaselineReconcile.has(index)) return false

    this.pendingFabricBaselineReconcile.delete(index)
    try {
      const liveJson = exportLiveFabricCanvasJson(canvas)
      const prepared = prepareCanvasJsonForPersistence(liveJson)
      const authoringSize = this.getAuthoringLogicalSize(index)
      const normalized =
        authoringSize != null
          ? normalizeFabricCanvasJsonToLogicalSize(prepared, authoringSize)
          : prepared
      this.store.set(index, normalized)
      this.baselineSerialized.set(index, this.serializeForComparison(prepared))
      return true
    } catch {
      return false
    }
  }

  // Drops live-trust when a store snapshot becomes authoritative. The mounted
  // canvas must reload before its live state can safely win again.
  markFabricLiveUntrusted(index: number): void {
    this.fabricLiveTrusted.delete(index)
  }

  private persistenceSnapshotFromStored(normalized: object): object {
    return prepareCanvasJsonForPersistence(normalized)
  }

  private baselineFromStoredSnapshot(normalized: object): string {
    return this.serializeForComparison(this.persistenceSnapshotFromStored(normalized))
  }

  preload(index: number, canvasJson: object, authoringLogicalSize?: CanvasLogicalSize): void {
    const prepared = prepareCanvasJsonForPersistence(canvasJson)
    const normalized =
      authoringLogicalSize != null
        ? normalizeFabricCanvasJsonToLogicalSize(prepared, authoringLogicalSize)
        : prepared
    this.fabricLiveTrusted.delete(index)
    this.store.set(index, normalized)
    // Baseline must match getCanvasJsonForPersistence: prepare(store snapshot).
    this.baselineSerialized.set(index, this.baselineFromStoredSnapshot(normalized))
    if (authoringLogicalSize) {
      this.setAuthoringLogicalSize(index, authoringLogicalSize)
    }
  }

  getSerialized(index: number): object | null {
    return this.store.get(index) ?? null
  }

  isDirty(index: number, canvasJson: object): boolean {
    const baseline = this.baselineSerialized.get(index)
    if (baseline == null) return true
    return this.serializeForComparison(canvasJson) !== baseline
  }

  // Called after a successful save so the store becomes "clean" again.
  markSaved(index: number, canvasJson: object): void {
    const prepared = prepareCanvasJsonForPersistence(canvasJson)
    const authoringSize = this.getAuthoringLogicalSize(index)
    const normalized =
      authoringSize != null
        ? normalizeFabricCanvasJsonToLogicalSize(prepared, authoringSize)
        : prepared
    this.store.set(index, normalized)
    if (this.isFabricLiveTrusted(index)) {
      // Live-trusted pages compare against Fabric export on each read.
      this.baselineSerialized.set(index, this.serializeForComparison(prepared))
      this.pendingFabricBaselineReconcile.delete(index)
      return
    }
    // Untrusted pages read prepare(store snapshot) via getCanvasJsonForPersistence.
    this.baselineSerialized.set(index, this.baselineFromStoredSnapshot(normalized))
  }

  /**
   * After save or post-load hydration settle: untrusted pages need a one-time
   * Fabric reconcile when they first mount so dirty state stays accurate.
   */
  markSavedAndTrackFabricReconcile(index: number, canvasJson: object): void {
    this.markSaved(index, canvasJson)
    if (!this.isFabricLiveTrusted(index)) {
      this.markPendingFabricBaselineReconcile(index)
    }
  }

  save(index: number, canvas: Canvas): void {
    if (this.saveSuspensionDepth > 0) return
    if (!this.isFabricLiveTrusted(index)) return
    try {
      const prepared = exportLiveFabricCanvasJson(canvas)
      this.store.set(index, prepared)
      const logicalSize = getCanvasLogicalSize(canvas)
      if (logicalSize) {
        this.setAuthoringLogicalSize(index, logicalSize)
      }
    } catch {
      // Canvas may be partially disposed; best-effort save
    }
  }

  async restore(index: number, canvas: Canvas): Promise<boolean> {
    const json = this.store.get(index)
    if (!json) return false
    try {
      const referencedFontFamilies = collectReferencedFontFamiliesFromFabricCanvasJson(json)
      await Promise.all(referencedFontFamilies.map((fontFamily) => ensureFontFamilyLoaded(fontFamily)))
      // Fabric 7 loadFromJSON does `this.set(serialized)`, so JSON width/height overwrite the
      // live zoom-scaled surface (display = page * zoom) and break safe-area alignment.
      // Persist logical size in the store for exports; never apply it onto a live editor canvas.
      await canvas.loadFromJSON(omitFabricCanvasJsonSurfaceFields(json as Record<string, unknown>))
      await upgradeInteractiveTextToTextbox(canvas)
      remeasureAllFabricEditableTextOnCanvas(canvas)
      return true
    } catch {
      return false
    }
  }

  has(index: number): boolean {
    return this.store.has(index)
  }

  // Used to update stored serialized snapshots without touching the baseline,
  // so the "dirty" comparison remains meaningful.
  setSerialized(index: number, canvasJson: object): void {
    this.store.set(index, prepareCanvasJsonForPersistence(canvasJson))
  }

  suspendSave(): void {
    this.saveSuspensionDepth += 1
  }

  resumeSave(): void {
    this.saveSuspensionDepth = Math.max(0, this.saveSuspensionDepth - 1)
  }

  delete(index: number): void {
    this.store.delete(index)
    this.baselineSerialized.delete(index)
    this.fabricLiveTrusted.delete(index)
    this.authoringLogicalSizeByIndex.delete(index)
    this.pendingFabricBaselineReconcile.delete(index)
  }

  markAllInteriorFabricLiveUntrusted(pageCount: number): void {
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      this.markFabricLiveUntrusted(pageIndex)
    }
  }

  private shiftPendingFabricBaselineReconcileAfterPageDelete(
    deletedPageIndex: number,
    nextPageCount: number,
  ): void {
    this.pendingFabricBaselineReconcile.delete(deletedPageIndex)
    const toShiftDown = Array.from(this.pendingFabricBaselineReconcile)
      .filter((i) => i > deletedPageIndex)
      .sort((a, b) => a - b)
    for (const i of toShiftDown) {
      this.pendingFabricBaselineReconcile.delete(i)
      this.pendingFabricBaselineReconcile.add(i - 1)
    }
    for (const i of Array.from(this.pendingFabricBaselineReconcile)) {
      if (i >= nextPageCount) this.pendingFabricBaselineReconcile.delete(i)
    }
  }

  private shiftFabricLiveTrustedAfterPageDelete(deletedPageIndex: number, nextPageCount: number): void {
    this.fabricLiveTrusted.delete(deletedPageIndex)
    const toShiftDown = Array.from(this.fabricLiveTrusted)
      .filter((i) => i > deletedPageIndex)
      .sort((a, b) => a - b)
    for (const i of toShiftDown) {
      this.fabricLiveTrusted.delete(i)
      this.fabricLiveTrusted.add(i - 1)
    }
    for (const i of Array.from(this.fabricLiveTrusted)) {
      if (i >= nextPageCount) this.fabricLiveTrusted.delete(i)
    }
  }

  private shiftPendingFabricBaselineReconcileAfterPageInsert(
    insertIndex: number,
    nextPageCount: number,
  ): void {
    this.shiftPendingFabricBaselineReconcileAfterPageInsertBlock(insertIndex, 1, nextPageCount)
  }

  private shiftPendingFabricBaselineReconcileAfterPageInsertBlock(
    insertIndex: number,
    count: number,
    nextPageCount: number,
  ): void {
    const toShiftUp = Array.from(this.pendingFabricBaselineReconcile)
      .filter((i) => i >= insertIndex)
      .sort((a, b) => b - a)
    for (const i of toShiftUp) {
      this.pendingFabricBaselineReconcile.delete(i)
      this.pendingFabricBaselineReconcile.add(i + count)
    }
    for (let offset = 0; offset < count; offset += 1) {
      this.pendingFabricBaselineReconcile.delete(insertIndex + offset)
    }
    for (const i of Array.from(this.pendingFabricBaselineReconcile)) {
      if (i >= nextPageCount) this.pendingFabricBaselineReconcile.delete(i)
    }
  }

  private shiftFabricLiveTrustedAfterPageInsert(insertIndex: number, nextPageCount: number): void {
    this.shiftFabricLiveTrustedAfterPageInsertBlock(insertIndex, 1, nextPageCount)
  }

  private shiftFabricLiveTrustedAfterPageInsertBlock(
    insertIndex: number,
    count: number,
    nextPageCount: number,
  ): void {
    const toShiftUp = Array.from(this.fabricLiveTrusted)
      .filter((i) => i >= insertIndex)
      .sort((a, b) => b - a)
    for (const i of toShiftUp) {
      this.fabricLiveTrusted.delete(i)
      this.fabricLiveTrusted.add(i + count)
    }
    for (let offset = 0; offset < count; offset += 1) {
      this.fabricLiveTrusted.delete(insertIndex + offset)
    }
    for (const i of Array.from(this.fabricLiveTrusted)) {
      if (i >= nextPageCount) this.fabricLiveTrusted.delete(i)
    }
  }

  deletePageAndShiftSerialized(deletedPageIndex: number, nextPageCount: number): void {
    if (deletedPageIndex < 0) return

    // Shift serialized snapshots so that fallback restores (when a Fabric canvas
    // isn't available yet) match the new page ordering after deletion.
    //
    // We intentionally do NOT shift `baselineSerialized` here. Keeping the old
    // baselines ensures pages that moved to new indices will be detected as
    // dirty and included in the next save.

    // Remove the deleted page first, then shift pages above it down.
    // Doing it in this order prevents us from deleting data that was shifted
    // into the deleted index.
    this.store.delete(deletedPageIndex)

    const serializedKeys = Array.from(this.store.keys()).sort((a, b) => a - b)
    for (const index of serializedKeys) {
      if (index < 0) continue
      if (index <= deletedPageIndex) continue

      const value = this.store.get(index)
      if (!value) continue
      this.store.delete(index)
      this.store.set(index - 1, value)
    }

    // Trim entries that are no longer present in the UI.
    for (const index of Array.from(this.store.keys())) {
      if (index >= nextPageCount) this.store.delete(index)
    }
    for (const index of Array.from(this.baselineSerialized.keys())) {
      if (index >= nextPageCount) this.baselineSerialized.delete(index)
    }

    this.shiftFabricLiveTrustedAfterPageDelete(deletedPageIndex, nextPageCount)
    this.shiftPendingFabricBaselineReconcileAfterPageDelete(deletedPageIndex, nextPageCount)
  }

  /**
   * Drop every interior page except index 0 and replace page 0 snapshot.
   * Does not touch cover (`index === -1`).
   */
  resetInteriorPagesToSingleEmpty(canvasJson: object): void {
    for (const index of Array.from(this.store.keys())) {
      if (index < 0) continue
      if (index >= 1) {
        this.store.delete(index)
        this.baselineSerialized.delete(index)
        this.fabricLiveTrusted.delete(index)
      }
    }
    for (const index of Array.from(this.baselineSerialized.keys())) {
      if (index >= 1) this.baselineSerialized.delete(index)
    }
    for (const index of Array.from(this.fabricLiveTrusted)) {
      if (index >= 1) this.fabricLiveTrusted.delete(index)
    }
    for (const index of Array.from(this.pendingFabricBaselineReconcile)) {
      if (index >= 1) this.pendingFabricBaselineReconcile.delete(index)
    }
    this.store.set(0, canvasJson)
  }

  insertPageAndShiftSerialized(insertAfterPageIndex: number, nextPageCount: number): void {
    if (insertAfterPageIndex < 0) return

    // Insert *below* the given page, so the new page index is insertAfter + 1.
    const insertIndex = insertAfterPageIndex + 1
    if (insertIndex >= nextPageCount) return

    // Shift serialized snapshots up so that pages after the insertion point
    // match the new indices.
    const serializedKeys = Array.from(this.store.keys()).sort((a, b) => b - a)
    for (const index of serializedKeys) {
      if (index < 0) continue
      if (index < insertIndex) continue
      const value = this.store.get(index)
      if (!value) continue
      this.store.delete(index)
      this.store.set(index + 1, value)
    }

    // Ensure the inserted page index is empty (new page starts blank).
    this.store.delete(insertIndex)

    // Safety trim if caller passed an inconsistent page count.
    for (const index of Array.from(this.store.keys())) {
      if (index >= nextPageCount) this.store.delete(index)
    }

    this.shiftFabricLiveTrustedAfterPageInsert(insertIndex, nextPageCount)
    this.shiftPendingFabricBaselineReconcileAfterPageInsert(insertIndex, nextPageCount)
  }

  private swapMapEntry<T>(map: Map<number, T>, indexA: number, indexB: number): void {
    const hasA = map.has(indexA)
    const hasB = map.has(indexB)
    const valueA = map.get(indexA)
    const valueB = map.get(indexB)

    if (hasA) map.set(indexB, valueA as T)
    else map.delete(indexB)

    if (hasB) map.set(indexA, valueB as T)
    else map.delete(indexA)
  }

  /** Swap serialized snapshots at two interior page indices (order-only change). */
  swapPagesSerialized(pageIndexA: number, pageIndexB: number): void {
    if (pageIndexA === pageIndexB || pageIndexA < 0 || pageIndexB < 0) return

    this.swapMapEntry(this.store, pageIndexA, pageIndexB)
    this.swapMapEntry(this.baselineSerialized, pageIndexA, pageIndexB)

    const trustedA = this.fabricLiveTrusted.has(pageIndexA)
    const trustedB = this.fabricLiveTrusted.has(pageIndexB)
    if (trustedA) this.fabricLiveTrusted.add(pageIndexB)
    else this.fabricLiveTrusted.delete(pageIndexB)
    if (trustedB) this.fabricLiveTrusted.add(pageIndexA)
    else this.fabricLiveTrusted.delete(pageIndexA)

    const pendingA = this.pendingFabricBaselineReconcile.has(pageIndexA)
    const pendingB = this.pendingFabricBaselineReconcile.has(pageIndexB)
    if (pendingA) this.pendingFabricBaselineReconcile.add(pageIndexB)
    else this.pendingFabricBaselineReconcile.delete(pageIndexB)
    if (pendingB) this.pendingFabricBaselineReconcile.add(pageIndexA)
    else this.pendingFabricBaselineReconcile.delete(pageIndexA)
  }

  /**
   * Rearrange interior snapshots: `order[newIndex] = oldIndex` (a permutation
   * of `0..order.length - 1`). Moved pages become store-authoritative until
   * their canvas remounts at the new index.
   *
   * Like delete/insert, baselines stay put so every moved page reads as dirty
   * and is written at its new index on the next save. Pending reconciles are
   * dropped for the same reason — reconciling would re-baseline them as clean.
   */
  reorderPagesSerialized(order: readonly number[]): void {
    const nextStore = new Map<number, object>()
    const nextSizes = new Map<number, CanvasLogicalSize>()
    order.forEach((oldIndex, newIndex) => {
      const value = this.store.get(oldIndex)
      if (value) nextStore.set(newIndex, value)
      const size = this.authoringLogicalSizeByIndex.get(oldIndex)
      if (size) nextSizes.set(newIndex, size)
    })

    for (let newIndex = 0; newIndex < order.length; newIndex += 1) {
      this.store.delete(newIndex)
      this.authoringLogicalSizeByIndex.delete(newIndex)
      if (order[newIndex] === newIndex) continue
      this.fabricLiveTrusted.delete(newIndex)
      this.pendingFabricBaselineReconcile.delete(newIndex)
    }
    for (const [index, value] of nextStore) this.store.set(index, value)
    for (const [index, size] of nextSizes) this.authoringLogicalSizeByIndex.set(index, size)
  }
}
