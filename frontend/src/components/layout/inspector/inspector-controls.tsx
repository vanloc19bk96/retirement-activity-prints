import { useId, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** A titled block of the inspector, separated from the next by a rule. */
export function InspectorSection({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}): JSX.Element {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="border-b border-border px-3 py-3 last:border-b-0">
      <div className="mb-2 flex min-h-5 items-center justify-between gap-2">
        <h3 id={headingId} className="text-xs font-semibold text-foreground">
          {title}
          {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Small square icon button with a tooltip; `isActive` renders it as a pressed toggle. */
export function InspectorIconButton({
  label,
  Icon,
  onClick,
  isActive,
  disabled,
  className,
}: {
  label: string
  Icon: LucideIcon
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  className?: string
}): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={isActive}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'flex h-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
            isActive && 'border-border bg-background text-foreground shadow-sm',
            className,
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

type NumberFieldProps = {
  /** Short visible prefix inside the field, e.g. "X", "W" or an icon. */
  prefix?: ReactNode
  /** Full name for screen readers, e.g. "Width". */
  label: string
  /** Null shows "Mixed": the selected objects differ. */
  value: number | null
  onCommit: (value: number) => void
  unit?: string
  decimals?: number
  step?: number
  min?: number
  max?: number
  disabled?: boolean
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value
  if (min !== undefined) next = Math.max(min, next)
  if (max !== undefined) next = Math.min(max, next)
  return next
}

function formatNumber(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)))
}

function parseNumber(text: string): number | null {
  const normalized = text.trim().replace(',', '.')
  if (!normalized) return null
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

/**
 * Numeric input for exact values. Typing is a draft until Enter or leaving the field; Escape
 * restores the value; ↑/↓ step it (Shift for ten steps), the way design tools behave.
 */
export function NumberField({
  prefix,
  label,
  value,
  onCommit,
  unit,
  decimals = 2,
  step = 1,
  min,
  max,
  disabled,
}: NumberFieldProps): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Escape blurs the field; the blur that follows must not commit the abandoned draft.
  const isCancellingRef = useRef(false)
  const shown = draft ?? (value === null ? '' : formatNumber(value, decimals))

  const commitDraft = (): void => {
    if (isCancellingRef.current) {
      isCancellingRef.current = false
      return
    }
    if (draft === null) return
    const parsed = parseNumber(draft)
    setDraft(null)
    if (parsed === null) return
    const next = clamp(parsed, min, max)
    if (value === null || formatNumber(next, decimals) !== formatNumber(value, decimals)) onCommit(next)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commitDraft()
      window.requestAnimationFrame(() => inputRef.current?.select())
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(null)
      isCancellingRef.current = true
      inputRef.current?.blur()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const base = (draft !== null ? parseNumber(draft) : null) ?? value ?? 0
      const delta = step * (event.shiftKey ? 10 : 1) * (event.key === 'ArrowUp' ? 1 : -1)
      const next = clamp(Number((base + delta).toFixed(decimals)), min, max)
      setDraft(null)
      onCommit(next)
    }
  }

  return (
    <label
      className={cn(
        'group flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2 text-xs transition-colors focus-within:border-ring focus-within:ring-1 focus-within:ring-ring',
        disabled ? 'opacity-50' : 'hover:border-muted-foreground/40',
      )}
    >
      {prefix !== undefined && (
        <span className="flex w-3 shrink-0 select-none justify-center font-medium text-muted-foreground" aria-hidden>
          {prefix}
        </span>
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        aria-label={label}
        disabled={disabled}
        value={shown}
        placeholder={value === null ? 'Mixed' : undefined}
        // No draft on focus: focus can come back after a commit, before the new value has arrived.
        onFocus={(event) => event.target.select()}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={handleKeyDown}
        className="h-full min-w-0 flex-1 bg-transparent tabular-nums text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      {unit && (
        <span className="shrink-0 select-none text-muted-foreground" aria-hidden>
          {unit}
        </span>
      )}
    </label>
  )
}

/** Read-only label/value row for facts such as the trim size. */
export function InspectorFact({ label, value }: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
