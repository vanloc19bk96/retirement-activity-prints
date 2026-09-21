import { Check, ChevronDown } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import { PopoverSelect } from '@/components/ui/popover-select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  BOOK_BINDING_TYPES,
  BOOK_READING_DIRECTIONS,
  type BookBindingType,
  type BookReadingDirection,
} from '@/constants/book-information.constants'
import { useBookInfoForm } from '@/hooks/use-book-info-form'
import {
  KDP_MAX_PAGE_COUNT,
  KDP_MIN_PAGE_COUNT,
} from '@/constants/book-information.constants'
import type { PageSizeLabel } from '@/types/canvas-settings.types'

function SelectField({
  id,
  label,
  value,
  options,
  onSelect,
}: {
  id: string
  label: string
  value: string
  options: readonly string[]
  onSelect: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-3 block text-sm font-medium text-foreground">
        {label}
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={id}
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-0 focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={label}
          >
            <span>{value}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md"
        >
          {options.map((option) => (
            <DropdownMenuItem
              key={option}
              className="flex items-center justify-between rounded-md"
              onSelect={() => onSelect(option)}
            >
              <span>{option}</span>
              {value === option ? <Check className="h-4 w-4" aria-hidden /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function BindingTypeField({
  bindingType,
  onBindingTypeChange,
}: {
  bindingType: BookBindingType
  onBindingTypeChange: (value: BookBindingType) => void
}) {
  const label =
    BOOK_BINDING_TYPES.find((option) => option.value === bindingType)?.label ??
    BOOK_BINDING_TYPES[0].label

  return (
    <div>
      <label
        htmlFor="book-info-binding-type"
        className="mb-3 block text-sm font-medium text-foreground"
      >
        Binding type
      </label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id="book-info-binding-type"
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-0 focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Binding type"
          >
            <span>{label}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md"
        >
          {BOOK_BINDING_TYPES.map((option) => (
            <DropdownMenuItem
              key={option.value}
              className="flex items-center justify-between rounded-md"
              onSelect={() => onBindingTypeChange(option.value)}
            >
              <span>{option.label}</span>
              {bindingType === option.value ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function ReadOnlyField({
  id,
  label,
  hint,
  value,
}: {
  id: string
  label: string
  hint: string
  value: string
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground">
        {label}
      </label>
      <p className="mb-2 text-xs text-muted-foreground">{hint}</p>
      <div
        id={id}
        className="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-foreground"
      >
        {value}
      </div>
    </div>
  )
}

export function BookInfoPanel(): JSX.Element {
  const {
    bindingType,
    setBindingType,
    interiorType,
    setInteriorType,
    paperType,
    setPaperType,
    readingDirection,
    setReadingDirection,
    trimBookSize,
    setTrimBookSize,
    pageCountInput,
    setPageCountInput,
    trimSizeOptions,
    interiorOptions,
    paperOptions,
    hasChanges,
    isSaving,
    handlePageCountBlur,
    handleApply,
  } = useBookInfoForm()

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Book Information</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Use this information to calculate the exact dimensions of your cover.
          </p>
        </div>

        <hr className="border-border" />

        <BindingTypeField bindingType={bindingType} onBindingTypeChange={setBindingType} />

        <SelectField
          id="book-info-interior-type"
          label="Interior type"
          value={interiorType}
          options={interiorOptions}
          onSelect={setInteriorType}
        />

        <SelectField
          id="book-info-paper-type"
          label="Paper type"
          value={paperType}
          options={paperOptions}
          onSelect={setPaperType}
        />

        <SelectField
          id="book-info-reading-direction"
          label="Reading direction"
          value={readingDirection}
          options={BOOK_READING_DIRECTIONS}
          onSelect={(value) => setReadingDirection(value as BookReadingDirection)}
        />

        <ReadOnlyField
          id="book-info-measurement-units"
          label="Measurement units"
          hint="All dimensions use inches."
          value="inches"
        />

        <div>
          <label
            htmlFor="book-info-trim-size"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Interior trim size
          </label>
          <p className="mb-2 text-xs text-muted-foreground">
            For cover calculations only. Does not change interior project settings.
          </p>
          <PopoverSelect
            id="book-info-trim-size"
            value={trimBookSize}
            onChange={(value) => setTrimBookSize(value as PageSizeLabel)}
            options={trimSizeOptions}
            ariaLabel="Interior trim size"
          />
        </div>

        <div>
          <label
            htmlFor="book-info-page-count"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            Page count
          </label>
          <p className="mb-2 text-xs text-muted-foreground">
            Enter total interior pages. KDP minimum {KDP_MIN_PAGE_COUNT}, maximum{' '}
            {KDP_MAX_PAGE_COUNT}.
          </p>
          <input
            id="book-info-page-count"
            type="number"
            min={KDP_MIN_PAGE_COUNT}
            max={KDP_MAX_PAGE_COUNT}
            step={1}
            value={pageCountInput}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setPageCountInput(event.target.value)
            }
            onBlur={handlePageCountBlur}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-none outline-none ring-0 focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Page count"
          />
        </div>
      </div>

      <div className="mt-4 border-t pt-4">
        <Button
          type="button"
          className="w-full gap-2"
          disabled={!hasChanges || isSaving}
          onClick={() => void handleApply()}
        >
          <Check className="size-4" aria-hidden />
          {isSaving ? 'Saving…' : 'Apply Settings'}
        </Button>
      </div>
    </div>
  )
}
