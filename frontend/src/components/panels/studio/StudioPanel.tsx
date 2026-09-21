import { useEffect, useState } from 'react'
import { ArrowLeft, Lock } from 'lucide-react'
import { getStudioTemplate } from '@/constants/studio-templates'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { isStarterStudioTemplate } from '@/constants/studio-plan-access'
import { useStudioTemplates } from '@/hooks/studio/use-studio-templates'
import { useAuthContext } from '@/context/AuthContext'
import {
  isUserStudioBookBuilderLocked,
  isUserStudioTemplateLibraryLimited,
} from '@/utils/user-plan'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { StudioCategoryTabs } from './StudioCategoryTabs'
import { StudioTagChips } from './StudioTagChips'
import { StudioTemplateCard } from './StudioTemplateCard'
import { StudioTemplateConfigForm } from './StudioTemplateConfigForm'
import { StudioBookBuilderPanel } from './StudioBookBuilderPanel'

type StudioPanelMode = 'single' | 'book'

const PANEL_MODES: { value: StudioPanelMode; label: string }[] = [
  { value: 'single', label: 'Single' },
  { value: 'book', label: 'Build a book' },
]

export function StudioPanel() {
  const { user } = useAuthContext()
  const { templates, category, setCategory, tag, setTag, query, setQuery } =
    useStudioTemplates(user)
  const [panelMode, setPanelMode] = useState<StudioPanelMode>('single')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const activeTemplate = activeKey ? getStudioTemplate(activeKey) : null
  const isBookBuilderLocked = isUserStudioBookBuilderLocked(user)
  // Guards a form left open when the plan changes (or downgrades) mid-session.
  const isActiveTemplateLocked = activeTemplate
    ? isUserStudioTemplateLibraryLimited(user) && !isStarterStudioTemplate(activeTemplate.key)
    : false

  useEffect(() => {
    if (!isBookBuilderLocked || panelMode !== 'book') return
    setPanelMode('single')
  }, [isBookBuilderLocked, panelMode])

  useEffect(() => {
    if (!isActiveTemplateLocked) return
    setActiveKey(null)
  }, [isActiveTemplateLocked])

  if (activeTemplate && !isActiveTemplateLocked) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setActiveKey(null)}
            aria-label="Back to templates"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Button>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-foreground">
              {activeTemplate.label}
            </h2>
            {activeTemplate.pageCount === 2 ? (
              <p className="text-xs text-muted-foreground">2-page spread</p>
            ) : null}
          </div>
        </div>

        <StudioTemplateConfigForm
          key={activeTemplate.key}
          template={activeTemplate}
          onBack={() => setActiveKey(null)}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex gap-1 rounded-md bg-muted p-1" role="tablist" aria-label="Studio mode">
        {PANEL_MODES.map((mode) => {
          const isLocked = mode.value === 'book' && isBookBuilderLocked
          const tab = (
            <button
              type="button"
              role="tab"
              aria-selected={panelMode === mode.value}
              aria-disabled={isLocked}
              disabled={isLocked}
              onClick={() => setPanelMode(mode.value)}
              className={cn(
                'inline-flex w-full items-center justify-center gap-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                panelMode === mode.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                isLocked && 'cursor-not-allowed opacity-50 hover:text-muted-foreground',
              )}
            >
              {mode.label}
              {isLocked ? <Lock className="h-3.5 w-3.5" aria-hidden /> : null}
            </button>
          )

          return (
            <span
              key={mode.value}
              className="flex-1"
              title={isLocked ? getPlanLockedTooltip('Build a book', 'pro') : undefined}
            >
              {tab}
            </span>
          )
        })}
      </div>

      {panelMode === 'book' && !isBookBuilderLocked ? (
        <StudioBookBuilderPanel />
      ) : (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            aria-label="Search templates"
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          />

          <StudioCategoryTabs value={category} onChange={setCategory} />

          <StudioTagChips value={tag} onChange={setTag} />

          <div className="min-h-0 flex-1 overflow-y-auto">
            {templates.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                No templates match “{query}”.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {templates.map(({ template, isLocked }) => (
                  <StudioTemplateCard
                    key={template.key}
                    template={template}
                    isLocked={isLocked}
                    onSelect={() => setActiveKey(template.key)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
