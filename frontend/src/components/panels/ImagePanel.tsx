import { useEffect, useMemo, useRef, useState } from 'react'
import { ImageIcon, Lock, Sparkles, Upload } from 'lucide-react'

import {
  AIImageForm,
  type AICoverFormState,
} from '@/components/panels/ai-cover-form/AIImageForm'
import { GeneratedImagesSection } from '@/components/panels/GeneratedImagesSection'
import { useAuthContext } from '@/context/AuthContext'
import { useCanvasSave } from '@/context/CanvasSaveContext'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { useEditorMode } from '@/context/EditorModeContext'
import { useAiImageDraft } from '@/hooks/use-ai-image-draft'
import { useAiImageGeneration } from '@/hooks/use-ai-image-generation'
import { useGenerateCover } from '@/hooks/use-generate-cover'
import { useUploadImage } from '@/hooks/use-upload-image'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import {
  isUserBookCoverAiLocked,
  isUserOnProPlan,
  isUserOnStandardTierPlan,
} from '@/utils/user-plan'
import { addGeneratedImage, mergeGeneratedImages } from '@/utils/ai-image-history'
import { CANVAS_LIVE_EVENT } from '@/utils/canvas-events'
import { FABRIC_HISTORY_CHANGED_EVENT } from '@/utils/fabric-canvas-history'
import { setImageDragData } from '@/utils/image-dnd'
import type { AiImageSize, AiImageType } from '@/types/ai-images.types'
import type { CoverDimensions, GenerateCoverPayload } from '@/types/cover.types'
import type { AiGeneratedImage, AiImageDraft } from '@/types/projects.types'

type ImagePanelTab = 'upload' | 'ai'

const COVER_PRINT_DPI = 300
const COVER_BLEED_INCHES = 0.125
const PLACED_IMAGES_REFRESH_DEBOUNCE_MS = 400

const DEFAULT_AI_COVER_FORM_STATE: AICoverFormState = {
  description: '',
  imageType: 'none',
  title: { enabled: false, text: '', position: 'top' },
  subtitle: { enabled: false, text: '', position: 'top' },
  author: { enabled: false, text: '', position: 'bottom' },
}

const IMAGE_PANEL_TAB_ACTIVE_CLASS =
  'bg-primary text-primary-foreground shadow-sm'
const IMAGE_PANEL_TAB_INACTIVE_CLASS =
  'text-muted-foreground hover:bg-accent hover:text-accent-foreground'

