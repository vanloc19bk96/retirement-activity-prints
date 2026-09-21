import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

function asSelected(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v)).filter(Boolean)
}

/** Multi-option topic picker — stores selected values as string[]. */
export function MultiSelectField({
  field,
  value,
  onChange,
  error,
}: StudioFieldProps<string[]>) {
  const options = field.options ?? []
  const selected = asSelected(value)
  const selectedSet = new Set(selected)

  function toggle(optionValue: string) {
    if (selectedSet.has(optionValue)) {
      onChange(selected.filter((v) => v !== optionValue))
      return
    }
    onChange([...selected, optionValue])
  }

  return (
    <FieldShell label={field.label} help={field.help} warning={field.warning} error={error}>
      <div
        role="group"
        aria-label={field.label}
        className="flex flex-col gap-1 rounded-md border border-input bg-background p-1.5"
      >
        {options.map((opt) => {
          const raw = String(opt.value)
          const isChecked = selectedSet.has(raw)
          return (
            <label
              key={raw}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-xs text-foreground hover:bg-muted/60"
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggle(raw)}
                className="size-3.5 shrink-0 rounded-sm border border-input accent-foreground"
                aria-label={opt.label}
              />
              <span>{opt.label}</span>
            </label>
          )
        })}
      </div>
    </FieldShell>
  )
}
