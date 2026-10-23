import { AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FontFamilySelect } from '@/components/ui/font-family-select'
import { Switch } from '@/components/ui/switch'
import {
  SPINE_TEXT_SCALE_MAX,
  SPINE_TEXT_SCALE_MIN,
  hasSpineText,
  type SpineDesign,
  type SpineTextDirection,
  type SpineTextLayout,
} from '@/types/book-cover-spine.types'
import { KDP_MIN_PAGE_COUNT_FOR_SPINE_TEXT } from '@/types/book-cover.types'
import { mergeSwatches, readableTextColor } from '@/utils/book-cover-spine-palette'
import {
  SpineColorInput,
  SpineFieldLabel,
  SpineSection,
  SpineSegmented,
  SpineSwatches,
} from './spine-controls'

const DIRECTIONS: ReadonlyArray<{ value: SpineTextDirection; label: string }> = [
  { value: 'top-to-bottom', label: 'Top to bottom' },
  { value: 'bottom-to-top', label: 'Bottom to top' },
]

const LAYOUTS: ReadonlyArray<{ value: SpineTextLayout; label: string; hint: string }> = [
  { value: 'split', label: 'Classic', hint: 'Title in the middle, author at the end' },
  { value: 'centered', label: 'Together', hint: 'Title and author side by side' },
]

const TEXT_INPUT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-ring'

/** Spine sketch: bars stand for the title (long) and author (short). */
function LayoutPreview({ layout, isActive }: { layout: SpineTextLayout; isActive: boolean }) {
  const ink = isActive ? 'var(--color-control-accent)' : 'currentColor'
  return (
    <svg viewBox="0 0 20 64" className="h-16 w-5 shrink-0" aria-hidden>
      <rect x="1" y="1" width="18" height="62" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.35" />
      {layout === 'split' ? (
        <>
          <rect x="8" y="14" width="4" height="22" rx="1" fill={ink} />
          <rect x="8.5" y="47" width="3" height="11" rx="1" fill={ink} fillOpacity="0.6" />
        </>
      ) : (
        <>
          <rect x="8" y="12" width="4" height="22" rx="1" fill={ink} />
          <rect x="8.5" y="38" width="3" height="12" rx="1" fill={ink} fillOpacity="0.6" />
        </>
      )}
    </svg>
  )
}

interface SpineTextSectionProps {
  design: SpineDesign
  palette: string[]
  pageCount: number
  canHaveText: boolean
  onChange: (patch: Partial<SpineDesign>) => void
  onTextColorChange: (color: string) => void
}

export function SpineTextSection({
  design,
  palette,
  pageCount,
  canHaveText,
  onChange,
  onTextColorChange,
}: SpineTextSectionProps): JSX.Element {
  if (!canHaveText) {
    return (
      <SpineSection title="Spine text">
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-800 dark:text-amber-300">
          <p className="flex items-start gap-1.5 font-medium">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Spine text needs at least {KDP_MIN_PAGE_COUNT_FOR_SPINE_TEXT} pages.
          </p>
          <p>
            Your book has {pageCount} pages, and KDP rejects text on spines this thin. A
            background color or image is still fine.
          </p>
          {hasSpineText(design) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => onChange({ title: '', author: '', publisher: '' })}
            >
              Remove spine text
            </Button>
          )}
        </div>
      </SpineSection>
    )
  }

  const backgroundForContrast =
    design.backgroundMode === 'color' ? design.backgroundColor : '#ffffff'
  const textSwatches = mergeSwatches(
    [readableTextColor(backgroundForContrast), '#ffffff', '#111111', ...palette],
    10,
  )

  return (
    <SpineSection
      title="Spine text"
      description="Sized automatically to the largest size that fits inside the spine text area."
    >
      <div className="space-y-3">
        <div>
          <SpineFieldLabel htmlFor="spine-title">Title</SpineFieldLabel>
          <input
            id="spine-title"
            className={TEXT_INPUT_CLASS}
            value={design.title}
            placeholder="Book title"
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </div>
        <div>
          <SpineFieldLabel htmlFor="spine-author">Author</SpineFieldLabel>
          <input
            id="spine-author"
            className={TEXT_INPUT_CLASS}
            value={design.author}
            placeholder="Author name"
            onChange={(event) => onChange({ author: event.target.value })}
          />
        </div>
        <div>
          <SpineFieldLabel htmlFor="spine-publisher">
            Publisher or series <span className="font-normal text-muted-foreground">(optional)</span>
          </SpineFieldLabel>
          <input
            id="spine-publisher"
            className={TEXT_INPUT_CLASS}
            value={design.publisher}
            placeholder="Imprint or series name"
            onChange={(event) => onChange({ publisher: event.target.value })}
          />
        </div>
      </div>

      <div>
        <SpineFieldLabel>Layout</SpineFieldLabel>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Spine text layout">
          {LAYOUTS.map((option) => {
            const isActive = design.layout === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange({ layout: option.value })}
                className={`flex items-center gap-2.5 rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isActive
                    ? 'border-[var(--color-control-accent)] bg-[var(--color-control-accent)]/5'
                    : 'border-input hover:bg-accent'
                }`}
              >
                <LayoutPreview layout={option.value} isActive={isActive} />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">{option.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <SpineFieldLabel>Reading direction</SpineFieldLabel>
        <SpineSegmented
          label="Spine text direction"
          value={design.direction}
          options={DIRECTIONS}
          onChange={(direction) => onChange({ direction })}
        />
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          {design.direction === 'top-to-bottom'
            ? 'Standard for US and UK books: readable when the book lies face up.'
            : 'Common in Europe: readable when the book stands on a shelf.'}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="min-w-0">
          <SpineFieldLabel>Font</SpineFieldLabel>
          <FontFamilySelect
            value={design.fontFamily}
            onChange={(fontFamily) => onChange({ fontFamily })}
            className="h-9 w-full min-w-0"
          />
        </div>
        <label className="flex h-9 items-center gap-2 text-xs font-medium text-foreground">
          Bold title
          <Switch
            checked={design.titleBold}
            onCheckedChange={(titleBold) => onChange({ titleBold })}
            aria-label="Bold title"
          />
        </label>
      </div>

      <div>
        <SpineFieldLabel>Text color</SpineFieldLabel>
        <div className="space-y-2">
          <SpineSwatches
            label="Text color"
            colors={textSwatches}
            value={design.textColor}
            onSelect={onTextColorChange}
          />
          <SpineColorInput
            id="spine-text-color"
            label="Spine text color"
            value={design.textColor}
            onChange={onTextColorChange}
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <SpineFieldLabel htmlFor="spine-text-size">Text size</SpineFieldLabel>
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(design.textScale * 100)}%
          </span>
        </div>
        <input
          id="spine-text-size"
          type="range"
          min={SPINE_TEXT_SCALE_MIN * 100}
          max={SPINE_TEXT_SCALE_MAX * 100}
          step={5}
          value={Math.round(design.textScale * 100)}
          onChange={(event) => onChange({ textScale: Number(event.target.value) / 100 })}
          className="block h-2 w-full cursor-pointer accent-[var(--color-control-accent)]"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">100% is the largest size that fits the spine.</p>
      </div>
    </SpineSection>
  )
}
