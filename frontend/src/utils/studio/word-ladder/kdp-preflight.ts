import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { isValidWlLadder, wlCaption, wlChangeOf, wlClue, wlLevelLadders, wlLevelSpec, wlRungs, type WlLadder, type WlLevel } from './content'
import { WL_PART_KEY } from './draw'
import { WL_CLUE_MAX_LINES, WL_CLUE_MIN, WL_LETTER_MIN, clueHeight, type WlLadderPlacement, type WlPagePlan } from './layout'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 0.5 &&
    inner.top >= outer.top - 0.5 &&
    inner.left + inner.width <= outer.left + outer.width + 0.5 &&
    inner.top + inner.height <= outer.top + outer.height + 0.5
  )
}

const joined = (lines: readonly string[]) => lines.join(' ').replace(/\s+/g, ' ')

/**
 * The last gate before a Word Ladder page is accepted.
 *
 * A ladder with one step that changes two letters cannot be climbed, and
 * the reader blames themselves. So every ladder is proven, not trusted:
 * one letter changes in place on every step, no word repeats, the rung
 * count is the level's, and every rung has a clue that does not give its
 * word away. Then the page: the count it was planned for, no ladder twice,
 * squares at the level's floor or larger, letters at 16 pt and clues at
 * 14 pt or larger, every clue set as written in at most two lines level
 * with its rung, every ladder on the printable panel and clear of the
 * next; and no ladder the book already prints while the level has unused
 * ones.
 */
