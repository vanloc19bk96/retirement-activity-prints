import type { TriviaClueItem } from '@/types/studio-trivia-clues.types'

/**
 * A pool shaped like one the content service returns.
 *
 * Every pair here already passes the gates in `content.ts`: single A–Z answers
 * of four to seven letters (so the gentle level can draw on all of them), no
 * palindromes, no answer nested inside another, and no clue that prints the
 * answer or a stem of it. A fixture that needed thinning before use would test
 * the gates instead of the page.
 */
export const TRIVIA_FIXTURE_ITEMS: readonly TriviaClueItem[] = [
  { answer: 'GARDEN', clue: 'Where roses and tomatoes are grown' },
  { answer: 'TRAVEL', clue: 'To journey far from home' },
  { answer: 'CRUISE', clue: 'A holiday taken aboard a ship' },
  { answer: 'FAMILY', clue: 'Your relatives, all together' },
  { answer: 'HOBBY', clue: 'A pastime you take up for pleasure' },
  { answer: 'SUNSET', clue: 'The sky at the end of the day' },
  { answer: 'FRIEND', clue: 'Someone you meet for coffee' },
  { answer: 'NATURE', clue: 'Woods, fields and wild things' },
  { answer: 'READING', clue: 'What you do with a good book' },
  { answer: 'SAILING', clue: 'Moving across water by wind' },
  { answer: 'FREEDOM', clue: 'Having no one to answer to' },
  { answer: 'JOURNEY', clue: 'A long trip from one place to another' },
  { answer: 'WEEKEND', clue: 'Saturday and Sunday together' },
  { answer: 'PICNIC', clue: 'A meal eaten on a rug outdoors' },
  { answer: 'LEISURE', clue: 'Time that is entirely your own' },
  { answer: 'PENSION', clue: 'Money paid after your working years' },
  { answer: 'HAMMOCK', clue: 'A hanging bed slung between trees' },
  { answer: 'PORCH', clue: 'A covered step at the front door' },
  { answer: 'QUILT', clue: 'A warm cover stitched in patches' },
  { answer: 'BENCH', clue: 'A long seat in a park' },
  { answer: 'WALK', clue: 'A gentle stroll for exercise' },
  { answer: 'LAKE', clue: 'Still water ringed by shore' },
  { answer: 'BIRD', clue: 'It sings in the hedge at dawn' },
  { answer: 'SOFA', clue: 'The soft seat in a living room' },
  { answer: 'KNIT', clue: 'To make a scarf with two needles' },
  { answer: 'POTTERY', clue: 'Bowls shaped from wet clay' },
  { answer: 'COTTAGE', clue: 'A small house in the country' },
  { answer: 'HARVEST', clue: 'Bringing in the ripe crops' },
]

export const TRIVIA_FIXTURE = { items: [...TRIVIA_FIXTURE_ITEMS] }
