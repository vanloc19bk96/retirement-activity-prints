import { BL_LIMITS, BL_MIN_SECTION_IDEAS, blIdeaProblem, ideaKey, keysRepeat } from './content'
import {
  CHECK_MIN,
  IDEA_FONT_MIN,
  IDEA_TEXT_MIN,
  MAX_IDEA_LINES,
  headingHeight,
  rowHeight,
  writeRowHeight,
  type BlPage,
  type BlPagePlan,
  type FittedBlSection,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a list is considered export-ready.
 *
 * Fit is already structural — pagination never places a row past its page —
 * so this re-proves it against the real ideas, then checks what a reader
 * would notice: the wrong number of ideas, numbering that skips or restarts,
 * a heading stranded without its ideas, an idea not fit to print or set
 * differently from the one written, the same idea twice, a theme too thin to
 * stand, or type and boxes smaller than a large-print book promises.
 */
export function runBlKdpPreflight(options: {
  sections: readonly FittedBlSection[]
  pages: readonly BlPage[]
  plan: BlPagePlan
  usable: (page: number) => number
  count: number
}): KdpPreflightResult {
  const { sections, pages, plan, usable, count } = options
  const errors: string[] = []
  const warnings: string[] = []
  const { metrics } = plan

  const rows = pages.flatMap((page) => page.blocks.flatMap((b) => (b.kind === 'row' ? [b.item] : [])))
  if (rows.length !== count) errors.push(`The list holds ${rows.length} ideas instead of ${count}.`)
  if (rows.some((item, i) => item.number !== i + 1)) {
    errors.push('The ideas are not numbered in one unbroken run.')
  }
  const listed = sections.flatMap((section) => section.ideas)
  if (listed.length !== rows.length || listed.some((item, i) => rows[i] !== item)) {
    errors.push('The pages do not print the list in order.')
  }

  const keys = rows.map((item) => ideaKey(item.idea))
  rows.forEach((item, i) => {
    const problem = blIdeaProblem(item.idea)
    if (problem) errors.push(problem)
    if (item.lines.length > Math.min(plan.ideaLines, MAX_IDEA_LINES)) {
      errors.push('An idea needs more lines than its row reserved.')
    }
    if (joined(item.lines) !== item.idea) errors.push('An idea was set differently from the one written.')
    if (keys.slice(0, i).some((earlier) => keysRepeat(keys[i]!, earlier))) {
      errors.push(`Idea ${item.number} repeats an earlier idea.`)
    }
  })

  pages.forEach((page, index) => {
    let y = 0
    page.blocks.forEach((block, b) => {
      if (block.kind === 'heading') {
        y += headingHeight(metrics, y === 0)
        const next = page.blocks[b + 1]?.kind
        if (next !== (block.own ? 'write' : 'row')) errors.push('A heading is separated from its ideas.')
      } else if (block.kind === 'row') {
        y += rowHeight(block.item.lines.length, metrics)
      } else {
        y += writeRowHeight(metrics)
      }
    })
    if (page.blocks[0]?.kind !== 'heading') errors.push('A page does not open with its heading.')
    if (y > usable(index)) errors.push(`Page ${index + 1} of the list runs past the printable area.`)
  })

  if (sections.length < BL_LIMITS.minSections - 1) errors.push('The list needs more themes.')
  const thin = Math.min(BL_MIN_SECTION_IDEAS, Math.floor(count / Math.max(1, sections.length)))
  if (sections.some((section) => section.ideas.length < thin)) errors.push('A theme has too few ideas.')

  if (metrics.font < IDEA_FONT_MIN) errors.push('Ideas must stay large print.')
  if (metrics.check < CHECK_MIN) errors.push('Checkboxes must stay large enough to tick with a pen.')
  if (plan.textWidth < IDEA_TEXT_MIN) errors.push('Ideas must stay wide enough to read.')
  const writeIns = pages.flatMap((page) => page.blocks.filter((b) => b.kind === 'write'))
  if (writeIns.length > 0 && !pages.at(-1)!.blocks.some((b) => b.kind === 'write')) {
    errors.push('Write-in lines belong at the end of the list.')
  }

  return { ok: errors.length === 0, warnings, errors }
}