export function runWlKdpPreflight(options: {
  placements: readonly WlLadderPlacement[]
  plan: WlPagePlan
  level: WlLevel
  field: Box
  book?: readonly string[]
}): KdpPreflightResult {
  const { placements, plan, level, field, book = [] } = options
  const errors: string[] = []
  const spec = wlLevelSpec(level)
  const m = plan.metrics

  if (placements.length === 0) return { ok: false, errors: ['No ladders were laid out.'] }
  if (placements.length !== plan.count) errors.push('The page holds a different number of ladders than it was planned for.')
  const ids = placements.map((p) => p.ladder.id)
  if (new Set(ids).size !== ids.length) errors.push('The page prints the same ladder twice.')

  for (const p of placements) {
    const { ladder } = p
    const name = `${ladder.words[0]} to ${ladder.words[ladder.words.length - 1]}`
    if (!wlLevelLadders(level).includes(ladder)) errors.push(`“${name}” is not a ladder of this level.`)
    if (!isValidWlLadder(ladder, level)) errors.push(`“${name}” is not a sound ladder.`)
    if (ladder.words.length > plan.maxWords) errors.push(`“${name}” is taller than the page was planned for.`)
    if (ladder.words[0]!.length !== plan.length) errors.push(`“${name}” does not have ${plan.length}-letter words.`)
    const rungs = wlRungs(ladder)
    if (p.clueLines.length !== rungs.length) errors.push(`“${name}” does not have a clue for every rung.`)
    p.clueLines.forEach((lines, i) => {
      if (lines.length === 0 || lines.length > WL_CLUE_MAX_LINES) errors.push(`A clue on “${name}” needs more than two lines.`)
      if (joined(lines) !== wlClue(rungs[i] ?? '')) errors.push(`A clue on “${name}” was set differently from the one written.`)
    })
    if (p.captionLines.length === 0 || p.captionLines.length > WL_CLUE_MAX_LINES || joined(p.captionLines) !== wlCaption(ladder, p.index)) {
      errors.push(`The caption on “${name}” was set differently from the one written.`)
    }
    if (!inside(p.block, field)) errors.push(`“${name}” does not fit the printable area of this page.`)
  }
  for (let i = 1; i < placements.length; i++) {
    const above = placements[i - 1]!.block
    if (placements[i]!.block.top < above.top + above.height + m.ladderGap - 0.5) errors.push('Two ladders crowd each other.')
  }

  // Large print.
  if (m.cell < Math.ceil(spec.minCell) - 1e-6) errors.push('The squares print below this level’s size.')
  if (m.letterSize < WL_LETTER_MIN) errors.push('Letters print below 16 pt.')
  if (m.letterSize > m.cell * 0.8) errors.push('Letters are too big for their squares.')
  if (m.clueSize < WL_CLUE_MIN) errors.push('Clues print below 14 pt.')
  if (clueHeight(WL_CLUE_MAX_LINES, m.clueSize) > m.pitch - 4 + 1e-6) errors.push('A two-line clue is taller than its rung.')

  // The book.
  const inBook = new Set(book)
  const pageIds = new Set(ids)
  const fresh = wlLevelLadders(level).filter((l) => !inBook.has(l.id) && !pageIds.has(l.id)).length
  for (const id of ids) if (inBook.has(id) && fresh > 0) errors.push('The book already has one of these ladders while others are unused.')

  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

function walk(obj: StudioFabricObject, visit: (o: StudioFabricObject) => void): void {
  visit(obj)
  for (const child of obj.objects ?? []) walk(child, visit)
}

/**
 * A drawn ladder, checked against the ladder it was drawn from: its
 * caption, the two given words printed in their squares, every rung's letters hidden in its
 * own squares, a square for every letter of every word, the clues in rung
 * order, and — on Gentle only — exactly the changing square of each rung
 * shaded.
 */
export function checkWlDrawnLadder(options: { group: StudioFabricObject; ladder: WlLadder; level: WlLevel; index: number }): string[] {
  const { group, ladder, level, index } = options
  const errors: string[] = []
  const words = ladder.words
  const last = words.length - 1
  const given = new Map<string, string>()
  const answers = new Map<string, StudioFabricObject>()
  const clues: StudioFabricObject[] = []
  const shaded: StudioFabricObject[] = []
  let caption = ''
  let squares = 0
  walk(group, (o) => {
    const role = o.data?.[WL_PART_KEY]
    const key = `${o.data?.row}:${o.data?.col}`
    if (role === 'given') given.set(key, String(o.text))
    else if (role === 'answer') answers.set(key, o)
    else if (role === 'clue') clues.push(o)
    else if (role === 'shade') shaded.push(o)
    else if (role === 'caption') caption = joined(String(o.text).split('\n'))
    if (role === 'square' || role === 'shade') squares++
  })

  if (squares !== words.length * words[0]!.length) errors.push('A word is missing some of its squares.')
  for (const row of [0, last]) {
    const printed = [...words[row]!].map((_, col) => given.get(`${row}:${col}`) ?? '').join('')
    if (printed !== words[row]) errors.push(`The ladder prints ${printed || 'nothing'} instead of ${words[row]}.`)
  }
  if (given.size !== words[0]!.length * 2) errors.push('Letters are printed outside the two given words.')
  for (let row = 1; row < last; row++) {
    const hidden = [...words[row]!].map((_, col) => answers.get(`${row}:${col}`))
    if (hidden.map((o) => o?.text ?? '').join('') !== words[row]) errors.push(`The answer for rung ${row} is not ${words[row]}.`)
    if (hidden.some((o) => o?.visible !== false)) errors.push('An answer shows on the puzzle page.')
  }
  if (answers.size !== (words.length - 2) * words[0]!.length) errors.push('The answers fill squares the rungs do not have.')

  const expected = wlRungs(ladder).map((word) => wlClue(word))
  const printed = [...clues].sort((a, b) => Number(a.data?.row) - Number(b.data?.row)).map((o) => joined(String(o.text).split('\n')))
  if (printed.join('|') !== expected.join('|')) errors.push('The clues are not printed in rung order.')

  if (caption !== wlCaption(ladder, index)) errors.push('The caption does not name this ladder.')

  const shouldShade = wlLevelSpec(level).shadeChange
  const want = shouldShade ? Array.from({ length: words.length - 2 }, (_, i) => `${i + 1}:${wlChangeOf(ladder, i + 1)}`) : []
  const got = shaded.map((o) => `${o.data?.row}:${o.data?.col}`).sort()
  if (got.join(',') !== [...want].sort().join(',')) errors.push(shouldShade ? 'The shaded squares are not the ones that change.' : 'This level shades no squares.')
  return [...new Set(errors)]
}
