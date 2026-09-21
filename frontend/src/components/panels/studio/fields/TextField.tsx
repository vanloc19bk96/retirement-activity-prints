import { FieldShell } from './FieldShell'
import { STUDIO_FIELD_INPUT_CLASS } from './field-input-classes'
import type { StudioFieldProps } from '../StudioConfigField'

export function TextField({ field, value, onChange, error }: StudioFieldProps<string>) {
  const maxLength = field.max != null ? Number(field.max) : undefined
  return (
    <FieldShell htmlFor={field.key} label={field.label} help={field.help} error={error}>
      <input
        id={field.key}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        placeholder={String(field.default ?? '')}
        aria-label={field.label}
        aria-invalid={error ? true : undefined}
        className={STUDIO_FIELD_INPUT_CLASS}
      />
    </FieldShell>
  )
}
