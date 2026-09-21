import { setTextDragData } from '@/utils/text-dnd'

export function TextPanel(): JSX.Element {
  const handleHeadingDragStart = (event: React.DragEvent<HTMLButtonElement>): void => {
    setTextDragData(event.dataTransfer, { text: 'Heading', fontSize: 48, fontWeight: 700 })
  }

  const handleSubheadingDragStart = (event: React.DragEvent<HTMLButtonElement>): void => {
    setTextDragData(event.dataTransfer, { text: 'Subheading', fontSize: 32, fontWeight: 600 })
  }

  const handleBodyDragStart = (event: React.DragEvent<HTMLButtonElement>): void => {
    setTextDragData(event.dataTransfer, { text: 'Body text', fontSize: 20, fontWeight: 'normal' })
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold tracking-tight text-muted-foreground">
        Text Elements
      </h2>
      <p className="text-xs text-muted-foreground">
        Add and customize text on your canvas
      </p>

      <div className="mt-2 space-y-2">
        <button
          type="button"
          className="w-full cursor-grab rounded-md border bg-card px-4 py-3 text-left transition-colors hover:bg-accent active:cursor-grabbing"
          draggable
          onDragStart={handleHeadingDragStart}
          title="Drag onto the canvas to place it"
        >
          <span className="block text-lg font-semibold text-foreground">
            Heading
          </span>
        </button>

        <button
          type="button"
          className="w-full cursor-grab rounded-md border bg-card px-4 py-3 text-left transition-colors hover:bg-accent active:cursor-grabbing"
          draggable
          onDragStart={handleSubheadingDragStart}
          title="Drag onto the canvas to place it"
        >
          <span className="block text-base font-medium text-foreground">
            Subheading
          </span>
        </button>

        <button
          type="button"
          className="w-full cursor-grab rounded-md border bg-card px-4 py-3 text-left transition-colors hover:bg-accent active:cursor-grabbing"
          draggable
          onDragStart={handleBodyDragStart}
          title="Drag onto the canvas to place it"
        >
          <span className="block text-sm text-foreground">
            Body Text
          </span>
        </button>
      </div>
    </div>
  )
}

