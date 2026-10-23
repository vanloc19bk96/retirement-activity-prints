import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, JSX, KeyboardEvent, MouseEvent } from 'react'
import type { Canvas, FabricObject } from 'fabric'
import type { LucideIcon } from 'lucide-react'
import {
  Circle,
  Eye,
  EyeOff,
  Group,
  Image,
  Layers,
  Lock,
  LockOpen,
  Minus,
  PenTool,
  Shapes,
  Square,
  Triangle,
  Type,
} from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCanvasLayers } from '@/hooks/canvas-editor/use-canvas-layers'
import { cn } from '@/lib/utils'
import {
  LAYER_NAME_MAX_LENGTH,
  moveLayer,
  planLayerMoveIndex,
  renameLayer,
  resolveLayerSelection,
  selectLayers,
  setLayerLocked,
  setLayerVisible,
  stepLayer,
  type CanvasLayer,
  type LayerKind,
  type LayerPlacement,
} from '@/utils/canvas-layers'

/** Own MIME type so the canvas drop handlers never mistake a row drag for dropped content. */
const LAYER_DND_MIME = 'application/x-mega-activity-layer'

export const LAYER_KIND_ICONS: Record<LayerKind, LucideIcon> = {
  text: Type,
  image: Image,
  shape: Square,
  circle: Circle,
  triangle: Triangle,
  line: Minus,
  icon: Shapes,
  group: Group,
  drawing: PenTool,
}

type DropTarget = { id: string; placement: LayerPlacement }

