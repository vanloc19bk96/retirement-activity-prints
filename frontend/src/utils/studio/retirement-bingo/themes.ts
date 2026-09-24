import type { StudioConfig, StudioSelectOption } from '@/types/studio-template.types'

/**
 * The one content decision a Retirement Bingo page asks for.
 *
 * Everything else about the card is either fixed by the game or derived from
 * the trim. Five by five with a free centre is what bingo *is*; the square size,
 * the type size and where the phrases break are worked out by `layout.ts` from
 * the page size in Settings, because none of them are questions a seller can
 * answer without knowing the other two.
 *
 * What a seller can answer is what kind of book this is. A "first year of
 * retirement" gift book and a general retirement activity book want different
 * moments on the card, and a book leaning on hobbies or on getting out of the
 * house is a real editorial choice. So the theme is the whole form.
 */

/** Where a moment lives in the bank — also what a card balances across. */
export type RetirementBingoGroup = 'routine' | 'home' | 'hobby' | 'social' | 'outing'

export const RETIREMENT_BINGO_GROUPS: readonly RetirementBingoGroup[] = [
  'routine',
  'home',
  'hobby',
  'social',
  'outing',
]

export type RetirementBingoThemeId = 'everyday' | 'first-year' | 'home-hobbies' | 'out-about'

export interface RetirementBingoTheme {
  id: RetirementBingoThemeId
  /** Option label in the form — short enough not to truncate in the panel. */
  label: string
  /** Groups the theme draws on. */
  groups: readonly RetirementBingoGroup[]
  /** Only moments flagged as first-year-of-retirement. */
  firstYearOnly: boolean
}

export const RETIREMENT_BINGO_THEMES: readonly RetirementBingoTheme[] = [
  {
    id: 'everyday',
    label: 'A bit of everything',
    groups: RETIREMENT_BINGO_GROUPS,
    firstYearOnly: false,
  },
  {
    id: 'first-year',
    label: 'The first year of retirement',
    groups: RETIREMENT_BINGO_GROUPS,
    firstYearOnly: true,
  },
  {
    id: 'home-hobbies',
    label: 'Home, garden & hobbies',
    groups: ['routine', 'home', 'hobby'],
    firstYearOnly: false,
  },
  {
    id: 'out-about',
    label: 'Friends, family & outings',
    groups: ['social', 'outing'],
    firstYearOnly: false,
  },
]

export const DEFAULT_RETIREMENT_BINGO_THEME_ID: RetirementBingoThemeId = 'everyday'

const THEME_INDEX = new Map(RETIREMENT_BINGO_THEMES.map((theme) => [theme.id, theme]))

export const RETIREMENT_BINGO_THEME_OPTIONS: StudioSelectOption[] =
  RETIREMENT_BINGO_THEMES.map((theme) => ({ label: theme.label, value: theme.id }))

export function parseRetirementBingoTheme(config: StudioConfig): RetirementBingoTheme {
  const chosen = THEME_INDEX.get(String(config.theme ?? '') as RetirementBingoThemeId)
  return chosen ?? THEME_INDEX.get(DEFAULT_RETIREMENT_BINGO_THEME_ID)!
}

/**
 * The sentence under the heading: what to do, then how to win.
 *
 * Broken where the sense breaks, and short enough that each line holds on a
 * 5 x 8 column — a wrapped rule strands "BINGO!" on a line of its own. The free
 * square is not mentioned: it is labelled FREE on the card, and a rule the card
 * already states is a line the reader has to read twice.
 */
export const RETIREMENT_BINGO_INSTRUCTION =
  'Cross off each moment as it happens.\n' +
  'Five in a row, any direction, is BINGO!'

/** What the page tells the reader, unless the heading strip is switched off. */
export function retirementBingoInstruction(config: StudioConfig): string {
  if (config.showInstructions === false) return ''
  return RETIREMENT_BINGO_INSTRUCTION
}
