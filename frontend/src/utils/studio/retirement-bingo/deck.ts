import {
  entropyReport,
  hmacSha256,
  log2Choose,
  log2Factorial,
  utf8Bytes,
  type EntropyReport,
} from '../_shared/uniqueness'
import {
  BINGO_MOMENT_COUNT,
  type RetirementBingoFamily,
  type RetirementBingoMoment,
} from './content'

/**
 * Each seller's own deck of moments.
 *
 * Salted seeds (§4.1) already make every *card* unique: two sellers never print
 * the same 24 squares in the same places. That is not enough on its own for
 * this game, because a bingo square is a sentence, and if every seller deals
 * from the same few hundred sentences then their books still read alike line by
 * line — which is exactly what a marketplace reviewer comparing two retirement
 * bingo books would notice.
 *
 * So each account gets a deck, derived from its puzzle salt:
 *
 * * **Which moments.** Each family is in the deck with probability
 *   `BINGO_DECK_SHARE`. Two sellers share only about that share squared of
 *   their families.
 * * **Which words.** Each family in the deck is written one way for that
 *   seller, picked from its three or four phrasings. Two sellers who both deal
 *   "slept in" print the same words for it only about one time in three.
 *
 * Together that leaves about a quarter to a third of one seller's squares
 * worded identically anywhere in another seller's deck, against all of them
 * without it (the higher end on small themes and small trims, where fewer
 * phrasings fit). And since a card deals 24 from a deck of eighty or more, two
 * sellers' cards typically share one to three squares, not a card's worth.
 *
 * Every decision is keyed per family by HMAC(salt, family), not drawn from one
 * stream in bank order. Adding families to the bank later therefore leaves
 * every existing seller's choices for the old families exactly where they were,
 * and a book reprinted after a content update keeps its voice.
 */

/** Share of a theme's families in any one seller's deck. */
export const BINGO_DECK_SHARE = 0.65

/**
 * Fewest families a deck holds, where the theme has them.
 *
 * Within one book, how often two cards repeat a square depends on the deck, not
 * the bank: about 24 squared over the deck size. This is the other side of the
 * trade — a smaller deck separates sellers more and repeats more inside each
 * book. At 84 two cards on the narrowest theme share about seven squares on
 * average, in line with the classic 75-call bingo set; below it, a reader
 * working through a book starts to notice. A theme with fewer families than
 * this simply gives the seller all of them.
 */
export const BINGO_DECK_MIN_FAMILIES = 84

/** Bump to reshuffle every seller's deck — never needed for a content update. */
const DECK_VERSION = 'v1'

interface FamilyDraw {
  /** Uniform in [0, 1): the family is in the deck when below the share. */
  rank: number
  /** Which phrasing this seller uses, before skipping ones that do not fit. */
  pick: number
}

/** Salt → family → draw. Bounded: a session sees one or two accounts. */
const drawCache = new Map<string, Map<string, FamilyDraw>>()
const DRAW_CACHE_SALTS = 4

function familyDraw(ownerSalt: string, family: string): FamilyDraw {
  let bySalt = drawCache.get(ownerSalt)
  if (!bySalt) {
    if (drawCache.size >= DRAW_CACHE_SALTS) {
      drawCache.delete(drawCache.keys().next().value!)
    }
    bySalt = new Map()
    drawCache.set(ownerSalt, bySalt)
  }
  let draw = bySalt.get(family)
  if (!draw) {
    const bytes = hmacSha256(
      utf8Bytes(ownerSalt),
      utf8Bytes(`retirement-bingo:deck:${DECK_VERSION}:${family}`),
    )
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    draw = { rank: view.getUint32(0, false) / 4294967296, pick: view.getUint32(4, false) }
    bySalt.set(family, draw)
  }
  return draw
}

/**
 * This seller's deck for one theme on one page size: one moment per family.
 *
 * `fits` says which phrasings fit a square on this trim. A family whose chosen
 * phrasing does not fit falls through to its next phrasing, in a fixed order,
 * so a seller's wording only changes on the trims where it has to.
 */
export function buildRetirementBingoDeck(options: {
  families: readonly RetirementBingoFamily[]
  fits: (text: string) => boolean
  ownerSalt: string
}): RetirementBingoMoment[] {
  const { families, fits, ownerSalt } = options

  const candidates: { family: RetirementBingoFamily; draw: FamilyDraw; text: string }[] = []
  for (const family of families) {
    const draw = familyDraw(ownerSalt, family.family)
    const count = family.variants.length
    let text: string | null = null
    for (let step = 0; step < count && !text; step++) {
      const variant = family.variants[(draw.pick + step) % count]!
      if (fits(variant)) text = variant
    }
    if (text) candidates.push({ family, draw, text })
  }

  const floor = Math.min(candidates.length, BINGO_DECK_MIN_FAMILIES)
  const inDeck = candidates.filter((candidate) => candidate.draw.rank < BINGO_DECK_SHARE)
  if (inDeck.length < floor) {
    // Top up with the families this seller came closest to drawing, so the
    // floor is still seller-specific rather than the same few for everyone.
    const rest = candidates
      .filter((candidate) => candidate.draw.rank >= BINGO_DECK_SHARE)
      .sort((a, b) => a.draw.rank - b.draw.rank)
    inDeck.push(...rest.slice(0, floor - inDeck.length))
  }

  return inDeck.map(({ family, text }) => ({
    text,
    group: family.group,
    family: family.family,
    firstYear: family.firstYear,
  }))
}

/**
 * Analytic entropy of one card dealt from a deck of `deckFamilies` (§4.5).
 *
 * Choosing 24 of the deck's families, then placing them in 24 squares. Counted
 * on the smallest deck a seller can be given, which is the pessimistic case:
 * even there it clears the 2^48 floor by a wide margin, so a repeated card is
 * a matter of arithmetic, not luck.
 */
export function retirementBingoEntropy(
  deckFamilies: number = BINGO_DECK_MIN_FAMILIES,
): EntropyReport {
  return entropyReport({
    templateKey: 'retirement-bingo',
    variant: `deck-${deckFamilies}`,
    perFigureBits:
      log2Choose(deckFamilies, BINGO_MOMENT_COUNT) + log2Factorial(BINGO_MOMENT_COUNT),
    figuresPerPage: 1,
  })
}
