import type { StudioFabricObject } from '@/types/studio-template.types'
import { estimateTextBoxWidth, insetBox, type Box } from '../studio-layout'
import {
  FIELD_INSET,
  centerColumns,
  labelSizeFor,
  ladderSlots,
  measureLadder,
  type LadderMetrics,
} from './layout'
import {
  buildGroup,
  buildText,
  type StudioTag,
  type TextSpec,
} from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_BOLD,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import type { WordLadderPuzzle } from './ladder'

function letterBox(cell: Box, text: string, font: string, size: number): TextSpec {
  // Identical top-left boxes for every glyph — centred origins make some
  // letters sit higher once Fabric remeasures them inside a group.
  const opticalLift = Math.round(size * 0.08)
  return {
    left: Math.round(cell.left),
    top: Math.round(cell.top + (cell.height - size) / 2 - opticalLift),
    width: Math.round(cell.width),
    height: size,
    text,
    fontFamily: font,
    fontSize: size,
    lineHeight: 1,
    textAlign: 'center',
    originX: 'left',
    originY: 'top',
    editable: false,
  }
}

interface RungInput {
  bounds: Box
  cell: number
  wordLength: number
  /** Start / target rungs are printed in full and framed in bold. */
  isGiven: boolean
  letters: (string | null)[]
  /** Letters the reader must supply — hidden until the solution page. */
  answers: (string | null)[]
  font: string
  tag: StudioTag
}

function drawRung(input: RungInput): StudioFabricObject[] {
  const { bounds, cell, wordLength, isGiven, letters, answers, font, tag } = input
  const objects: StudioFabricObject[] = drawGridLines(
    bounds,
    cell,
    wordLength,
    1,
    tag,
    isGiven
      ? {
          thickness: STUDIO_STROKE_HAIRLINE,
          boldThickness: STUDIO_STROKE_BOLD,
          fill: STUDIO_INK,
          boxCols: wordLength,
          boxRows: 1,
        }
      : { thickness: STUDIO_STROKE_HAIRLINE, fill: STUDIO_RULE_MEDIUM },
  )

  const letterSize = Math.max(10, Math.round(cell * 0.56))
  for (let i = 0; i < wordLength; i++) {
    const cellBox: Box = {
      left: bounds.left + i * cell,
      top: bounds.top,
      width: cell,
      height: cell,
    }
    const given = letters[i]
    if (given) {
      objects.push(
        buildText(
          { ...letterBox(cellBox, given, font, letterSize), fill: STUDIO_INK },
          tag,
          'prompt',
        ),
      )
      continue
    }
    const answer = answers[i]
    if (!answer) continue
    objects.push(
      buildText(letterBox(cellBox, answer, font, letterSize), tag, 'answer'),
    )
  }
  return objects
}

function drawLadder(options: {
  puzzle: WordLadderPuzzle
  column: Box
  metrics: LadderMetrics
  label: string | null
  font: string
  tag: StudioTag
}): StudioFabricObject {
  const { puzzle, column, metrics, label, font, tag } = options
  const { cell, rungGap, blockHeight, labelHeight } = metrics
  const wordLength = puzzle.path[0]!.length
  const gridWidth = cell * wordLength
  const left = Math.round(column.left + (column.width - gridWidth) / 2)
  const top = Math.round(column.top + (column.height - blockHeight) / 2)
  const parts: StudioFabricObject[] = []

  if (label) {
    const size = labelSizeFor(cell)
    parts.push(
      buildText(
        {
          left: Math.round(left + gridWidth / 2),
          top,
          text: label,
          width: estimateTextBoxWidth(label, size, gridWidth),
          fontFamily: font,
          fontSize: size,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
          lineHeight: 1,
        },
        tag,
        'decoration',
      ),
    )
  }

  const hintAt = new Map(
    puzzle.hints.map((hint) => [`${hint.rung}:${hint.position}`, hint.letter]),
  )

  puzzle.path.forEach((word, rung) => {
    const isGiven = rung === 0 || rung === puzzle.steps
    const letters = word
      .split('')
      .map((letter, position) =>
        isGiven ? letter : (hintAt.get(`${rung}:${position}`) ?? null),
      )
    const answers = word
      .split('')
      .map((letter, position) => (letters[position] ? null : letter))
    parts.push(
      ...drawRung({
        bounds: {
          left,
          top: top + labelHeight + rung * (cell + rungGap),
          width: gridWidth,
          height: cell,
        },
        cell,
        wordLength,
        isGiven,
        letters,
        answers,
        font,
        tag,
      }),
    )
  })

  return buildGroup(
    parts,
    { left, top, width: gridWidth, height: blockHeight },
    tag,
  )
}

export interface DrawLaddersResult {
  objects: StudioFabricObject[]
  /** Cell used — the solution page reuses it so both pages print alike. */
  cell: number
}

export function drawWordLadders(options: {
  puzzles: WordLadderPuzzle[]
  field: Box
  font: string
  tag: StudioTag
  maxCell?: number
}): DrawLaddersResult {
  const { puzzles, font, tag, maxCell } = options
  const field = insetBox(options.field, FIELD_INSET)
  const showLabels = puzzles.length > 1
  const wordLength = puzzles[0]?.path[0]?.length ?? 4
  const rungCount = (puzzles[0]?.steps ?? 3) + 1
  const slots = ladderSlots(field, puzzles.length)
  const metrics = measureLadder({
    column: slots[0] ?? field,
    wordLength,
    rungCount,
    showLabels,
    maxCell,
  })
  // Ladders rarely fill their slot at the capped cell size. Re-flow them at
  // their drawn width so the gaps between ladders match the air around them.
  const cols = centerColumns(field, slots, metrics.cell * wordLength)

  const objects = puzzles.map((puzzle, index) =>
    drawLadder({
      puzzle,
      column: cols[index]!,
      metrics,
      label: showLabels ? `${index + 1}` : null,
      font,
      tag,
    }),
  )
  return { objects, cell: metrics.cell }
}
