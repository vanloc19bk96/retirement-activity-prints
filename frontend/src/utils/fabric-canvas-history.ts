import type { Canvas } from 'fabric'

import { CUSTOM_OBJECT_PROPS } from '@/utils/canvas-state-store'

/** Cap keeps memory bounded; average page snapshot is small (few KB – tens of KB). */
const HISTORY_MAX_ENTRIES = 50

type CanvasSnapshot = string

type HistoryEventName =
  | 'object:modified'
  | 'object:added'
  | 'object:removed'
  | 'path:created'
  | 'text:editing:exited'

const HISTORY_RECORD_EVENTS: readonly HistoryEventName[] = [
  'object:modified',
  'object:added',
  'object:removed',
  'path:created',
  'text:editing:exited',
]

export type RecordSnapshotOptions = {
  /**
   * When set, coalesce rapid calls and only snapshot once the stream has been
   * quiet for `debounceMs`. Use for continuous controls (sliders, color pickers,
   * font-size scrubbing) so one user interaction = one undo step.
   */
  debounceMs?: number
}

export interface FabricCanvasHistoryManager {
  /** Attach Fabric listeners and capture the initial snapshot as the baseline. */
  start: () => void
  /** Manually capture a snapshot; use after imperative mutations Fabric doesn't broadcast. */
  recordSnapshot: (options?: RecordSnapshotOptions) => void
  /** Increment suspension counter — while > 0 all automatic and manual recording is ignored. */
  suspend: () => void
  /** Decrement suspension counter and optionally record a snapshot when fully resumed. */
  resume: () => void
  undo: () => Promise<boolean>
  redo: () => Promise<boolean>
  canUndo: () => boolean
  canRedo: () => boolean
  /** Detach listeners, drop stacks, and remove registry entry. */
  dispose: () => void
}

const CANVAS_HISTORY_REGISTRY = new WeakMap<Canvas, FabricCanvasHistoryManager>()

export function getFabricCanvasHistoryManager(
  canvas: Canvas | null | undefined,
): FabricCanvasHistoryManager | null {
  if (!canvas) return null
  return CANVAS_HISTORY_REGISTRY.get(canvas) ?? null
}

function serializeCanvas(canvas: Canvas): CanvasSnapshot | null {
  try {
    return JSON.stringify(canvas.toObject(CUSTOM_OBJECT_PROPS as unknown as string[]))
  } catch {
    return null
  }
}

export function createFabricCanvasHistoryManager(canvas: Canvas): FabricCanvasHistoryManager {
  const undoStack: CanvasSnapshot[] = []
  const redoStack: CanvasSnapshot[] = []

  let currentSnapshot: CanvasSnapshot | null = null
  let suspendDepth = 0
  let isListening = false
  let isDisposed = false
  let isRecordScheduled = false
  let debounceTimerId: ReturnType<typeof setTimeout> | null = null

  const captureAndPushIfChanged = (): void => {
    if (isDisposed || suspendDepth > 0) return
    const next = serializeCanvas(canvas)
    if (next === null) return
    if (currentSnapshot !== null && next === currentSnapshot) return
    if (currentSnapshot !== null) {
      undoStack.push(currentSnapshot)
      if (undoStack.length > HISTORY_MAX_ENTRIES) undoStack.shift()
    }
    currentSnapshot = next
    if (redoStack.length > 0) redoStack.length = 0
  }

  const clearDebounceTimer = (): void => {
    if (debounceTimerId === null) return
    clearTimeout(debounceTimerId)
    debounceTimerId = null
  }

  /** Commit any pending (debounced or microtask) snapshot synchronously. */
  const flushPendingSnapshot = (): void => {
    if (debounceTimerId !== null) clearDebounceTimer()
    captureAndPushIfChanged()
  }

  /**
   * Batch bursts (e.g. paste of N objects firing N `object:added` events synchronously)
   * into a single snapshot via a microtask. `debounceMs` coalesces scrubbing-style
   * inputs (sliders, pickers) into one undo step per interaction.
   */
  const scheduleRecord = (options?: RecordSnapshotOptions): void => {
    if (isDisposed) return

    const debounceMs = options?.debounceMs
    if (typeof debounceMs === 'number' && debounceMs > 0) {
      clearDebounceTimer()
      debounceTimerId = setTimeout(() => {
        debounceTimerId = null
        captureAndPushIfChanged()
      }, debounceMs)
      return
    }

    // Immediate path: flush any still-pending debounce so we don't lose that step,
    // then batch sync bursts through one microtask.
    if (debounceTimerId !== null) flushPendingSnapshot()

    if (isRecordScheduled) return
    isRecordScheduled = true
    queueMicrotask(() => {
      isRecordScheduled = false
      captureAndPushIfChanged()
    })
  }

  const applySnapshot = async (snapshot: CanvasSnapshot): Promise<void> => {
    suspendDepth += 1
    try {
      canvas.discardActiveObject()
      await canvas.loadFromJSON(JSON.parse(snapshot))
      canvas.requestRenderAll()
      currentSnapshot = serializeCanvas(canvas) ?? snapshot
    } finally {
      suspendDepth = Math.max(0, suspendDepth - 1)
    }
  }

  /** Fabric invokes listeners with an event arg; we ignore it and batch immediately. */
  const onFabricCanvasMutationEvent = (): void => {
    scheduleRecord()
  }

  const attachListeners = (): void => {
    if (isListening) return
    for (const eventName of HISTORY_RECORD_EVENTS) {
      canvas.on(eventName, onFabricCanvasMutationEvent)
    }
    isListening = true
  }

  const detachListeners = (): void => {
    if (!isListening) return
    for (const eventName of HISTORY_RECORD_EVENTS) {
      canvas.off(eventName, onFabricCanvasMutationEvent)
    }
    isListening = false
  }

  const manager: FabricCanvasHistoryManager = {
    start() {
      if (isDisposed) return
      attachListeners()
      currentSnapshot = serializeCanvas(canvas)
      undoStack.length = 0
      redoStack.length = 0
    },

    recordSnapshot(options) {
      scheduleRecord(options)
    },

    suspend() {
      suspendDepth += 1
    },

    resume() {
      suspendDepth = Math.max(0, suspendDepth - 1)
    },

    async undo() {
      if (isDisposed) return false
      flushPendingSnapshot()
      const previous = undoStack.pop()
      if (previous === undefined) return false
      if (currentSnapshot !== null) {
        redoStack.push(currentSnapshot)
        if (redoStack.length > HISTORY_MAX_ENTRIES) redoStack.shift()
      }
      await applySnapshot(previous)
      return true
    },

    async redo() {
      if (isDisposed) return false
      flushPendingSnapshot()
      const next = redoStack.pop()
      if (next === undefined) return false
      if (currentSnapshot !== null) {
        undoStack.push(currentSnapshot)
        if (undoStack.length > HISTORY_MAX_ENTRIES) undoStack.shift()
      }
      await applySnapshot(next)
      return true
    },

    canUndo() {
      return undoStack.length > 0
    },

    canRedo() {
      return redoStack.length > 0
    },

    dispose() {
      if (isDisposed) return
      isDisposed = true
      clearDebounceTimer()
      detachListeners()
      undoStack.length = 0
      redoStack.length = 0
      currentSnapshot = null
      CANVAS_HISTORY_REGISTRY.delete(canvas)
    },
  }

  CANVAS_HISTORY_REGISTRY.set(canvas, manager)
  return manager
}
