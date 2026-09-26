import type { RollADayItem, RollADayResponse } from '@/types/studio-roll-a-day.types'

/**
 * A reply shaped like one the content service returns: six faces plus spares
 * on each side, every kind represented.
 *
 * Every activity here already passes the gates in `content.ts` — the right
 * shape and half of the day, and no word of substance shared with any other,
 * on either side — so a fixture that needed thinning before use would test
 * the gates instead of the page. Mirrors MORNING / AFTERNOON in
 * backend/tests/test_studio_roll_a_day_service.py.
 */
export const RD_FIXTURE_MORNING: readonly RollADayItem[] = [
  { activity: 'Take a slow walk and grab a coffee', concept: 'coffee stroll', kind: 'move' },
  { activity: 'Sketch the view from a window', concept: 'window sketch', kind: 'make' },
  { activity: 'Call a friend for a long catch-up', concept: 'catch-up call', kind: 'people' },
  { activity: 'Stretch gently to a favourite song', concept: 'song stretch', kind: 'move' },
  { activity: 'Read a chapter on a park bench', concept: 'bench reading', kind: 'rest' },
  { activity: 'Repot a leggy houseplant', concept: 'houseplant repotting', kind: 'home' },
  { activity: 'Pick fresh flowers at a market', concept: 'market flowers', kind: 'outing' },
  { activity: 'Learn five words in Italian', concept: 'italian words', kind: 'learn' },
  { activity: 'Solve a crossword with a warm tea', concept: 'crossword and tea', kind: 'play' },
  { activity: 'Watch the ducks at a nearby pond', concept: 'duck watching', kind: 'rest' },
]

export const RD_FIXTURE_AFTERNOON: readonly RollADayItem[] = [
  { activity: 'Bake a small batch of scones', concept: 'scone baking', kind: 'make' },
  { activity: 'Browse the shelves at the library', concept: 'library browse', kind: 'outing' },
  { activity: 'Play a board game with a neighbour', concept: 'board game', kind: 'play' },
  { activity: 'Write a postcard to an old pal', concept: 'postcard writing', kind: 'people' },
  { activity: 'Paint a pebble for the doorstep', concept: 'pebble painting', kind: 'make' },
  { activity: 'Watch a film about volcanoes', concept: 'volcano film', kind: 'learn' },
  { activity: 'Invite a neighbour round for cake', concept: 'cake visit', kind: 'people' },
  { activity: 'Try a jigsaw puzzle by the window', concept: 'jigsaw', kind: 'play' },
  { activity: 'Doodle a map of your street', concept: 'street map', kind: 'home' },
  { activity: 'Nap in a sunny armchair', concept: 'armchair nap', kind: 'rest' },
]

export const RD_FIXTURE: RollADayResponse = {
  morning: [...RD_FIXTURE_MORNING],
  afternoon: [...RD_FIXTURE_AFTERNOON],
}
