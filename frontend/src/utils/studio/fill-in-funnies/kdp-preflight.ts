import { PLACEHOLDER_RE, fifPrintProblem, fillStory } from './content'
import type { FittedFif } from './fit'
import {
  BLANK_MIN,
  FONT_MIN,
  HELPER_FONT_MIN,
  MAX_STORY_PAGES,
  WRITE_RULE_MIN,
  footerHeight,
  headingHeight,
  linesHeight,
  placeLine,
  titleHeight,
  wordPageHeight,
  type FifPlan,
} from './layout'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/** The paragraph text a run of laid-out lines spells, blanks written back as `[n]`. */
function spelled(fitted: FittedFif): string {
  const words: string[] = []
  for (const page of fitted.pages) {
    for (const line of page.lines) {
      line.atoms.forEach((atom, index) => {
        const piece = atom.kind === 'text' ? atom.text : `[${atom.n}]`
        if (index === 0 || atom.space) words.push(piece)
        else words[words.length - 1] += piece
      })
    }
  }
  return words.join(' ')
}

/**
 * The last gate before an activity is considered export-ready.
 *
 * Size and fit are already structural — the plan never lays out a line that
 * does not fit — so this re-proves them against the real story, then checks
 * what a reader would notice: a prompt with no blank, a blank with no prompt,
 * a story set differently from the one that was checked, or print that has
 * crept below large print.
 */
export function runFifKdpPreflight(options: {
  fitted: FittedFif
  fields: FifPlan['fields']
  family: string
}): KdpPreflightResult {
  const { fitted, fields, family } = options
  const { story, words, storyPlan, pages } = fitted
  const m = storyPlan.metrics
  const errors: string[] = []
  const warnings: string[] = []

  const problem = fifPrintProblem(story)
  if (problem) errors.push(problem)

  if (words.count !== story.blanks.length) {
    errors.push('The word list has a different number of prompts than the story has blanks.')
  }
  const drawn = new Set<number>()
  for (const page of pages) {
    for (const line of page.lines) {
      for (const atom of line.atoms) if (atom.kind === 'blank') drawn.add(atom.n)
    }
  }
  for (let n = 1; n <= story.blanks.length; n++) {
    if (!drawn.has(n)) errors.push(`Prompt ${n} has no blank in the story.`)
  }
  if ([...drawn].some((n) => n < 1 || n > story.blanks.length)) {
    errors.push('A blank in the story has no prompt on the word list.')
  }
  try {
    const filled = fillStory(story, story.blanks.map((_, i) => `word${i + 1}`)).join(' ')
    if (filled.replace(PLACEHOLDER_RE, '') !== filled) {
      errors.push('The finished story still has an empty blank.')
    }
  } catch {
    errors.push('The finished story cannot be put together from the word list.')
  }
  if (spelled(fitted) !== story.paragraphs.join(' ')) {
    errors.push('The story was set differently from the one that was checked.')
  }

  if (pages.length === 0 || pages.length > MAX_STORY_PAGES) {
    errors.push('The story does not fit on the pages it was given.')
  }
  pages.forEach((page, index) => {
    for (const line of page.lines) {
      if (placeLine(line.atoms, m, family).right > storyPlan.textWidth) {
        errors.push('A line of the story runs past the margin.')
        break
      }
    }
    const field = index === 0 ? fields.storyFirst : fields.storyNext
    const height =
      headingHeight(m.heading) +
      m.headingGap +
      (page.titleLines.length ? titleHeight(page.titleLines.length, m) : 0) +
      linesHeight(page.lines, m) +
      footerHeight(page.footer.length, m)
    if (height > field.height - storyPlan.bottomGuard) errors.push('The story does not fit on the page.')
  })
  if (wordPageHeight(words) > fields.words.height - words.bottomGuard) {
    errors.push('The word list does not fit on the page.')
  }

  if (words.metrics.font < FONT_MIN || m.font < FONT_MIN) errors.push('Text must stay large print.')
  if (words.metrics.hint < HELPER_FONT_MIN || m.number < HELPER_FONT_MIN) {
    errors.push('Hints and blank numbers must stay readable.')
  }
  if (words.ruleW < WRITE_RULE_MIN) errors.push('Writing lines must stay long enough to write on.')
  if (m.blankW < BLANK_MIN) errors.push('Story blanks must stay long enough to write on.')

  return { ok: errors.length === 0, warnings, errors }
}
