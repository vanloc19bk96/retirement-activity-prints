import { useStudioBookBuilder } from '@/hooks/studio/use-studio-book-builder'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StudioBookRandomForm } from './StudioBookRandomForm'
import { StudioBookGameList } from './StudioBookGameList'
import { StudioGenerateProgressDialog } from './StudioGenerateProgressDialog'
import { ToggleField } from './fields/ToggleField'
import type { StudioBookMode, StudioConfigField } from '@/types/studio-template.types'

const MODE_OPTIONS: { value: StudioBookMode; label: string }[] = [
  { value: 'random', label: 'Random mix' },
  { value: 'choose', label: 'Choose games' },
]

const TITLE_FIELD: StudioConfigField = {
  key: 'showTitle',
  label: 'Number pages “Game N”',
  type: 'toggle',
  default: true,
}

export function StudioBookBuilderPanel() {
  const { state, actions } = useStudioBookBuilder()

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) actions.cancel()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-0.5">
        <p className="text-xs text-muted-foreground">
          Generate a whole book at once — pick a random mix or choose games and quantities.
        </p>

        <div
          className="flex gap-1 rounded-md bg-muted p-1"
          role="tablist"
          aria-label="Book mode"
        >
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={state.mode === option.value}
              onClick={() => actions.setMode(option.value)}
              className={cn(
                'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                state.mode === option.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {state.mode === 'random' ? (
          <StudioBookRandomForm
            gameCount={state.gameCount}
            categories={state.categories}
            onGameCountChange={actions.setGameCount}
            onToggleCategory={actions.toggleCategory}
          />
        ) : (
          <StudioBookGameList
            rows={state.rows}
            order={state.order}
            layout={state.layout}
            pageHeader={state.pageHeader}
            onOrderChange={actions.setOrder}
            onAddRow={actions.addRow}
            onRemoveRow={actions.removeRow}
            onTemplateChange={actions.setRowTemplate}
            onQuantityChange={actions.setRowQuantity}
            onConfigChange={actions.setRowConfig}
          />
        )}

        <ToggleField
          field={TITLE_FIELD}
          value={state.showTitle}
          onChange={actions.setShowTitle}
        />

        <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{state.gameTotal}</span> games ·
          ≈ <span className="font-semibold text-foreground">{state.estimatedPages}</span> pages
          {state.titlePreview ? (
            <>
              {' · '}
              <span className="text-foreground">{state.titlePreview}</span>
            </>
          ) : null}
        </div>

        {state.validationError ? (
          <p className="text-sm text-destructive" role="alert">
            {state.validationError}
          </p>
        ) : null}
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        {state.note && !state.error ? (
          <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">
            {state.note}
          </p>
        ) : null}
      </div>

      <div className="shrink-0">
        <Button
          className="w-full"
          onClick={() => void actions.handleGenerate()}
          disabled={state.isGenerateDisabled}
        >
          {state.generateLabel}
        </Button>
      </div>

      <StudioGenerateProgressDialog
        open={state.isGenerating}
        progress={state.progress}
        label="Building your book…"
        onCancel={actions.cancel}
        onOpenChange={handleDialogOpenChange}
      />
    </div>
  )
}
