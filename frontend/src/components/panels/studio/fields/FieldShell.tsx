import type { ReactNode } from 'react'

interface Props {
  htmlFor?: string
  label: string
  help?: string
  warning?: string | null
  error?: string | null
  action?: ReactNode
  children: ReactNode
}

export function FieldShell({ htmlFor, label, help, warning, error, action, children }: Props) {
  const showHeader = Boolean(label) || Boolean(action)

  return (
    <div className="flex flex-col gap-1.5">
      {showHeader ? (
        <div className="flex items-center justify-between gap-2">
          {label ? (
            <label htmlFor={htmlFor} className="text-xs font-medium text-foreground">
              {label}
            </label>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
      {help ? (
        <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>
      ) : null}
      {warning ? (
        <p
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400"
        >
          {warning}
        </p>
      ) : null}
      {error ? (
        <p className="text-[11px] leading-snug text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
