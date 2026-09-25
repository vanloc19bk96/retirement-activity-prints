import type { WorkLingoPair } from '@/types/studio-work-lingo.types'

/**
 * A reply shaped like one the content service returns.
 *
 * Every pair here already passes the gates in `content.ts`, carries the
 * service's `verified` mark, and sits beside the others without a shared word
 * or a look-alike meaning — twelve pairs, more than the fullest page. A
 * fixture that needed thinning before use would test the gates instead of the
 * page.
 */
export const WL_FIXTURE_PAIRS: readonly WorkLingoPair[] = [
  { phrase: 'Circle back', meaning: 'Return to the topic later', verified: true },
  { phrase: 'Touch base', meaning: 'Briefly check in with someone', verified: true },
  { phrase: 'Low-hanging fruit', meaning: 'Easy wins to go after first', verified: true },
  { phrase: 'Move the needle', meaning: 'Make a noticeable difference', verified: true },
  { phrase: 'Think outside the box', meaning: 'Come up with fresh, unusual ideas', verified: true },
  { phrase: 'Keep me in the loop', meaning: 'Keep me informed as things change', verified: true },
  { phrase: 'Hit the ground running', meaning: 'Start a new job at full speed', verified: true },
  { phrase: 'Ballpark figure', meaning: 'A rough estimate of a number', verified: true },
  { phrase: 'Take it offline', meaning: 'Discuss it privately after the meeting', verified: true },
  { phrase: 'Crunch time', meaning: 'The hectic final stretch before a deadline', verified: true },
  { phrase: 'Pass the buck', meaning: 'Shift the blame onto somebody else', verified: true },
  { phrase: 'Red tape', meaning: 'Rules and paperwork that slow everything', verified: true },
]

export const WL_FIXTURE = {
  pairs: WL_FIXTURE_PAIRS.map((pair) => ({ ...pair })),
}
