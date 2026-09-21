import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { StudioFieldProps } from '../StudioConfigField'

export function ToggleField({ field, value, onChange, error }: StudioFieldProps<boolean>) {
  const hasSecondary = Boolean(field.help) || Boolean(error)

  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        hasSecondary ? 'items-start' : 'items-center',
      )}
    >
      <div className="flex flex-col gap-0.5">
        <label htmlFor={field.key} className="text-xs font-medium text-foreground">
          {field.label}
        </label>
        {field.help ? (
          <p className="text-[11px] leading-snug text-muted-foreground">{field.help}</p>
        ) : null}
        {error ? (
          <p className="text-[11px] leading-snug text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <Switch id={field.key} checked={value} onCheckedChange={onChange} />
    </div>
  )
}
