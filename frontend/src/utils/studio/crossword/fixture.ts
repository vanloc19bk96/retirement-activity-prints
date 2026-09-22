import type { CrosswordPair } from './types'

/**
 * Stand-in for one clue-API response, shared by the crossword tests.
 *
 * Shaped like the real thing: retirement vocabulary, four to nine letters,
 * clues inside the level budget, and enough shared letters that the packer can
 * interlock a full grid without the network.
 */
export const FIXTURE_PAIRS: CrosswordPair[] = [
  { word: 'GARDEN', clue: 'A place to grow flowers and vegetables' },
  { word: 'TRAVEL', clue: 'Going on trips away from home' },
  { word: 'HOBBY', clue: 'A pastime done for enjoyment' },
  { word: 'RELAX', clue: 'Take it easy after a busy week' },
  { word: 'CRUISE', clue: 'A vacation taken by ship' },
  { word: 'PENSION', clue: 'Income paid after a working life' },
  { word: 'RETIRE', clue: 'Leave work for a new chapter' },
  { word: 'LEISURE', clue: 'Free time for rest or hobbies' },
  { word: 'NATURE', clue: 'The outdoors and living world' },
  { word: 'FRIEND', clue: 'Someone you enjoy spending time with' },
  { word: 'FAMILY', clue: 'Relatives you share life with' },
  { word: 'SUNSET', clue: 'Evening colors in the western sky' },
  { word: 'READING', clue: 'Enjoying a book in a quiet chair' },
  { word: 'WALKING', clue: 'A gentle outdoor exercise' },
  { word: 'CRAFTS', clue: 'Handmade creative projects' },
  { word: 'MUSIC', clue: 'Songs and melodies to enjoy' },
  { word: 'KITCHEN', clue: 'Room where meals are prepared' },
  { word: 'WEEKEND', clue: 'Days often free from the workweek' },
  { word: 'MEMORY', clue: 'Something remembered from the past' },
  { word: 'JOURNEY', clue: 'A trip from one place to another' },
  { word: 'PICNIC', clue: 'An outdoor meal on a blanket' },
  { word: 'CAMERA', clue: 'Device used to take photographs' },
  { word: 'BRIDGE', clue: 'Structure built to cross water' },
  { word: 'MARKET', clue: 'Place where people buy goods' },
  { word: 'SEWING', clue: 'Joining cloth with needle and thread' },
  { word: 'BAKING', clue: 'Making bread or cakes in an oven' },
  { word: 'COTTAGE', clue: 'A small house in the country' },
  { word: 'HARBOR', clue: 'Sheltered water where boats moor' },
]
