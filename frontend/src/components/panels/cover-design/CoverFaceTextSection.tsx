import { Move } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { FontFamilySelect } from '@/components/ui/font-family-select'
import { Switch } from '@/components/ui/switch'
import {
  COVER_FACE_ARRANGEMENTS,
  COVER_FACE_TEXT_SCALE_MAX,
  COVER_FACE_TEXT_SCALE_MIN,
  type CoverFace,
  type CoverFaceArrangement,
  type CoverFaceDesign,
  type CoverFaceTextAlign,
} from '@/types/book-cover-face.types'
import { mergeSwatches, readableTextColor } from '@/utils/book-cover-spine-palette'
import {
  CoverColorInput,
  CoverFieldLabel,
  CoverSection,
  CoverSegmented,
  CoverSwatches,
} from './cover-controls'

const ARRANGEMENT_COPY: Record<CoverFaceArrangement, { label: string; hint: string }> = {
  classic: { label: 'Classic', hint: 'Title at the top, author at the bottom' },
  top: { label: 'Top', hint: 'Everything near the top' },
  center: { label: 'Center', hint: 'Everything in the middle' },
  bottom: { label: 'Bottom', hint: 'Everything near the bottom' },
}

const ALIGNMENTS: ReadonlyArray<{ value: CoverFaceTextAlign; label: string }> = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
]

const INPUT_CLASS =
  'w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-1 focus-visible:ring-ring'
const TEXT_INPUT_CLASS = `h-9 ${INPUT_CLASS}`
const TEXTAREA_CLASS = `resize-y py-2 leading-snug ${INPUT_CLASS}`

/** Page sketch: the thick bar is the title / headline, thin bars the other lines. */
function ArrangementPreview({
  face,
  arrangement,
  isActive,
}: {
  face: CoverFace
  arrangement: CoverFaceArrangement
  isActive: boolean
}) {
  const ink = isActive ? 'var(--color-control-accent)' : 'currentColor'
  const lead = { height: 5, width: 22 }
  const lines = face === 'front' ? [{ height: 2.5, width: 16 }, { height: 2.5, width: 12 }] : [
    { height: 2, width: 24 },
    { height: 2, width: 24 },
    { height: 2, width: 18 },
  ]
  const gap = 3
  const blockHeight = lead.height + lines.reduce((sum, line) => sum + line.height + gap, 0)
  const startY =
    arrangement === 'center' ? (52 - blockHeight) / 2 : arrangement === 'bottom' ? 46 - blockHeight : 6

  let cursor = startY
  const bars = [lead, ...lines].map((bar, index) => {
    if (index > 0) cursor += gap
    let y = cursor
    // Classic pins the author line to the bottom of the cover.
    if (arrangement === 'classic' && index === lines.length) y = 46 - bar.height
    cursor += bar.height
    return { ...bar, y, opacity: index === 0 ? 1 : 0.6 }
  })

  return (
    <svg viewBox="0 0 40 52" className="h-12 w-9 shrink-0" aria-hidden>
      <rect x="1" y="1" width="38" height="50" rx="2" fill="none" stroke="currentColor" strokeOpacity="0.35" />
      {bars.map((bar, index) => (
        <rect
          key={index}
          x={(40 - bar.width) / 2}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          rx="1"
          fill={ink}
          fillOpacity={bar.opacity}
        />
      ))}
    </svg>
  )
}

interface CoverFaceTextSectionProps {
  face: CoverFace
  design: CoverFaceDesign
  palette: string[]
  hasManualPositions: boolean
  onChange: (patch: Partial<CoverFaceDesign>) => void
  onTextColorChange: (color: string) => void
  onResetPositions: () => void
}

