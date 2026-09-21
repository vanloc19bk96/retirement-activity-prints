import type { LucideIcon } from 'lucide-react'
import {
  LayoutGrid,
  Images,
  Lock,
  Wrench,
  SettingsIcon,
  DownloadIcon,
  SaveIcon,
  Loader2,
  BookOpen,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { PanelKey } from '@/components/layout/layout.types'
import { ComponentsPanel } from '@/components/panels/ComponentsPanel'
import { StudioPanel } from '@/components/panels/studio/StudioPanel'
import { SettingPanel } from '@/components/panels/SettingPanel'
import { DownloadPanel } from '@/components/panels/DownloadPanel'
import { PhotosPanel } from '@/components/panels/PhotosPanel'
import { ToolsPanel } from '@/components/panels/ToolsPanel'
import { SavePanel } from '@/components/panels/SavePanel'
import { AlignmentPanel } from '@/components/panels/AlignmentPanel'
import { BookInfoPanel } from '@/components/panels/BookInfoPanel'
import { useCanvasSave } from '@/context/CanvasSaveContext'
import { useAuthContext } from '@/context/AuthContext'
import { useCanvasPenTool } from '@/context/CanvasPenToolContext'
import { useEditorMode } from '@/context/EditorModeContext'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'

const iconClasses = 'h-4 w-4 shrink-0 sm:h-5 sm:w-5'

const baseItemClasses =
  'flex min-h-[2.875rem] w-full flex-col items-center justify-center gap-0.5 rounded-md px-0.5 py-1 transition-colors sm:min-h-[3.25rem] sm:px-1 sm:py-1.5'

const labelClasses =
  'max-w-full text-center text-[9px] font-medium leading-tight tracking-tight sm:text-[10px]'

const inactiveItemClasses = 'text-muted-foreground hover:text-foreground hover:bg-accent'
const activeIconClasses = 'text-primary dark:text-zinc-50'

const NAV_ITEMS: ReadonlyArray<{ panel: PanelKey; label: string; Icon: LucideIcon }> = [
  { panel: 'components', label: 'Components', Icon: LayoutGrid },
  { panel: 'studio', label: 'Studio', Icon: Sparkles },
  { panel: 'photos', label: 'Photos', Icon: Images },
  { panel: 'tools', label: 'Tools', Icon: Wrench },
  { panel: 'setting', label: 'Settings', Icon: SettingsIcon },
  { panel: 'download', label: 'Download', Icon: DownloadIcon },
]

const BOOK_COVER_NAV_ITEM: { panel: PanelKey; label: string; Icon: LucideIcon } = {
  panel: 'bookInfo',
  label: 'Book Info',
  Icon: BookOpen,
}

interface SidebarProps {
  activePanel: PanelKey
  onChangePanel: (panel: PanelKey) => void
  isPanelExpanded: boolean
}

const panelContentClasses = (panel: PanelKey, activePanel: PanelKey): string =>
  activePanel === panel ? 'block h-full' : 'hidden h-full'

export function Sidebar({
  activePanel,
  onChangePanel,
  isPanelExpanded,
}: SidebarProps): JSX.Element {
  const { saveCanvases, isSaving, hasUnsavedChanges } = useCanvasSave()
  const { user } = useAuthContext()
  const { activeDrawingTool, setActiveDrawingTool } = useCanvasPenTool()
  const { isBookCoverMode } = useEditorMode()
  const wasBookCoverModeRef = useRef(isBookCoverMode)
  const normalizedPlan = user?.plan?.trim().toLowerCase() ?? null
  const isToolsAndPhotosLocked =
    user !== null &&
    (normalizedPlan === 'starter' ||
      normalizedPlan === 'essential' ||
      normalizedPlan === 'basic' ||
      normalizedPlan === 'standard')

  const getItemClasses = (): string =>
    `${baseItemClasses} ${inactiveItemClasses}`
  const getIconClasses = (panel: PanelKey): string =>
    `${iconClasses} ${activePanel === panel ? activeIconClasses : ''}`

  const handleChangePanel = (panel: PanelKey): void => {
    if (activeDrawingTool !== 'none') {
      setActiveDrawingTool('none')
    }
    onChangePanel(panel)
  }

  useEffect(() => {
    if (!wasBookCoverModeRef.current && isBookCoverMode) {
      onChangePanel('bookInfo')
    }
    wasBookCoverModeRef.current = isBookCoverMode

    if (!isBookCoverMode && activePanel === 'bookInfo') {
      onChangePanel('components')
    }
  }, [activePanel, isBookCoverMode, onChangePanel])

  return (
    <aside className="flex h-full shrink-0 border-r border-border bg-card">
      <div className="flex w-[4.125rem] flex-col items-stretch border-r border-border py-1.5 sm:w-[4.5rem] sm:py-2 md:w-[4.75rem]">
        <nav className="flex flex-col items-stretch gap-1 px-0.5 sm:gap-1.5 sm:px-0.5">
          {NAV_ITEMS.map(({ panel, label, Icon }) => {
            const isLocked = isToolsAndPhotosLocked && (panel === 'tools' || panel === 'photos')
            const button = (
              <button
                key={panel}
                type="button"
                className={`${getItemClasses()} ${isLocked ? 'cursor-not-allowed opacity-50 hover:text-muted-foreground' : ''}`}
                onClick={() => handleChangePanel(panel)}
                disabled={isLocked}
                aria-disabled={isLocked}
              >
                <Icon className={getIconClasses(panel)} aria-hidden />
                <span className={labelClasses}>
                  <span className="inline-flex items-center gap-1">
                    {label}
                    {isLocked && <Lock className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                </span>
              </button>
            )

            if (!isLocked) return button

            const lockedTooltip =
              panel === 'tools'
                ? getPlanLockedTooltip('Tools', 'pro')
                : getPlanLockedTooltip('Photos', 'pro')

            return (
              <span key={panel} title={lockedTooltip}>
                {button}
              </span>
            )
          })}

          {isBookCoverMode && (
            <button
              type="button"
              className={getItemClasses()}
              onClick={() => handleChangePanel(BOOK_COVER_NAV_ITEM.panel)}
              aria-label={BOOK_COVER_NAV_ITEM.label}
            >
              <BOOK_COVER_NAV_ITEM.Icon
                className={getIconClasses(BOOK_COVER_NAV_ITEM.panel)}
                aria-hidden
              />
              <span className={labelClasses}>{BOOK_COVER_NAV_ITEM.label}</span>
            </button>
          )}

          <button
            type="button"
            className={`${getItemClasses()} disabled:pointer-events-none disabled:opacity-50`}
            onClick={() => {
              void saveCanvases()
            }}
            disabled={isSaving}
            aria-label={
              hasUnsavedChanges && !isSaving ? 'Save (unsaved changes)' : isSaving ? 'Saving' : 'Save'
            }
          >
            {isSaving ? (
              <Loader2
                className={`h-4 w-4 shrink-0 animate-spin sm:h-5 sm:w-5 ${
                  activePanel === 'save' ? activeIconClasses : ''
                }`}
                aria-hidden
              />
            ) : (
              <span className="relative inline-flex">
                <SaveIcon className={getIconClasses('save')} aria-hidden />
                {hasUnsavedChanges && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500 ring-2 ring-card"
                    aria-hidden
                  />
                )}
              </span>
            )}
            <span className={labelClasses}>{isSaving ? 'Saving…' : 'Save'}</span>
          </button>
        </nav>
      </div>
      <div
        className={`h-full overflow-hidden transition-[width,opacity] duration-300 ease-in-out ${
          isPanelExpanded ? 'w-[21rem] max-w-sm opacity-100' : 'w-0 max-w-0 opacity-0 pointer-events-none'
        }`}
        aria-hidden={!isPanelExpanded}
      >
        <div
          className={`w-[21rem] h-full bg-card/80 shadow-sm backdrop-blur-sm ${
            activePanel === 'setting' ? 'px-4 pt-4 pb-0' : 'p-4'
          } ${
            activePanel === 'components' || activePanel === 'studio'
              ? 'flex min-h-0 flex-col overflow-hidden'
              : 'overflow-y-auto'
          }`}
        >
          <div
            className={
              activePanel === 'components'
                ? 'flex h-full min-h-0 flex-col overflow-hidden'
                : panelContentClasses('components', activePanel)
            }
          >
            <ComponentsPanel />
          </div>
          <div
            className={
              activePanel === 'studio'
                ? 'flex h-full min-h-0 flex-col overflow-hidden'
                : panelContentClasses('studio', activePanel)
            }
          >
            <StudioPanel />
          </div>
          <div className={panelContentClasses('photos', activePanel)}>
            <PhotosPanel isOpen={activePanel === 'photos' && isPanelExpanded} />
          </div>
          <div className={panelContentClasses('tools', activePanel)}>
            <ToolsPanel />
          </div>
          <div className={panelContentClasses('setting', activePanel)}>
            <SettingPanel />
          </div>
          <div className={panelContentClasses('download', activePanel)}>
            <DownloadPanel />
          </div>
          <div className={panelContentClasses('save', activePanel)}>
            <SavePanel />
          </div>
          <div className={panelContentClasses('alignment', activePanel)}>
            <AlignmentPanel />
          </div>
          <div className={panelContentClasses('bookInfo', activePanel)}>
            <BookInfoPanel />
          </div>
        </div>
      </div>
    </aside>
  )
}
