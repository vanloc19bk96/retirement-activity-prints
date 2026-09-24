import type { TopFiveGuessItem } from '@/types/studio-top-five-guess.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every set here already passes the gates in `content.ts`: exactly five short
 * answers, none overlapping another, none repeating its question, and no two
 * sets that read as the same puzzle. A fixture that needed thinning before use
 * would test the gates instead of the page.
 */
export const TOP_FIVE_FIXTURE_ITEMS: readonly TopFiveGuessItem[] = [
  {
    question: 'Name something you will never miss about the office.',
    answers: ['The morning commute', 'Meetings', 'Alarm clocks', 'Deadlines', 'Office politics'],
  },
  {
    question: 'Name a hobby people finally have time for after they retire.',
    answers: ['Gardening', 'Golf', 'Reading', 'Painting', 'Fishing'],
  },
  {
    question: 'Name something you would pack for a week at the beach.',
    answers: ['Sunscreen', 'Swimsuit', 'Towel', 'Sunglasses', 'A good book'],
  },
  {
    question: 'Name a treat you might enjoy on a slow Sunday morning.',
    answers: ['Pancakes', 'Fresh coffee', 'Croissants', 'Bacon and eggs', 'Cinnamon rolls'],
  },
  {
    question: 'Name a place grandchildren love to visit with you.',
    answers: ['The park', 'The zoo', 'The beach', 'An ice cream shop', 'The library'],
  },
]

export const TOP_FIVE_FIXTURE = { items: TOP_FIVE_FIXTURE_ITEMS.map((item) => ({ ...item })) }
