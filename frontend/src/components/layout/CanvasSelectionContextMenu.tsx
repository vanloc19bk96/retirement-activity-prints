import { ClipboardPaste, Copy, Trash2 } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'

type CanvasSelectionContextMenuProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  anchorPoint: { x: number; y: number }
  canPaste: boolean
  canCopy: boolean
  canDelete: boolean
  canFitFullFront?: boolean
  canFitFullBack?: boolean
  onCopy: () => void
  onPaste: () => void
  onDelete: () => void
  onFitFullFront?: () => void
  onFitFullBack?: () => void
}

const menuItemClass =
  'flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none ' +
  'hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring'

const kbdClass =
  'ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground'

export function CanvasSelectionContextMenu({
  isOpen,
  onOpenChange,
  anchorPoint,
  canPaste,
  canCopy,
  canDelete,
  canFitFullFront = false,
  canFitFullBack = false,
  onCopy,
  onPaste,
  onDelete,
  onFitFullFront,
  onFitFullBack,
}: CanvasSelectionContextMenuProps): JSX.Element {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <PopoverAnchor asChild>
        <div
          aria-hidden
          className="pointer-events-none fixed z-40 h-px w-px"
          style={{ left: anchorPoint.x, top: anchorPoint.y }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        role="menu"
        aria-label="Selection actions"
        className="w-auto min-w-[12rem] border border-border p-1 text-popover-foreground opacity-100 shadow-md"
        style={{ backgroundColor: 'var(--color-background)' }}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <button
          type="button"
          role="menuitem"
          className={`${menuItemClass} disabled:pointer-events-none disabled:opacity-40`}
          disabled={!canCopy}
          aria-disabled={!canCopy}
          onClick={() => onCopy()}
        >
          <Copy className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>Copy</span>
          <kbd className={kbdClass}>Ctrl+C</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          className={`${menuItemClass} disabled:pointer-events-none disabled:opacity-40`}
          disabled={!canPaste}
          aria-disabled={!canPaste}
          onClick={() => {
            if (!canPaste) return
            onPaste()
          }}
        >
          <ClipboardPaste className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>Paste</span>
          <kbd className={kbdClass}>Ctrl+V</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          className={`${menuItemClass} disabled:pointer-events-none disabled:opacity-40`}
          disabled={!canDelete}
          aria-disabled={!canDelete}
          onClick={() => onDelete()}
        >
          <Trash2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span>Delete</span>
          <kbd className={kbdClass}>DELETE</kbd>
        </button>
        {(canFitFullFront || canFitFullBack) && <div className="my-1 h-px bg-border" aria-hidden />}
        {canFitFullFront && onFitFullFront && (
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => onFitFullFront()}
          >
            <span>Fit Full Front</span>
          </button>
        )}
        {canFitFullBack && onFitFullBack && (
          <button
            type="button"
            role="menuitem"
            className={menuItemClass}
            onClick={() => onFitFullBack()}
          >
            <span>Fit Full Back</span>
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
