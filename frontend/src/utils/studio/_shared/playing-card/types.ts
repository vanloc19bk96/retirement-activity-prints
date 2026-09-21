/**
 * Shared playing-card model and print constraints.
 *
 * The whole Card Games Pack renders through this module: six templates, one
 * renderer. Cards are a *rendering substrate*, not a theme — nothing in here
 * knows what a puzzle is.
 *
 * Print rules encoded here are not cosmetic. Books ship as black-and-white POD
 * interiors, where a hairline under 0.75pt breaks up on grayscale and a corner
 * index under 12pt stops being legible for the large-print audience this
 * library sells to.
 */

import { DPI } from '@/types/canvas-settings.types'

/** 0 = spades, 1 = hearts, 2 = diamonds, 3 = clubs. */
export type Suit = 0 | 1 | 2 | 3

/** 1 = Ace … 11 = Jack, 12 = Queen, 13 = King. */
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13

export interface Card {
  rank: Rank
  suit: Suit
}

export type CardSizeName = 'S' | 'M' | 'L'

/**
 * Monochrome treatment for hearts and diamonds.
 *
 * `outline` is the default and the only one that is unconditionally safe: a
 * 35% tint can band or plug on cheap POD grayscale, and §2.2 otherwise allows
 * pure K only. `gray35` exists because some sellers prefer the heavier read.
 */
export type RedSuitStyle = 'outline' | 'gray35'

export type CornerIndexMode = 'both' | 'topLeftOnly'

export interface CardStyle {
  size: CardSizeName
  redSuitStyle: RedSuitStyle
  cornerIndices: CornerIndexMode
  /** Card border weight in points. Clamped to MIN_STROKE_PT at render time. */
  borderWeight: number
}

export const DEFAULT_CARD_STYLE: CardStyle = {
  size: 'M',
  redSuitStyle: 'outline',
  cornerIndices: 'both',
  borderWeight: 1,
}

/** Canvas pixels per PostScript point at the editor's authoring DPI. */
export const PT_TO_PX = DPI / 72

export const pt = (points: number): number => points * PT_TO_PX

/** §2.2 — thinner hairlines break up or moiré on POD grayscale. */
export const MIN_STROKE_PT = 0.75
export const MIN_STROKE_PX = pt(MIN_STROKE_PT)

/** §2.2 — absolute floor for corner indices at card size S. */
export const MIN_INDEX_PT = 12
export const MIN_INDEX_PX = pt(MIN_INDEX_PT)

/** §2.2 — floor for body copy in large-print books. */
export const MIN_BODY_PT = 16
export const MIN_BODY_PX = pt(MIN_BODY_PT)

/** Poker standard: width / height. Corner radius is 6% of card width. */
export const CARD_ASPECT = 5 / 7
export const CARD_CORNER_RADIUS_RATIO = 0.06

/** §3.1 tier presets, in inches of card width. Height follows CARD_ASPECT. */
export const CARD_WIDTH_INCHES: Record<CardSizeName, number> = {
  S: 0.9,
  M: 1.2,
  L: 1.5,
}

export const CARD_SIZE_NAMES: readonly CardSizeName[] = ['S', 'M', 'L']

/** Nominal card width in canvas pixels for a size preset. */
export function cardWidthForSize(size: CardSizeName): number {
  return CARD_WIDTH_INCHES[size] * DPI
}

export function isCardSizeName(value: unknown): value is CardSizeName {
  return value === 'S' || value === 'M' || value === 'L'
}

export function parseCardSize(value: unknown, fallback: CardSizeName = 'M'): CardSizeName {
  return isCardSizeName(value) ? value : fallback
}

/** Pure K only (§2.2). No rich black, no near-blacks, no alpha. */
export const CARD_INK = '#000000'
/** 35% K tint — only reachable through `redSuitStyle: 'gray35'`. */
export const CARD_TINT_35 = '#A6A6A6'
export const CARD_PAPER = '#FFFFFF'

export const SUIT_SPADES: Suit = 0
export const SUIT_HEARTS: Suit = 1
export const SUIT_DIAMONDS: Suit = 2
export const SUIT_CLUBS: Suit = 3

export const SUITS: readonly Suit[] = [
  SUIT_SPADES,
  SUIT_HEARTS,
  SUIT_DIAMONDS,
  SUIT_CLUBS,
]

export const RANKS: readonly Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

/** True for hearts and diamonds — the suits a colour deck prints red. */
export function isRedSuit(suit: Suit): boolean {
  return suit === SUIT_HEARTS || suit === SUIT_DIAMONDS
}

/**
 * Rank characters. "10" is the only two-glyph index and is what forces the
 * corner column to be measured rather than assumed.
 */
export const RANK_LABELS: Record<Rank, string> = {
  1: 'A',
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'J',
  12: 'Q',
  13: 'K',
}

/**
 * Spoken rank names for answer keys and write-in prompts.
 * Never abbreviated in prose — "Jack of Spades" reads for the large-print
 * audience in a way "J♠" does not.
 */
export const RANK_NAMES: Record<Rank, string> = {
  1: 'Ace',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
}

export const SUIT_NAMES: Record<Suit, string> = {
  0: 'Spades',
  1: 'Hearts',
  2: 'Diamonds',
  3: 'Clubs',
}

/**
 * Unicode suit glyphs — phrasing / prose only, never Fabric answer text.
 * Catalog fonts (Inter) lack these; PDF export substitutes "?" (see
 * `renderCardWriteLabel`).
 */
export const SUIT_GLYPHS: Record<Suit, string> = {
  0: '♠',
  1: '♥',
  2: '♦',
  3: '♣',
}

export function isCourtRank(rank: Rank): boolean {
  return rank >= 11
}

/**
 * Compact prose notation, e.g. "A♠" or "10♦".
 * Not for Fabric textboxes destined for PDF — use `renderCardWriteLabel`.
 */
export function cardLabel(card: Card): string {
  return `${RANK_LABELS[card.rank]}${SUIT_GLYPHS[card.suit]}`
}

/** Prose name for instructions and keys, e.g. "Ace of Spades". */
export function cardName(card: Card): string {
  return `${RANK_NAMES[card.rank]} of ${SUIT_NAMES[card.suit]}`
}

/** Stable 0..51 index — the canonical serialisation of a card. */
export function cardIndex(card: Card): number {
  return (card.rank - 1) * 4 + card.suit
}

export function cardFromIndex(index: number): Card {
  return {
    rank: (Math.floor(index / 4) + 1) as Rank,
    suit: (index % 4) as Suit,
  }
}

export function sameCard(a: Card, b: Card): boolean {
  return a.rank === b.rank && a.suit === b.suit
}

/**
 * Card values for arithmetic templates.
 * `face` = A 1, pips at face value, J 11 / Q 12 / K 13.
 * `ten`  = J/Q/K all worth 10 — gentler, and the familiar convention.
 */
export type CourtValueMode = 'face' | 'ten'

export function cardValue(card: Card, mode: CourtValueMode = 'face'): number {
  if (mode === 'ten' && isCourtRank(card.rank)) return 10
  return card.rank
}
