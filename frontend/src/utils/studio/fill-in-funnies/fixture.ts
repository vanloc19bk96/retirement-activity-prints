import type { FillInFunniesStoryPayload } from '@/types/studio-fill-in-funnies.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every story here already passes the gates in `content.ts` — ten blanks at
 * most, every number used in order, no "a" in front of a blank — and carries
 * the service's `verified` mark. A fixture that needed thinning before use
 * would test the gates instead of the page.
 */
export const FIF_FIXTURE_STORIES: readonly FillInFunniesStoryPayload[] = [
  {
    title: 'The Great Garage Tidy-Up',
    premise: 'a retiree finally tidies the garage',
    topic: 'finally organising the garage',
    paragraphs: [
      'On the first free Tuesday of my retirement, I decided to tidy the garage. I put on my [1] overalls, made a flask of [2] and marched in like the bravest [3] in town.',
      'Behind the lawnmower I found [4] boxes of [5] and a note from [6] that simply said "[7]!"',
      'By lunchtime I had [8] past every shelf and invented a brand-new hobby called [9].',
      'The garage has never looked so [10]. The shed is next, just as soon as I finish my nap.',
    ],
    blanks: [
      'adjective', 'food', 'job', 'number', 'plural_noun',
      'friend_name', 'exclamation', 'verb_past', 'hobby', 'adjective',
    ],
    verified: true,
  },
  {
    title: 'Postcard From Paradise',
    premise: 'a postcard home from a dream holiday',
    topic: 'the dream retirement vacation',
    paragraphs: [
      'Greetings from [1]! The sun is shining, the sea is [2], and nobody here has heard of a Monday meeting.',
      'Each morning I eat [3] for breakfast, then join the other guests for a round of [4] by the pool. Yesterday I won a trophy shaped like one giant [5].',
      'The captain says I [6] more gracefully than anyone he has ever met. I think it is the [7] I packed.',
      'Please tell [8] that I will be home in [9] weeks. Wish you were here, and [10]!',
    ],
    blanks: [
      'place', 'adjective', 'food', 'hobby', 'animal',
      'verb', 'clothing', 'coworker_name', 'number', 'exclamation',
    ],
    verified: true,
  },
  {
    title: 'Minutes of the Hammock Committee',
    premise: 'the first meeting of a very relaxed club',
    topic: 'neighbours, clubs and community life',
    paragraphs: [
      "The first meeting of the Hammock Committee began at [1] o'clock sharp. Chairperson [2] opened by banging one enormous [3] on the table.",
      'Members agreed that [4] should be served at every meeting, preferably while [5].',
      'Next, [2] proposed a new rule: anyone who mentions work must [6] around the garden while shouting "[7]!" The motion passed [8].',
      'Our next meeting will be held in [9], weather and naps permitting.',
    ],
    blanks: [
      'number', 'friend_name', 'household_item', 'plural_noun', 'verb_ing',
      'verb', 'sound', 'adverb', 'place',
    ],
    verified: true,
  },
]

export const FIF_FIXTURE = { stories: FIF_FIXTURE_STORIES.map((story) => ({ ...story })) }
