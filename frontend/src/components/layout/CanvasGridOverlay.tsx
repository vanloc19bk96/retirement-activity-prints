type CanvasGridOverlayProps = {
  zoom: number
  /** Spacing between grid lines in logical (1×) canvas pixels */
  cellLogicalPx?: number
}

export function CanvasGridOverlay({
  zoom,
  cellLogicalPx = 20,
}: CanvasGridOverlayProps): JSX.Element {
  const cell = Math.max(2, cellLogicalPx * zoom)

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      style={{
        backgroundImage: `
          linear-gradient(to right, rgba(148, 163, 184, 0.4) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.4) 1px, transparent 1px)
        `,
        backgroundSize: `${cell}px ${cell}px`,
      }}
      aria-hidden="true"
    />
  )
}
