import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { MainContent } from '@/components/layout/MainContent'
import { Header } from '@/components/layout/Header'
import { PageThumbnails } from '@/components/layout/PageThumbnails'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toaster'
import { BookProvider } from '@/context/BookContext'
import { CanvasSettingsProvider, useCanvasSettings } from '@/context/CanvasSettingsContext'
import { CanvasSaveProvider } from '@/context/CanvasSaveContext'
import { CanvasExportProvider } from '@/context/CanvasExportContext'
import { PageThumbnailsProvider, usePageThumbnails } from '@/context/PageThumbnailsContext'
import { CanvasPenToolProvider } from '@/context/CanvasPenToolContext'
import { EditorModeProvider } from '@/context/EditorModeContext'
import { StudioTargetProvider } from '@/context/StudioTargetContext'
import { CanvasStateStore } from '@/utils/canvas-state-store'
import {
  onOpenComponentsElement,
  onOpenEditorPanel,
} from '@/utils/editor-panel-navigation'
import type { PanelKey } from '@/components/layout/layout.types'

function StudioTargetBridge({
  canvasStateStore,
  children,
}: {
  canvasStateStore: CanvasStateStore
  children: ReactNode
}) {
  const { activePageIndex } = usePageThumbnails()
  const { settings } = useCanvasSettings()
  return (
    <StudioTargetProvider
      canvasStateStore={canvasStateStore}
      currentPageIndex={activePageIndex}
      interiorPageCount={settings.pageCount}
    >
      {children}
    </StudioTargetProvider>
  )
}

export function MainLayout(): JSX.Element {
  const [activePanel, setActivePanel] = useState<PanelKey>('components')
  const [canvasStateStore] = useState(() => new CanvasStateStore())

  const [collapsedPanels, setCollapsedPanels] = useState<Record<PanelKey, boolean>>({
    components: false,
    studio: false,
    photos: false,
    tools: false,
    setting: false,
    download: false,
    save: false,
    alignment: false,
    bookInfo: false,
  })

  const isPanelExpanded = !collapsedPanels[activePanel]
  const openPanel = useCallback((panel: PanelKey): void => {
    setActivePanel(panel)
    setCollapsedPanels((value) => ({
      ...value,
      [panel]: false,
    }))
  }, [])

  // Studio resource-library buttons → Sidebar Components (panel expands if collapsed).
  useEffect(() => {
    return onOpenComponentsElement(() => {
      openPanel('components')
    })
  }, [openPanel])

  // Components Back (from Studio deep-link) → restore previous Sidebar panel.
  useEffect(() => {
    return onOpenEditorPanel(({ panel }) => {
      openPanel(panel)
    })
  }, [openPanel])

  const handleOpenAlignmentPanel = useCallback((): void => {
    openPanel('alignment')
  }, [openPanel])

  return (
    <BookProvider>
      <EditorModeProvider>
        <CanvasSettingsProvider>
          <CanvasExportProvider>
            <PageThumbnailsProvider>
              <CanvasSaveProvider>
                <CanvasPenToolProvider>
                  <StudioTargetBridge canvasStateStore={canvasStateStore}>
                    <div className="h-screen bg-background text-foreground flex flex-col">
                      <Header />
                      <div className="flex flex-1 overflow-hidden">
                        <div className="relative shrink-0">
                          <Sidebar
                            activePanel={activePanel}
                            onChangePanel={setActivePanel}
                            isPanelExpanded={isPanelExpanded}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-background/70 backdrop-blur shadow-md border-muted-foreground/20"
                            onClick={() =>
                              setCollapsedPanels((value) => ({
                                ...value,
                                [activePanel]: !value[activePanel],
                              }))
                            }
                            aria-label={isPanelExpanded ? 'Collapse panel' : 'Expand panel'}
                          >
                            <ChevronLeft
                              className={`h-4 w-4 transition-transform duration-200 ${
                                isPanelExpanded ? 'rotate-0' : 'rotate-180'
                              }`}
                            />
                          </Button>
                        </div>
                        <PageThumbnails />
                        <MainContent
                          onOpenAlignmentPanel={handleOpenAlignmentPanel}
                          canvasStateStore={canvasStateStore}
                        />
                      </div>
                      <Toaster />
                    </div>
                  </StudioTargetBridge>
                </CanvasPenToolProvider>
              </CanvasSaveProvider>
            </PageThumbnailsProvider>
          </CanvasExportProvider>
        </CanvasSettingsProvider>
      </EditorModeProvider>
    </BookProvider>
  )
}
