import type { MissingVowelsResponse } from '@/types/studio-missing-vowels.types'

/**
 * A content-service reply, as the page would really be handed one.
 *
 * Every answer here passes the vowel-pattern gate in `pattern.ts`: its blanks
 * spell nothing else in the common list. That is not incidental to the fixture
 * — a test pool full of answers the page would reject tests the rejection path
 * and nothing else. GARDEN is the word this list conspicuously lacks, for the
 * same reason CHOIR and CALENDAR do: G_RD_N is also GORDON, CH__R is CHAIR and
 * CHEER, and C_L_ND_R is COLANDER.
 *
 * Every row also carries at least two vowels, because a row with one blank is
 * a spelling test rather than a puzzle — which is what rules out HOBBY, BENCH
 * and NIGHT SKY, all perfectly good retirement copy.
 *
 * Clues obey the printed budget: 8 to 42 characters, no wordplay, and never a
 * token sharing an answer word's first four letters.
 *
 * Lengths run from five to ten letters so one fixture covers all three levels.
 * The phrases stop at nine, which is where Classic stops: a word gap is the
 * widest thing a row holds and a two-column page pays for it twice, so the
 * longest level takes single words and every phrase here has to fit Classic.
 */
export const MISSING_VOWELS_FIXTURE_ITEMS: MissingVowelsResponse['items'] = [
  { answer: 'RELAX', clue: 'Put your feet up at last' },
  { answer: 'ALBUM', clue: 'Where the photographs live' },
  { answer: 'ROBIN', clue: 'Red breast at the feeder' },
  { answer: 'TRAVEL', clue: 'Seeing places far from home' },
  { answer: 'FAMILY', clue: 'Everyone at the Sunday table' },
  { answer: 'MEMORY', clue: 'Something you look back on' },
  { answer: 'SUNSET', clue: 'The sky at the end of the day' },
  { answer: 'PICNIC', clue: 'Lunch on a rug in the park' },
  { answer: 'RETIRE', clue: 'Leave working life behind' },
  { answer: 'NATURE', clue: 'The outdoors and its wildlife' },
  { answer: 'PUZZLE', clue: 'A pastime with pieces or clues' },
  { answer: 'TEAPOT', clue: 'It pours the morning brew' },
  { answer: 'MEADOW', clue: 'A field of wild flowers' },
  { answer: 'MARKET', clue: 'Stalls on a Saturday morning' },
  { answer: 'MUSEUM', clue: 'Rooms full of old things' },
  { answer: 'RAMBLE', clue: 'A long wander in the hills' },
  { answer: 'SEWING', clue: 'Needle, thread and a torn hem' },
  { answer: 'TROWEL', clue: 'Small tool for planting bulbs' },
  { answer: 'PENSION', clue: 'Money paid after working life' },
  { answer: 'LEISURE', clue: 'Time that is entirely your own' },
  { answer: 'SAILING', clue: 'Out on the water under canvas' },
  { answer: 'READING', clue: 'An evening with a good story' },
  { answer: 'COOKING', clue: 'Making supper from scratch' },
  { answer: 'WALKING', clue: 'Miles covered on foot' },
  { answer: 'FRIENDS', clue: 'People you meet for coffee' },
  { answer: 'COMFORT', clue: 'Warmth and ease at day end' },
  { answer: 'FREEDOM', clue: 'Nobody telling you the hour' },
  { answer: 'JOURNEY', clue: 'A trip from here to there' },
  { answer: 'WEEKEND', clue: 'Saturday and Sunday' },
  { answer: 'FISHING', clue: 'Waiting by the river with a rod' },
  { answer: 'CAMPING', clue: 'Nights spent in a tent' },
  { answer: 'BLANKET', clue: 'Warmth over your knees' },
  { answer: 'SUNRISE', clue: 'First light over the rooftops' },
  { answer: 'MORNING', clue: 'The hours before noon' },
  { answer: 'EVENING', clue: 'Lamps on and curtains drawn' },
  { answer: 'SEASIDE', clue: 'Sand, gulls and a pier' },
  { answer: 'COTTAGE', clue: 'A small house in the country' },
  { answer: 'VILLAGE', clue: 'A green, a shop and a church' },
  { answer: 'HARVEST', clue: 'Bringing in the ripe crop' },
  { answer: 'ORCHARD', clue: 'Rows of apple trees' },
  { answer: 'BOUQUET', clue: 'Flowers tied with ribbon' },
  { answer: 'LIBRARY', clue: 'Shelves you can borrow from' },
  { answer: 'CONCERT', clue: 'An evening of live music' },
  { answer: 'GALLERY', clue: 'Walls hung with paintings' },
  { answer: 'PICTURE', clue: 'It hangs above the fireplace' },
  { answer: 'RECIPE', clue: 'How a cake gets made' },
  { answer: 'KITCHEN', clue: 'The warmest room in the house' },
  { answer: 'SUPPER', clue: 'The last meal of the day' },
  { answer: 'DANCING', clue: 'Moving in time to the band' },
  { answer: 'SINGING', clue: 'Joining in with the chorus' },
  { answer: 'THEATRE', clue: 'Curtain up on a live show' },
  { answer: 'HOLIDAY', clue: 'Two weeks away from home' },
  { answer: 'CARAVAN', clue: 'A home you tow behind you' },
  { answer: 'BICYCLE', clue: 'Two wheels and a bell' },
  { answer: 'SPARROW', clue: 'A small brown garden bird' },
  { answer: 'COMPOST', clue: 'Old leaves turned into soil' },
  { answer: 'HAMMOCK', clue: 'A bed slung between trees' },
  { answer: 'VERANDA', clue: 'Shaded seat along the house' },
  { answer: 'CUSHION', clue: 'It softens the armchair' },
  { answer: 'CROCHET', clue: 'One hook and a ball of wool' },
  { answer: 'POTTERY', clue: 'Clay turned on a wheel' },
  { answer: 'REUNION', clue: 'Old friends together again' },
  { answer: 'KNITTING', clue: 'Needles, wool and a warm scarf' },
  { answer: 'ARMCHAIR', clue: 'The seat beside the fire' },
  { answer: 'SLIPPERS', clue: 'Soft shoes for indoors' },
  { answer: 'PAINTING', clue: 'Brush, easel and a quiet hour' },
  { answer: 'QUILTING', clue: 'Stitching squares into a cover' },
  { answer: 'PASSPORT', clue: 'You need it at the border' },
  { answer: 'POSTCARD', clue: 'A note sent home from abroad' },
  { answer: 'SOUVENIR', clue: 'A keepsake from a trip' },
  { answer: 'SWIMMING', clue: 'Gentle exercise in the water' },
  { answer: 'GRANDSON', clue: 'Your own child, now grown' },
  { answer: 'DAUGHTER', clue: 'A girl of your own family' },
  { answer: 'WELLNESS', clue: 'Feeling good in body and mind' },
  { answer: 'BIRDSONG', clue: 'What wakes you in spring' },
  { answer: 'WOODWORK', clue: 'Saw, chisel and a bench' },
  { answer: 'BUTTERFLY', clue: 'Bright wings over the border' },
  { answer: 'LAVENDER', clue: 'Purple spikes that smell sweet' },
  { answer: 'ROSEBUSH', clue: 'Thorny plant by the path' },
  { answer: 'TOMATOES', clue: 'They ripen in the greenhouse' },
  { answer: 'POTATOES', clue: 'You dig them up in autumn' },
  { answer: 'WATERING', clue: 'What the borders need in July' },
  { answer: 'DOMINOES', clue: 'Spotted tiles laid end to end' },
  { answer: 'BREAKFAST', clue: 'The first meal of the day' },
  { answer: 'CROSSWORD', clue: 'Squares filled from clues' },
  { answer: 'VOLUNTEER', clue: 'Giving time without pay' },
  { answer: 'ALLOTMENT', clue: 'A rented plot for vegetables' },
  { answer: 'ADVENTURE', clue: 'A bold trip somewhere new' },
  { answer: 'GRATITUDE', clue: 'Thankful for the small things' },
  { answer: 'COLLEAGUE', clue: 'Someone you worked beside' },
  { answer: 'BRIEFCASE', clue: 'It carried papers to the office' },
  { answer: 'FIREPLACE', clue: 'Where the logs go' },
  { answer: 'PENSIONER', clue: 'Somebody drawing a state income' },
  { answer: 'MILESTONE', clue: 'A birthday worth marking' },
  { answer: 'NEIGHBOUR', clue: 'The person next door' },
  { answer: 'GREENHOUSE', clue: 'Glass shelter for tender plants' },
  { answer: 'GRANDCHILD', clue: 'The youngest at the table' },
  { answer: 'BOOK CLUB', clue: 'Monthly meeting over a novel' },
  { answer: 'DAY CENTRE', clue: 'Somewhere to meet for lunch' },
  { answer: 'OLD FRIEND', clue: 'Someone known for years' },
  { answer: 'SUNNY SPOT', clue: 'The warm corner of the garden' },
  { answer: 'QUIET LIFE', clue: 'No rush, no fuss' },
  { answer: 'WORD GAME', clue: 'A pastime played with letters' },
  { answer: 'SPARE ROOM', clue: 'Made up when guests come' },
  { answer: 'BIRD BATH', clue: 'Shallow dish on a stone stand' },
  { answer: 'NEWS PAPER', clue: 'It lands on the mat each day' },
  { answer: 'JIGSAW', clue: 'A thousand pieces on the table' },
  { answer: 'BUS PASS', clue: 'It gets you a free ride' },
  { answer: 'NEW HOBBY', clue: 'Something taken up at last' },
  { answer: 'MARKET DAY', clue: 'Stalls fill the square' },
]

export function missingVowelsFixtureResponse(): MissingVowelsResponse {
  return { items: MISSING_VOWELS_FIXTURE_ITEMS }
}