export function ImagePanel(): JSX.Element {
  const { user } = useAuthContext()
  const [activeTab, setActiveTab] = useState<ImagePanelTab>('upload')
  const [isBookCoverMode, setIsBookCoverMode] = useState<boolean>(false)
  const [selectedUploadCount, setSelectedUploadCount] = useState<number>(0)
  const [uploadedItems, setUploadedItems] = useState<Array<{ publicUrl: string; fileName: string }>>([])
  const [uploadBatchError, setUploadBatchError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [interiorIdeaInput, setInteriorIdeaInput] = useState<string>('')
  const [interiorImageType, setInteriorImageType] = useState<AiImageType>('none')
  const [interiorImageSize, setInteriorImageSize] = useState<AiImageSize>('square')
  const [aiCoverFormState, setAiCoverFormState] = useState<AICoverFormState>(
    DEFAULT_AI_COVER_FORM_STATE,
  )
  const [generatedImages, setGeneratedImages] = useState<AiGeneratedImage[]>([])
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null)
  const [placedImageUrls, setPlacedImageUrls] = useState<ReadonlySet<string> | null>(null)
  const { getPlacedImageUrls, registerGeneratedImagesGetter } = useCanvasSave()

  const { isBookCoverMode: isEditingCover } = useEditorMode()
  const { bookCoverDimensions, pageDimensions } = useCanvasSettings()
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

  const selectedImage =
    generatedImages.find((image) => image.url === selectedImageUrl) ?? generatedImages[0] ?? null

  const aiImageDraft = useMemo<AiImageDraft>(
    () => ({
      isBookCoverMode,
      idea: interiorIdeaInput,
      imageType: interiorImageType,
      imageSize: interiorImageSize,
      cover: aiCoverFormState,
      generatedImages,
      generatedImageUrl: selectedImage?.kind === 'interior' ? selectedImage.url : null,
      generatedImageIdea: selectedImage?.kind === 'interior' ? selectedImage.idea : null,
      generatedCoverImageUrl: selectedImage?.kind === 'cover' ? selectedImage.url : null,
    }),
    [
      aiCoverFormState,
      generatedImages,
      interiorIdeaInput,
      interiorImageSize,
      interiorImageType,
      isBookCoverMode,
      selectedImage,
    ],
  )

  useAiImageDraft(aiImageDraft, isStandardTierPlan, (stored) => {
    setActiveTab('ai')
    setIsBookCoverMode(stored.isBookCoverMode)
    setInteriorIdeaInput(stored.idea)
    setInteriorImageType(stored.imageType)
    setInteriorImageSize(stored.imageSize)
    setAiCoverFormState(stored.cover)
    setGeneratedImages((current) => mergeGeneratedImages(current, stored.generatedImages))
    setSelectedImageUrl((current) => current ?? stored.generatedCoverImageUrl ?? stored.generatedImageUrl)
  })

  const generatedImagesRef = useRef(generatedImages)
  generatedImagesRef.current = generatedImages
  useEffect(() => {
    registerGeneratedImagesGetter(() => generatedImagesRef.current)
  }, [registerGeneratedImagesGetter])

  // Which images are in the book changes with every edit, so this only runs while it is on screen.
  const hasGeneratedImages = generatedImages.length > 0
  useEffect(() => {
    if (activeTab !== 'ai' || !hasGeneratedImages) return
    let timer: number | null = null
    const refresh = (): void => {
      if (timer != null) window.clearTimeout(timer)
      timer = window.setTimeout(() => setPlacedImageUrls(getPlacedImageUrls()), PLACED_IMAGES_REFRESH_DEBOUNCE_MS)
    }
    refresh()
    window.addEventListener(CANVAS_LIVE_EVENT, refresh)
    window.addEventListener(FABRIC_HISTORY_CHANGED_EVENT, refresh)
    return () => {
      if (timer != null) window.clearTimeout(timer)
      window.removeEventListener(CANVAS_LIVE_EVENT, refresh)
      window.removeEventListener(FABRIC_HISTORY_CHANGED_EVENT, refresh)
    }
  }, [activeTab, getPlacedImageUrls, hasGeneratedImages])

  // Working on the cover means the form makes covers; the switch still overrides it.
  const wasEditingCoverRef = useRef(isEditingCover)
  useEffect(() => {
    if (wasEditingCoverRef.current === isEditingCover) return
    wasEditingCoverRef.current = isEditingCover
    setIsBookCoverMode(isEditingCover)
  }, [isEditingCover])

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
      const result = await generateInteriorImages({
        idea,
        imageType: interiorImageType,
        imageSize: interiorImageSize,
        pageWidthInches: pageDimensions.widthInches,
        pageHeightInches: pageDimensions.heightInches,
      })
      const image = result.images[0]
      if (!image) return
      setGeneratedImages((current) =>
        addGeneratedImage(current, {
          url: image.publicUrl,
          previewUrl: image.previewUrl,
          idea: image.idea ?? null,
          kind: 'interior',
        }),
      )
      setSelectedImageUrl(image.publicUrl)
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
      setGeneratedImages((current) =>
        addGeneratedImage(current, {
          url: result.imageUrl,
          previewUrl: result.previewUrl,
          idea: payload.description,
          kind: 'cover',
        }),
      )
      setSelectedImageUrl(result.imageUrl)
    } catch {
      // hook already sets a human-readable error message
    }
  }

  const isAiGenerating = isGeneratingInterior || isGeneratingCover
  // A failure stays visible even if the form switched mode meanwhile (entering the cover does that).
  const aiGenerateError = coverGenerateError ?? generateError

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
              imageType={interiorImageType}
              imageSize={interiorImageSize}
              pageWidthInches={pageDimensions.widthInches}
              pageHeightInches={pageDimensions.heightInches}
              isBookCoverMode={isBookCoverMode}
              coverState={aiCoverFormState}
              coverDimensions={coverDimensions}
              isGenerating={isAiGenerating}
              error={aiGenerateError}
              isBookCoverLocked={isBookCoverModeLocked}
              onIdeaChange={setInteriorIdeaInput}
              onImageTypeChange={setInteriorImageType}
              onImageSizeChange={setInteriorImageSize}
              onBookCoverModeChange={handleBookCoverModeChange}
              onCoverStateChange={setAiCoverFormState}
              onGenerateInterior={handleGenerateInteriorImages}
              onGenerateCover={handleGenerateBookCover}
            />

            <GeneratedImagesSection
              images={generatedImages}
              selectedImage={selectedImage}
              placedUrls={placedImageUrls}
              isEditingCover={isEditingCover}
              isGenerating={isAiGenerating}
              onSelectImage={setSelectedImageUrl}
            />
          </div>
        )}
      </div>
    </div>
  )
}
