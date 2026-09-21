import { FieldShell } from './FieldShell'
import { STUDIO_FIELD_INPUT_CLASS } from './field-input-classes'
import type { StudioFieldProps } from '../StudioConfigField'

export function ColorField({ field, value, onChange, error }: StudioFieldProps<string>) {
  return (
    <FieldShell label={field.label} help={field.help} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
          aria-label={field.label}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${STUDIO_FIELD_INPUT_CLASS} flex-1 font-mono`}
        />
      </div>
    </FieldShell>
  )
}
