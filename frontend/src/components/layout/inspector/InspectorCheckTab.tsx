import { useEffect } from 'react'
import type { JSX } from 'react'
import type { Canvas, FabricObject } from 'fabric'
import type { LucideIcon } from 'lucide-react'
import { ChevronRight, CircleAlert, CircleCheck, ClipboardCheck, Info, TriangleAlert } from 'lucide-react'

import { cn } from '@/lib/utils'
import { selectLayers, setLayerVisible } from '@/utils/canvas-layers'
import { BookCheckSection } from './InspectorBookCheck'
import {
  MIN_RECOMMENDED_IMAGE_DPI,
  summarizePreflight,
  type PreflightIssue,
  type PreflightSeverity,
} from '@/utils/kdp-preflight'

const SEVERITY_STYLES: Record<PreflightSeverity, { Icon: LucideIcon; className: string; label: string }> = {
  error: { Icon: CircleAlert, className: 'text-destructive-text', label: 'Error' },
  warning: { Icon: TriangleAlert, className: 'text-amber-600 dark:text-amber-400', label: 'Warning' },
  info: { Icon: Info, className: 'text-muted-foreground', label: 'Note' },
}

const CHECKED_RULES = [
  'Text stays inside the margins (cover: the safe area)',
  'Spine text fits the spine',
  `Images are at least ${MIN_RECOMMENDED_IMAGE_DPI} DPI`,
  'Edge-to-edge art reaches the bleed edge',
  'Nothing covers the barcode area (cover)',
  'Nothing sits off the page, hidden or empty',
]

type InspectorCheckTabProps = {
  canvas: Canvas | null
  scopeLabel: string
  isCover: boolean
  issues: PreflightIssue[]
  layerCount: number
  getObject: (layerId: string) => FabricObject | null
  highlight: (object: FabricObject | null) => void
}

export function InspectorCheckTab({
  canvas,
  scopeLabel,
  isCover,
  issues,
  layerCount,
  getObject,
  highlight,
}: InspectorCheckTabProps): JSX.Element {
  const summary = summarizePreflight(issues)
  const problemCount = summary.error + summary.warning

  // Leaving the tab mid-hover must not leave an outline stuck on the canvas.
  useEffect(() => () => highlight(null), [highlight])

  const reveal = (issue: PreflightIssue): void => {
    const object = getObject(issue.layerId)
    if (canvas && object) selectLayers(canvas, [object])
  }

  const showHiddenLayer = (issue: PreflightIssue): void => {
    const object = getObject(issue.layerId)
    if (!canvas || !object) return
    setLayerVisible(canvas, object, true)
    selectLayers(canvas, [object])
  }

  return (
    <div className="flex flex-col">
      <p className="truncate px-3 pb-1 pt-2.5 text-[11px] text-muted-foreground">{scopeLabel} · print check</p>

      <div className="px-3 pb-3 pt-1">
        {layerCount === 0 ? (
          <div className="flex items-start gap-2.5 rounded-md border border-dashed border-border px-3 py-2.5">
            <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{canvas ? 'Nothing to check yet' : 'Checking…'}</p>
              <p className="text-xs leading-snug text-muted-foreground">
                Add text, images or shapes; the checks run as you work.
              </p>
            </div>
          </div>
        ) : problemCount === 0 ? (
          <div className="flex items-start gap-2.5 rounded-md border border-emerald-600/25 bg-emerald-600/10 px-3 py-2.5">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{canvas ? 'Ready to print' : 'Checking…'}</p>
              <p className="text-xs leading-snug text-muted-foreground">
                {summary.info > 0
                  ? `No problems on this ${isCover ? 'cover' : 'page'}. ${summary.info} ${summary.info === 1 ? 'note' : 'notes'} below.`
                  : `No problems found on this ${isCover ? 'cover' : 'page'}.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2.5">
            <p className="text-sm font-medium text-foreground">
              {problemCount} {problemCount === 1 ? 'problem' : 'problems'} to fix
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
              {summary.error > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-medium text-destructive-text">
                  <CircleAlert className="size-3" aria-hidden />
                  {summary.error} {summary.error === 1 ? 'error' : 'errors'}
                </span>
              )}
              {summary.warning > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-300">
                  <TriangleAlert className="size-3" aria-hidden />
                  {summary.warning} {summary.warning === 1 ? 'warning' : 'warnings'}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {issues.length > 0 && (
        <ul aria-label="Print check results" className="flex flex-col gap-1 px-1.5 pb-2">
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              onReveal={reveal}
              onShowHidden={showHiddenLayer}
              onHover={(isHovered) => highlight(isHovered ? getObject(issue.layerId) : null)}
            />
          ))}
        </ul>
      )}

      {!isCover && <BookCheckSection />}

      <details className="group mx-3 mb-3 rounded-md border border-border text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-medium text-foreground marker:hidden focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
          What's checked
        </summary>
        <ul className="space-y-1 px-3 pb-2.5 pl-8 text-muted-foreground">
          {CHECKED_RULES.map((rule) => (
            <li key={rule} className="list-disc">
              {rule}
            </li>
          ))}
        </ul>
      </details>

      <p className="px-3 pb-3 text-[11px] leading-snug text-muted-foreground">
        {isCover ? 'Checks the cover only.' : 'The list above is this page; Whole book checks every page.'} Before
        publishing, also look through your files in KDP's Print Previewer.
      </p>
    </div>
  )
}

function IssueRow({
  issue,
  onReveal,
  onShowHidden,
  onHover,
}: {
  issue: PreflightIssue
  onReveal: (issue: PreflightIssue) => void
  onShowHidden: (issue: PreflightIssue) => void
  onHover: (isHovered: boolean) => void
}): JSX.Element {
  const { Icon, className, label } = SEVERITY_STYLES[issue.severity]
  const isHidden = issue.ruleId === 'hidden-layer'

  return (
    <li
      className="group relative flex rounded-md transition-colors hover:bg-accent/70"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
    >
      <button
        type="button"
        onClick={() => onReveal(issue)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        className="flex min-w-0 flex-1 items-start gap-2 rounded-md px-1.5 py-2 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
        aria-label={`${label}: ${issue.title}, ${issue.layerName}. ${issue.detail}`}
        // Hidden layers can't be selected on the canvas; their row offers "Show" instead.
        disabled={isHidden}
      >
        <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium leading-snug text-foreground">{issue.title}</span>
          <span className="block truncate text-[11px] leading-snug text-muted-foreground">{issue.layerName}</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">{issue.detail}</span>
        </span>
      </button>
      {isHidden && (
        <button
          type="button"
          onClick={() => onShowHidden(issue)}
          className="mr-1.5 mt-1.5 h-6 shrink-0 self-start rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          Show
        </button>
      )}
    </li>
  )
}
