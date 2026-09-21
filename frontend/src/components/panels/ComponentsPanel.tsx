import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  FileCode2,
  ImageIcon,
  Lock,
  ShapesIcon,
  Smile,
  Sparkles,
  TypeIcon,
  type LucideIcon,
} from 'lucide-react'

import type { ComponentElementKey, PanelKey } from '@/components/layout/layout.types'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthContext } from '@/context/AuthContext'
import { cn } from '@/lib/utils'
import { ImagePanel } from '@/components/panels/ImagePanel'
import { TextPanel } from '@/components/panels/TextPanel'
import { ShapePanel } from '@/components/panels/ShapePanel'
import { IconPanel } from '@/components/panels/IconPanel'
import { EmojiPanel } from '@/components/panels/EmojiPanel'
import { SvgPanel } from '@/components/panels/SvgPanel'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import {
  dispatchOpenEditorPanel,
  onOpenComponentsElement,
} from '@/utils/editor-panel-navigation'
import { isUserEmojisLocked, isUserIconsLocked } from '@/utils/user-plan'

type ComponentsPanelView = 'elements' | ComponentElementKey

const ELEMENT_ITEMS: ReadonlyArray<{
  key: ComponentElementKey
  label: string
  description: string
  Icon: LucideIcon
}> = [
  {
    key: 'image',
    label: 'Image',
    description: 'Upload, AI, and drag images onto the canvas.',
    Icon: ImageIcon,
  },
  {
    key: 'text',
    label: 'Text',
    description: 'Add and style text on the canvas.',
    Icon: TypeIcon,
  },
  {
    key: 'shape',
    label: 'Shape',
    description: 'Insert shapes and paths.',
    Icon: ShapesIcon,
  },
  {
    key: 'icon',
    label: 'Icons',
    description: 'Drag icons onto the canvas.',
    Icon: Sparkles,
  },
  {
    key: 'emoji',
    label: 'Emojis',
    description: 'Drag emojis onto the canvas.',
    Icon: Smile,
  },
  {
    key: 'svg',
    label: 'SVG',
    description: 'Upload SVGs and drag them onto the canvas.',
    Icon: FileCode2,
  },
]

const ELEMENT_ROW_CLASS =
  'flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const ELEMENT_ROW_LOCKED_CLASS =
  'cursor-not-allowed opacity-50 hover:bg-card hover:text-foreground'

function isElementLocked(key: ComponentElementKey, user: { plan: string | null } | null): boolean {
  if (key === 'icon') return isUserIconsLocked(user)
  if (key === 'emoji') return isUserEmojisLocked(user)
  return false
}

function getElementLockedTooltip(key: ComponentElementKey): string | null {
  if (key === 'icon') return getPlanLockedTooltip('Icons', 'standard')
  if (key === 'emoji') return getPlanLockedTooltip('Emojis', 'pro')
  return null
}

export function ComponentsPanel(): JSX.Element {
  const { user } = useAuthContext()
  const [view, setView] = useState<ComponentsPanelView>('elements')
  // Set when opened from Studio (or another panel) so Back restores that panel.
  const [returnPanel, setReturnPanel] = useState<PanelKey | null>(null)

  useEffect(() => {
    if (view === 'elements') return
    if (!isElementLocked(view, user)) return
    setView('elements')
    setReturnPanel(null)
  }, [user, view])

  // Studio (and other callers) deep-link into a nested library view.
  useEffect(() => {
    return onOpenComponentsElement(({ element, returnPanel: nextReturnPanel }) => {
      setReturnPanel(nextReturnPanel ?? null)
      if (isElementLocked(element, user)) {
        setView('elements')
        setReturnPanel(null)
        return
      }
      setView(element)
    })
  }, [user])

  const handleBack = (): void => {
    if (returnPanel) {
      const panel = returnPanel
      setReturnPanel(null)
      setView('elements')
      dispatchOpenEditorPanel(panel)
      return
    }
    setView('elements')
  }

  const activeTitle =
    view === 'elements'
      ? 'Elements'
      : ELEMENT_ITEMS.find((item) => item.key === view)?.label ?? 'Elements'

  const backAriaLabel =
    returnPanel === 'studio' ? 'Back to Studio' : 'Back to Elements'

  return (
    <TooltipProvider delayDuration={120}>
      <section className="flex h-full min-h-0 w-full flex-col gap-4">
        <header className="flex shrink-0 flex-col gap-2">
          <div className="flex items-center gap-2">
            {view !== 'elements' ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={handleBack}
                aria-label={backAriaLabel}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">Components</h2>
              <p className="text-xs text-muted-foreground">{activeTitle}</p>
            </div>
          </div>
        </header>

        {view === 'elements' ? (
          <div className="min-h-0 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Elements</p>
            <ul className="flex flex-col gap-2" role="list">
              {ELEMENT_ITEMS.map(({ key, label, description, Icon }) => {
                const isLocked = isElementLocked(key, user)
                const lockedTooltip = getElementLockedTooltip(key)

                const elementButton = (
                  <button
                    type="button"
                    className={cn(ELEMENT_ROW_CLASS, isLocked && ELEMENT_ROW_LOCKED_CLASS)}
                    onClick={() => {
                      if (isLocked) return
                      setReturnPanel(null)
                      setView(key)
                    }}
                    aria-disabled={isLocked}
                    disabled={isLocked}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
                      <Icon className="h-4 w-4 text-foreground" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                        {label}
                        {isLocked ? <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                    </span>
                  </button>
                )

                return (
                  <li key={key}>
                    {isLocked && lockedTooltip ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="block w-full">{elementButton}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top">{lockedTooltip}</TooltipContent>
                      </Tooltip>
                    ) : (
                      elementButton
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {view !== 'elements' ? (
          <div
            className={
              view === 'icon' || view === 'emoji'
                ? 'flex min-h-0 flex-1 flex-col overflow-hidden'
                : 'flex min-h-0 flex-1 flex-col overflow-y-auto'
            }
          >
            {view === 'image' ? <ImagePanel /> : null}
            {view === 'text' ? <TextPanel /> : null}
            {view === 'shape' ? <ShapePanel /> : null}
            {view === 'icon' ? <IconPanel /> : null}
            {view === 'emoji' ? <EmojiPanel /> : null}
            {view === 'svg' ? <SvgPanel /> : null}
          </div>
        ) : null}
      </section>
    </TooltipProvider>
  )
}
