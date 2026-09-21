import { PopoverSelect } from '@/components/ui/popover-select'
import { Switch } from '@/components/ui/switch'
import type { AuthorPosition, CoverTextPosition } from '@/types/cover.types'

type ToggleFieldProps = {
  id: string
  label: string
  enabled: boolean
  text: string
  position: CoverTextPosition | AuthorPosition
  positionOptions: ReadonlyArray<{ value: CoverTextPosition | AuthorPosition; label: string }>
  maxLength: number
  placeholder: string
  disabled?: boolean
  onEnabledChange: (enabled: boolean) => void
  onTextChange: (text: string) => void
  onPositionChange: (position: CoverTextPosition | AuthorPosition) => void
}

export function ToggleField({
  id,
  label,
  enabled,
  text,
  position,
  positionOptions,
  maxLength,
  placeholder,
  disabled = false,
  onEnabledChange,
  onTextChange,
  onPositionChange,
}: ToggleFieldProps): JSX.Element {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <Switch
          checked={enabled}
          disabled={disabled}
          onCheckedChange={onEnabledChange}
          aria-label={`Enable ${label.toLowerCase()}`}
        />
      </div>

      {enabled && (
        <div className="space-y-2">
          <input
            id={`${id}-text`}
            type="text"
            maxLength={maxLength}
            disabled={disabled}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder={placeholder}
            aria-label={`${label} text`}
          />
          <PopoverSelect
            id={`${id}-position`}
            disabled={disabled}
            value={position}
            onChange={(nextValue) =>
              onPositionChange(nextValue as CoverTextPosition | AuthorPosition)
            }
            options={positionOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            ariaLabel={`${label} position`}
          />
        </div>
      )}
    </div>
  )
}
