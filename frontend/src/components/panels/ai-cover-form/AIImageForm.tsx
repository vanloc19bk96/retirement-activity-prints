import { Loader2, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { AI_IMAGE_TEXTAREA_CLASS_NAME } from '@/components/panels/ai-image-textarea-styles'
import { ToggleField } from '@/components/panels/ai-cover-form/ToggleField'
import type {
  AuthorPosition,
  CoverDimensions,
  CoverTextPosition,
  GenerateCoverPayload,
} from '@/types/cover.types'

const TITLE_POSITIONS: ReadonlyArray<{ value: CoverTextPosition; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
]

const AUTHOR_POSITIONS: ReadonlyArray<{ value: AuthorPosition; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
]

export type AICoverFormState = {
  description: string
  title: GenerateCoverPayload['title']
  subtitle: GenerateCoverPayload['subtitle']
  author: GenerateCoverPayload['author']
}

type AIImageFormProps = {
  idea: string
  isBookCoverMode: boolean
  coverState: AICoverFormState
  coverDimensions: CoverDimensions
  isGenerating: boolean
  error: string | null
  isBookCoverLocked: boolean
  onIdeaChange: (idea: string) => void
  onBookCoverModeChange: (enabled: boolean) => void
  onCoverStateChange: (next: AICoverFormState) => void
  onGenerateInterior: (idea: string) => void
  onGenerateCover: (payload: GenerateCoverPayload) => void
}

function buildCoverPayload(
  state: AICoverFormState,
  coverDimensions: CoverDimensions,
): GenerateCoverPayload {
  return {
    description: state.description.trim(),
    title: state.title.enabled
      ? state.title
      : { enabled: false, text: '', position: 'top' },
    subtitle: state.subtitle.enabled
      ? state.subtitle
      : { enabled: false, text: '', position: 'top' },
    author: state.author.enabled
      ? state.author
      : { enabled: false, text: '', position: 'bottom' },
    coverDimensions,
  }
}

export function AIImageForm({
  idea,
  isBookCoverMode,
  coverState,
  coverDimensions,
  isGenerating,
  error,
  isBookCoverLocked,
  onIdeaChange,
  onBookCoverModeChange,
  onCoverStateChange,
  onGenerateInterior,
  onGenerateCover,
}: AIImageFormProps): JSX.Element {
  const trimmedIdea = idea.trim()
  const trimmedDescription = coverState.description.trim()
  const isInputValid = isBookCoverMode ? trimmedDescription.length > 0 : trimmedIdea.length > 0
  const isFormDisabled = isGenerating

  const updateCoverState = (patch: Partial<AICoverFormState>): void => {
    onCoverStateChange({ ...coverState, ...patch })
  }

  const handleTitleEnabledChange = (enabled: boolean): void => {
    updateCoverState({
      title: enabled
        ? { ...coverState.title, enabled: true }
        : { enabled: false, text: '', position: 'top' },
    })
  }

  const handleSubtitleEnabledChange = (enabled: boolean): void => {
    updateCoverState({
      subtitle: enabled
        ? { ...coverState.subtitle, enabled: true }
        : { enabled: false, text: '', position: 'top' },
    })
  }

  const handleAuthorEnabledChange = (enabled: boolean): void => {
    updateCoverState({
      author: enabled
        ? { ...coverState.author, enabled: true }
        : { enabled: false, text: '', position: 'bottom' },
    })
  }

  const handleGenerateClick = (): void => {
    if (!isInputValid || isGenerating) return
    if (isBookCoverMode) {
      onGenerateCover(buildCoverPayload(coverState, coverDimensions))
      return
    }
    onGenerateInterior(trimmedIdea)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">Generate image</h3>
        <p className="text-xs text-muted-foreground">
          Drag the result onto the canvas when ready.
        </p>
      </div>

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-xs font-medium text-foreground">Book cover</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {isBookCoverMode
                ? 'Background artwork for your front cover.'
                : 'Turn on to generate a cover background instead of a general image.'}
            </p>
          </div>
          <Switch
            checked={isBookCoverMode}
            disabled={isFormDisabled || isBookCoverLocked}
            onCheckedChange={onBookCoverModeChange}
            aria-label="Book cover mode"
            title={isBookCoverLocked ? getPlanLockedTooltip('Book cover', 'pro') : undefined}
            className="shrink-0"
          >
            {isBookCoverLocked ? <Lock className="h-3.5 w-3.5" /> : null}
          </Switch>
        </div>
      </div>

      {!isBookCoverMode ? (
        <div className="space-y-2">
          <label htmlFor="ai-idea-input" className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Idea</span>
            <span className="text-[11px] text-muted-foreground">Any image for your page</span>
          </label>
          <textarea
            id="ai-idea-input"
            disabled={isFormDisabled}
            className={AI_IMAGE_TEXTAREA_CLASS_NAME}
            placeholder="e.g. A detective's desk with magnifying glass in black-and-white coloring-book style"
            aria-label="Idea for the image to generate"
            value={idea}
            onChange={(event) => onIdeaChange(event.target.value)}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <label
              htmlFor="cover-background-description"
              className="flex items-center justify-between gap-2 text-xs"
            >
              <span className="font-medium text-foreground">
                Background image <span className="text-red-600">*</span>
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                Auto-scales to front cover
              </span>
            </label>
            <textarea
              id="cover-background-description"
              disabled={isFormDisabled}
              className={AI_IMAGE_TEXTAREA_CLASS_NAME}
              placeholder="e.g. deep navy background with gold accents, mysterious and modern"
              aria-label="Book cover background description"
              value={coverState.description}
              onChange={(event) => updateCoverState({ description: event.target.value })}
            />
          </div>

          <ToggleField
            id="cover-title"
            label="Title"
            enabled={coverState.title.enabled}
            text={coverState.title.text}
            position={coverState.title.position}
            positionOptions={TITLE_POSITIONS}
            maxLength={80}
            placeholder="e.g. Creative Adventures"
            disabled={isFormDisabled}
            onEnabledChange={handleTitleEnabledChange}
            onTextChange={(text) =>
              updateCoverState({ title: { ...coverState.title, enabled: true, text } })
            }
            onPositionChange={(position) =>
              updateCoverState({
                title: {
                  ...coverState.title,
                  enabled: true,
                  position: position as CoverTextPosition,
                },
              })
            }
          />

          <ToggleField
            id="cover-subtitle"
            label="Subtitle"
            enabled={coverState.subtitle.enabled}
            text={coverState.subtitle.text}
            position={coverState.subtitle.position}
            positionOptions={TITLE_POSITIONS}
            maxLength={120}
            placeholder="e.g. A Creative Activity Book"
            disabled={isFormDisabled}
            onEnabledChange={handleSubtitleEnabledChange}
            onTextChange={(text) =>
              updateCoverState({ subtitle: { ...coverState.subtitle, enabled: true, text } })
            }
            onPositionChange={(position) =>
              updateCoverState({
                subtitle: {
                  ...coverState.subtitle,
                  enabled: true,
                  position: position as CoverTextPosition,
                },
              })
            }
          />

          <ToggleField
            id="cover-author"
            label="Author"
            enabled={coverState.author.enabled}
            text={coverState.author.text}
            position={coverState.author.position}
            positionOptions={AUTHOR_POSITIONS}
            maxLength={60}
            placeholder="e.g. John Smith"
            disabled={isFormDisabled}
            onEnabledChange={handleAuthorEnabledChange}
            onTextChange={(text) =>
              updateCoverState({ author: { ...coverState.author, enabled: true, text } })
            }
            onPositionChange={(position) =>
              updateCoverState({
                author: {
                  ...coverState.author,
                  enabled: true,
                  position: position as AuthorPosition,
                },
              })
            }
          />
        </div>
      )}

      {isGenerating && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {isBookCoverMode ? 'Generating cover background...' : 'Generating image...'}
        </p>
      )}

      <div className="mt-auto flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          size="sm"
          disabled={!isInputValid || isGenerating}
          onClick={handleGenerateClick}
        >
          {isGenerating ? 'Generating...' : 'Generate'}
        </Button>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}
