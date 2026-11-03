import { TriangleAlert } from 'lucide-react'

import { Button } from '@/components/ui/button'

/**
 * Covers a canvas whose saved content could not load: anything drawn on it would be lost, because
 * Save and Export keep using the saved snapshot until a load succeeds.
 */
export function CanvasRestoreFailedOverlay({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div
      className="absolute inset-0 z-[110] flex flex-col items-center justify-center gap-3 bg-background p-4 text-center"
      role="alert"
    >
      <TriangleAlert className="size-8 text-destructive" aria-hidden />
      <span className="text-sm font-medium">Images on this page could not load</span>
      <span className="max-w-xs text-xs text-muted-foreground">
        Your saved page is unchanged. Check your connection and try again.
      </span>
      <Button type="button" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}
