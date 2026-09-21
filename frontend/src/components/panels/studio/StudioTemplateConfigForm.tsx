import { useStudioTemplateConfigForm } from '@/hooks/studio/use-studio-template-config-form'
import { Button } from '@/components/ui/button'
import { StudioConfigField } from './StudioConfigField'
import { StudioGenerateProgressDialog } from './StudioGenerateProgressDialog'
import type { StudioTemplateDefinition } from '@/types/studio-template.types'

interface Props {
  template: StudioTemplateDefinition
  onBack: () => void
}

export function StudioTemplateConfigForm({ template, onBack }: Props) {
  const { state, actions } = useStudioTemplateConfigForm(template)

  const handleBack = () => {
    if (state.isGenerating) actions.cancel()
    onBack()
  }

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) actions.cancel()
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-0.5">
        <p className="text-xs text-muted-foreground">{template.description}</p>

        {template.showsCanvasEditHint ? (
          <p
            role="note"
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400"
          >
            {template.canvasEditHint ??
              'Want to change it afterwards? Click the puzzle on the page, hit Ungroup, then add emojis, icons or your own artwork from Components.'}
          </p>
        ) : null}

        {state.visibleFields.map((field) => (
          <StudioConfigField
            key={field.key}
            field={field}
            value={state.config[field.key]}
            onChange={(v) => actions.setField(field.key, v)}
            error={
              state.configError?.field === field.key ? state.configError.message : null
            }
          />
        ))}

        {state.configError && !state.configError.field ? (
          <p className="text-sm text-destructive" role="alert">
            {state.configError.message}
          </p>
        ) : null}
        {state.error ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 gap-2">
        <Button
          variant="ghost"
          className="flex-1"
          onClick={handleBack}
          disabled={state.isGenerating}
        >
          Cancel
        </Button>
        <Button
          className="flex-1"
          onClick={() => void actions.handleGenerate()}
          disabled={state.isGenerateDisabled}
        >
          {state.generateLabel}
        </Button>
      </div>

      <StudioGenerateProgressDialog
        open={state.isGenerating}
        progress={state.progress}
        label={state.progressLabel}
        onCancel={actions.cancel}
        onOpenChange={handleDialogOpenChange}
      />
    </div>
  )
}
