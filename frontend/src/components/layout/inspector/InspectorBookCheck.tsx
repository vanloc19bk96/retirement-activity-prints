import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { BookCheck, CircleAlert, CircleCheck, Info, Lock, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { getPlanLockedTooltip } from '@/constants/plan-lock-tooltips'
import { useAuthContext } from '@/context/AuthContext'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { cn } from '@/lib/utils'
import { checkBook, type BookCheckReport } from '@/utils/book-preflight'
import { resolveInteriorIsLeftPage } from '@/utils/canvas-template'
import { dispatchScrollToEditorPage } from '@/utils/editor-page-navigation'
import { buildInteriorPreflightSurface, type PreflightSeverity } from '@/utils/kdp-preflight'
import { requestInteriorPages } from '@/utils/page-design-events'
import { isUserBookCheckLocked } from '@/utils/user-plan'

const SEVERITY_ICONS: Record<PreflightSeverity, { Icon: LucideIcon; className: string }> = {
  error: { Icon: CircleAlert, className: 'text-destructive-text' },
  warning: { Icon: TriangleAlert, className: 'text-amber-600 dark:text-amber-400' },
  info: { Icon: Info, className: 'text-muted-foreground' },
}

const SEVERITY_ORDER: Record<PreflightSeverity, number> = { error: 0, warning: 1, info: 2 }

/** Pages listed per finding before "and N more". */
const PAGE_LINKS_SHOWN = 8

type CheckState =
  | { status: 'idle' }
  | { status: 'running'; checked: number; total: number }
  | { status: 'done'; report: BookCheckReport }
  | { status: 'failed'; message: string }

function PageLinks({ pages }: { pages: readonly number[] }): JSX.Element | null {
  if (pages.length === 0) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {pages.slice(0, PAGE_LINKS_SHOWN).map((index) => (
        <button
          key={index}
          type="button"
          onClick={() => dispatchScrollToEditorPage(index)}
          className="h-5 rounded border border-border bg-background px-1.5 text-[10px] font-medium tabular-nums text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          aria-label={`Go to page ${index + 1}`}
        >
          {index + 1}
        </button>
      ))}
      {pages.length > PAGE_LINKS_SHOWN && (
        <span className="self-center text-[10px] text-muted-foreground">+{pages.length - PAGE_LINKS_SHOWN}</span>
      )}
    </span>
  )
}

/** Findings of a whole-book check: the book's own, then each page's problems grouped by kind. */
function ReportView({ report }: { report: BookCheckReport }): JSX.Element {
  // Page problems grouped by what they are, so 120 pages with the same margin issue read as one line.
  const grouped = new Map<string, { severity: PreflightSeverity; title: string; pages: number[] }>()
  for (const { index, issues } of report.pages) {
    for (const issue of issues) {
      const key = `${issue.ruleId}:${issue.title}`
      const entry = grouped.get(key) ?? { severity: issue.severity, title: issue.title, pages: [] }
      if (!entry.pages.includes(index)) entry.pages.push(index)
      grouped.set(key, entry)
    }
  }
  const rows = [
    ...report.bookIssues.map((issue) => ({ key: issue.id, severity: issue.severity, title: issue.title, detail: issue.detail, pages: issue.pages })),
    ...[...grouped.entries()].map(([key, entry]) => ({
      key,
      severity: entry.severity,
      title: entry.title,
      detail: `On ${entry.pages.length} ${entry.pages.length === 1 ? 'page' : 'pages'}. Open a page to see which objects.`,
      pages: entry.pages,
    })),
  ].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
  const problems = rows.filter((row) => row.severity !== 'info').length

  return (
    <div className="mt-2">
      {problems === 0 ? (
        <p className="flex items-start gap-2 rounded-md border border-emerald-600/25 bg-emerald-600/10 px-2.5 py-2 text-xs text-foreground">
          <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          All {report.pageCount} pages passed.{rows.length ? ' Notes below.' : ''}
        </p>
      ) : (
        <p className="text-xs font-medium text-foreground">
          {problems} {problems === 1 ? 'kind of problem' : 'kinds of problems'} in {report.pageCount} pages
        </p>
      )}
      {rows.length > 0 && (
        <ul aria-label="Whole book check results" className="mt-1.5 flex flex-col gap-1.5">
          {rows.map((row) => {
            const { Icon, className } = SEVERITY_ICONS[row.severity]
            return (
              <li key={row.key} className="flex gap-2 rounded-md bg-muted/40 px-2 py-1.5">
                <Icon className={cn('mt-0.5 size-3.5 shrink-0', className)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium leading-snug text-foreground">{row.title}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">{row.detail}</span>
                  <PageLinks pages={row.pages} />
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function summarizeReport(report: BookCheckReport): Record<PreflightSeverity, number> {
  const summary: Record<PreflightSeverity, number> = { error: 0, warning: 0, info: 0 }
  for (const { severity } of [...report.bookIssues, ...report.pages.flatMap((page) => page.issues)]) summary[severity] += 1
  return summary
}

/** Run the print check on every interior page at once, plus the checks only a whole book can fail. */
export function BookCheckSection(): JSX.Element {
  const { user } = useAuthContext()
  const isLocked = isUserBookCheckLocked(user)
  const { settings } = useCanvasSettings()
  const [state, setState] = useState<CheckState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  // Leaving the tab stops a running check.
  useEffect(() => () => abortRef.current?.abort(), [])

  const run = async (): Promise<void> => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const pages = await requestInteriorPages()
      setState({ status: 'running', checked: 0, total: pages.length })
      const report = await checkBook(
        pages,
        (index) =>
          buildInteriorPreflightSurface({
            width: settings.pageDimensions.widthPixels,
            height: settings.pageDimensions.heightPixels,
            marginGuide: settings.marginGuide,
            isLeftPage: resolveInteriorIsLeftPage(index),
            hasBleed: settings.addBleed,
          }),
        { signal: controller.signal, onProgress: (checked, total) => setState({ status: 'running', checked, total }) },
      )
      if (!controller.signal.aborted) setState({ status: 'done', report })
    } catch (caught) {
      if (controller.signal.aborted) return
      setState({ status: 'failed', message: caught instanceof Error ? caught.message : 'Could not check the book.' })
    }
  }

  const summary = state.status === 'done' ? summarizeReport(state.report) : null

  return (
    <div className="mx-3 mb-3 rounded-md border border-border px-3 py-2.5">
      <div className="flex items-center gap-2">
        <BookCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1 text-xs font-semibold text-foreground">Whole book</p>
        {summary && summary.error + summary.warning > 0 && (
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {summary.error} errors · {summary.warning} warnings
          </span>
        )}
      </div>
      {isLocked ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-300">
          <Lock className="size-3 shrink-0" aria-hidden />
          {getPlanLockedTooltip('Checking the whole book', 'pro')}
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Every page against the same rules, plus page count and blank pages.
          </p>
          {state.status === 'running' ? (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${state.total ? Math.round((state.checked / state.total) * 100) : 0}%` }}
                />
              </div>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {state.checked}/{state.total}
              </span>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2" onClick={() => {
                abortRef.current?.abort()
                setState({ status: 'idle' })
              }}>
                Stop
              </Button>
            </div>
          ) : (
            <Button type="button" size="sm" variant="outline" className="mt-2 h-8 w-full" onClick={() => void run()}>
              {state.status === 'done' ? 'Check again' : 'Check whole book'}
            </Button>
          )}
          {state.status === 'failed' && <p className="mt-2 text-[11px] text-destructive-text">{state.message}</p>}
          {state.status === 'done' && <ReportView report={state.report} />}
        </>
      )}
    </div>
  )
}
