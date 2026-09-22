import type { RetirementAnagramResponse } from '@/types/studio-retirement-anagram.types'

/**
 * A content-service reply, as the page would really be handed one.
 *
 * Every word here passes the dictionary gate in `scramble.ts`: its letters
 * spell nothing else in the common list. That is not incidental to the fixture
 * — a test pool full of words the page would reject tests the rejection path
 * and nothing else. GARDEN is the word this list conspicuously lacks, because
 * its letters also spell GANDER.
 *
 * Clues obey the printed budget: 8 to 42 characters, no wordplay, and never a
 * token sharing the answer's first four letters.
 */
export const ANAGRAM_FIXTURE_ITEMS: RetirementAnagramResponse['items'] = [
  { word: 'WALK', clue: 'A gentle turn around the block' },
  { word: 'READ', clue: 'What you do with a good novel' },
  { word: 'CALM', clue: 'Peaceful and unhurried' },
  { word: 'REST', clue: 'A sit down and a cup of tea' },
  { word: 'SWIM', clue: 'Lengths at the local pool' },
  { word: 'GOLF', clue: 'Eighteen holes on a Sunday' },
  { word: 'BAKE', clue: 'Make a cake in the oven' },
  { word: 'HOME', clue: 'Where you hang your coat' },
  { word: 'PARK', clue: 'Green space with benches' },
  { word: 'TREE', clue: 'It gives shade in summer' },
  { word: 'BIRD', clue: 'It visits the feeder' },
  { word: 'BOOK', clue: 'Pages between two covers' },
  { word: 'HOBBY', clue: 'A pastime you make time for' },
  { word: 'RELAX', clue: 'Put your feet up at last' },
  { word: 'ROSES', clue: 'Blooms with thorns' },
  { word: 'CHESS', clue: 'Board game of kings and pawns' },
  { word: 'SPADE', clue: 'Tool for turning the soil' },
  { word: 'PATIO', clue: 'Paved spot for a deck chair' },
  { word: 'PORCH', clue: 'Sheltered step by the front door' },
  { word: 'LAWNS', clue: 'Grass you mow on Saturdays' },
  { word: 'SHEDS', clue: 'Where the tools are kept' },
  { word: 'TRAVEL', clue: 'Seeing places far from home' },
  { word: 'CRUISE', clue: 'A holiday spent at sea' },
  { word: 'FAMILY', clue: 'Everyone at the Sunday table' },
  { word: 'MEMORY', clue: 'Something you look back on' },
  { word: 'SUNSET', clue: 'The sky at the end of the day' },
  { word: 'PICNIC', clue: 'Lunch on a rug in the park' },
  { word: 'RETIRE', clue: 'Leave working life behind' },
  { word: 'NATURE', clue: 'The outdoors and its wildlife' },
  { word: 'BAKING', clue: 'It fills the house with warmth' },
  { word: 'PUZZLE', clue: 'A pastime with pieces or clues' },
  { word: 'TEAPOT', clue: 'It pours the morning brew' },
  { word: 'MEADOW', clue: 'A field of wild flowers' },
  { word: 'MARKET', clue: 'Stalls on a Saturday morning' },
  { word: 'PENSION', clue: 'Money paid after working life' },
  { word: 'LEISURE', clue: 'Time that is entirely your own' },
  { word: 'SAILING', clue: 'Out on the water under canvas' },
  { word: 'READING', clue: 'An evening with a good story' },
  { word: 'COOKING', clue: 'Making supper from scratch' },
  { word: 'WALKING', clue: 'Miles covered on foot' },
  { word: 'FRIENDS', clue: 'People you meet for coffee' },
  { word: 'COMFORT', clue: 'Warmth and ease at day end' },
  { word: 'FREEDOM', clue: 'Nobody telling you the hour' },
  { word: 'JOURNEY', clue: 'A trip from here to there' },
  { word: 'WEEKEND', clue: 'Saturday and Sunday' },
  { word: 'FISHING', clue: 'Waiting by the river with a rod' },
  { word: 'CAMPING', clue: 'Nights spent in a tent' },
  { word: 'BLANKET', clue: 'Warmth over your knees' },
  { word: 'WELLNESS', clue: 'Feeling good in body and mind' },
  { word: 'KNITTING', clue: 'Needles, wool and a warm scarf' },
  { word: 'ARMCHAIR', clue: 'The seat beside the fire' },
  { word: 'SLIPPERS', clue: 'Soft shoes for indoors' },
  { word: 'PAINTING', clue: 'Brush, easel and a quiet hour' },
  { word: 'QUILTING', clue: 'Stitching squares into a cover' },
  { word: 'PASSPORT', clue: 'You need it at the border' },
  { word: 'POSTCARD', clue: 'A note sent home from abroad' },
  { word: 'SOUVENIR', clue: 'A keepsake from a trip' },
  { word: 'SWIMMING', clue: 'Gentle exercise in the water' },
  { word: 'GRANDSON', clue: 'Your own child, now grown' },
  { word: 'DAUGHTER', clue: 'A girl of your own family' },
  { word: 'VOLUNTEER', clue: 'Giving time without pay' },
  { word: 'ALLOTMENT', clue: 'A rented plot for vegetables' },
  { word: 'ADVENTURE', clue: 'A bold trip somewhere new' },
  { word: 'GRATITUDE', clue: 'Thankful for the small things' },
  { word: 'COLLEAGUE', clue: 'Someone you worked beside' },
  { word: 'BRIEFCASE', clue: 'It carried papers to the office' },
  { word: 'GREENHOUSE', clue: 'Glass shelter for tender plants' },
]

export function anagramFixtureResponse(): RetirementAnagramResponse {
  return { items: ANAGRAM_FIXTURE_ITEMS }
}
