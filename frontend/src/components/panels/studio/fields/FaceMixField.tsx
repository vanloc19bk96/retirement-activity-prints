import { useMemo, useState, type DragEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  MAX_FACE_NAME_LENGTH,
  parseFaceMixEntries,
  type FaceMixEntry,
} from '@/utils/studio/face-name-recall/face-specs'
import { describeFaceMixEntry } from '@/utils/studio/face-name-recall/face-mix-labels'
import {
  renderFaceMixSvg,
  svgToImgSrc,
} from '@/utils/studio/face-name-recall/face-preview'
import { setFaceCardDragData } from '@/utils/face-card-dnd'
import { FaceMixDialog } from '../FaceMixDialog'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

/** Hand-picked cast for Face–Name Association: add, name, edit and remove faces. */
export function FaceMixField({ field, value, onChange, error }: StudioFieldProps) {
  const entries = useMemo(() => parseFaceMixEntries(value), [value])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editing, setEditing] = useState<FaceMixEntry | null>(null)

  const openAdd = () => {
    setEditing(null)
    setIsDialogOpen(true)
  }

  const openEdit = (entry: FaceMixEntry) => {
    setEditing(entry)
    setIsDialogOpen(true)
  }

  const handleSubmit = (entry: FaceMixEntry) => {
    const isKnown = entries.some((row) => row.id === entry.id)
    onChange(
      isKnown ? entries.map((row) => (row.id === entry.id ? entry : row)) : [...entries, entry],
    )
  }

  const handleRename = (id: string, name: string) => {
    onChange(
      entries.map((row) =>
        row.id === id ? { ...row, name: name.slice(0, MAX_FACE_NAME_LENGTH) } : row,
      ),
    )
  }

  const handleRemove = (id: string) => {
    onChange(entries.filter((row) => row.id !== id))
  }

  const handleDragStart = (event: DragEvent<HTMLElement>, entry: FaceMixEntry) => {
    setFaceCardDragData(event.dataTransfer, { entry })
  }

  return (
    <FieldShell
      label={field.label}
      help={field.help}
      error={error}
      action={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={openAdd}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add face
        </Button>
      }
    >
      {entries.length === 0 ? (
        <button
          type="button"
          onClick={openAdd}
          className="rounded-md border border-dashed border-input px-3 py-6 text-xs text-muted-foreground hover:border-ring hover:text-foreground"
        >
          No faces yet — add your first one.
        </button>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {entries.length} {entries.length === 1 ? 'face' : 'faces'} · click to edit,
            drag onto the page to place one
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1">
                <div className="relative">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) => handleDragStart(event, entry)}
                    onClick={() => openEdit(entry)}
                    className="block w-full cursor-grab overflow-hidden rounded-md border border-border bg-white p-1 hover:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring active:cursor-grabbing"
                    title="Click to edit · drag onto the page"
                  >
                    <img
                      src={svgToImgSrc(renderFaceMixSvg(entry))}
                      alt={describeFaceMixEntry(entry)}
                      draggable={false}
                      className="aspect-square w-full object-contain"
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(entry.id)}
                    aria-label={`Remove face: ${describeFaceMixEntry(entry)}`}
                    className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </div>
                <input
                  value={entry.name}
                  onChange={(event) => handleRename(entry.id, event.target.value)}
                  placeholder="Auto name"
                  maxLength={MAX_FACE_NAME_LENGTH}
                  aria-label={`Name for ${describeFaceMixEntry(entry)}`}
                  className="h-7 w-full rounded-md border border-input bg-background px-1.5 text-center text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                />
              </li>
            ))}
          </ul>
        </>
      )}

      <FaceMixDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        entry={editing}
        onSubmit={handleSubmit}
      />
    </FieldShell>
  )
}
