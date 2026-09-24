import type { RetiredNameResponse } from '@/types/studio-retired-name.types'

/**
 * A reply shaped like one the content service returns: a full table plus
 * spares on both lists.
 *
 * Every name here already passes the gates in `content.ts` — the right shape,
 * no shared roots within a list or across the two — so a fixture that needed
 * thinning before use would test the gates instead of the page. Mirrors
 * FIRST_NAMES / LAST_NAMES in backend/tests/test_studio_retired_name_service.py.
 */
export const RN_FIXTURE_FIRST: readonly string[] = [
  'Captain', 'Breezy', 'Admiral', 'Mellow', 'Commodore', 'Jolly', 'Professor', 'Sunny',
  'Skipper', 'Dapper', 'Maestro', 'Toasty', 'Coach', 'Chipper', 'Ranger', 'Merry',
  'Big Cheese', 'Cozy', 'Navigator', 'Snappy', 'Marshal', 'Lucky', 'Easygoing', 'Peppy',
  'Chief', 'Nifty', 'Rosy', 'Zippy',
]

export const RN_FIXTURE_LAST: readonly string[] = [
  'Hammock Snoozer', 'Porch Rocker', 'Crossword Champ', 'Fairway Explorer',
  'Tomato Whisperer', 'Biscuit Dunker', 'Garden Putterer', 'Cruise Hopper',
  'Sunset Chaser', 'Pancake Flipper', 'Kite Flyer', 'Trail Wanderer',
  'Jigsaw Solver', 'Birdhouse Maker',
]

export const RN_FIXTURE: RetiredNameResponse = {
  firstNames: [...RN_FIXTURE_FIRST],
  lastNames: [...RN_FIXTURE_LAST],
}
