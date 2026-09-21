import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

function sliderIndex(values: number[], value: number): number {
  const exact = values.indexOf(value)
  if (exact >= 0) return exact
  let best = 0
  let bestDist = Math.abs(value - values[0])
  for (let i = 1; i < values.length; i += 1) {
    const dist = Math.abs(value - values[i])
    if (dist < bestDist) {
      best = i
      bestDist = dist
    }
  }
  return best
}

export function NumberField({ field, value, onChange, error }: StudioFieldProps<number>) {
  const values = field.values
  const min = field.min ?? 0
  const max = field.max ?? 100
  const step = field.step ?? 1
  const display = step < 1 && !values ? value.toFixed(2) : String(value)

  if (values && values.length > 0) {
    const index = sliderIndex(values, value)
    return (
      <FieldShell
        label={field.label}
        help={field.help}
        warning={field.warning}
        error={error}
        action={<span className="text-xs tabular-nums text-muted-foreground">{display}</span>}
      >
        <input
          type="range"
          value={index}
          min={0}
          max={values.length - 1}
          step={1}
          onChange={(e) => onChange(values[Number(e.target.value)] ?? values[0])}
          aria-label={field.label}
          className="h-8 w-full accent-primary"
        />
      </FieldShell>
    )
  }

  return (
    <FieldShell
      label={field.label}
      help={field.help}
      warning={field.warning}
      error={error}
      action={<span className="text-xs tabular-nums text-muted-foreground">{display}</span>}
    >
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={field.label}
        className="h-8 w-full accent-primary"
      />
    </FieldShell>
  )
}
