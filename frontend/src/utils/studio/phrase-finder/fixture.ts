import type {
  PhraseFinderItem,
  PhraseFinderResponse,
} from '@/types/studio-phrase-finder.types'

/**
 * A content-service reply, as a page would really be handed one.
 *
 * Every phrase here passes `isValidPhrase` for one of the three bands and lays
 * out at the trims the test suite uses. That matters more than it sounds: a
 * fixture full of phrases the page would reject tests the rejection path and
 * nothing else, and this template's whole risk lives on the other side of that,
 * in puzzles that print and print unfairly.
 *
 * Several per band, because the page discards candidates until it has enough it
 * can both set and validate, and a fixture of one proves nothing about
 * discarding. The punctuation is deliberately mixed — an apostrophe inside a
 * word, a hyphen joining two, a comma closing one — since a mark is the part of
 * the shape most likely to be mismeasured, and a fixture of bare letters would
 * never notice.
 *
 * Every clue is one a real reply would have to pass: inside the printed column's
 * character budget, and sharing no content word with the saying it points at.
 * A fixture of placeholder clues would make the clue gates look like they hold
 * when what they were tested against was "clue 1".
 */
const SHORT_ITEMS: PhraseFinderItem[] = [
  {
    text: 'EVERY DAY OF THE WEEK IS A SATURDAY',
    clue: 'No such thing as a working Monday now',
  },
  {
    text: 'THE GARDEN KEEPS ITS OWN QUIET HOURS',
    clue: 'The beds outside run on their own clock',
  },
  {
    text: 'THERE IS TIME NOW FOR THE LONG WAY HOME',
    clue: 'No need to rush back from anywhere',
  },
  {
    text: "DON'T RUSH, THE KETTLE IS ALREADY ON",
    clue: 'Tea is waiting, so take your time',
  },
  {
    text: 'A WELL-EARNED REST AND A GOOD BOOK',
    clue: 'An afternoon in the armchair with a story',
  },
  {
    text: 'THE BEST HOUR IS THE ONE NOBODY PLANNED',
    clue: 'The unbooked part of the day',
  },
]

const MEDIUM_ITEMS: PhraseFinderItem[] = [
  {
    text: 'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
    clue: 'An hour nobody wrote in the diary',
  },
  {
    text: 'A KIND WORD COSTS YOU LITTLE AND IS KEPT FOR YEARS',
    clue: 'Why a small gesture outlasts its moment',
  },
  {
    text: 'THE LONG WAY ROUND IS THE ONLY WAY WORTH TAKING NOW',
    clue: 'Why the scenic drive beats the quick one',
  },
  {
    text: 'A GARDEN ASKS ONLY THAT YOU TURN UP AND THEN SIT DOWN',
    clue: 'What the vegetable patch expects of you',
  },
  {
    text: 'COUNT THE MORNINGS THAT BEGIN WITH NO PLAN AT ALL',
    clue: 'Keeping score of empty diary pages',
  },
  {
    text: 'THE ALARM CLOCK HAS GONE, AND THE KETTLE HAS NOT',
    clue: 'One machine retired, the other did not',
  },
]

const LONG_ITEMS: PhraseFinderItem[] = [
  {
    text: 'YOU SPEND YEARS SAVING TIME AND THEN YOU GET TO SPEND ALL OF IT',
    clue: 'What all that overtime was really for',
  },
  {
    text: 'A HOUSE FULL OF BOOKS AND A POT OF TEA IS ALL A DAY REALLY NEEDS',
    clue: 'A short list for a contented afternoon',
  },
  {
    text: 'THE ROAD IS LONGER WHEN YOU STOP FOR EVERY VIEW, AND THAT IS THE POINT',
    clue: 'Why the detour is the holiday',
  },
  {
    text: 'SUNDAY LUNCH WITH ALL OF THEM ROUND ONE TABLE IS WORTH A WHOLE WEEK',
    clue: 'The best hours are the crowded kitchen ones',
  },
  {
    text: 'COUNT THE MORNINGS YOU WAKE WITH NO PLAN AT ALL AND CALL THAT LUCK',
    clue: 'Empty diary pages, and why they are a gift',
  },
  {
    text: 'THE GARDEN DOES NOT ASK WHAT YOU DID FOR WORK, IT ASKS THAT YOU COME',
    clue: 'The one place your old job means nothing',
  },
]

export const PHRASE_FINDER_FIXTURE_ITEMS: PhraseFinderItem[] = [
  ...SHORT_ITEMS,
  ...MEDIUM_ITEMS,
  ...LONG_ITEMS,
]

export function phraseFinderFixtureResponse(): PhraseFinderResponse {
  return { items: PHRASE_FINDER_FIXTURE_ITEMS }
}
