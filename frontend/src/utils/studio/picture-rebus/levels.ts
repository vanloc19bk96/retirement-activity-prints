import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'

/**
 * The one difficulty decision a picture rebus page asks for.
 *
 * Almost everything else about this game is either fixed by what the game is or
 * derived from the trim. Two pictures joined into one word is the game; how many
 * puzzles a page holds, how big the pictures print, how wide the writing slots
 * are and whether the page runs in one column or two all come from `layout.ts`,
 * which can see the page size in Settings. None of those are questions a seller
 * can answer without knowing the other four.
 *
 * There is no theme picker, and that is a decision rather than an omission. A
 * picture rebus can only use words the icon set can actually draw, and slicing
 * that vocabulary by theme would leave a "Gardening" page reaching for its
 * fourth flower puzzle. The whole bank is written for a retirement audience
 * instead, so every page is on theme without the form asking.
 *
 * What is left is one question anyone can answer: how much of a leap should the
 * pictures ask for.
 */

/**
 * How far a picture stands from the word it contributes.
 *
 * This is the only axis that makes a rebus harder or easier without making it
 * unfair, so it is the axis the level moves.
 *
 * * `1` — the picture *is* the word. A sun says SUN, a bell says BELL. The work
 *   left is joining them: SUN + FLOWER.
 * * `2` — one short step. A rain cloud says RAIN, a tent says CAMP, a clock
 *   says TIME. A solver names the picture and then names what it is *for*.
 * * `3` — a genuine association. A dog says PET, a chef's hat says COOK, a
 *   musical note says NOTE. The literal reading spells nothing, which is the
 *   nudge to look again.
 *
 * Nothing above 3 exists on purpose. Sound-alike rebuses (a bee for BE, a
 * letter struck through) are the traditional next rung and they are exactly
 * where a picture puzzle stops being checkable: the page can no longer prove
 * its own answer, and a reader who is wrong cannot tell whether the page is.
 */
export type PictureRebusTier = 1 | 2 | 3

export type PictureRebusLevelId = 'gentle' | 'classic' | 'challenging'

export interface PictureRebusLevel {
  id: PictureRebusLevelId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Which tiers of the bank this level draws from. */
  tiers: readonly PictureRebusTier[]
  /**
   * Print the short hint under each puzzle.
   *
   * Only the gentle level does. A hint beside a tier-1 puzzle is encouragement;
   * beside a tier-2 puzzle it is the answer, and the pictures become decoration
   * on a one-line quiz. So the level that gives hints is also the level whose
   * puzzles need the least help, which sounds backwards and is not: the gentle
   * page is for the reader who wants to finish it, not for the reader who wants
   * to be beaten by it.
   */
  showHint: boolean
}

export const PICTURE_REBUS_LEVELS: readonly PictureRebusLevel[] = [
  {
    id: 'gentle',
    label: 'Gentle — plain pictures, with a hint',
    tiers: [1],
    showHint: true,
  },
  {
    id: 'classic',
    label: 'Classic — the everyday puzzle',
    tiers: [1, 2],
    showHint: false,
  },
  {
    id: 'challenging',
    label: 'Challenging — pictures that need a think',
    tiers: [2, 3],
    showHint: false,
  },
]

export const DEFAULT_PICTURE_REBUS_LEVEL_ID: PictureRebusLevelId = 'classic'

const LEVEL_INDEX = new Map(PICTURE_REBUS_LEVELS.map((level) => [level.id, level]))

export const PICTURE_REBUS_LEVEL_OPTIONS: StudioSelectOption[] =
  PICTURE_REBUS_LEVELS.map((level) => ({ label: level.label, value: level.id }))

export function parsePictureRebusLevel(config: StudioConfig): PictureRebusLevel {
  const chosen = LEVEL_INDEX.get(String(config.level ?? '') as PictureRebusLevelId)
  return chosen ?? LEVEL_INDEX.get(DEFAULT_PICTURE_REBUS_LEVEL_ID)!
}

/**
 * The sentence under the heading. States the rule, then what to do with it.
 *
 * One sentence per line, broken where the sense breaks rather than where the
 * column runs out. Both lines still fit the narrowest interior this app
 * supports; a narrower one wraps them further but never drops either, and the
 * header measures whatever comes out before the puzzles are placed.
 *
 * "In order" is the load-bearing phrase. Without it a reader is free to read
 * HOUSE and BOAT as either HOUSEBOAT or BOATHOUSE, and the page has two answers
 * it can only print one of.
 */
export const PICTURE_REBUS_INSTRUCTION =
  'Each picture is a word. Join them\nin order to fill in the blanks.'

/** What the page tells the solver, unless the heading strip is switched off. */
export function pictureRebusInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return PICTURE_REBUS_INSTRUCTION
}
