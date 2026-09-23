import type { StudioFabricObject } from '@/types/studio-template.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import {
  buildGroup,
  buildRect,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import { unionObjectBounds, type Box } from '../studio-layout'
import { hugTextBoxWidth } from '../studio-text-metrics'
import type { PhraseModel, PhraseWord } from './phrase'
import {
  CLUE_LINE_HEIGHT,
  RULE_HEIGHT,
  RULE_RATIO,
  rowWidth,
  type PhraseFinderMetrics,
  type PhraseFinderPagePlan,
  type PhraseFinderPuzzleLayout,
} from './layout'

export interface PhraseFinderPuzzle {
  model: PhraseModel
  /** The line printed above the blanks — what makes one wording the answer. */
  clue: string
  /** Letter indices printed in before the solver starts. */
  revealed: ReadonlySet<number>
}

/**
 * One phrase, drawn a cell at a time.
 *
 * Every letter of the answer owns a slot, and the letter is drawn into that
 * slot whether it is given or not — a given letter prints, a hidden one is an
 * invisible `answer` object sitting exactly where the solver will write it. Two
 * things follow from that, and both matter more than they look.
 *
 * The solution page is this page with the blanks filled, at the very positions
 * the blanks were, so a reader checking an answer is looking at the row they
 * just solved rather than a bare line of prose somewhere else in the book. And
 * because both pages are read off one model, they cannot drift: there is no
 * second copy of the phrase to fall out of step with the first.
 *
 * Nothing on the row distinguishes a given letter by colour, weight or tint. It
 * is distinguished by *being printed at all*, which is the only difference that
 * survives a black-and-white interior, a photocopy, and a reader who does not
 * see colour. Every glyph sits on one baseline, lifted just off its rule — a
 * given letter floating at a different height from the one beside it is the
 * difference between a phrase and a ransom note.
 */
function drawWord(
  objects: StudioFabricObject[],
  options: {
    left: number
    baselineY: number
    word: PhraseWord
    revealed: ReadonlySet<number>
    metrics: PhraseFinderMetrics
    font: string
    tag: StudioTag
  },
): number {
  const { left, baselineY, word, revealed, metrics, font, tag } = options
  const { slotW, markW, letterFont, letterLift } = metrics
  const ruleW = Math.round(slotW * RULE_RATIO)
  const spec = { fontFamily: font }
  let x = left

  for (const cell of word.cells) {
    const width = cell.kind === 'letter' ? slotW : markW
    const centerX = x + width / 2

    if (cell.kind === 'letter') {
      objects.push(
        buildRect(
          {
            left: Math.round(centerX - ruleW / 2),
            top: baselineY,
            width: ruleW,
            height: RULE_HEIGHT,
            fill: STUDIO_INK,
            stroke: 'transparent',
            strokeWidth: 0,
          },
          tag,
          'structure',
        ),
      )
    }

    const isGiven = cell.kind === 'mark' || revealed.has(cell.letterIndex)
    objects.push(
      buildText(
        {
          left: centerX,
          top: baselineY - letterLift,
          text: cell.char,
          width: hugTextBoxWidth(cell.char, letterFont, width * 2, spec),
          fontFamily: font,
          fontSize: letterFont,
          fill: STUDIO_INK,
          textAlign: 'center',
          originX: 'center',
          originY: 'bottom',
          lineHeight: 1,
        },
        tag,
        // Punctuation and the given letters are the puzzle; everything else is
        // the answer, and stays hidden until the key reveals it in its own slot.
        isGiven ? 'prompt' : 'answer',
      ),
    )
    x += width
  }

  return x
}

function drawPuzzleRows(
  objects: StudioFabricObject[],
  options: {
    bandLeft: number
    bandWidth: number
    blockTop: number
    layout: PhraseFinderPuzzleLayout
    puzzle: PhraseFinderPuzzle
    metrics: PhraseFinderMetrics
    font: string
    tag: StudioTag
  },
): void {
  const { bandLeft, bandWidth, blockTop, layout, puzzle, metrics, font, tag } = options

  layout.lines.forEach((words, row) => {
    const width = rowWidth(words, metrics)
    // Rows are centred rather than ranged left. A phrase whose rows differ in
    // length reads as one block when they share a centre line and as a ragged
    // column when they share a left edge — and the ragged version invites a
    // solver to read the rows as separate items.
    let cursor = bandLeft + Math.max(0, (bandWidth - width) / 2)
    const baselineY = blockTop + row * metrics.lineH + metrics.writeRoom

    for (const word of words) {
      cursor = drawWord(objects, {
        left: cursor,
        baselineY,
        word,
        revealed: puzzle.revealed,
        metrics,
        font,
        tag,
      })
      cursor += metrics.wordGapW
    }
  })
}

