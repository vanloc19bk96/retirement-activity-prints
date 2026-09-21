import {
  Group,
  Lock,
  MoreHorizontal,
  Trash2,
  Ungroup,
  Unlock,
} from 'lucide-react'

export type CanvasSelectionFloatingToolbarPosition = {
  left: number
  top: number
}

type CanvasSelectionFloatingToolbarProps = {
  position: CanvasSelectionFloatingToolbarPosition | null
  canDelete: boolean
  canGroup: boolean
  canUngroup: boolean
  isLocked: boolean
  isTextSelection?: boolean
  onDelete: () => void
  onGroup: () => void
  onUngroup: () => void
  onToggleLock: () => void
  onOpenMenu: (clientX: number, clientY: number) => void
}

export function CanvasSelectionFloatingToolbar({
  position,
  canDelete,
  canGroup,
  canUngroup,
  isLocked,
  isTextSelection: _isTextSelection = false,
  onDelete,
  onGroup,
  onUngroup,
  onToggleLock,
  onOpenMenu,
}: CanvasSelectionFloatingToolbarProps): JSX.Element | null {
  if (!position) return null

  return (
    <div
      className="absolute z-[120] flex -translate-x-1/2 -translate-y-full items-center"
      style={{ left: position.left, top: position.top - 8 }}
      role="toolbar"
      aria-label="Selection actions"
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        className="flex items-center gap-1 rounded-md border border-border bg-background p-1 text-foreground shadow-md"
        role="group"
        aria-label="Object actions"
      >
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onClick={onToggleLock}
          aria-label={isLocked ? 'Unlock selection' : 'Lock selection'}
          aria-pressed={isLocked}
        >
          {isLocked ? <Lock className="h-4 w-4" aria-hidden /> : <Unlock className="h-4 w-4" aria-hidden />}
        </button>

        {canGroup && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onGroup}
            aria-label="Group selection"
            title="Group"
          >
            <Group className="h-4 w-4" aria-hidden />
          </button>
        )}
        {canUngroup && (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
            onClick={onUngroup}
            aria-label="Ungroup selection"
            title="Ungroup"
          >
            <Ungroup className="h-4 w-4" aria-hidden />
          </button>
        )}

        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
          disabled={!canDelete}
          onClick={onDelete}
          aria-label="Delete selection"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect()
            onOpenMenu(rect.left + rect.width / 2, rect.bottom)
          }}
          aria-label="More selection actions"
          aria-haspopup="menu"
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