export function InspectorLayersTab({
  canvas,
  scopeLabel,
  isCover,
  highlight,
}: {
  canvas: Canvas | null
  scopeLabel: string
  isCover: boolean
  /** Outlines an object on the canvas while its row is hovered. */
  highlight: (object: FabricObject | null) => void
}): JSX.Element {
  const { layers, getObject } = useCanvasLayers(canvas)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const anchorIdRef = useRef<string | null>(null)
  const pendingFocusIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const orderedIds = useMemo(() => layers.map((layer) => layer.id), [layers])
  const selectedIds = useMemo(() => layers.filter((layer) => layer.isSelected).map((layer) => layer.id), [layers])
  const selectionKey = selectedIds.join(',')

  const setHoveredLayer = useCallback(
    (id: string | null): void => highlight(id ? getObject(id) : null),
    [getObject, highlight],
  )

  // Leaving the tab mid-hover must not leave an outline stuck on the canvas.
  useEffect(() => () => highlight(null), [highlight])

  const findRow = useCallback((id: string): HTMLElement | null => {
    return scrollRef.current?.querySelector<HTMLElement>(`[data-layer-id="${id}"]`) ?? null
  }, [])

  const focusRow = useCallback(
    (id: string): void => {
      findRow(id)?.querySelector<HTMLElement>('[data-layer-select]')?.focus()
    },
    [findRow],
  )

  // Reordering moves DOM nodes, which drops focus; put it back on the row the keyboard moved.
  useLayoutEffect(() => {
    const id = pendingFocusIdRef.current
    if (!id) return
    pendingFocusIdRef.current = null
    focusRow(id)
  }, [layers, focusRow])

  // Selecting on the canvas scrolls the matching row into view (inside the list only).
  useEffect(() => {
    const firstSelectedId = selectionKey.split(',')[0]
    const container = scrollRef.current
    const row = firstSelectedId ? findRow(firstSelectedId) : null
    if (!container || !row) return
    const containerRect = container.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    if (rowRect.top < containerRect.top) container.scrollTop -= containerRect.top - rowRect.top
    else if (rowRect.bottom > containerRect.bottom) container.scrollTop += rowRect.bottom - containerRect.bottom
  }, [selectionKey, findRow])

  const handleSelect = useCallback(
    (layer: CanvasLayer, event: MouseEvent<HTMLButtonElement>): void => {
      if (!canvas) return
      const mode = event.shiftKey ? 'range' : event.metaKey || event.ctrlKey ? 'toggle' : 'replace'
      // Hidden objects can't be edited; clicking one shouldn't throw away the current selection.
      if (mode === 'replace' && !layer.isVisible) return
      const nextIds = resolveLayerSelection({
        orderedIds,
        selectedIds,
        anchorId: anchorIdRef.current,
        clickedId: layer.id,
        mode,
      })
      if (mode !== 'range') anchorIdRef.current = layer.id
      const objects = nextIds.map(getObject).filter((object): object is FabricObject => object !== null)
      selectLayers(canvas, objects)
    },
    [canvas, getObject, orderedIds, selectedIds],
  )

  const handleToggleVisible = useCallback(
    (layer: CanvasLayer): void => {
      const object = getObject(layer.id)
      if (canvas && object) setLayerVisible(canvas, object, !layer.isVisible)
    },
    [canvas, getObject],
  )

  const handleToggleLocked = useCallback(
    (layer: CanvasLayer): void => {
      const object = getObject(layer.id)
      if (canvas && object) setLayerLocked(canvas, object, !layer.isLocked)
    },
    [canvas, getObject],
  )

  const finishRename = useCallback(
    (layer: CanvasLayer, value: string | null, restoreFocus: boolean): void => {
      setRenamingId(null)
      const object = getObject(layer.id)
      // Confirming the automatic name unchanged must not freeze it (a text layer's name follows its text).
      const isUnchangedAutoName = !layer.hasCustomName && value?.trim() === layer.name
      if (canvas && object && value !== null && !isUnchangedAutoName) renameLayer(canvas, object, value)
      if (restoreFocus) window.requestAnimationFrame(() => focusRow(layer.id))
    },
    [canvas, focusRow, getObject],
  )

  const handleRowKeyDown = useCallback(
    (layer: CanvasLayer, event: KeyboardEvent<HTMLButtonElement>): void => {
      const index = orderedIds.indexOf(layer.id)
      const { key } = event

      if (key === 'ArrowUp' || key === 'ArrowDown') {
        // Arrows navigate the list here; they must not reach the editor's nudge shortcut.
        event.preventDefault()
        event.stopPropagation()
        const isUp = key === 'ArrowUp'
        if (event.altKey) {
          const object = getObject(layer.id)
          if (canvas && object && stepLayer(canvas, object, isUp ? 'up' : 'down')) {
            pendingFocusIdRef.current = layer.id
          }
          return
        }
        const nextId = orderedIds[index + (isUp ? -1 : 1)]
        if (nextId) focusRow(nextId)
        return
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.stopPropagation()
        return
      }
      if (key === 'Home' || key === 'End') {
        event.preventDefault()
        event.stopPropagation()
        const targetId = key === 'Home' ? orderedIds[0] : orderedIds[orderedIds.length - 1]
        if (targetId) focusRow(targetId)
        return
      }
      if (key === 'F2') {
        event.preventDefault()
        event.stopPropagation()
        setRenamingId(layer.id)
        return
      }
      // Delete acts on the canvas selection; from a row that isn't selected it would hit something else.
      if ((key === 'Delete' || key === 'Backspace') && !layer.isSelected) {
        event.stopPropagation()
      }
    },
    [canvas, focusRow, getObject, orderedIds],
  )

  const clearDrag = useCallback((): void => {
    setDraggingId(null)
    setDropTarget(null)
  }, [])

  const handleDragStart = useCallback(
    (layer: CanvasLayer, event: DragEvent<HTMLLIElement>): void => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData(LAYER_DND_MIME, layer.id)
      setHoveredLayer(null)
      setDraggingId(layer.id)
    },
    [setHoveredLayer],
  )

  const handleDragOver = useCallback(
    (layer: CanvasLayer, event: DragEvent<HTMLLIElement>): void => {
      if (!draggingId || !canvas) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const rect = event.currentTarget.getBoundingClientRect()
      const placement: LayerPlacement = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below'
      const moving = getObject(draggingId)
      const anchor = getObject(layer.id)
      // No indicator where the drop wouldn't change anything (the row itself, or its own gap).
      const isNoop = !moving || !anchor || planLayerMoveIndex(canvas.getObjects(), moving, anchor, placement) === null
      setDropTarget((previous) => {
        if (isNoop) return null
        if (previous?.id === layer.id && previous.placement === placement) return previous
        return { id: layer.id, placement }
      })
    },
    [canvas, draggingId, getObject],
  )

  const handleDrop = useCallback(
    (event: DragEvent<HTMLLIElement>): void => {
      if (!draggingId) return
      event.preventDefault()
      const moving = getObject(draggingId)
      const anchor = dropTarget ? getObject(dropTarget.id) : null
      if (canvas && moving && anchor && dropTarget) moveLayer(canvas, moving, anchor, dropTarget.placement)
      clearDrag()
    },
    [canvas, clearDrag, draggingId, dropTarget, getObject],
  )

  const count = layers.length
  const surfaceName = isCover ? 'cover' : 'page'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 truncate px-3 pb-1 pt-2.5 text-[11px] text-muted-foreground">
        {scopeLabel} · {count} {count === 1 ? 'layer' : 'layers'}
      </p>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-1.5">
        {count === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-5 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Layers className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <p className="text-sm font-medium">{canvas ? 'No layers yet' : 'Loading layers…'}</p>
            {canvas && (
              <p className="text-xs leading-snug text-muted-foreground">
                Text, images and shapes you add to this {surfaceName} show up here.
              </p>
            )}
          </div>
        ) : (
          <ul
            aria-label={`Layers on ${scopeLabel}`}
            className="flex flex-col gap-0.5"
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null)
            }}
          >
            {layers.map((layer) => (
              <LayerRow
                key={layer.id}
                layer={layer}
                isRenaming={renamingId === layer.id}
                isDragging={draggingId === layer.id}
                dropPlacement={dropTarget?.id === layer.id ? dropTarget.placement : null}
                onSelect={handleSelect}
                onStartRename={setRenamingId}
                onFinishRename={finishRename}
                onToggleVisible={handleToggleVisible}
                onToggleLocked={handleToggleLocked}
                onKeyDown={handleRowKeyDown}
                onHover={setHoveredLayer}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onDragEnd={clearDrag}
              />
            ))}
          </ul>
        )}
      </div>

      {count > 0 && (
        <p className="shrink-0 border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          Drag to reorder · Double-click to rename
        </p>
      )}
    </div>
  )
}

