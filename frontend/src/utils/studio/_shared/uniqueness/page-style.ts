/**
 * Page-style pool (§4.6) — the answer to failure mode F3.
 *
 * Two books can hold mathematically distinct puzzles and still read as the same
 * product, because the layout, the labels and the page furniture are identical.
 * F3 is the one everybody underestimates: solving F1 without it is not solving
 * anything.
 *
 * A style tuple is drawn per page from the salted seed, independently of the
 * puzzle content, and adjacent pages are not allowed to share one.
 */

import type { StudioRng } from '../../studio-rng'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../../studio-variety'
import type { CardSizeName } from '../playing-card/types'

export type CardLabelStyle = 'letters' | 'numbers' | 'puzzleN' | 'none'
export type CardAnswerAffordance = 'ruledLine' | 'boxedField' | 'blankCard'
export type CardDividerStyle = 'none' | 'hairline' | 'centeredRule'
export type CardInstructionPlacement = 'aboveFigure' | 'underTitle'

export interface CardPageStyle {
  cardSize: CardSizeName
  figuresPerPage: number
  labelStyle: CardLabelStyle
  answerAffordance: CardAnswerAffordance
  dividerStyle: CardDividerStyle
  instructionPlacement: CardInstructionPlacement
}

export interface CardPageStyleAxes {
  cardSize?: readonly CardSizeName[]
  figuresPerPage?: readonly number[]
  labelStyle?: readonly CardLabelStyle[]
  answerAffordance?: readonly CardAnswerAffordance[]
  dividerStyle?: readonly CardDividerStyle[]
  instructionPlacement?: readonly CardInstructionPlacement[]
}

const DEFAULT_AXES: Required<CardPageStyleAxes> = {
  cardSize: ['S', 'M', 'L'],
  figuresPerPage: [1, 2, 4],
  labelStyle: ['letters', 'numbers', 'puzzleN', 'none'],
  answerAffordance: ['ruledLine', 'boxedField', 'blankCard'],
  dividerStyle: ['none', 'hairline', 'centeredRule'],
  instructionPlacement: ['aboveFigure', 'underTitle'],
}

/** Attempts to draw a tuple the previous pages have not used. */
const DISTINCT_ATTEMPTS = 12
/** How many previous pages a tuple must differ from. */
const ADJACENT_WINDOW = 1

export function cardPageStyleToken(style: CardPageStyle): string {
  return [
    style.cardSize,
    style.figuresPerPage,
    style.labelStyle,
    style.answerAffordance,
    style.dividerStyle,
    style.instructionPlacement,
  ].join('-')
}

/**
 * Draw a page-style tuple, avoiding the one the previous page used.
 *
 * Falls back to the last draw rather than looping forever: when a template pins
 * every axis there is only one legal tuple, and refusing to lay out the page
 * would be a worse outcome than two neighbours sharing a style.
 */
export function pickCardPageStyle(options: {
  templateKey: string
  rng: StudioRng
  axes?: CardPageStyleAxes
  /** Bucket key so two modes of one template keep separate histories. */
  variant?: string
}): CardPageStyle {
  const { templateKey, rng, variant } = options
  const axes: Required<CardPageStyleAxes> = { ...DEFAULT_AXES, ...options.axes }
  const key = studioVarietyKey(`${templateKey}-page-style`, variant ?? 'default')
  const recent = new Set(studioAvoidList(key, ADJACENT_WINDOW))

  let style: CardPageStyle = draw(rng, axes)
  for (let attempt = 0; attempt < DISTINCT_ATTEMPTS; attempt++) {
    if (!recent.has(cardPageStyleToken(style))) break
    style = draw(rng, axes)
  }

  rememberStudioContent(key, [cardPageStyleToken(style)])
  return style
}

function draw(rng: StudioRng, axes: Required<CardPageStyleAxes>): CardPageStyle {
  return {
    cardSize: rng.pick(axes.cardSize),
    figuresPerPage: rng.pick(axes.figuresPerPage),
    labelStyle: rng.pick(axes.labelStyle),
    answerAffordance: rng.pick(axes.answerAffordance),
    dividerStyle: rng.pick(axes.dividerStyle),
    instructionPlacement: rng.pick(axes.instructionPlacement),
  }
}

const LETTER_LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Label printed above figure `index` (0-based) for a given label style. */
export function figureLabel(style: CardLabelStyle, index: number): string {
  switch (style) {
    case 'letters':
      return LETTER_LABELS[index % LETTER_LABELS.length]
    case 'numbers':
      return String(index + 1)
    case 'puzzleN':
      return `Puzzle ${index + 1}`
    case 'none':
    default:
      return ''
  }
}