export function CoverFaceTextSection({
  face,
  design,
  palette,
  hasManualPositions,
  onChange,
  onTextColorChange,
  onResetPositions,
}: CoverFaceTextSectionProps): JSX.Element {
  const backgroundForContrast =
    design.backgroundMode === 'color' ? design.backgroundColor : '#ffffff'
  const textSwatches = mergeSwatches(
    [readableTextColor(backgroundForContrast), '#ffffff', '#111111', ...palette],
    10,
  )
  const arrangements = COVER_FACE_ARRANGEMENTS[face]
  const id = (field: string): string => `${face}-cover-${field}`

  return (
    <CoverSection
      title={face === 'front' ? 'Cover text' : 'Back cover text'}
      description={
        face === 'front'
          ? 'Sized and placed for you inside the safe area. Drag any line on the cover to move it.'
          : 'Kept inside the safe area and clear of the barcode box. Drag any text on the cover to move it.'
      }
    >
      {face === 'front' ? (
        <div className="space-y-3">
          <div>
            <CoverFieldLabel htmlFor={id('title')}>Title</CoverFieldLabel>
            <textarea
              id={id('title')}
              rows={2}
              className={TEXTAREA_CLASS}
              value={design.title}
              placeholder="Book title"
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </div>
          <div>
            <CoverFieldLabel htmlFor={id('subtitle')}>
              Subtitle <span className="font-normal text-muted-foreground">(optional)</span>
            </CoverFieldLabel>
            <textarea
              id={id('subtitle')}
              rows={2}
              className={TEXTAREA_CLASS}
              value={design.subtitle}
              placeholder="e.g. 100 Large Print Puzzles for Seniors"
              onChange={(event) => onChange({ subtitle: event.target.value })}
            />
          </div>
          <div>
            <CoverFieldLabel htmlFor={id('author')}>Author</CoverFieldLabel>
            <input
              id={id('author')}
              className={TEXT_INPUT_CLASS}
              value={design.author}
              placeholder="Author or brand name"
              onChange={(event) => onChange({ author: event.target.value })}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <CoverFieldLabel htmlFor={id('headline')}>
              Headline <span className="font-normal text-muted-foreground">(optional)</span>
            </CoverFieldLabel>
            <input
              id={id('headline')}
              className={TEXT_INPUT_CLASS}
              value={design.headline}
              placeholder="e.g. Keep your mind sharp, one puzzle at a time"
              onChange={(event) => onChange({ headline: event.target.value })}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-baseline justify-between">
              <CoverFieldLabel htmlFor={id('description')}>Description</CoverFieldLabel>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {design.description.trim().length} characters
              </span>
            </div>
            <textarea
              id={id('description')}
              rows={7}
              className={TEXTAREA_CLASS}
              value={design.description}
              placeholder="What's inside, who it's for, and why they'll love it. Press Enter for a new paragraph."
              onChange={(event) => onChange({ description: event.target.value })}
            />
          </div>
        </div>
      )}

      <div>
        <CoverFieldLabel>Position</CoverFieldLabel>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Text position">
          {arrangements.map((arrangement) => {
            const isActive = design.arrangement === arrangement
            return (
              <button
                key={arrangement}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange({ arrangement })}
                className={`flex items-center gap-2.5 rounded-md border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${
                  isActive
                    ? 'border-[var(--color-control-accent)] bg-[var(--color-control-accent)]/5'
                    : 'border-input hover:bg-accent'
                }`}
              >
                <ArrangementPreview face={face} arrangement={arrangement} isActive={isActive} />
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-foreground">
                    {ARRANGEMENT_COPY[arrangement].label}
                  </span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {ARRANGEMENT_COPY[arrangement].hint}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
        {hasManualPositions && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2 w-full gap-1.5"
            onClick={onResetPositions}
          >
            <Move className="h-3.5 w-3.5" aria-hidden />
            Reset text you moved on the cover
          </Button>
        )}
      </div>

      <div>
        <CoverFieldLabel>Alignment</CoverFieldLabel>
        <CoverSegmented
          label="Text alignment"
          value={design.textAlign}
          options={ALIGNMENTS}
          onChange={(textAlign) => onChange({ textAlign })}
        />
      </div>

      <div className="grid grid-cols-[1fr_auto] items-end gap-3">
        <div className="min-w-0">
          <CoverFieldLabel>{face === 'front' ? 'Title font' : 'Headline font'}</CoverFieldLabel>
          <FontFamilySelect
            value={design.titleFontFamily}
            onChange={(titleFontFamily) => onChange({ titleFontFamily })}
            className="h-9 w-full min-w-0"
          />
        </div>
        <label className="flex h-9 items-center gap-2 text-xs font-medium text-foreground">
          Bold
          <Switch
            checked={design.titleBold}
            onCheckedChange={(titleBold) => onChange({ titleBold })}
            aria-label={face === 'front' ? 'Bold title' : 'Bold headline'}
          />
        </label>
      </div>
      <div className="min-w-0">
        <CoverFieldLabel>{face === 'front' ? 'Subtitle and author font' : 'Description font'}</CoverFieldLabel>
        <FontFamilySelect
          value={design.bodyFontFamily}
          onChange={(bodyFontFamily) => onChange({ bodyFontFamily })}
          className="h-9 w-full min-w-0"
        />
      </div>

      <div>
        <CoverFieldLabel>Text color</CoverFieldLabel>
        <div className="space-y-2">
          <CoverSwatches
            label="Text color"
            colors={textSwatches}
            value={design.textColor}
            onSelect={onTextColorChange}
          />
          <CoverColorInput
            id={id('text-color')}
            label={`${face === 'front' ? 'Front' : 'Back'} cover text color`}
            value={design.textColor}
            onChange={onTextColorChange}
          />
        </div>
        <label className="mt-2 flex items-center justify-between gap-2 text-xs font-medium text-foreground">
          <span>
            Text shadow
            <span className="block text-[11px] font-normal text-muted-foreground">
              Helps text stand out on photos.
            </span>
          </span>
          <Switch
            checked={design.textShadow}
            onCheckedChange={(textShadow) => onChange({ textShadow })}
            aria-label="Text shadow"
          />
        </label>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <CoverFieldLabel htmlFor={id('text-size')}>Text size</CoverFieldLabel>
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(design.textScale * 100)}%
          </span>
        </div>
        <input
          id={id('text-size')}
          type="range"
          min={COVER_FACE_TEXT_SCALE_MIN * 100}
          max={COVER_FACE_TEXT_SCALE_MAX * 100}
          step={5}
          value={Math.round(design.textScale * 100)}
          onChange={(event) => onChange({ textScale: Number(event.target.value) / 100 })}
          className="block h-2 w-full cursor-pointer accent-[var(--color-control-accent)]"
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Text that would not fit shrinks on its own, so it never leaves the safe area.
        </p>
      </div>
    </CoverSection>
  )
}
