import { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface PopoverSelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface PopoverSelectProps {
  id?: string
  value: string
  onChange: (value: string) => void
  options: PopoverSelectOption[]
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  title?: string
  className?: string
}

export function PopoverSelect({
  id,
  value,
  onChange,
  options,
  ariaLabel,
  placeholder = 'Select...',
  disabled = false,
  title,
  className,
}: PopoverSelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value)

  const handleSelect = (nextValue: string): void => {
    onChange(nextValue)
    setIsOpen(false)
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          className={cn(
            'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-2 text-xs text-foreground transition-colors',
            'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            'disabled:pointer-events-none disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate text-left', !selectedOption && 'text-muted-foreground')}>
            {selectedOption?.label ?? placeholder}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={4}
        className="w-[var(--radix-popover-trigger-width)] border-border bg-popover p-1 shadow-none"
        role="listbox"
        aria-label={ariaLabel}
      >
        <ul className="flex max-h-[min(16rem,var(--radix-popover-content-available-height))] flex-col gap-0.5 overflow-y-auto">
          {options.map((option) => {
            const isSelected = option.value === value
            const isOptionDisabled = option.disabled === true

            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={isOptionDisabled}
                  disabled={isOptionDisabled}
                  onClick={() => {
                    if (isOptionDisabled) return
                    handleSelect(option.value)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                    'hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                    isSelected && 'bg-accent/70 text-accent-foreground',
                    isOptionDisabled &&
                      'cursor-not-allowed text-muted-foreground/70 opacity-50 hover:bg-transparent hover:text-muted-foreground/70 dark:text-slate-500',
                  )}
                >
                  <Check
                    className={cn('h-3.5 w-3.5 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                    aria-hidden
                  />
                  <span className="truncate">{option.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
