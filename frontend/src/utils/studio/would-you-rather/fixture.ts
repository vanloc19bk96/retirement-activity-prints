import type { WouldYouRatherItem } from '@/types/studio-would-you-rather.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every pair here already passes the gates in `content.ts`: two verb-led
 * choices of similar length, one scenario each, and no two pairs that read as
 * the same question. A fixture that needed thinning before use would test the
 * gates instead of the page.
 */
export const WYR_FIXTURE_ITEMS: readonly WouldYouRatherItem[] = [
  {
    optionA: 'Spend a spring weekend in a cottage by the sea',
    optionB: 'Spend a spring weekend at a farmhouse in the hills',
    topic: 'short getaways and day trips',
  },
  {
    optionA: 'Learn to play the piano from scratch',
    optionB: 'Learn to hold a conversation in Italian',
    topic: 'learning something brand new',
  },
  {
    optionA: 'Host a big family dinner every Sunday',
    optionB: 'Be treated to a home-cooked meal once a week',
    topic: 'cooking, baking and hosting a meal',
  },
  {
    optionA: 'Have every weekday feel like a Saturday',
    optionB: 'Have every Saturday last twice as long',
    topic: 'the fun side of having all this free time',
  },
  {
    optionA: 'Grow a vegetable patch that feeds the whole street',
    optionB: 'Grow a flower garden that stops people in their tracks',
    topic: 'the garden and the backyard',
  },
  {
    optionA: 'Wake up to birdsong and a slow pot of coffee',
    optionB: 'Sleep in and enjoy a long, lazy brunch',
    topic: 'slow mornings and the first cup of the day',
  },
]

export const WYR_FIXTURE = { items: WYR_FIXTURE_ITEMS.map((item) => ({ ...item })) }
