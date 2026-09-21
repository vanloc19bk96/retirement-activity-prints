import type { PhrasingPool } from '@/utils/studio/_shared/uniqueness/phrasing'

/** What Changed? instruction variants (§4.7). Hand-written, never generated. */
export const CARDS_CHANGED_INSTRUCTIONS: PhrasingPool = {
  default: [
    'The second spread is not quite the same as the first. Circle every card that changed.',
    'Compare the two spreads and ring each card that is different in the lower one.',
    'Something moved, turned or changed between these two spreads. Find them all.',
    'Study the first spread, then circle the cards that are different in the second.',
    'Look carefully at both spreads. Mark every difference you can find in the second.',
    'Some cards are not what they were. Circle each one in the lower spread.',
    'Work across the two spreads and ring every card that has changed.',
    'The lower spread has been altered. Circle each card that is no longer the same.',
    'Find the differences between the two spreads and circle them below.',
    'Cards have changed between the first spread and the second. Circle each one.',
  ],
}

/** Heading over the two spreads. */
export const CARDS_CHANGED_SPREAD_LABELS: readonly { before: string; after: string }[] = [
  { before: 'Before', after: 'After' },
  { before: 'First', after: 'Second' },
  { before: 'The original', after: 'The change' },
  { before: 'Spread one', after: 'Spread two' },
  { before: 'Start', after: 'Now' },
  { before: 'Top spread', after: 'Bottom spread' },
  { before: 'As dealt', after: 'As it stands' },
  { before: 'Earlier', after: 'Later' },
  { before: 'Original layout', after: 'New layout' },
  { before: 'Look at this', after: 'Then this' },
]
