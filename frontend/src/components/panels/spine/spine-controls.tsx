import { Check } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

export function SpineSection({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}): JSX.Element {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function SpineFieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }): JSX.Element {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-foreground">
      {children}
    </label>
  )
}

export function SpineSegmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
}): JSX.Element {
  return (
    <div
      className="grid gap-1 rounded-md border border-input bg-muted/40 p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`h-7 rounded px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function SpineSwatches({
  colors,
  value,
  onSelect,
  label,
}: {
  colors: readonly string[]
  value: string
  onSelect: (color: string) => void
  label: string
}): JSX.Element {
  const selected = value.toLowerCase()
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {colors.map((color) => {
        const isActive = color.toLowerCase() === selected
        return (
          <button
            key={color}
            type="button"
            title={color}
            aria-label={`${label} ${color}`}
            aria-pressed={isActive}
            onClick={() => onSelect(color)}
            className={`relative h-7 w-7 rounded-md border shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              isActive ? 'border-foreground ring-2 ring-[var(--color-control-accent)] ring-offset-1 ring-offset-background' : 'border-border'
            }`}
            style={{ backgroundColor: color }}
          >
            {isActive && (
              <Check
                className="absolute inset-0 m-auto h-3.5 w-3.5 drop-shadow"
                style={{ color: contrastIconColor(color) }}
                aria-hidden
              />
            )}
          </button>
        )
      })}
    </div>
  )
}

export function SpineColorInput({
  id,
  value,
  onChange,
  label,
}: {
  id: string
  value: string
  onChange: (color: string) => void
  label: string
}): JSX.Element {
  // Local draft so a half-typed hex value is not reverted on each keystroke.
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border bg-transparent"
        aria-label={label}
      />
      <input
        type="text"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value)
          const next = event.target.value.trim()
          if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next.toLowerCase())
        }}
        onBlur={() => setDraft(value)}
        className="h-8 w-full rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
        aria-label={`${label} hex value`}
        spellCheck={false}
      />
    </div>
  )
}

function contrastIconColor(hex: string): string {
  const value = Number.parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(value)) return '#000000'
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? '#000000' : '#ffffff'
}
