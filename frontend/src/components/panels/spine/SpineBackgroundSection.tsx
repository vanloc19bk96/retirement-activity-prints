import { ImageUp, Loader2, RefreshCw } from 'lucide-react'
import { useRef, type ChangeEvent } from 'react'

import { Button } from '@/components/ui/button'
import { useUploadImage } from '@/hooks/use-upload-image'
import type { SpineBackgroundMode, SpineDesign } from '@/types/book-cover-spine.types'
import {
  SpineColorInput,
  SpineFieldLabel,
  SpineSection,
  SpineSegmented,
  SpineSwatches,
} from './spine-controls'

/** Classic spine colors that print well on KDP paper stock. */
const PRESET_SPINE_COLORS = [
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

const BACKGROUND_MODES: ReadonlyArray<{ value: SpineBackgroundMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'color', label: 'Color' },
  { value: 'image', label: 'Image' },
]

interface SpineBackgroundSectionProps {
  design: SpineDesign
  palette: string[]
  onChange: (patch: Partial<SpineDesign>) => void
  onRefreshPalette: () => void
}

export function SpineBackgroundSection({
  design,
  palette,
  onChange,
  onRefreshPalette,
}: SpineBackgroundSectionProps): JSX.Element {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const { isUploading, error, uploadImage } = useUploadImage()

  const handleModeChange = (mode: SpineBackgroundMode): void => {
    // First switch to Color starts from the color right beside the front cover.
    if (mode === 'color' && design.backgroundMode !== 'color' && palette[0]) {
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
    <SpineSection
      title="Background"
      description="Fills the spine between the two fold lines, including the bleed."
    >
      <SpineSegmented
        label="Spine background"
        value={design.backgroundMode}
        options={BACKGROUND_MODES}
        onChange={handleModeChange}
      />

      {design.backgroundMode === 'color' && (
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <SpineFieldLabel>Match your cover</SpineFieldLabel>
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
              <SpineSwatches
                label="Cover color"
                colors={palette}
                value={design.backgroundColor}
                onSelect={(color) => onChange({ backgroundColor: color })}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Add your front and back cover art, then press Refresh to pick colors from it.
              </p>
            )}
          </div>
          <div>
            <SpineFieldLabel>Classic colors</SpineFieldLabel>
            <SpineSwatches
              label="Preset color"
              colors={PRESET_SPINE_COLORS}
              value={design.backgroundColor}
              onSelect={(color) => onChange({ backgroundColor: color })}
            />
          </div>
          <div>
            <SpineFieldLabel htmlFor="spine-background-color">Custom color</SpineFieldLabel>
            <SpineColorInput
              id="spine-background-color"
              label="Spine background color"
              value={design.backgroundColor}
              onChange={(color) => onChange({ backgroundColor: color })}
            />
          </div>
        </div>
      )}

      {design.backgroundMode === 'image' && (
        <div className="space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(event) => void handleFileChange(event)}
          />
          <div className="flex items-stretch gap-3">
            {design.backgroundImageUrl ? (
              <img
                src={design.backgroundImageUrl}
                alt="Spine background"
                className="h-24 w-10 shrink-0 rounded border border-border object-cover"
              />
            ) : (
              <div className="flex h-24 w-10 shrink-0 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
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
                  : design.backgroundImageUrl
                    ? 'Replace image'
                    : 'Upload image'}
              </Button>
              <p className="text-[11px] leading-snug text-muted-foreground">
                The image is cropped to fill the spine. Tall images or textures work best. JPG, PNG or WEBP.
              </p>
            </div>
          </div>
          {error && <p className="text-xs text-amber-600">{error}</p>}
        </div>
      )}
    </SpineSection>
  )
}
