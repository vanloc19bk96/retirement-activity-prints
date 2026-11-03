import { useCanvasSave } from '@/context/CanvasSaveContext'

export function SavePanel(): JSX.Element {
  const { isSaving, error, lastSavedAt, hasUnsavedChanges } = useCanvasSave()

  return (
    <section className="w-full space-y-5 rounded-lg border border-border bg-card p-4">
      <header className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Save</h3>
        <p className="text-xs text-muted-foreground">
          Changes save automatically a few seconds after you make them. Click the Save icon in the sidebar to save
          right away.
        </p>
      </header>

      <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-foreground">Status</span>
          <span className="text-muted-foreground">
            {isSaving ? 'Saving…' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes saved'}
          </span>
        </div>

        {lastSavedAt && (
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Last saved</span>
            <span className="text-muted-foreground">{lastSavedAt.toLocaleString()}</span>
          </div>
        )}

        {error && <p className="text-xs text-destructive-text">Error: {error}</p>}
      </div>
    </section>
  )
}

