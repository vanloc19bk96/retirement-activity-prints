/**
 * Illustrator / SVGEdit-style pen tool for Fabric: click for straight segments,
 * drag for a quadratic curve; click near the start point to close; Shift constrains
 * the segment to 45° steps from the last anchor; double-click or Enter finishes an
 * open path; Escape cancels the current draft.
 */
import type { Canvas } from 'fabric'
import { Circle, Path } from 'fabric'
import { getFabricCanvasHistoryManager } from '@/utils/fabric-canvas-history'

const CLOSE_RADIUS = 14
const DRAG_THRESHOLD = 4
/** 8 steps ⇒ multiples of 45° from the previous anchor (Illustrator / SVGEdit-style). */
const ANGLE_SNAP_DIVISIONS = 8

const ANCHOR_RADIUS = 4.5
const ANCHOR_STROKE = '#2563eb'
const ANCHOR_FILL = '#ffffff'
/** First anchor: easier to see as the “close path” target (SVGEdit-style). */
const ANCHOR_FIRST_FILL = '#fde047'

const PEN_DRAFT_STYLE = {
  fill: 'rgba(0,0,0,0)',
  stroke: '#0f172a',
  strokeWidth: 2,
  strokeUniform: true,
  selectable: false,
  evented: false,
  objectCaching: false,
  opacity: 0.88,
} as const

const PEN_DONE_STYLE = {
  fill: 'rgba(0,0,0,0)',
  stroke: '#0f172a',
  strokeWidth: 2,
  strokeUniform: true,
  selectable: true,
  evented: true,
  objectCaching: false,
  opacity: 1,
} as const

function fmt(n: number): string {
  const v = Math.round(n * 100) / 100
  return String(v)
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Snap `point` onto a ray from `origin` at multiples of 360 / stepCount degrees.
 */
function snapPointToPolarSteps(
  origin: { x: number; y: number },
  point: { x: number; y: number },
  stepCount: number,
): { x: number; y: number } {
  const dx = point.x - origin.x
  const dy = point.y - origin.y
  const len = Math.hypot(dx, dy)
  if (len < 1e-9) return { ...point }
  const step = (Math.PI * 2) / stepCount
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / step) * step
  return {
    x: origin.x + len * Math.cos(snapped),
    y: origin.y + len * Math.sin(snapped),
  }
}

function pathHasSegmentAfterMove(d: string): boolean {
  return /[LQC]/i.test(d)
}

type PathWithSetPath = Path & { _setPath(data: string, adjustPosition?: boolean): void }

function applyPathD(path: Path, d: string): void {
  const normalized = d.trim()
  if (!normalized) return
  ;(path as PathWithSetPath)._setPath(normalized, true)
  path.setCoords()
}

export type AttachFabricPenToolOptions = {
  getIsActive: () => boolean
  /** Called when the user begins a pen stroke on this canvas (e.g. mark editor focus). */
  onInteractionStart?: () => void
}

