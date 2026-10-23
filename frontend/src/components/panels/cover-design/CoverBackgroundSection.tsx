import { ImageUp, Loader2, RefreshCw } from 'lucide-react'
import { useRef, type ChangeEvent, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useUploadImage } from '@/hooks/use-upload-image'
import {
  CoverColorInput,
  CoverFieldLabel,
  CoverSection,
  CoverSegmented,
  CoverSwatches,
} from './cover-controls'

export type CoverBackgroundMode = 'none' | 'color' | 'image'

/** Background fields shared by the spine and front / back cover designs. */
export interface CoverBackgroundValue {
  backgroundMode: CoverBackgroundMode
  backgroundColor: string
  backgroundImageUrl: string | null
}

/** Classic cover colors that print well on KDP paper stock. */
const PRESET_COVER_COLORS = [
  '#1e3a5f',
  '#111111',
  '#ffffff',
  '#f5ecd7',
  '#2f5d50',
  '#7a1f2b',
  '#0f766e',
  '#e86a5a',
  '#e0a526',
  '#8e7cc3',
  '#f4a6b8',
  '#4a90d9',
] as const

const BACKGROUND_MODES: ReadonlyArray<{ value: CoverBackgroundMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'color', label: 'Color' },
  { value: 'image', label: 'Image' },
]

interface CoverBackgroundSectionProps {
  /** Used in labels, e.g. "Spine" or "Front cover". */
  name: string
  description: string
  imageHint: string
  /** Shape of the image thumbnail: a tall strip for the spine, a page for a cover. */
  thumbnail: 'strip' | 'page'
  value: CoverBackgroundValue
  palette: string[]
  onChange: (patch: Partial<CoverBackgroundValue>) => void
  onRefreshPalette: () => void
  /** Extra control shown beside the section title. */
  action?: ReactNode
}

export function CoverBackgroundSection({
  name,
  description,
  imageHint,
  thumbnail,
  value,
  palette,
  onChange,
  onRefreshPalette,
  action,
}: CoverBackgroundSectionProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { isUploading, error, uploadImage } = useUploadImage()
  const idPrefix = name.toLowerCase().replace(/\s+/g, '-')
  const thumbnailClass = thumbnail === 'strip' ? 'h-24 w-10' : 'h-24 w-[4.5rem]'

  const handleModeChange = (mode: CoverBackgroundMode): void => {
    // First switch to Color starts from the best matching cover color.
    if (mode === 'color' && value.backgroundMode !== 'color' && palette[0]) {
      onChange({ backgroundMode: mode, backgroundColor: palette[0] })
      return
    }
    onChange({ backgroundMode: mode })
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const uploaded = await uploadImage(file)
      onChange({ backgroundMode: 'image', backgroundImageUrl: uploaded.publicUrl })
    } catch {
      // `error` from the hook is shown below.
    }
  }

  return (
    <CoverSection title="Background" description={description} action={action}>
      <CoverSegmented
        label={`${name} background`}
        value={value.backgroundMode}
        options={BACKGROUND_MODES}
        onChange={handleModeChange}
      />

      {value.backgroundMode === 'color' && (
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <CoverFieldLabel>Match your cover</CoverFieldLabel>
              <button
                type="button"
                onClick={onRefreshPalette}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                title="Sample the cover colors again"
              >
                <RefreshCw className="h-3 w-3" aria-hidden />
                Refresh
              </button>
            </div>
            {palette.length > 0 ? (
              <CoverSwatches
                label="Cover color"
                colors={palette}
                value={value.backgroundColor}
                onSelect={(color) => onChange({ backgroundColor: color })}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Add art to your cover, then press Refresh to pick colors from it.
              </p>
            )}
          </div>
          <div>
            <CoverFieldLabel>Classic colors</CoverFieldLabel>
            <CoverSwatches
              label="Preset color"
              colors={PRESET_COVER_COLORS}
              value={value.backgroundColor}
              onSelect={(color) => onChange({ backgroundColor: color })}
            />
          </div>
          <div>
            <CoverFieldLabel htmlFor={`${idPrefix}-background-color`}>Custom color</CoverFieldLabel>
            <CoverColorInput
              id={`${idPrefix}-background-color`}
              label={`${name} background color`}
              value={value.backgroundColor}
              onChange={(color) => onChange({ backgroundColor: color })}
            />
          </div>
        </div>
      )}

      {value.backgroundMode === 'image' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          <div className="flex items-stretch gap-3">
            {value.backgroundImageUrl ? (
              <img
                src={value.backgroundImageUrl}
                alt={`${name} background`}
                className={`${thumbnailClass} shrink-0 rounded border border-border object-cover`}
              />
            ) : (
              <div
                className={`${thumbnailClass} flex shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground`}
              >
                <ImageUp className="h-4 w-4" aria-hidden />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-1.5"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ImageUp className="h-3.5 w-3.5" aria-hidden />
                )}
                {isUploading
                  ? 'Uploading…'
                  : value.backgroundImageUrl
                    ? 'Replace image'
                    : 'Upload image'}
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">{imageHint}</p>
            </div>
          </div>
          {error && <p className="text-xs text-amber-600">{error}</p>}
        </div>
      )}
    </CoverSection>
  )
}
