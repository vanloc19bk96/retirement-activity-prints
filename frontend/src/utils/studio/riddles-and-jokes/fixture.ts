import type { RiddlesJokesItem } from '@/types/studio-riddles-jokes.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every item here already passes the gates in `content.ts` and carries the
 * service's `verified` mark: six riddles and six jokes on different topics,
 * no two opening alike more than twice. A fixture that needed thinning before
 * use would test the gates instead of the page.
 */
export const RJ_FIXTURE_ITEMS: readonly RiddlesJokesItem[] = [
  {
    kind: 'riddle',
    setup: 'I have a face that used to shout at dawn, but now I let you sleep till nine. What am I?',
    answer: 'The alarm clock.',
    verified: true,
  },
  {
    kind: 'joke',
    setup: 'What do you call a gardener who finally has time for every weed?',
    answer: 'A mulch-tasker.',
    verified: true,
  },
  {
    kind: 'riddle',
    setup: 'I have a trunk but never pack for a holiday. What am I?',
    answer: 'An oak tree.',
    verified: true,
  },
  {
    kind: 'joke',
    setup: 'What did the out-of-office reply say on the first day of retirement?',
    answer: 'Gone fishing. Back whenever!',
    verified: true,
  },
  {
    kind: 'riddle',
    setup: 'I get emptier every morning while your day gets brighter. What am I?',
    answer: 'Your coffee pot.',
    verified: true,
  },
  {
    kind: 'joke',
    setup: 'Why was the hammock so popular on a Tuesday afternoon?',
    answer: 'Everyone wanted to hang out.',
    verified: true,
  },
  {
    kind: 'riddle',
    setup: 'I fill up with postcards but never go on holiday myself. What am I?',
    answer: 'The mailbox.',
    verified: true,
  },
  {
    kind: 'joke',
    setup: 'Where do retired train drivers go on holiday?',
    answer: 'Anywhere with a good track record.',
    verified: true,
  },
  {
    kind: 'riddle',
    setup: 'I hold your whole week, yet most of my squares stay empty now. What am I?',
    answer: 'The calendar.',
    verified: true,
  },
  {
    kind: 'joke',
    setup: 'How can you tell a bird feeder belongs to someone who just retired?',
    answer: 'It gets refilled before the birds even ask.',
    verified: true,
  },
  {
    kind: 'riddle',
    setup: 'I spend all week in the shed, then chase the grass on Saturday. What am I?',
    answer: 'The lawn mower.',
    verified: true,
  },
  {
    kind: 'joke',
    setup: 'What do you get when you cross a road trip with an afternoon nap?',
    answer: 'A snooze cruise.',
    verified: true,
  },
]

export const RJ_FIXTURE = {
  items: RJ_FIXTURE_ITEMS.map((item) => ({ ...item })),
}
