import type { StudioFabricObject } from '@/types/studio-template.types'
import {
  STUDIO_DIGIT_FONT,
  STUDIO_RULE,
  STUDIO_RULE_MEDIUM,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_STROKE_NORMAL,
} from '@/constants/studio.constants'
import {
  estimateTextBoxWidth,
  toNonBreakingSpaces,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import { buildGroup, buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { drawGridLines } from '../studio-grid-rules'
import { canonicalKeyData } from '../_shared/uniqueness'
import { WORDOKU_SIZE } from './levels'
import { WORDOKU_SHADE, wordokuWordLabel, type WordokuPagePlan } from './layout'
import {
  wordokuCanonicalKey,
  wordokuLetter,
  wordokuLetterBank,
  type WordokuPuzzle,
} from './puzzle'

/**
 * Printed givens are bold, the solver's letters (on the answer page) regular.
 *
 * On the puzzle page the weight is what separates "the book wrote this" from
 * "I pencilled this in" at a glance. On the answer page it lets a reader check
 * only the letters they wrote. Inter throughout the grid, like the number
 * Sudoku: lining caps of even width read more reliably at arm's length than a
 * serif's, and I, L and T stay unmistakable.
 */
const GIVEN_WEIGHT = 'bold'
const SOLVED_WEIGHT = 'normal'

/** A single centred glyph in `box`. */
function glyph(box: Box, text: string, fontSize: number, fontWeight: string) {
  return {
    left: Math.round(box.left + box.width / 2),
    top: Math.round(box.top + box.height / 2),
    text,
    fontFamily: STUDIO_DIGIT_FONT,
    fontSize,
    fontWeight,
    width: estimateTextBoxWidth(text, fontSize, box.width),
    textAlign: 'center' as const,
    originX: 'center' as const,
    originY: 'center' as const,
    // Fabric's default multiplier centres a lone glyph off the cell axis.
    lineHeight: 1,
  }
}

/**
 * The diagonal treatment, drawn twice over so it never depends on one cue.
 *
 * A grey tint marks the cells at a glance; an inset outline inside each one
 * marks them again in line work, which is what survives a toner-light press,
 * a photocopy or a reader with low contrast sensitivity. Neither is a colour.
 */
function shadedCell(box: Box, tag: StudioTag): StudioFabricObject[] {
  const inset = Math.max(3, Math.round(box.width * 0.09))
  return [
    buildRect(
      { ...box, fill: WORDOKU_SHADE, stroke: 'transparent', strokeWidth: 0 },
      tag,
      'structure',
    ),
    buildRect(
      {
        left: box.left + inset,
        top: box.top + inset,
        width: box.width - inset * 2,
        height: box.height - inset * 2,
        fill: 'transparent',
        stroke: STUDIO_RULE,
        strokeWidth: STUDIO_STROKE_HAIRLINE,
      },
      tag,
      'structure',
    ),
  ]
}

function group(parts: StudioFabricObject[], fallback: Box, tag: StudioTag): StudioFabricObject {
  return buildGroup(parts, unionObjectBounds(parts) ?? fallback, tag)
}

/** The nine letters, alphabetical, in one framed strip above the grid. */
function drawLetterBank(
  plan: WordokuPagePlan,
  puzzle: WordokuPuzzle,
  tag: StudioTag,
): StudioFabricObject {
  const { frame, pitch, font } = plan.bank
  const parts: StudioFabricObject[] = [
    buildRect(
      {
        ...frame,
        fill: 'transparent',
        stroke: STUDIO_RULE_MEDIUM,
        strokeWidth: STUDIO_STROKE_NORMAL,
        rx: Math.round(frame.height * 0.2),
        ry: Math.round(frame.height * 0.2),
      },
      tag,
      'structure',
    ),
  ]
  const centerX = frame.left + frame.width / 2
  wordokuLetterBank(puzzle.target).forEach((letter, i) => {
    const slot: Box = {
      left: Math.round(centerX + (i - (WORDOKU_SIZE - 1) / 2) * pitch - pitch / 2),
      top: frame.top,
      width: pitch,
      height: frame.height,
    }
    parts.push(buildText(glyph(slot, letter, font, GIVEN_WEIGHT), tag, 'prompt'))
  })
  return group(parts, frame, tag)
}

/**
 * The 9×9 grid. On the puzzle page every blank still carries its answer,
 * hidden — the editor's reveal and the Studio's answer contract both read it.
 * On the solution page the blanks' letters are the answers the key reveals.
 */
function drawGrid(
  plan: WordokuPagePlan,
  puzzle: WordokuPuzzle,
  tag: StudioTag,
): StudioFabricObject {
  const parts: StudioFabricObject[] = []
  for (let i = 0; i < WORDOKU_SIZE; i++) parts.push(...shadedCell(plan.cellBox(i, i), tag))
  parts.push(
    ...drawGridLines(plan.grid, plan.cell, WORDOKU_SIZE, WORDOKU_SIZE, tag, {
      boxCols: 3,
      boxRows: 3,
      // Near-black at both weights: boxes are told apart by rule thickness.
      fill: STUDIO_RULE,
    }),
  )

  for (let r = 0; r < WORDOKU_SIZE; r++) {
    for (let c = 0; c < WORDOKU_SIZE; c++) {
      const cell = plan.cellBox(r, c)
      const given = puzzle.puzzle[r]![c]!
      if (given !== 0) {
        const text = wordokuLetter(puzzle.target, given)
        parts.push(buildText(glyph(cell, text, plan.letterFont, GIVEN_WEIGHT), tag, 'prompt'))
        continue
      }
      const text = wordokuLetter(puzzle.target, puzzle.solved[r]![c]!)
      parts.push(buildText(glyph(cell, text, plan.letterFont, SOLVED_WEIGHT), tag, 'answer'))
    }
  }

  const grid = group(parts, plan.grid, tag)
  return {
    ...grid,
    data: {
      ...(grid.data ?? {}),
      ...canonicalKeyData('wordoku', wordokuCanonicalKey(puzzle)),
    },
  }
}

/**
 * "Hidden word" and its nine boxes.
 *
 * The boxes wear the diagonal's tint so the eye links the two without being
 * told. Their letters are answers: hidden on the puzzle page, printed on the
 * key — the word is always spelled out whole there, never left for a reader to
 * trace back down the diagonal.
 */
function drawWordRow(
  plan: WordokuPagePlan,
  puzzle: WordokuPuzzle,
  tag: StudioTag,
  font: string,
): StudioFabricObject[] {
  const row = plan.word
  const label = wordokuWordLabel(puzzle.target.hint)
  const centerX = row.boxesLeft + row.width / 2
  const labelObject = buildText(
    {
      left: Math.round(centerX),
      top: row.labelTop,
      text: toNonBreakingSpaces(label),
      fontFamily: font,
      fontSize: row.labelFont,
      width: estimateTextBoxWidth(label, row.labelFont, row.labelWidth),
      textAlign: 'center',
      originX: 'center',
    },
    tag,
    'prompt',
  )

  const parts: StudioFabricObject[] = []
  for (let i = 0; i < WORDOKU_SIZE; i++) {
    const box: Box = {
      left: row.boxesLeft + i * (row.box + row.gap),
      top: row.boxesTop,
      width: row.box,
      height: row.box,
    }
    parts.push(
      buildRect(
        { ...box, fill: WORDOKU_SHADE, stroke: STUDIO_RULE, strokeWidth: STUDIO_STROKE_NORMAL },
        tag,
        'structure',
      ),
    )
    parts.push(buildText(glyph(box, puzzle.target.word[i]!, row.font, SOLVED_WEIGHT), tag, 'answer'))
  }
  const fallback: Box = { left: row.boxesLeft, top: row.boxesTop, width: row.width, height: row.box }
  return [labelObject, group(parts, fallback, tag)]
}

export interface WordokuDrawOptions {
  plan: WordokuPagePlan
  puzzle: WordokuPuzzle
  tag: StudioTag
  /** Seller's body font, for the label. Grid letters are always Inter. */
  font: string
}

/**
 * The page body, identical on the puzzle and its answer page.
 *
 * The answer page draws exactly the same blocks from the same plan and lets the
 * key reveal the hidden letters, so every cell sits where it sat on the puzzle.
 * The letter bank stays on the key too — without it the page opens on a hole
 * the height of the strip, and a page that looks unfinished reads as a fault.
 */
export function drawWordokuBody(options: WordokuDrawOptions): StudioFabricObject[] {
  const { plan, puzzle, tag, font } = options
  return [
    drawLetterBank(plan, puzzle, tag),
    drawGrid(plan, puzzle, tag),
    ...drawWordRow(plan, puzzle, tag, font),
  ]
}
