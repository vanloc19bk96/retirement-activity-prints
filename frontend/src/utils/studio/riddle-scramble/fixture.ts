import type { RiddleScrambleResponse } from '@/types/studio-riddle-scramble.types'

/**
 * A content-service reply, as a page would really be handed one.
 *
 * Two things make this fixture more than a convenience. Every word passes the
 * dictionary gate in `scramble.ts` — its letters spell nothing else in the
 * common list — because a test pool full of words the page would reject tests
 * the rejection path and nothing else. And the pool is deliberately *wide in
 * the alphabet* rather than merely long: the page has to find one word
 * carrying each letter of a riddle answer, so a pool of thirty words that all
 * start with S proves nothing about the matching.
 *
 * Riddles are supplied at all three answer lengths, since a level asks for an
 * exact one, and each is a question whose answer no word in the pool leaks.
 */
export const RIDDLE_SCRAMBLE_FIXTURE_RIDDLES: RiddleScrambleResponse['riddles'] = [
  // Four letters — the gentle level.
  { riddle: 'What does a retired postman look forward to each afternoon?', answer: 'NAPS' },
  { riddle: 'What did the hammock offer the tired new retiree?', answer: 'REST' },
  { riddle: 'Which sport is really a long walk with a small errand?', answer: 'GOLF' },
  { riddle: 'What do you call a morning with nowhere at all to be?', answer: 'CALM' },
  // Five letters — the classic level.
  { riddle: 'Where does a retired sailor drop anchor every evening?', answer: 'PORCH' },
  { riddle: 'What does a retired night owl finally get enough of?', answer: 'SLEEP' },
  { riddle: 'What did the old bookkeeper call his favourite new seat?', answer: 'CHAIR' },
  { riddle: 'What do retired bakers always have plenty of at teatime?', answer: 'SCONE' },
  // Six letters — the challenging level.
  { riddle: 'What does a retired banker do best in the afternoon light?', answer: 'SNOOZE' },
  { riddle: 'Which day of the week does a retired person like most?', answer: 'SUNDAY' },
  { riddle: 'What did the retired golfer name his new pet tortoise?', answer: 'PUTTER' },
  { riddle: 'What do retired couples watch every night and never pay for?', answer: 'SUNSET' },
]

export const RIDDLE_SCRAMBLE_FIXTURE_WORDS: RiddleScrambleResponse['words'] = [
  { word: 'WALK', clue: 'A turn around the block' },
  { word: 'SWIM', clue: 'Lengths at the pool' },
  { word: 'BAKE', clue: 'Make a cake in the oven' },
  { word: 'HOME', clue: 'Where you hang your coat' },
  { word: 'PARK', clue: 'Green space with benches' },
  { word: 'TREE', clue: 'It gives shade in summer' },
  { word: 'BIRD', clue: 'It visits the feeder' },
  { word: 'BOOK', clue: 'Pages between two covers' },
  { word: 'HOBBY', clue: 'A pastime you make time for' },
  { word: 'ROSES', clue: 'Blooms with thorns' },
  { word: 'CHESS', clue: 'Game of kings and pawns' },
  { word: 'SPADE', clue: 'Tool for turning soil' },
  { word: 'PATIO', clue: 'Paved spot for a deck chair' },
  { word: 'LAWNS', clue: 'Grass you mow on Saturdays' },
  { word: 'SHEDS', clue: 'Where the tools are kept' },
  { word: 'BINGO', clue: 'Numbers called on a Tuesday' },
  { word: 'JIGSAW', clue: 'A thousand pieces of sky' },
  { word: 'TRAVEL', clue: 'Seeing places far from home' },
  { word: 'CRUISE', clue: 'A holiday spent at sea' },
  { word: 'FAMILY', clue: 'Everyone at Sunday lunch' },
  { word: 'MEMORY', clue: 'Something you look back on' },
  { word: 'PICNIC', clue: 'Lunch on a rug in the park' },
  { word: 'RETIRE', clue: 'Leave working life behind' },
  { word: 'NATURE', clue: 'The outdoors and wildlife' },
  { word: 'BAKING', clue: 'It warms the whole house' },
  { word: 'PUZZLE', clue: 'A pastime with pieces' },
  { word: 'TEAPOT', clue: 'It pours the morning brew' },
  { word: 'MEADOW', clue: 'A field of wild flowers' },
  { word: 'MARKET', clue: 'Stalls on a Saturday' },
  { word: 'COFFEE', clue: 'A cup with a friend' },
  { word: 'GARAGE', clue: 'Where the car lives' },
  { word: 'SUPPER', clue: 'The last meal of the day' },
  { word: 'KETTLE', clue: 'It whistles when ready' },
  { word: 'WINDOW', clue: 'You watch the birds from it' },
  { word: 'CANDLE', clue: 'Soft light on a dark night' },
  { word: 'MUSEUM', clue: 'A hall full of old things' },
  { word: 'VOYAGE', clue: 'A long trip over water' },
  { word: 'PENSION', clue: 'Money paid after working' },
  { word: 'LEISURE', clue: 'Time entirely your own' },
  { word: 'SAILING', clue: 'Out on the water' },
  { word: 'READING', clue: 'An evening with a story' },
  { word: 'COOKING', clue: 'Supper made from scratch' },
  { word: 'WALKING', clue: 'Miles covered on foot' },
  { word: 'FRIENDS', clue: 'People you meet for tea' },
  { word: 'COMFORT', clue: 'Warmth and ease at day end' },
  { word: 'FREEDOM', clue: 'Nobody telling you the hour' },
  { word: 'JOURNEY', clue: 'A trip from here to there' },
  { word: 'WEEKEND', clue: 'Saturday and Sunday' },
  { word: 'FISHING', clue: 'Waiting by the river' },
  { word: 'CAMPING', clue: 'Nights spent in a tent' },
  { word: 'BLANKET', clue: 'Warmth over your knees' },
  { word: 'KNITTING', clue: 'Needles, wool and a scarf' },
  { word: 'ARMCHAIR', clue: 'The seat beside the fire' },
  { word: 'SLIPPERS', clue: 'Soft shoes for indoors' },
  { word: 'PAINTING', clue: 'Brush, easel, a quiet hour' },
  { word: 'PASSPORT', clue: 'You need it at the border' },
  { word: 'POSTCARD', clue: 'A note sent from abroad' },
  { word: 'SOUVENIR', clue: 'A keepsake from a trip' },
  { word: 'MAGAZINE', clue: 'It arrives every month' },
  { word: 'DAUGHTER', clue: 'A girl of your own family' },
  { word: 'ALLOTMENT', clue: 'A rented vegetable plot' },
  { word: 'ADVENTURE', clue: 'A bold trip somewhere new' },
  { word: 'GRATITUDE', clue: 'Thankful for small things' },
  { word: 'COLLEAGUE', clue: 'Someone you worked beside' },
]

export function riddleScrambleFixtureResponse(): RiddleScrambleResponse {
  return {
    riddles: RIDDLE_SCRAMBLE_FIXTURE_RIDDLES,
    words: RIDDLE_SCRAMBLE_FIXTURE_WORDS,
  }
}
