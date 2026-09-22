import { FieldShell } from './FieldShell'
import { STUDIO_FIELD_INPUT_CLASS } from './field-input-classes'
import type { StudioFieldProps } from '../StudioConfigField'

export function TextField({ field, value, onChange, error }: StudioFieldProps<string>) {
  const maxLength = field.max != null ? Number(field.max) : undefined
  return (
    <FieldShell
      htmlFor={field.key}
      label={field.label}
      help={field.help}
      // Text fields are where a seller types a theme of their own, so they are
      // the one place the IP warning has to land. Every other field type
      // already forwards it.
      warning={field.warning}
      error={error}
    >
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
