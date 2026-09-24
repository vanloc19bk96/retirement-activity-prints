import type { EverOrNeverItem } from '@/types/studio-ever-or-never.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every statement here already passes the gates in `content.ts`: "Ever" and a
 * past participle, one experience, and no two that read as the same thing. A
 * fixture that needed thinning before use would test the gates instead of the
 * page.
 */
export const EON_FIXTURE_ITEMS: readonly EverOrNeverItem[] = [
  {
    statement: 'Ever taken a nap before lunch on a Tuesday?',
    topic: 'naps at unexpected times and places',
  },
  {
    statement: 'Ever stayed in your pyjamas until noon on a Monday?',
    topic: 'staying comfy: slippers, pyjamas and lazy clothes',
  },
  {
    statement: 'Ever booked a trip on a Wednesday just because you could?',
    topic: 'day trips and spontaneous outings',
  },
  {
    statement: 'Ever grown a tomato bigger than your fist?',
    topic: 'the garden and the backyard',
  },
  {
    statement: 'Ever lost track of what day of the week it is?',
    topic: 'losing track of which day of the week it is',
  },
  {
    statement: 'Ever set an alarm just to switch it off and roll over?',
    topic: 'the old work alarm clock and routines left behind',
  },
  {
    statement: 'Ever had a second cup of coffee in the garden at ten?',
    topic: 'coffee, tea and slow mornings',
  },
  {
    statement: 'Ever beaten a grandchild at a board game fair and square?',
    topic: 'cards, puzzles and board games',
  },
  {
    statement: 'Ever joined a class just to meet new people?',
    topic: 'taking a class or learning a new skill',
  },
  {
    statement: 'Ever sung along to the radio at full volume?',
    topic: 'music, dancing and singing',
  },
  {
    statement: 'Ever watched the sunrise simply because you were up?',
    topic: 'seasons, weather and the great outdoors',
  },
  {
    statement: 'Ever baked bread from scratch for the neighbours?',
    topic: 'cooking and baking experiments',
  },
]

export const EON_FIXTURE = { items: EON_FIXTURE_ITEMS.map((item) => ({ ...item })) }
