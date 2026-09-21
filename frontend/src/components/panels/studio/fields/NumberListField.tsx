import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

function toLines(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => String(v)).join('\n')
  return String(value ?? '')
}

function linesFromText(raw: string): string[] {
  return raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

/**
 * Day intervals — one number per line (commas also ok).
 * Keeps raw lines (including blanks) so Enter works while typing.
 */
export function NumberListField({
  field,
  value,
  onChange,
  error,
}: StudioFieldProps<number[] | string[] | string>) {
  const text = toLines(value)

  return (
    <FieldShell htmlFor={field.key} label={field.label} help={field.help} error={error}>
      <textarea
        id={field.key}
        value={text}
        onChange={(e) => onChange(linesFromText(e.target.value))}
        rows={4}
        spellCheck={false}
        inputMode="numeric"
        aria-label={field.label}
        aria-invalid={Boolean(error)}
        placeholder={'1\n3\n7\n21'}
        className="flex min-h-[5rem] w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      />
    </FieldShell>
  )
}
