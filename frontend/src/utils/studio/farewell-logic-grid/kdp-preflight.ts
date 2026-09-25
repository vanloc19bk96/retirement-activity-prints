import type { StudioFabricObject } from '@/types/studio-template.types'
import { objectExtent } from '../studio-object-bounds'
import { harvestAnswers } from '../studio-answer-key'
import { expectedCheckCount, groupLabels, solutionRows } from './draw'
import type { LgLevel } from './levels'
import { CELL_MIN, CLUE_FONT_MIN, LABEL_FONT_MIN, MAX_CLUE_LINES } from './layout'
import type { LgLaidOut } from './pages'
import { validateLgPuzzle, type LgPuzzle } from './puzzle'
import { personOf } from './solver'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')
const clean = (text: unknown) => String(text ?? '').replace(/ /g, ' ')

/**
 * The last gate before a puzzle is export-ready.
 *
 * The logic is re-proved from scratch (one answer, reachable by deduction,
 * every clue true of it), then the print: every clue set once, in order and
 * word for word; nothing outside the safe area; type and squares above their
 * floors; and an answer page that states exactly the stored answer, with one
 * check per person in every block of its grid. Any failure is a refund.
 */
export function runLgKdpPreflight(options: {
  puzzle: LgPuzzle
  laid: LgLaidOut
  level: LgLevel
}): KdpPreflightResult {
  const { puzzle, laid, level } = options
  const plan = laid.plan
  const errors: string[] = [...validateLgPuzzle(puzzle, level)]
  const warnings: string[] = []

  const set = laid.cluePages.flat()
  if (set.length !== puzzle.clues.length || set.some((clue, i) => clue.index !== i)) {
    errors.push('The clues are not all printed once, in order.')
  }
  set.forEach((clue) => {
    if (joined(clue.lines) !== puzzle.clueTexts[clue.index]) errors.push(`Clue ${clue.index + 1} was set differently from the one written.`)
    if (clue.lines.length === 0 || clue.lines.length > MAX_CLUE_LINES) errors.push(`Clue ${clue.index + 1} runs too long.`)
  })
  if (laid.cluePages.length !== plan.pages) errors.push('The puzzle spans a different number of pages than planned.')

  if (plan.text.font < CLUE_FONT_MIN) errors.push('Clues must stay large print.')
  if (laid.grid.labelFont < LABEL_FONT_MIN || laid.grid.cell < CELL_MIN) {
    errors.push('The grid squares or labels are too small to use.')
  }

  const { content } = laid
  const inside = (objects: readonly StudioFabricObject[]) =>
    objects.every((o) => {
      const e = objectExtent(o)
      return (
        e.left >= content.left - 1 &&
        e.top >= content.top - 1 &&
        e.right <= content.left + content.width + 1 &&
        e.bottom <= content.top + content.height + 1
      )
    })
  laid.outputs.forEach((page, i) => {
    if (!inside(page.objects)) errors.push(`Something on puzzle page ${i + 1} sits outside the safe area.`)
    if (harvestAnswers(page.objects).length > 0) errors.push('A puzzle page carries part of the answer.')
  })

  const key = laid.outputs[laid.outputs.length - 1]?.answerSourceObjects ?? []
  if (!inside(key)) errors.push('Something on the answer page sits outside the safe area.')
  const answers = harvestAnswers(key)
  const checks = answers.filter((o) => o.type === 'group').length
  if (laid.answerGrid && checks !== expectedCheckCount(puzzle)) {
    errors.push('The answer grid does not mark exactly one match per person in every block.')
  }
  if (!laid.answerGrid) warnings.push('The answer page lists the answer without its grid.')

  // The answer as printed must be the stored answer, person by person.
  const printed = new Set(answers.map((o) => clean(o.text).replace(/\n/g, ' ')).filter(Boolean))
  solutionRows(puzzle).forEach((row, p) => {
    const [name, ...values] = row
    const shown =
      laid.solution.mode === 'table'
        ? values.every((value) => printed.has(value))
        : printed.has(`${name}: ${values.join(', ')}`)
    if (!shown) errors.push(`The answer for ${name} is not printed as stored.`)
    for (let g = 1; g <= puzzle.shape.K; g++) {
      const v = puzzle.solution[g]![p]!
      if (personOf({ g, v }, puzzle.solution) !== p || groupLabels(puzzle, g)[v] !== row[g]) {
        errors.push('The answer table disagrees with the stored answer.')
      }
    }
  })

  return { ok: errors.length === 0, warnings, errors }
}
