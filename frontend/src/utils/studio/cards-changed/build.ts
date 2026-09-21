/**
 * What Changed? puzzle construction (§6.6).
 *
 * Two spreads of the same cards, Before and After, with `m` cards altered. The
 * changed cells are deliberately spread across the grid: clustered changes make
 * the puzzle trivial, because the eye finds one and the rest are next to it.
 */

import type { StudioRng } from '../studio-rng'
import {
  RANKS,
  SUITS,
  cardIndex,
  deal,
  type Card,
  type Rank,
  type Suit,
} from '../_shared/playing-card'
import {
  canonicalGridForm,
  composeCanonicalForm,
  log2Choose,
  log2Pow,
} from '../_shared/uniqueness'

export type CardChangeType = 'rank' | 'suit' | 'swap'

export const CARD_CHANGE_TYPES: readonly CardChangeType[] = ['rank', 'suit', 'swap']

export interface CardCell {
  card: Card
}

export interface CardsChangedFigure {
  cols: number
  rows: number
  before: CardCell[]
  after: CardCell[]
  /** True where the After spread differs from Before. The answer key. */
  changed: boolean[]
}

export interface CardsChangedOptions {
  /** Cards per spread. */
  cardCount: number
  /** Cells that differ. */
  changeCount: number
  changeTypes: readonly CardChangeType[]
  cols: number
}

/** Attempts to find a well-spread set of change positions before relaxing. */
const SPREAD_ATTEMPTS = 40

function isOrthogonallyAdjacent(a: number, b: number, cols: number): boolean {
  const ar = Math.floor(a / cols)
  const ac = a % cols
  const br = Math.floor(b / cols)
  const bc = b % cols
  return Math.abs(ar - br) + Math.abs(ac - bc) <= 1
}

/**
 * Change positions with no two orthogonal neighbours.
 *
 * Relaxes after `SPREAD_ATTEMPTS` rather than looping forever: on a 3x3 grid
 * with four changes no such set exists, and a clustered puzzle is better than
 * no puzzle.
 */
function pickSpreadPositions(
  rng: StudioRng,
  total: number,
  count: number,
  cols: number,
): number[] {
  const all = Array.from({ length: total }, (_, i) => i)
  for (let attempt = 0; attempt < SPREAD_ATTEMPTS; attempt++) {
    const picked = rng.sample(all, count)
    const clustered = picked.some((a, i) =>
      picked.slice(i + 1).some((b) => isOrthogonallyAdjacent(a, b, cols)),
    )
    if (!clustered) return picked.sort((x, y) => x - y)
  }
  return rng.sample(all, count).sort((x, y) => x - y)
}

/** A rank swap that does not collide with a card already on the spread. */
function reRank(rng: StudioRng, card: Card, used: Set<number>): Card | null {
  const options = RANKS.filter(
    (rank) => rank !== card.rank && !used.has(cardIndex({ rank, suit: card.suit })),
  )
  if (options.length === 0) return null
  return { rank: rng.pick(options) as Rank, suit: card.suit }
}

/** A suit swap that does not collide with a card already on the spread. */
function reSuit(rng: StudioRng, card: Card, used: Set<number>): Card | null {
  const options = SUITS.filter(
    (suit) => suit !== card.suit && !used.has(cardIndex({ rank: card.rank, suit })),
  )
  if (options.length === 0) return null
  return { rank: card.rank, suit: rng.pick(options) as Suit }
}

export function buildCardsChangedFigure(
  rng: StudioRng,
  options: CardsChangedOptions,
): CardsChangedFigure {
  const { cardCount, cols } = options
  const rows = Math.ceil(cardCount / cols)
  const types = options.changeTypes.length > 0 ? options.changeTypes : ['rank', 'suit']
  const changeCount = Math.max(1, Math.min(options.changeCount, cardCount - 1))

  const dealt = deal(rng, cardCount)
  const before: CardCell[] = dealt.map((card) => ({ card }))
  const after: CardCell[] = before.map((cell) => ({ ...cell }))
  const changed = new Array<boolean>(cardCount).fill(false)
  const used = new Set(dealt.map(cardIndex))

  const positions = pickSpreadPositions(rng, cardCount, changeCount, cols)
  // Swaps consume a partner cell, so walk positions and skip ones already spent.
  const spent = new Set<number>()

  for (const position of positions) {
    if (spent.has(position)) continue
    const order = rng.shuffle(types)
    for (const type of order) {
      if (type === 'swap') {
        const partners = positions.filter(
          (other) => other !== position && !spent.has(other),
        )
        if (partners.length === 0) continue
        const partner = rng.pick(partners)
        const temp = after[position]
        after[position] = after[partner]
        after[partner] = temp
        changed[position] = true
        changed[partner] = true
        spent.add(position)
        spent.add(partner)
        break
      }
      const replacement =
        type === 'rank'
          ? reRank(rng, after[position].card, used)
          : reSuit(rng, after[position].card, used)
      if (!replacement) continue
      used.add(cardIndex(replacement))
      after[position] = { card: replacement }
      changed[position] = true
      spent.add(position)
      break
    }
  }

  return { cols, rows, before, after, changed }
}

function cellToken(cell: CardCell): string {
  return String(cardIndex(cell.card)).padStart(2, '0')
}

/** Empty cell marker — a short final row still has to make a rectangle. */
const EMPTY_CELL_TOKEN = '--'

/**
 * Canonical form (§4.2): the paired Before/After grid, reduced over the grid's
 * own symmetry group. Turning both spreads together is the same puzzle.
 *
 * The grid is padded to a full rectangle first: a nine-card spread laid five
 * across leaves a short final row, and rotating a ragged array is undefined.
 * The padding is part of the form, so two spreads that differ only in their
 * row shape stay distinct — which they visibly are.
 */
export function cardsChangedCanonicalForm(figure: CardsChangedFigure): string {
  const cols = Math.max(1, figure.cols)
  const rows = Math.ceil(figure.before.length / cols)
  const grid: string[][] = []
  for (let r = 0; r < rows; r++) {
    const row: string[] = []
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c
      const before = figure.before[index]
      const after = figure.after[index]
      row.push(
        before && after
          ? `${cellToken(before)}>${cellToken(after)}`
          : EMPTY_CELL_TOKEN,
      )
    }
    grid.push(row)
  }
  return composeCanonicalForm('cards-changed', canonicalGridForm(grid, (token) => token))
}

/**
 * Analytic entropy of one figure, in bits (§4.5).
 *
 * The change term counts the *sum* of the per-type target counts, because a
 * change at a cell can be any one of them: with rank and suit both enabled
 * there are 12 + 3 distinct outcomes per changed cell, not two.
 * Rank and suit targets are discounted for collisions with cards already on
 * the spread, so the figure stays a lower bound.
 */
export function cardsChangedFigureEntropyBits(options: CardsChangedOptions): number {
  const { cardCount, changeCount } = options
  const types = new Set(options.changeTypes.length > 0 ? options.changeTypes : ['rank'])
  const collisionDiscount = Math.ceil(cardCount / 4)
  let targets = 0
  if (types.has('rank')) targets += Math.max(1, 12 - collisionDiscount)
  if (types.has('suit')) targets += Math.max(1, 3 - 1)
  // A swap consumes two cells, so it contributes one outcome per cell at most.
  if (types.has('swap')) targets += 1

  return (
    log2Choose(52, cardCount) +
    log2Choose(cardCount, changeCount) +
    log2Pow(targets, changeCount)
  )
}
