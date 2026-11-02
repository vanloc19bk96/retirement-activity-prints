import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode } from 'react'
import type { Canvas } from 'fabric'
import type { LucideIcon } from 'lucide-react'
import { Layers, PanelRightClose, SlidersHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useCanvasObjectHighlight } from '@/hooks/canvas-editor/use-canvas-object-highlight'
import { cn } from '@/lib/utils'
import { InspectorDesignTab } from './InspectorDesignTab'
import { InspectorLayersTab } from './InspectorLayersTab'

export type InspectorTab = 'design' | 'layers'

const TABS: ReadonlyArray<{ tab: InspectorTab; label: string; Icon: LucideIcon }> = [
  { tab: 'design', label: 'Design', Icon: SlidersHorizontal },
  { tab: 'layers', label: 'Layers', Icon: Layers },
]

const STORAGE_KEY = 'editor.inspector'

type StoredInspector = { isOpen: boolean; tab: InspectorTab }

function isInspectorTab(value: unknown): value is InspectorTab {
  return value === 'design' || value === 'layers'
}

function readStored(): StoredInspector {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<StoredInspector> | null
    return { isOpen: parsed?.isOpen === true, tab: isInspectorTab(parsed?.tab) ? parsed.tab : 'design' }
  } catch {
    return { isOpen: false, tab: 'design' }
  }
}

function store(value: StoredInspector): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Storage blocked (private mode); the inspector just won't remember.
  }
}

export type InspectorState = StoredInspector & {
  openTab: (tab: InspectorTab) => void
  collapse: () => void
  /** Set when the user just toggled the inspector, so focus can follow the toggle. */
  wasToggled: boolean
}

/** Open/closed and the chosen tab, remembered across visits. Owned by the editor so the toolbar can open a tab. */
export function useInspectorState(): InspectorState {
  const [state, setState] = useState<StoredInspector>(readStored)
  const [wasToggled, setWasToggled] = useState(false)

  const update = useCallback((next: StoredInspector): void => {
    setState(next)
    store(next)
  }, [])

  const openTab = useCallback(
    (tab: InspectorTab): void => {
      setWasToggled(true)
      update({ isOpen: true, tab })
    },
    [update],
  )
  const collapse = useCallback((): void => {
    setWasToggled(true)
    setState((previous) => {
      const next = { ...previous, isOpen: false }
      store(next)
      return next
    })
  }, [])

  return { ...state, openTab, collapse, wasToggled }
}

type RightInspectorProps = {
  /** The cover canvas, or the interior page that is active / in view. */
  canvas: Canvas | null
  isCover: boolean
  /** Interior page index (0-based); ignored for the cover. */
  pageIndex: number
  state: InspectorState
}

/**
 * Right-hand inspector: Design and Layers tabs, one at a time. It collapses to a narrow rail
 * so the canvas gets the room back; below the `lg` breakpoint the open panel floats over the canvas.
 */
export function RightInspector({ canvas, isCover, pageIndex, state }: RightInspectorProps): JSX.Element {
  const scopeLabel = isCover ? 'Cover' : `Page ${pageIndex + 1}`
  const highlight = useCanvasObjectHighlight(canvas)

  return (
    <TooltipProvider delayDuration={120}>
      <aside
        aria-label="Inspector"
        data-tour="inspector"
        className={cn(
          'hidden shrink-0 flex-col border-l border-border bg-background/95 md:flex',
          state.isOpen
            ? 'w-[17rem] max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:shadow-xl'
            : 'w-12',
        )}
      >
        {state.isOpen ? (
          <OpenInspector state={state}>
            {state.tab === 'design' && (
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <InspectorDesignTab canvas={canvas} scopeLabel={scopeLabel} isCover={isCover} />
              </div>
            )}
            {state.tab === 'layers' && (
              <InspectorLayersTab canvas={canvas} scopeLabel={scopeLabel} isCover={isCover} highlight={highlight} />
            )}
          </OpenInspector>
        ) : (
          <InspectorRail state={state} />
        )}
      </aside>
    </TooltipProvider>
  )
}

function tabId(tab: InspectorTab): string {
  return `inspector-tab-${tab}`
}

const PANEL_ID = 'inspector-panel'

function OpenInspector({ state, children }: { state: InspectorState; children: ReactNode }): JSX.Element {
  const tabRefs = useRef<Partial<Record<InspectorTab, HTMLButtonElement | null>>>({})

  useEffect(() => {
    if (state.wasToggled) tabRefs.current[state.tab]?.focus()
    // Only on opening: later tab changes move focus themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tabs follow the WAI-ARIA pattern: one tab stop, arrow keys move between tabs.
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    const index = TABS.findIndex(({ tab }) => tab === state.tab)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = TABS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    event.stopPropagation()
    const nextTab = TABS[nextIndex].tab
    state.openTab(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border pl-2 pr-1">
        <div role="tablist" aria-label="Inspector" className="flex min-w-0 flex-1 gap-0.5 rounded-md bg-muted p-0.5">
          {TABS.map(({ tab, label }) => {
            const isSelected = state.tab === tab
            return (
              <button
                key={tab}
                ref={(element) => {
                  tabRefs.current[tab] = element
                }}
                type="button"
                role="tab"
                id={tabId(tab)}
                aria-selected={isSelected}
                aria-controls={PANEL_ID}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => state.openTab(tab)}
                onKeyDown={handleTabKeyDown}
                className={cn(
                  'flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded px-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  isSelected
                    ? 'bg-background text-primary-text shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={state.collapse}
              aria-expanded
              aria-controls={PANEL_ID}
              aria-label="Hide inspector"
            >
              <PanelRightClose className="h-4 w-4" aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">Hide panel</TooltipContent>
        </Tooltip>
      </div>
      <div role="tabpanel" id={PANEL_ID} aria-labelledby={tabId(state.tab)} className="flex min-h-0 flex-1 flex-col">
        {children}
      </div>
    </div>
  )
}

function InspectorRail({ state }: { state: InspectorState }): JSX.Element {
  const buttonRefs = useRef<Partial<Record<InspectorTab, HTMLButtonElement | null>>>({})

  useEffect(() => {
    if (state.wasToggled) buttonRefs.current[state.tab]?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <nav aria-label="Inspector" className="flex flex-col items-center gap-1 py-2">
      {TABS.map(({ tab, label, Icon }) => (
        <Tooltip key={tab}>
          <TooltipTrigger asChild>
            <button
              ref={(element) => {
                buttonRefs.current[tab] = element
              }}
              type="button"
              onClick={() => state.openTab(tab)}
              aria-expanded={false}
              aria-controls={PANEL_ID}
              aria-label={`Open ${label}`}
              className="relative flex w-10 flex-col items-center gap-0.5 rounded-md py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="text-[9px] font-medium leading-tight">{label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
