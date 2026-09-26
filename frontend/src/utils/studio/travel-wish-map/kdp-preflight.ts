import { twmSectionsProblem, type TwmMode, type TwmSection } from './content'
import {
  CHECK_MIN,
  FIRST_LINE_MIN,
  NAME_FONT_MIN,
  PITCH_MIN,
  boldSpec,
  entryHeight,
  headingHeight,
  writeInHeight,
  type TwmPage,
  type TwmPlan,
} from './layout'
import { hugTextBoxWidth } from '../studio-text-metrics'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/**
 * The last gate before a list is considered export-ready.
 *
 * Fit is already structural — pagination never places an entry past its
 * page — so this re-proves it, then checks what a reader or a reviewer would
 * notice: a place that is not in the data or under the wrong heading, a
 * fixed list with a state missing, a name twice, the pages printing a
 * different list from the one checked, a heading cut off from its entries, a
 * name that would not sit on its line, or type, boxes and writing lines
 * smaller than a large-print book promises.
 */
export function runTwmKdpPreflight(options: {
  mode: TwmMode
  sections: readonly TwmSection[]
  pages: readonly TwmPage[]
  plan: TwmPlan
  usable: (page: number) => number
  font: string
}): KdpPreflightResult {
  const { mode, sections, pages, plan, usable, font } = options
  const errors: string[] = []
  const { metrics } = plan

  const listProblem = twmSectionsProblem(mode, sections)
  if (listProblem) errors.push(listProblem)

  const listed = sections.flatMap((s) => s.names.map((name) => `${s.key}|${name}`))
  const printed = pages.flatMap((p) => p.blocks.flatMap((b) => (b.kind === 'entry' ? [`${b.group}|${b.name}`] : [])))
  if (printed.length !== listed.length || printed.some((entry, i) => entry !== listed[i])) {
    errors.push('The pages do not print the list in order.')
  }

  const bold = boldSpec(font)
  for (const entry of printed) {
    const name = entry.slice(entry.indexOf('|') + 1)
    if (hugTextBoxWidth(name, metrics.font, Infinity, bold) > plan.textWidth) {
      errors.push(`“${name}” does not fit on its line.`)
    }
  }

  const titles = new Map(sections.map((s) => [s.key, s.title]))
  pages.forEach((page, index) => {
    let y = 0
    page.blocks.forEach((block, b) => {
      if (block.kind === 'heading') {
        y += headingHeight(metrics, y === 0)
        const next = page.blocks[b + 1]
        if (next?.kind !== (block.own ? 'write' : 'entry')) errors.push('A heading is separated from its entries.')
        else if (next.kind === 'entry' && titles.get(next.group) !== block.title) {
          errors.push('An entry sits under the wrong heading.')
        }
      } else if (block.kind === 'entry') {
        y += entryHeight(plan)
      } else {
        y += writeInHeight(plan)
      }
    })
    if (page.blocks[0]?.kind !== 'heading') errors.push('A page does not open with its heading.')
    if (y > usable(index)) errors.push(`Page ${index + 1} of the list runs past the printable area.`)
  })

  const writeIns = pages.flatMap((p) => p.blocks.filter((b) => b.kind === 'write'))
  if (writeIns.length > 0 && pages.at(-1)!.blocks.some((b) => b.kind === 'entry') === false) {
    errors.push('Write-in places may not fill a page of their own.')
  }
  if (pages.slice(0, -1).some((p) => p.blocks.some((b) => b.kind === 'write'))) {
    errors.push('Write-in places belong at the end of the list.')
  }

  if (metrics.font < NAME_FONT_MIN || metrics.labelFont < NAME_FONT_MIN) errors.push('Text must stay large print.')
  if (metrics.check < CHECK_MIN) errors.push('Checkboxes must stay large enough to tick with a pen.')
  if (metrics.pitch < PITCH_MIN) errors.push('Writing lines must stay far enough apart to write on.')
  if (plan.textWidth - plan.labelWidth - metrics.labelGap < FIRST_LINE_MIN) {
    errors.push('The line after “Why I want to go” must stay long enough to write on.')
  }

  return { ok: errors.length === 0, errors }
}
