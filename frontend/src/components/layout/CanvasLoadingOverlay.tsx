import { Loader2 } from 'lucide-react'

/**
 * Full-surface loading overlay shown while the canvas is restoring or waiting
 * to become active. Must be rendered inside a `position: relative` parent.
 */
export function CanvasLoadingOverlay(): JSX.Element {
  return (
    <div
      className="absolute inset-0 z-[110] flex flex-col items-center justify-center gap-2 bg-background/80 text-muted-foreground"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="size-8 animate-spin" aria-hidden />
      <span className="text-sm font-medium">Loading canvas…</span>
    </div>
  )
}
