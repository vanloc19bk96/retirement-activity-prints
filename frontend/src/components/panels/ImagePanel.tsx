import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, Lock, Sparkles, Upload } from 'lucide-react'

import {
  AIImageForm,
  type AICoverFormState,
} from '@/components/panels/ai-cover-form/AIImageForm'
import { useAuthContext } from '@/context/AuthContext'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useAiImageGeneration } from '@/hooks/use-ai-image-generation'
import { useGenerateCover } from '@/hooks/use-generate-cover'
import { useUploadImage } from '@/hooks/use-upload-image'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import {
  isUserBookCoverAiLocked,
  isUserOnProPlan,
  isUserOnStandardTierPlan,
} from '@/utils/user-plan'
import { setImageDragData } from '@/utils/image-dnd'
import type { GeneratedImage } from '@/types/ai-images.types'
import type { CoverDimensions, GenerateCoverPayload } from '@/types/cover.types'

type ImagePanelTab = 'upload' | 'ai'

const COVER_PRINT_DPI = 300
const COVER_BLEED_INCHES = 0.125

const DEFAULT_AI_COVER_FORM_STATE: AICoverFormState = {
  description: '',
  title: { enabled: false, text: '', position: 'top' },
  subtitle: { enabled: false, text: '', position: 'top' },
  author: { enabled: false, text: '', position: 'bottom' },
}

const IMAGE_PANEL_TAB_ACTIVE_CLASS =
  'bg-primary text-primary-foreground shadow-sm dark:bg-zinc-700 dark:text-zinc-50'
const IMAGE_PANEL_TAB_INACTIVE_CLASS =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-zinc-800 dark:hover:text-zinc-100'