type LayerRowProps = {
  layer: CanvasLayer
  isRenaming: boolean
  isDragging: boolean
  dropPlacement: LayerPlacement | null
  onSelect: (layer: CanvasLayer, event: MouseEvent<HTMLButtonElement>) => void
  onStartRename: (id: string) => void
  onFinishRename: (layer: CanvasLayer, value: string | null, restoreFocus: boolean) => void
  onToggleVisible: (layer: CanvasLayer) => void
  onToggleLocked: (layer: CanvasLayer) => void
  onKeyDown: (layer: CanvasLayer, event: KeyboardEvent<HTMLButtonElement>) => void
  onHover: (id: string | null) => void
  onDragStart: (layer: CanvasLayer, event: DragEvent<HTMLLIElement>) => void
  onDragOver: (layer: CanvasLayer, event: DragEvent<HTMLLIElement>) => void
  onDrop: (event: DragEvent<HTMLLIElement>) => void
  onDragEnd: () => void
}

function LayerRow({
  layer,
  isRenaming,
  isDragging,
  dropPlacement,
  onSelect,
  onStartRename,
  onFinishRename,
  onToggleVisible,
  onToggleLocked,
  onKeyDown,
  onHover,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: LayerRowProps): JSX.Element {
  const KindIcon = LAYER_KIND_ICONS[layer.kind]
  const iconClassName = cn(
    'size-3.5 shrink-0',
    layer.isSelected ? 'text-primary-text' : 'text-muted-foreground',
    !layer.isVisible && 'opacity-50',
  )

  return (
    <li
      data-layer-id={layer.id}
      draggable={!isRenaming}
      onDragStart={(event) => onDragStart(layer, event)}
      onDragOver={(event) => onDragOver(layer, event)}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onHover(layer.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'group relative flex h-8 items-center gap-0.5 rounded-md pr-1 text-[13px] transition-colors',
        layer.isSelected ? 'bg-primary/10 dark:bg-primary/25' : 'hover:bg-accent/70',
        isDragging && 'opacity-40',
      )}
    >
      {dropPlacement && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded-full bg-primary-text',
            dropPlacement === 'above' ? '-top-[2px]' : '-bottom-[2px]',
          )}
        />
      )}

      {isRenaming ? (
        <div className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2">
          <KindIcon className={iconClassName} aria-hidden />
          <LayerNameInput
            initialValue={layer.name}
            onCommit={(value, restoreFocus) => onFinishRename(layer, value, restoreFocus)}
            onCancel={() => onFinishRename(layer, null, true)}
          />
        </div>
      ) : (
        <button
          type="button"
          data-layer-select
          aria-pressed={layer.isSelected}
          title={layer.isVisible ? undefined : 'Hidden — show it to select it on the canvas'}
          onClick={(event) => onSelect(layer, event)}
          onDoubleClick={() => onStartRename(layer.id)}
          onKeyDown={(event) => onKeyDown(layer, event)}
          className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <KindIcon className={iconClassName} aria-hidden />
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              layer.isVisible ? 'text-foreground' : 'text-muted-foreground',
              layer.isSelected && 'font-medium',
            )}
          >
            {layer.name}
          </span>
        </button>
      )}

      <LayerToggleButton
        label={layer.isLocked ? 'Unlock' : 'Lock'}
        isActive={layer.isLocked}
        Icon={layer.isLocked ? Lock : LockOpen}
        onClick={() => onToggleLocked(layer)}
      />
      <LayerToggleButton
        label={layer.isVisible ? 'Hide' : 'Show'}
        isActive={!layer.isVisible}
        Icon={layer.isVisible ? Eye : EyeOff}
        onClick={() => onToggleVisible(layer)}
      />
    </li>
  )
}

/** Lock/visibility toggle: revealed on row hover or focus, and always shown when not in its default state. */
function LayerToggleButton({
  label,
  isActive,
  Icon,
  onClick,
}: {
  label: string
  isActive: boolean
  Icon: LucideIcon
  onClick: () => void
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${label} layer`}
          aria-pressed={isActive}
          onClick={(event) => {
            event.stopPropagation()
            onClick()
          }}
          className={cn(
            'flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-opacity hover:bg-background/80 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            isActive
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function LayerNameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string
  onCommit: (value: string, restoreFocus: boolean) => void
  onCancel: () => void
}): JSX.Element {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const isDoneRef = useRef(false)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const finish = (commit: boolean, restoreFocus: boolean): void => {
    if (isDoneRef.current) return
    isDoneRef.current = true
    if (commit) onCommit(value, restoreFocus)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      value={value}
      maxLength={LAYER_NAME_MAX_LENGTH}
      aria-label="Layer name"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(true, false)}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Enter') {
          event.preventDefault()
          finish(true, true)
        } else if (event.key === 'Escape') {
          event.preventDefault()
          finish(false, true)
        }
      }}
      className="h-6 min-w-0 flex-1 rounded border border-ring bg-background px-1.5 text-[13px] text-foreground outline-none"
    />
  )
}