export function attachFabricPenTool(canvas: Canvas, options: AttachFabricPenToolOptions): () => void {
  let dCommitted = ''
  let draftPath: Path | null = null
  let lastAnchor: { x: number; y: number } | null = null
  let firstAnchor: { x: number; y: number } | null = null
  let phase: 'hover' | 'press' = 'hover'
  let pressStart: { x: number; y: number } | null = null
  let dragExceeded = false
  let quadControl: { x: number; y: number } | null = null
  let hoverPointer: { x: number; y: number } | null = null
  /** After creating `M`, first mouseup only ends the click — no segment yet (SVGEdit-style). */
  let suppressNextSegmentCommit = false
  /** Scene-space anchors committed so far (matches vertices in `dCommitted`). */
  let anchorPoints: { x: number; y: number }[] = []
  let gripObjects: Circle[] = []
  /** Shift: constrain segment direction to 45° increments from `lastAnchor`. */
  let shiftAngleConstrain = false

  const isActive = (): boolean => options.getIsActive()

  function isTypingTarget(target: EventTarget | null): boolean {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return true
    }
    return target instanceof HTMLElement && target.isContentEditable
  }

  function syncShiftFromKeyboard(ev: KeyboardEvent): void {
    if (!draftPath || !isActive() || isTypingTarget(ev.target)) return
    const next = ev.shiftKey
    if (next !== shiftAngleConstrain) {
      shiftAngleConstrain = next
      renderPreview()
    }
  }

  function removeAnchorGrips(): void {
    for (const c of gripObjects) {
      canvas.remove(c)
    }
    gripObjects = []
  }

  function syncAnchorGrips(): void {
    removeAnchorGrips()
    if (!draftPath || anchorPoints.length === 0) {
      canvas.requestRenderAll()
      return
    }
    for (let i = 0; i < anchorPoints.length; i += 1) {
      const pt = anchorPoints[i]
      const circle = new Circle({
        left: pt.x,
        top: pt.y,
        radius: ANCHOR_RADIUS,
        originX: 'center',
        originY: 'center',
        fill: i === 0 ? ANCHOR_FIRST_FILL : ANCHOR_FILL,
        stroke: ANCHOR_STROKE,
        strokeWidth: 1.5,
        strokeUniform: true,
        selectable: false,
        evented: false,
        objectCaching: false,
      })
      canvas.add(circle)
      gripObjects.push(circle)
    }
    canvas.requestRenderAll()
  }

  function renderPreview(): void {
    if (!draftPath || !lastAnchor) return
    const hpRaw = hoverPointer
    if (!hpRaw) {
      applyPathD(draftPath, dCommitted)
      canvas.requestRenderAll()
      return
    }

    const base = dCommitted.trim()
    const useShift = shiftAngleConstrain
    const hp = useShift ? snapPointToPolarSteps(lastAnchor, hpRaw, ANGLE_SNAP_DIVISIONS) : hpRaw

    if (phase === 'press' && pressStart) {
      if (!dragExceeded) {
        applyPathD(draftPath, `${base} L ${fmt(hp.x)} ${fmt(hp.y)}`)
      } else {
        const qcRaw = quadControl ?? hpRaw
        const qc = useShift ? snapPointToPolarSteps(lastAnchor, qcRaw, ANGLE_SNAP_DIVISIONS) : qcRaw
        applyPathD(draftPath, `${base} Q ${fmt(qc.x)} ${fmt(qc.y)} ${fmt(hp.x)} ${fmt(hp.y)}`)
      }
    } else {
      applyPathD(draftPath, `${base} L ${fmt(hp.x)} ${fmt(hp.y)}`)
    }
    canvas.requestRenderAll()
  }

  function resumeHistoryRecording(shouldRecord: boolean): void {
    const history = getFabricCanvasHistoryManager(canvas)
    if (!history) return
    history.resume()
    if (shouldRecord) history.recordSnapshot()
  }

  function abortDraft(): void {
    const wasDrafting = draftPath !== null
    removeAnchorGrips()
    anchorPoints = []
    if (draftPath) {
      canvas.remove(draftPath)
      draftPath = null
      canvas.requestRenderAll()
    }
    dCommitted = ''
    lastAnchor = null
    firstAnchor = null
    phase = 'hover'
    pressStart = null
    dragExceeded = false
    quadControl = null
    hoverPointer = null
    suppressNextSegmentCommit = false
    shiftAngleConstrain = false
    if (wasDrafting) resumeHistoryRecording(false)
  }

  function tryClosePath(p: { x: number; y: number }): boolean {
    if (!draftPath || !firstAnchor || !lastAnchor) return false
    if (!pathHasSegmentAfterMove(dCommitted)) return false
    if (dist(p, firstAnchor) > CLOSE_RADIUS) return false

    const closed = `${dCommitted.trim()} Z`
    removeAnchorGrips()
    anchorPoints = []
    applyPathD(draftPath, closed)
    draftPath.set({ ...PEN_DONE_STYLE })
    draftPath.setCoords()
    canvas.setActiveObject(draftPath)
    canvas.requestRenderAll()

    draftPath = null
    dCommitted = ''
    lastAnchor = null
    firstAnchor = null
    phase = 'hover'
    pressStart = null
    dragExceeded = false
    quadControl = null
    hoverPointer = null
    suppressNextSegmentCommit = false
    shiftAngleConstrain = false
    resumeHistoryRecording(true)
    return true
  }

  function finalizeOpenPath(): void {
    if (!draftPath) return
    const trimmed = dCommitted.trim()
    if (!pathHasSegmentAfterMove(trimmed)) {
      abortDraft()
      return
    }

    removeAnchorGrips()
    anchorPoints = []
    applyPathD(draftPath, trimmed)
    draftPath.set({ ...PEN_DONE_STYLE })
    draftPath.setCoords()
    canvas.setActiveObject(draftPath)
    canvas.requestRenderAll()

    draftPath = null
    dCommitted = ''
    lastAnchor = null
    firstAnchor = null
    phase = 'hover'
    pressStart = null
    dragExceeded = false
    quadControl = null
    hoverPointer = null
    suppressNextSegmentCommit = false
    shiftAngleConstrain = false
    resumeHistoryRecording(true)
  }

  function onMouseDown(opt: { e?: Event }): void {
    if (!isActive()) return
    const ev = opt.e
    if (!(ev instanceof MouseEvent) || ev.button !== 0) return

    options.onInteractionStart?.()

    shiftAngleConstrain = ev.shiftKey

    const p = canvas.getScenePoint(ev)
    if (tryClosePath(p)) {
      ev.preventDefault()
      ev.stopPropagation()
      return
    }

    if (!draftPath) {
      getFabricCanvasHistoryManager(canvas)?.suspend()
      dCommitted = `M ${fmt(p.x)} ${fmt(p.y)}`
      firstAnchor = { ...p }
      lastAnchor = { ...p }
      anchorPoints = [{ ...p }]
      draftPath = new Path(dCommitted, { ...PEN_DRAFT_STYLE })
      canvas.add(draftPath)
      syncAnchorGrips()
      suppressNextSegmentCommit = true
      phase = 'press'
      pressStart = { ...p }
      dragExceeded = false
      quadControl = null
      hoverPointer = { ...p }
      ev.preventDefault()
      ev.stopPropagation()
      renderPreview()
      return
    }

    phase = 'press'
    pressStart = { ...p }
    dragExceeded = false
    quadControl = null
    hoverPointer = { ...p }
    ev.preventDefault()
    ev.stopPropagation()
    renderPreview()
  }

  function onMouseMove(opt: { e?: Event }): void {
    if (!isActive() || !draftPath) return
    const ev = opt.e
    if (!(ev instanceof MouseEvent)) return

    shiftAngleConstrain = ev.shiftKey

    const p = canvas.getScenePoint(ev)
    hoverPointer = { ...p }

    if (phase === 'press' && pressStart) {
      const pForDrag =
        shiftAngleConstrain && lastAnchor ? snapPointToPolarSteps(lastAnchor, p, ANGLE_SNAP_DIVISIONS) : p
      if (!dragExceeded && dist(pressStart, p) > DRAG_THRESHOLD) {
        dragExceeded = true
        quadControl = { ...pForDrag }
      } else if (dragExceeded) {
        quadControl = { ...pForDrag }
      }
    }

    renderPreview()
  }

  function handleMouseUp(ev?: Event): void {
    if (!isActive() || !draftPath || phase !== 'press') return
    if (ev instanceof MouseEvent && ev.button !== 0) return

    const shiftSnap = ev instanceof MouseEvent ? ev.shiftKey : shiftAngleConstrain

    let release =
      ev instanceof MouseEvent ? canvas.getScenePoint(ev) : (hoverPointer ?? lastAnchor)
    if (release && lastAnchor && shiftSnap) {
      release = snapPointToPolarSteps(lastAnchor, release, ANGLE_SNAP_DIVISIONS)
    }
    if (!release || !pressStart || !lastAnchor) {
      phase = 'hover'
      pressStart = null
      dragExceeded = false
      quadControl = null
      return
    }

    if (suppressNextSegmentCommit) {
      suppressNextSegmentCommit = false
      phase = 'hover'
      pressStart = null
      dragExceeded = false
      quadControl = null
      applyPathD(draftPath, dCommitted)
      syncAnchorGrips()
      return
    }

    if (!dragExceeded && dist(release, lastAnchor) < 1) {
      phase = 'hover'
      pressStart = null
      dragExceeded = false
      quadControl = null
      applyPathD(draftPath, dCommitted)
      syncAnchorGrips()
      return
    }

    const base = dCommitted.trim()
    if (!dragExceeded) {
      dCommitted = `${base} L ${fmt(release.x)} ${fmt(release.y)}`
    } else {
      const qcRaw = quadControl ?? release
      const qc =
        lastAnchor && shiftSnap
          ? snapPointToPolarSteps(lastAnchor, qcRaw, ANGLE_SNAP_DIVISIONS)
          : qcRaw
      dCommitted = `${base} Q ${fmt(qc.x)} ${fmt(qc.y)} ${fmt(release.x)} ${fmt(release.y)}`
    }

    lastAnchor = { ...release }
    anchorPoints.push({ ...release })
    phase = 'hover'
    pressStart = null
    dragExceeded = false
    quadControl = null
    applyPathD(draftPath, dCommitted)
    syncAnchorGrips()
  }

  function onCanvasMouseUp(opt: { e?: Event }): void {
    handleMouseUp(opt.e)
  }

  function onWindowMouseUp(ev: MouseEvent): void {
    handleMouseUp(ev)
  }

  function onDoubleClick(opt: { e?: Event }): void {
    if (!isActive()) return
    const ev = opt.e
    if (ev instanceof MouseEvent) {
      ev.preventDefault()
      ev.stopPropagation()
    }
    finalizeOpenPath()
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (!isActive()) return
    const target = ev.target
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) {
      return
    }
    if (target instanceof HTMLElement && target.isContentEditable) {
      return
    }
    if (ev.key === 'Escape') {
      ev.preventDefault()
      abortDraft()
      return
    }
    if (ev.key === 'Enter' && draftPath && pathHasSegmentAfterMove(dCommitted)) {
      ev.preventDefault()
      finalizeOpenPath()
      return
    }
    syncShiftFromKeyboard(ev)
  }

  function onWindowKeyUp(ev: KeyboardEvent): void {
    syncShiftFromKeyboard(ev)
  }

  canvas.on('mouse:down', onMouseDown)
  canvas.on('mouse:move', onMouseMove)
  canvas.on('mouse:up', onCanvasMouseUp)
  canvas.on('mouse:dblclick', onDoubleClick)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onWindowKeyUp)
  window.addEventListener('mouseup', onWindowMouseUp)

  return () => {
    canvas.off('mouse:down', onMouseDown)
    canvas.off('mouse:move', onMouseMove)
    canvas.off('mouse:up', onCanvasMouseUp)
    canvas.off('mouse:dblclick', onDoubleClick)
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onWindowKeyUp)
    window.removeEventListener('mouseup', onWindowMouseUp)
    abortDraft()
  }
}