export function ImagePanel(): JSX.Element {
  const { user } = useAuthContext()
  const [activeTab, setActiveTab] = useState<ImagePanelTab>('upload')
  const [isBookCoverMode, setIsBookCoverMode] = useState<boolean>(false)
  const [selectedUploadCount, setSelectedUploadCount] = useState<number>(0)
  const [uploadedItems, setUploadedItems] = useState<Array<{ publicUrl: string; fileName: string }>>([])
  const [uploadBatchError, setUploadBatchError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [interiorIdeaInput, setInteriorIdeaInput] = useState<string>('')
  const [aiCoverFormState, setAiCoverFormState] = useState<AICoverFormState>(
    DEFAULT_AI_COVER_FORM_STATE,
  )
  const [generatedInteriorImage, setGeneratedInteriorImage] = useState<GeneratedImage | null>(null)
  const [generatedBookCoverImageUrl, setGeneratedBookCoverImageUrl] = useState<string | null>(null)

  const { bookCoverDimensions } = useCanvasSettings()
  // One front/back panel including bleed: the back panel (bleed + trim) and the
  // front panel (trim + bleed) are the same size, so one image fits either side exactly.
  const coverPanelWidthInches =
    (bookCoverDimensions.fullWidthInches - bookCoverDimensions.spineWidthInches) / 2
  const coverPanelHeightInches = bookCoverDimensions.fullHeightInches
  const coverDimensions = useMemo<CoverDimensions>(
    () => ({
      widthPx: Math.round(coverPanelWidthInches * COVER_PRINT_DPI),
      heightPx: Math.round(coverPanelHeightInches * COVER_PRINT_DPI),
      dpi: COVER_PRINT_DPI,
      bleedPx: Math.round(COVER_BLEED_INCHES * COVER_PRINT_DPI),
    }),
    [coverPanelWidthInches, coverPanelHeightInches],
  )

  const { isUploading, error, uploadImage, reset } = useUploadImage()
  const {
    isGenerating: isGeneratingInterior,
    error: generateError,
    generateInteriorImages,
    resetError: resetGenerateError,
  } = useAiImageGeneration()
  const {
    isGenerating: isGeneratingCover,
    error: coverGenerateError,
    generateCover,
    resetError: resetCoverGenerateError,
  } = useGenerateCover()
  const isStandardTierPlan = isUserOnStandardTierPlan(user)
  const isAiTabLocked = user !== null && !isStandardTierPlan
  const isBookCoverModeLocked = isUserBookCoverAiLocked(user)

  useEffect(() => {
    if (!isBookCoverModeLocked) return
    if (isBookCoverMode) {
      setIsBookCoverMode(false)
    }
  }, [isBookCoverMode, isBookCoverModeLocked])

  useEffect(() => {
    if (!isAiTabLocked) return
    if (activeTab === 'ai') {
      setActiveTab('upload')
    }
  }, [activeTab, isAiTabLocked])

  const handleUploadedImageDragStart = (
    event: React.DragEvent<HTMLElement>,
    image: { publicUrl: string; fileName: string },
  ): void => {
    setImageDragData(event.dataTransfer, {
      publicUrl: image.publicUrl,
      fileName: image.fileName,
    })
  }

  const handleGeneratedImageDragStart = (
    event: React.DragEvent<HTMLElement>,
    imageUrl: string,
    fileName: string | null,
  ): void => {
    setImageDragData(event.dataTransfer, {
      publicUrl: imageUrl,
      fileName,
    })
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) {
      setSelectedUploadCount(0)
      reset()
      return
    }
    setSelectedUploadCount(files.length)
    setUploadBatchError(null)
    reset()
    const nextUploadedItems: Array<{ publicUrl: string; fileName: string }> = []
    let failedCount = 0

    for (const file of files) {
      try {
        const uploadedImage = await uploadImage(file)
        nextUploadedItems.push({ publicUrl: uploadedImage.publicUrl, fileName: file.name })
      } catch {
        failedCount += 1
      }
    }

    setUploadedItems(nextUploadedItems)
    if (failedCount > 0) {
      setUploadBatchError(`Uploaded ${nextUploadedItems.length}/${files.length} images.`)
    }
    setSelectedUploadCount(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleBookCoverModeChange = (enabled: boolean): void => {
    setIsBookCoverMode(enabled)
    resetGenerateError()
    resetCoverGenerateError()
  }

  const handleGenerateInteriorImages = async (idea: string): Promise<void> => {
    if (!isStandardTierPlan) return

    resetGenerateError()
    resetCoverGenerateError()
    try {
      const result = await generateInteriorImages({ idea })
      setGeneratedInteriorImage(result.images[0] ?? null)
      setGeneratedBookCoverImageUrl(null)
    } catch {
      // hook already sets a human-readable error message
    }
  }

  const handleGenerateBookCover = async (payload: GenerateCoverPayload): Promise<void> => {
    if (!isUserOnProPlan(user)) return

    resetCoverGenerateError()
    resetGenerateError()
    try {
      const result = await generateCover(payload)
      setGeneratedBookCoverImageUrl(result.imageUrl)
      setGeneratedInteriorImage(null)
    } catch {
      // hook already sets a human-readable error message
    }
  }

  const isAiGenerating = isGeneratingInterior || isGeneratingCover
  const aiGenerateError = isBookCoverMode ? coverGenerateError : generateError

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex gap-1 rounded-md bg-muted p-1">
        <button
          type="button"
          onClick={() => setActiveTab('upload')}
          aria-pressed={activeTab === 'upload'}
          className={`flex-1 inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-sm font-medium transition ${
            activeTab === 'upload' ? IMAGE_PANEL_TAB_ACTIVE_CLASS : IMAGE_PANEL_TAB_INACTIVE_CLASS
          }`}
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>
        <span
          className="flex-1"
          title={isAiTabLocked ? getPlanLockedTooltip('AI images', 'standard') : undefined}
        >
          <button
            type="button"
            onClick={() => setActiveTab('ai')}
            disabled={isAiTabLocked}
            aria-disabled={isAiTabLocked}
            aria-pressed={activeTab === 'ai'}
            className={`w-full inline-flex items-center justify-center gap-1 rounded px-2 py-1 text-sm font-medium transition ${
              activeTab === 'ai' ? IMAGE_PANEL_TAB_ACTIVE_CLASS : IMAGE_PANEL_TAB_INACTIVE_CLASS
            } ${isAiTabLocked ? 'cursor-not-allowed opacity-50 hover:text-muted-foreground' : ''}`}
          >
            <Sparkles className="h-4 w-4" />
            <span className="inline-flex items-center gap-1">
              AI
              {isAiTabLocked && <Lock className="h-3.5 w-3.5" />}
            </span>
          </button>
        </span>
      </div>

      <div className="flex-1 rounded-md border border-border bg-card p-3 text-sm text-foreground">
        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Choose Image</div>
              <label
                htmlFor="image-upload-input"
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/50 px-4 py-6 text-center transition hover:border-muted-foreground/40 hover:bg-accent"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-sm">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="w-full break-words text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                  {selectedUploadCount > 0
                    ? `Uploading ${selectedUploadCount} image${selectedUploadCount > 1 ? 's' : ''}...`
                    : 'Click to select images'}
                </div>
                <div className="text-xs text-muted-foreground">Supports JPG, PNG, WebP</div>
                <input
                  id="image-upload-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <div className="flex items-center gap-2">
              {isUploading && <div className="text-xs text-muted-foreground">Uploading...</div>}
            </div>
            {error && <div className="text-xs text-red-600">{error}</div>}
            {uploadBatchError && <div className="text-xs text-amber-600">{uploadBatchError}</div>}

            {uploadedItems.length > 0 && (
              <div className="overflow-hidden rounded-md border border-border bg-muted">
                <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground">
                  <span className="font-medium">Preview ({uploadedItems.length})</span>
                </div>
                <div className="grid max-h-72 grid-cols-2 gap-2 overflow-y-auto bg-foreground/5 p-2">
                  {uploadedItems.map((image) => (
                    <div key={image.publicUrl} className="overflow-hidden rounded-md border border-border bg-card">
                      <button
                        type="button"
                        draggable
                        onDragStart={(event) => handleUploadedImageDragStart(event, image)}
                        className="flex h-28 w-full cursor-grab items-center justify-center overflow-hidden bg-foreground/5 active:cursor-grabbing"
                        title="Drag onto the canvas to place it"
                        aria-label={`Drag ${image.fileName} onto the canvas`}
                      >
                        <img
                          src={image.publicUrl}
                          alt={image.fileName}
                          className="max-h-full max-w-full pointer-events-none object-contain"
                          draggable={false}
                        />
                      </button>
                      <p className="truncate px-2 py-1 text-center text-[11px] text-muted-foreground">
                        {image.fileName}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  Drag an image from preview and drop it onto the canvas.
                </p>
              </div>
            )}
          </div>
        )}
        {activeTab === 'ai' && (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
            <AIImageForm
              idea={interiorIdeaInput}
              isBookCoverMode={isBookCoverMode}
              coverState={aiCoverFormState}
              coverDimensions={coverDimensions}
              isGenerating={isAiGenerating}
              error={aiGenerateError}
              isBookCoverLocked={isBookCoverModeLocked}
              onIdeaChange={setInteriorIdeaInput}
              onBookCoverModeChange={handleBookCoverModeChange}
              onCoverStateChange={setAiCoverFormState}
              onGenerateInterior={handleGenerateInteriorImages}
              onGenerateCover={handleGenerateBookCover}
            />

            {generatedInteriorImage && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Generated image</p>
                <div className="overflow-hidden rounded-md border border-border bg-muted">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      handleGeneratedImageDragStart(
                        event,
                        generatedInteriorImage.publicUrl,
                        generatedInteriorImage.idea ? `${generatedInteriorImage.idea}.png` : null,
                      )
                    }
                    className="flex h-40 w-full cursor-grab items-center justify-center overflow-hidden bg-foreground/5 active:cursor-grabbing"
                    title="Drag onto the canvas to place it"
                    aria-label="Drag generated image onto the canvas"
                  >
                    <img
                      src={generatedInteriorImage.publicUrl}
                      alt={generatedInteriorImage.idea ?? 'Generated image'}
                      className="max-h-full max-w-full pointer-events-none object-contain"
                      draggable={false}
                    />
                  </button>
                  {generatedInteriorImage.idea && (
                    <p className="truncate px-2 py-1 text-center text-[11px] text-muted-foreground">
                      {generatedInteriorImage.idea}
                    </p>
                  )}
                </div>
              </div>
            )}

            {generatedBookCoverImageUrl && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">Generated cover background</p>
                <div className="overflow-hidden rounded-md border border-border bg-muted">
                  <button
                    type="button"
                    draggable
                    onDragStart={(event) =>
                      handleGeneratedImageDragStart(
                        event,
                        generatedBookCoverImageUrl,
                        'book-cover-generated.png',
                      )
                    }
                    className="flex h-56 w-full cursor-grab items-center justify-center overflow-hidden bg-foreground/5 active:cursor-grabbing"
                    title="Drag onto the canvas to place it"
                    aria-label="Drag generated book cover onto the canvas"
                  >
                    <img
                      src={generatedBookCoverImageUrl}
                      alt="Generated book cover background"
                      className="max-h-full max-w-full pointer-events-none object-contain"
                      draggable={false}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
