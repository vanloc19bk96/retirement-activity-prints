import type { LucideIcon } from 'lucide-react'
import { BookImage, BookText, ChevronRight, Library } from 'lucide-react'
import { useState } from 'react'
import type { RightPanelKey } from '@/components/layout/layout.types'
import { CoverFacePanel } from '@/components/panels/CoverFacePanel'
import { SpinePanel } from '@/components/panels/SpinePanel'
import { Button } from '@/components/ui/button'
import { useEditorMode } from '@/context/EditorModeContext'

const iconClasses = 'h-4 w-4 shrink-0 sm:h-5 sm:w-5'

const baseItemClasses =
  'flex min-h-[2.875rem] w-full flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 transition-colors sm:min-h-[3.25rem] sm:px-1 sm:py-1.5'

const labelClasses =
  'max-w-full text-center text-[9px] font-medium leading-tight tracking-tight sm:text-[10px]'

const inactiveItemClasses = 'text-muted-foreground hover:text-foreground hover:bg-accent'
const activeIconClasses = 'text-primary dark:text-zinc-50'

const RIGHT_NAV_ITEMS: ReadonlyArray<{ panel: RightPanelKey; label: string; Icon: LucideIcon }> = [
  { panel: 'front', label: 'Front', Icon: BookImage },
  { panel: 'spine', label: 'Spine', Icon: Library },
  { panel: 'back', label: 'Back', Icon: BookText },
]

const panelContentClasses = (panel: RightPanelKey, activePanel: RightPanelKey): string =>
  activePanel === panel ? 'block h-full' : 'hidden h-full'

/** Book Cover only: icon rail on the right edge with a collapsible panel beside the canvas. */
export function RightSidebar(): JSX.Element | null {
  const { isBookCoverMode } = useEditorMode()
  const [activePanel, setActivePanel] = useState<RightPanelKey>('front')
  const [isPanelExpanded, setIsPanelExpanded] = useState(false)

  if (!isBookCoverMode) return null

  const handleChangePanel = (panel: RightPanelKey): void => {
    // Clicking the open panel's icon again collapses it.
    setIsPanelExpanded((expanded) => (panel === activePanel ? !expanded : true))
    setActivePanel(panel)
  }

  return (
    <div className="relative shrink-0">
      <aside className="flex h-full shrink-0 border-l border-border bg-card">
        <div
          className={`h-full overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${
            isPanelExpanded ? 'w-[21rem] max-w-sm opacity-100' : 'w-0 max-w-0 opacity-0 pointer-events-none'
          }`}
          aria-hidden={!isPanelExpanded}
        >
          <div className="flex h-full w-[21rem] min-h-0 flex-col overflow-hidden border-r border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
            <div className={panelContentClasses('front', activePanel)}>
              <CoverFacePanel face="front" isOpen={activePanel === 'front' && isPanelExpanded} />
            </div>
            <div className={panelContentClasses('spine', activePanel)}>
              <SpinePanel isOpen={activePanel === 'spine' && isPanelExpanded} />
            </div>
            <div className={panelContentClasses('back', activePanel)}>
              <CoverFacePanel face="back" isOpen={activePanel === 'back' && isPanelExpanded} />
            </div>
          </div>
        </div>
        <div className="flex w-[4.125rem] flex-col items-stretch py-1.5 sm:w-[4.5rem] sm:py-2 md:w-[4.75rem]">
          <nav className="flex flex-col items-stretch gap-1 px-0.5 sm:gap-1.5 sm:px-0.5">
            {RIGHT_NAV_ITEMS.map(({ panel, label, Icon }) => {
              const isActive = isPanelExpanded && activePanel === panel
              return (
                <button
                  key={panel}
                  type="button"
                  className={`${baseItemClasses} ${inactiveItemClasses}`}
                  onClick={() => handleChangePanel(panel)}
                  aria-label={label}
                  aria-pressed={isActive}
                >
                  <Icon className={`${iconClasses} ${isActive ? activeIconClasses : ''}`} aria-hidden />
                  <span className={labelClasses}>{label}</span>
                </button>
              )
            })}
          </nav>
        </div>
      </aside>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/70 backdrop-blur shadow-md border-muted-foreground/20"
        onClick={() => setIsPanelExpanded((expanded) => !expanded)}
        aria-label={isPanelExpanded ? 'Collapse panel' : 'Expand panel'}
      >
        <ChevronRight
          className={`h-4 w-4 transition-transform duration-200 ${
            isPanelExpanded ? 'rotate-0' : 'rotate-180'
          }`}
        />
      </Button>
    </div>
  )
}
