import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { Canvas } from 'fabric'
import { Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { useAuthContext } from '@/context/AuthContext'
import { useCanvasDerivedState } from '@/hooks/canvas-editor/use-canvas-derived-state'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { isPageBackground, type PageScope } from '@/utils/page-design'
import {
  removeRepeatedObjects,
  repeatSelectionOnPages,
  selectionRepeatGroup,
  setPagesBackground,
} from '@/utils/page-design-actions'
import { isUserPageToolsLocked } from '@/utils/user-plan'
import { InspectorSection } from './inspector-controls'

const SCOPES: ReadonlyArray<{ scope: PageScope; label: string }> = [
  { scope: 'this', label: 'This page' },
  { scope: 'all', label: 'All' },
  { scope: 'odd', label: 'Odd' },
  { scope: 'even', label: 'Even' },
]

const DEFAULT_BACKGROUND = '#f6f1e7'

const readBackground = (canvas: Canvas): string | null => {
  const fill = canvas.getObjects().find((obj) => isPageBackground(obj as { data?: unknown }))?.fill
  return typeof fill === 'string' ? fill : null
}

const sameValue = <T,>(a: T, b: T): boolean => a === b

const pagesLabel = (count: number): string => (count === 1 ? '1 page' : `${count} pages`)

function ScopePicker({
  value,
  onChange,
  disabled,
  scopes = SCOPES,
}: {
  value: PageScope
  onChange: (scope: PageScope) => void
  disabled: boolean
  scopes?: ReadonlyArray<{ scope: PageScope; label: string }>
}): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="Pages"
      className="grid gap-0.5 rounded-md bg-muted/60 p-0.5"
      style={{ gridTemplateColumns: `repeat(${scopes.length}, minmax(0, 1fr))` }}
    >
      {scopes.map(({ scope, label }) => (
        <button
          key={scope}
          type="button"
          role="radio"
          aria-checked={value === scope}
          disabled={disabled}
          onClick={() => onChange(scope)}
          className={cn(
            'h-7 truncate rounded px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
            value === scope && 'bg-background text-foreground shadow-sm',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ProNote({ feature }: { feature: string }): JSX.Element {
  return (
    <p className="mb-2 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
      <Lock className="size-3 shrink-0" aria-hidden />
      {getPlanLockedTooltip(feature, 'pro')}
    </p>
  )
}

/** Run a page tool, then say in a toast what it changed (or why it could not). */
function usePageToolRunner(): { isBusy: boolean; run: (action: () => Promise<number>, done: (pages: number) => string) => void } {
  const { toast } = useToast()
  const [isBusy, setIsBusy] = useState(false)
  const run = (action: () => Promise<number>, done: (pages: number) => string): void => {
    setIsBusy(true)
    action()
      .then(
        (pages) => toast({ title: pages ? 'Pages updated' : 'Nothing to change', description: pages ? done(pages) : 'Those pages already look like that.' }),
        (caught: unknown) => toast({ title: 'Pages not changed', description: caught instanceof Error ? caught.message : 'Could not change the pages.' }),
      )
      .finally(() => setIsBusy(false))
  }
  return { isBusy, run }
}

/** Page background colour for this page or a set of pages; shown on an interior page with nothing selected. */
export function PageBackgroundSection({ canvas }: { canvas: Canvas | null }): JSX.Element {
  const { user } = useAuthContext()
  const isLocked = isUserPageToolsLocked(user)
  const current = useCanvasDerivedState(canvas, readBackground, sameValue, null)
  const [color, setColor] = useState<string>(current ?? DEFAULT_BACKGROUND)
  // Open a page with a background: start from its colour.
  useEffect(() => {
    if (current) setColor(current)
  }, [current])
  const [scope, setScope] = useState<PageScope>('this')
  const { isBusy, run } = usePageToolRunner()
  const disabled = isLocked || isBusy || !canvas

  return (
    <InspectorSection title="Page background" hint={current ? undefined : 'none'}>
      {isLocked && <ProNote feature="Page backgrounds" />}
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label="Background colour"
          value={color}
          disabled={disabled}
          onChange={(event) => setColor(event.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{color}</span>
      </div>
      <div className="mt-2">
        <ScopePicker value={scope} onChange={setScope} disabled={disabled} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={disabled}
          onClick={() => run(() => setPagesBackground(scope, color), (pages) => `Background set on ${pagesLabel(pages)}.`)}
        >
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={disabled}
          onClick={() => run(() => setPagesBackground(scope, null), (pages) => `Background removed from ${pagesLabel(pages)}.`)}
        >
          Remove
        </Button>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        A colour background costs more to print: choose a colour interior in KDP. With bleed on it runs to the page edge.
      </p>
    </InspectorSection>
  )
}

const REPEAT_SCOPES = SCOPES.filter(({ scope }) => scope !== 'this')

/** Copy the selection onto other pages (a border, a header, a watermark), or take its copies off every page. */
export function RepeatOnPagesSection({ canvas }: { canvas: Canvas }): JSX.Element {
  const { user } = useAuthContext()
  const isLocked = isUserPageToolsLocked(user)
  const group = useCanvasDerivedState(canvas, selectionRepeatGroup, sameValue, null)
  const [scope, setScope] = useState<PageScope>('all')
  const { isBusy, run } = usePageToolRunner()
  const disabled = isLocked || isBusy

  return (
    <InspectorSection title="Repeat on pages" hint={group ? 'repeated' : undefined}>
      {isLocked && <ProNote feature="Repeating objects on pages" />}
      <ScopePicker value={scope} onChange={setScope} disabled={disabled} scopes={REPEAT_SCOPES} />
      <div className={cn('mt-2 grid gap-1.5', group ? 'grid-cols-2' : 'grid-cols-1')}>
        <Button
          type="button"
          size="sm"
          className="h-8"
          disabled={disabled}
          onClick={() => run(() => repeatSelectionOnPages(canvas, scope), (pages) => `Placed on ${pagesLabel(pages)}.`)}
        >
          {group ? 'Update copies' : 'Repeat'}
        </Button>
        {group && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            disabled={disabled}
            onClick={() => run(() => removeRepeatedObjects(group), (pages) => `Removed from ${pagesLabel(pages)}.`)}
          >
            Remove all
          </Button>
        )}
      </div>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        {group
          ? 'Change it here, then Update copies to change it on every page.'
          : 'Puts a copy in the same place on each page: borders, headers, watermarks.'}
      </p>
    </InspectorSection>
  )
}
