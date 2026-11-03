import { useState } from 'react'
import { CheckCircle2, ImageOff, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { AiGeneratedImage } from '@/types/projects.types'
import { isImagePlaced } from '@/utils/ai-image-history'
import {
  placeGeneratedImage,
  type GeneratedImagePlacementTarget,
} from '@/utils/generated-image-placement-events'
import { setImageDragData } from '@/utils/image-dnd'

const COVER_TARGETS: ReadonlyArray<{ target: GeneratedImagePlacementTarget; label: string }> = [
  { target: 'front', label: 'Front' },
  { target: 'back', label: 'Back' },
  { target: 'spine', label: 'Spine' },
]

function imageAltText(image: AiGeneratedImage): string {
  return image.idea ?? (image.kind === 'cover' ? 'Generated book cover background' : 'Generated image')
}

function handleImageDragStart(event: React.DragEvent<HTMLElement>, image: AiGeneratedImage): void {
  setImageDragData(event.dataTransfer, {
    publicUrl: image.url,
    fileName: image.kind === 'cover' ? 'book-cover-generated.png' : image.idea ? `${image.idea}.png` : null,
  })
}

type PreviewStatus = 'loading' | 'loaded' | 'failed'

/**
 * Shows the light preview. An image without one, or whose preview fails, shows the print file instead.
 * Callers key their component by the image URL, so another image starts over.
 */
function usePreviewSource(image: AiGeneratedImage): {
  src: string
  status: PreviewStatus
  onLoad: () => void
  onError: () => void
  retry: () => void
  retryCount: number
} {
  const [useFullFile, setUseFullFile] = useState(!image.previewUrl)
  const [status, setStatus] = useState<PreviewStatus>('loading')
  const [retryCount, setRetryCount] = useState(0)

  return {
    src: useFullFile ? image.url : image.previewUrl!,
    status,
    retryCount,
    onLoad: () => setStatus('loaded'),
    onError: () => {
      if (useFullFile) {
        setStatus('failed')
        return
      }
      setUseFullFile(true)
    },
    retry: () => {
      setUseFullFile(!image.previewUrl)
      setStatus('loading')
      setRetryCount((count) => count + 1)
    },
  }
}

function SelectedImagePreview({
  image,
  heightClassName,
}: {
  image: AiGeneratedImage
  heightClassName: string
}): JSX.Element {
  const { src, status, retryCount, onLoad, onError, retry } = usePreviewSource(image)

  return (
    <div className={cn('relative w-full overflow-hidden bg-foreground/5', heightClassName)}>
      <button
        type="button"
        draggable
        onDragStart={(event) => handleImageDragStart(event, image)}
        className="flex h-full w-full cursor-grab items-center justify-center overflow-hidden active:cursor-grabbing"
        title="Drag onto the canvas to place it"
        aria-label={`Drag ${imageAltText(image)} onto the canvas`}
      >
        {status !== 'failed' && (
          <img
            key={`${src}#${retryCount}`}
            src={src}
            alt={imageAltText(image)}
            onLoad={onLoad}
            onError={onError}
            decoding="async"
            className="max-h-full max-w-full pointer-events-none object-contain"
            draggable={false}
          />
        )}
      </button>
      {status === 'loading' && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-muted-foreground"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          <span className="text-xs">Loading preview…</span>
        </div>
      )}
      {status === 'failed' && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-foreground"
          role="alert"
        >
          <ImageOff className="h-5 w-5" aria-hidden />
          <span className="text-xs">The preview could not load. Your image is still kept here.</span>
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

function ImageThumbnail({
  image,
  isSelected,
  isUnplaced,
  onSelect,
}: {
  image: AiGeneratedImage
  isSelected: boolean
  isUnplaced: boolean
  onSelect: () => void
}): JSX.Element {
  const { src, status, onLoad, onError } = usePreviewSource(image)

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => handleImageDragStart(event, image)}
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={`Show ${imageAltText(image)}${isUnplaced ? ', not placed yet' : ''}`}
      title={isUnplaced ? 'Not placed yet' : undefined}
      className={cn(
        'relative flex aspect-square items-center justify-center overflow-hidden rounded border bg-foreground/5',
        isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-muted-foreground/40',
      )}
    >
      {status === 'failed' ? (
        <ImageOff className="h-4 w-4 text-muted-foreground" aria-hidden />
      ) : (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={onLoad}
          onError={onError}
          className="max-h-full max-w-full pointer-events-none object-contain"
          draggable={false}
        />
      )}
      {status === 'loading' && (
        <Loader2 className="pointer-events-none absolute h-4 w-4 animate-spin text-muted-foreground" aria-hidden />
      )}
      {isUnplaced && (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500 ring-1 ring-card"
          aria-hidden
        />
      )}
    </button>
  )
}

type GeneratedImagesSectionProps = {
  images: readonly AiGeneratedImage[]
  selectedImage: AiGeneratedImage | null
  /** Images the canvases use; null until the project has loaded. */
  placedUrls: ReadonlySet<string> | null
  isEditingCover: boolean
  isGenerating: boolean
  onSelectImage: (url: string) => void
}

export function GeneratedImagesSection({
  images,
  selectedImage,
  placedUrls,
  isEditingCover,
  isGenerating,
  onSelectImage,
}: GeneratedImagesSectionProps): JSX.Element | null {
  const { toast } = useToast()
  const [placingTarget, setPlacingTarget] = useState<GeneratedImagePlacementTarget | null>(null)

  if (!selectedImage) {
    if (!isGenerating) return null
    return (
      <div
        className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-4 text-xs text-muted-foreground"
        aria-live="polite"
      >
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        Generating your image. It appears here when it is ready.
      </div>
    )
  }

  const handlePlace = async (target: GeneratedImagePlacementTarget): Promise<void> => {
    setPlacingTarget(target)
    const result = await placeGeneratedImage(selectedImage.url, target)
    setPlacingTarget(null)
    if ('error' in result) {
      toast({ title: 'Image not placed', description: result.error })
      return
    }
    toast({ title: `Added to ${result.placedOn}`, description: 'It saves automatically in a few seconds.' })
  }

  const isSelectedPlaced = placedUrls != null && isImagePlaced(selectedImage, placedUrls)
  const targets = isEditingCover ? COVER_TARGETS : [{ target: 'page' as const, label: 'Place on current page' }]

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-foreground">Generated images ({images.length})</p>
      {isGenerating && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
          Generating a new image. Your earlier images stay here.
        </p>
      )}

      <div className="overflow-hidden rounded-md border border-border bg-muted">
        <SelectedImagePreview
          key={selectedImage.url}
          image={selectedImage}
          heightClassName={selectedImage.kind === 'cover' ? 'h-56' : 'h-40'}
        />
        {selectedImage.idea && (
          <p className="truncate px-2 py-1 text-center text-[11px] text-muted-foreground">{selectedImage.idea}</p>
        )}
      </div>

      {isSelectedPlaced && (
        <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
          This image is in your book. Place it again to use it somewhere else too.
        </p>
      )}

      <div className="space-y-1">
        {isEditingCover && <p className="text-[11px] font-medium text-muted-foreground">Place on the cover</p>}
        <div className="flex gap-1.5">
          {targets.map(({ target, label }) => (
            <Button
              key={target}
              type="button"
              size="sm"
              className="min-w-0 flex-1"
              disabled={placingTarget !== null}
              onClick={() => void handlePlace(target)}
            >
              {placingTarget === target && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {label}
            </Button>
          ))}
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {placingTarget !== null
            ? 'Fetching the print-quality file. This can take a moment on a slow connection.'
            : 'You can also drag the image onto the canvas.'}
        </p>
      </div>

      {selectedImage.kind === 'cover' && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          You can add or change the title, subtitle and author at any time from Front in the bar on
          the right of the Book Cover view.
        </p>
      )}

      {images.length > 1 && (
        <div className="grid max-h-44 grid-cols-4 gap-1.5 overflow-y-auto p-0.5">
          {images.map((image) => (
            <ImageThumbnail
              key={image.url}
              image={image}
              isSelected={image.url === selectedImage.url}
              isUnplaced={placedUrls != null && !isImagePlaced(image, placedUrls)}
              onSelect={() => onSelectImage(image.url)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