function buildPuzzleGroup(options: {
  puzzle: PhraseFinderPuzzle
  layout: PhraseFinderPuzzleLayout
  metrics: PhraseFinderMetrics
  index: number
  showIndex: boolean
  field: Box
  bandWidth: number
  top: number
  font: string
  tag: StudioTag
}): StudioFabricObject | null {
  const {
    puzzle,
    layout,
    metrics,
    index,
    showIndex,
    field,
    bandWidth,
    top,
    font,
    tag,
  } = options
  const parts: StudioFabricObject[] = []
  const bandLeft = showIndex ? field.left + metrics.indexW : field.left

  if (showIndex) {
    const label = `${index + 1}.`
    parts.push(
      buildText(
        {
          left: field.left,
          // On the clue's first line rather than on a rule, so a reader's eye
          // runs "1. — clue" as one line and the blanks read as its answer.
          top,
          text: label,
          width: hugTextBoxWidth(label, metrics.clueFont, metrics.indexW, {
            fontFamily: font,
          }),
          fontFamily: font,
          fontSize: metrics.clueFont,
          fill: STUDIO_INK,
          lineHeight: CLUE_LINE_HEIGHT,
        },
        tag,
        'decoration',
      ),
    )
  }

  // The clue, in the same ink as everything else and centred on the same axis
  // as the rows under it. Pre-broken to the column and set in a box as wide as
  // the band, so Fabric has no reason to re-wrap it into a line the block did
  // not reserve. It is tagged `prompt`, which is what carries it onto the
  // answer page too: a reader checking a row wants to see what was asked.
  parts.push(
    buildText(
      {
        left: bandLeft,
        top,
        text: layout.clueLines.join('\n'),
        width: bandWidth,
        fontFamily: font,
        fontSize: metrics.clueFont,
        fill: STUDIO_INK,
        textAlign: 'center',
        lineHeight: CLUE_LINE_HEIGHT,
      },
      tag,
      'prompt',
    ),
  )

  drawPuzzleRows(parts, {
    bandLeft,
    bandWidth,
    blockTop: top + layout.clueHeight + metrics.clueGap,
    layout,
    puzzle,
    metrics,
    font,
    tag,
  })

  const bounds = unionObjectBounds(parts)
  if (!bounds) return null
  return buildGroup(parts, bounds, tag, 'structure')
}

export interface PhraseFinderDrawOptions {
  field: Box
  plan: PhraseFinderPagePlan
  puzzles: readonly PhraseFinderPuzzle[]
  font: string
  tag: StudioTag
}

/**
 * Stack the puzzles down the page.
 *
 * Leftover height is spread between them before the block is centred, up to one
 * row pitch each. Centring alone leaves a page of two short phrases as a clump
 * in the middle with a hand's width of white above and below it; spreading
 * first is what makes a printed page look composed rather than cropped.
 */
export function drawPhraseFinderPuzzles(
  objects: StudioFabricObject[],
  options: PhraseFinderDrawOptions,
): void {
  const { field, plan, puzzles, font, tag } = options
  const { metrics, layouts, bandWidth, puzzleCount, showIndex } = plan
  if (puzzleCount === 0) return

  const usableHeight = Math.max(0, field.height - metrics.bottomGuard)
  const content = layouts.reduce((sum, layout) => sum + layout.height, 0)
  const gaps = Math.max(0, puzzleCount - 1)
  const slack = Math.max(0, usableHeight - content - metrics.puzzleGutter * gaps)
  const spread = gaps > 0 ? Math.min(slack / (gaps + 1), metrics.lineH) : 0
  const gutter = metrics.puzzleGutter + spread
  const stackH = content + gutter * gaps

  let top = field.top + Math.max(0, (usableHeight - stackH) / 2)
  for (let i = 0; i < puzzleCount; i++) {
    const layout = layouts[i]
    const puzzle = puzzles[i]
    if (!layout || !puzzle) continue
    const group = buildPuzzleGroup({
      puzzle,
      layout,
      metrics,
      index: i,
      showIndex,
      field,
      bandWidth,
      top,
      font,
      tag,
    })
    if (group) objects.push(group)
    top += layout.height + gutter
  }
}
