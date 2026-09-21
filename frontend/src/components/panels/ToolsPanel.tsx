import { Eraser, PenLine, Pencil } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCanvasPenTool } from '@/context/CanvasPenToolContext'

export function ToolsPanel(): JSX.Element {
  const { isPenToolActive, isPencilToolActive, isEraseToolActive, togglePenTool, togglePencilTool, toggleEraseTool } =
    useCanvasPenTool()

  return (
    <section className="flex w-full flex-col gap-4" aria-label="Tools">
      <header className="space-y-1">
        <h2 className="text-sm font-semibold text-foreground">Tools</h2>
        <p className="text-xs text-muted-foreground">Drawing and editing modes for the canvas</p>
      </header>

      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant={isPenToolActive ? 'default' : 'outline'}
            className="w-full shrink-0 justify-center gap-2 shadow-none"
            onClick={togglePenTool}
            aria-pressed={isPenToolActive}
            aria-describedby="path-tool-hint"
          >
            <PenLine className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-sm font-medium">Path tool</span>
          </Button>
          <p
            id="path-tool-hint"
            className="text-xs leading-relaxed text-muted-foreground break-words [overflow-wrap:anywhere]"
          >
            Click the canvas to start drawing. Click near the starting point to close the path. Hold Shift to
            constrain segments to 45° steps (horizontal, vertical, diagonals). Double-click or Enter to finish;
            Esc cancels.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant={isPencilToolActive ? 'default' : 'outline'}
            className="w-full shrink-0 justify-center gap-2 shadow-none"
            onClick={togglePencilTool}
            aria-pressed={isPencilToolActive}
            aria-describedby="pencil-tool-hint"
          >
            <Pencil className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-sm font-medium">Pencil tool</span>
          </Button>
          <p
            id="pencil-tool-hint"
            className="text-xs leading-relaxed text-muted-foreground break-words [overflow-wrap:anywhere]"
          >
            Drag on the canvas to draw freehand strokes. Turn the tool off to select and edit objects again.
          </p>
        </div>

        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <Button
            type="button"
            variant={isEraseToolActive ? 'default' : 'outline'}
            className="w-full shrink-0 justify-center gap-2 shadow-none"
            onClick={toggleEraseTool}
            aria-pressed={isEraseToolActive}
            aria-describedby="erase-tool-hint"
          >
            <Eraser className="h-4 w-4 shrink-0" aria-hidden />
            <span className="text-sm font-medium">Erase tool</span>
          </Button>
          <p
            id="erase-tool-hint"
            className="text-xs leading-relaxed text-muted-foreground break-words [overflow-wrap:anywhere]"
          >
            Drag over an image to erase pixels. Adjust brush size from the toolbar. Turn the tool off to select and
            edit objects again.
          </p>
        </div>
      </div>
    </section>
  )
}
