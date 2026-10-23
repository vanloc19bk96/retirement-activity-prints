import { memo, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { LayoutGrid, Loader2, Pencil } from 'lucide-react'

import type { LaunchProject } from '@/lib/launch-session'

const PROJECT_NAME_MAX_LENGTH = 120

type HeaderProjectTitleProps = {
  appName: string
  project: LaunchProject | null
  /** Where "All projects" goes; hidden when the hub URL is not configured. */
  projectsUrl: string | null
  isBlueHeaderSurface: boolean
  onRename: (name: string) => Promise<void>
}

function HeaderProjectTitleComponent({
  appName,
  project,
  projectsUrl,
  isBlueHeaderSurface,
  onRename,
}: HeaderProjectTitleProps): JSX.Element {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing) inputRef.current?.select()
  }, [isEditing])

  const mutedText = isBlueHeaderSurface ? 'text-primary-foreground/75' : 'text-muted-foreground'
  const hoverSurface = isBlueHeaderSurface ? 'hover:bg-primary-foreground/15' : 'hover:bg-muted'
  const focusRing = isBlueHeaderSurface
    ? 'focus-visible:ring-primary-foreground/70'
    : 'focus-visible:ring-ring'

  const startEditing = () => {
    setDraft(project?.name ?? '')
    setError(null)
    setIsEditing(true)
  }

  const submit = async (event?: FormEvent) => {
    event?.preventDefault()
    const name = draft.replace(/\s+/g, ' ').trim()
    if (!name || name === project?.name) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    try {
      await onRename(name)
      setIsEditing(false)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the project')
    } finally {
      setIsSaving(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setIsEditing(false)
      setError(null)
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      {projectsUrl && (
        <a
          href={projectsUrl}
          className={
            'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 ' +
            hoverSurface +
            ' ' +
            focusRing
          }
          title="All projects"
          aria-label="Back to all projects in the hub"
        >
          <LayoutGrid className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Projects</span>
        </a>
      )}

      {projectsUrl && (
        <span className={'h-6 w-px shrink-0 ' + (isBlueHeaderSurface ? 'bg-primary-foreground/30' : 'bg-border')} />
      )}

      <div className="flex min-w-0 flex-col">
        {project && <span className={'text-xs leading-tight ' + mutedText}>{appName}</span>}

        {!project ? (
          <span className="text-sm font-semibold leading-tight sm:text-base">{appName}</span>
        ) : isEditing ? (
          <form onSubmit={submit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              value={draft}
              maxLength={PROJECT_NAME_MAX_LENGTH}
              disabled={isSaving}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => void submit()}
              onKeyDown={onKeyDown}
              aria-label="Project name"
              aria-invalid={error ? true : undefined}
              className={
                'h-7 w-56 max-w-[50vw] rounded-md border px-2 text-sm font-semibold outline-none focus-visible:ring-2 ' +
                (isBlueHeaderSurface
                  ? 'border-primary-foreground/40 bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/60 focus-visible:ring-primary-foreground/70'
                  : 'border-input bg-background text-foreground focus-visible:ring-ring')
              }
            />
            {isSaving && <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving name" />}
          </form>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            className={
              'group -mx-1 flex min-w-0 items-center gap-1.5 rounded px-1 text-left text-sm font-semibold leading-tight outline-none transition-colors focus-visible:ring-2 sm:text-base ' +
              hoverSurface +
              ' ' +
              focusRing
            }
            title="Rename project"
            aria-label={`Project: ${project.name ?? 'Untitled'}. Rename`}
          >
            <span className="truncate">{project.name ?? 'Untitled project'}</span>
            <Pencil
              className={'h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ' + mutedText}
              aria-hidden
            />
          </button>
        )}

        {error && (
          <span role="alert" className="text-xs font-medium text-destructive">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

export const HeaderProjectTitle = memo(HeaderProjectTitleComponent)
