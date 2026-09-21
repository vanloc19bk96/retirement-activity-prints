import * as React from 'react'

import { cn } from '@/lib/utils'

interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onCheckedChange, className, children, ...props }, ref) => {
    const isDisabled = Boolean(props.disabled)
    const handleToggle = (): void => {
      onCheckedChange?.(!checked)
    }

    // Same blue as range controls (--color-control-accent), not theme primary (near-black).
    const trackClass = isDisabled
      ? 'bg-muted/70'
      : checked
        ? 'bg-[var(--color-control-accent)]'
        : 'bg-input'
    const textClass = isDisabled
      ? 'text-muted-foreground'
      : checked
        ? 'text-primary-foreground'
        : 'text-muted-foreground'
    const thumbTransformClass = checked ? 'translate-x-5' : 'translate-x-0'
    const thumbToneClass = isDisabled
      ? 'bg-background/70 shadow-sm dark:bg-slate-200/70'
      : checked
        ? 'bg-white shadow-md dark:bg-white'
        : 'bg-background dark:bg-slate-100'

    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={handleToggle}
        ref={ref}
        className={cn(
          'inline-flex h-8 shrink-0 items-center gap-2 rounded-full text-xs font-medium transition-colors',
          isDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
          textClass,
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'relative inline-flex h-6 w-11 items-center rounded-full border border-border transition-colors',
            isDisabled && 'border-muted-foreground/20',
            trackClass,
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 top-0.5 h-5 w-5 rounded-full border border-border shadow-sm transition-transform dark:border-white/20',
              isDisabled && 'border-muted-foreground/20',
              thumbToneClass,
              thumbTransformClass,
            )}
          />
        </span>
        {children ? <span className="flex items-center">{children}</span> : null}
      </button>
    )
  },
)

Switch.displayName = 'Switch'


