import type { FallenPhraseResponse } from '@/types/studio-fallen-phrase.types'

/**
 * A content-service reply, as a page would really be handed one.
 *
 * Every saying here passes `isValidPhrase` for one of the three bands and
 * grids at the widths the trims in the test suite produce. That matters more
 * than it sounds: a fixture full of sayings the page would reject tests the
 * rejection path and nothing else, and this template's whole risk lives on the
 * other side of that, in grids that build but build wrong.
 *
 * Several per band, because the page discards candidates until one both grids
 * and passes preflight, and a fixture of one proves nothing about discarding.
 * Their word shapes are deliberately mixed — some all short words, some with a
 * nine-letter word in the middle — since word shape, not letter count, is what
 * decides whether a saying can be set into a grid at all.
 */
const SHORT_PHRASES = [
  'THE GARDEN KEEPS ITS OWN QUIET HOURS NOW',
  'EVERY DAY OF THE WEEK IS A SATURDAY',
  'THERE IS TIME NOW FOR THE LONG WAY HOME',
  'THE BEST HOUR IS THE ONE YOU DID NOT PLAN',
  'MAKE THE TEA AND LET THE DAY COME TO YOU',
  'THE ALARM CLOCK HAS GONE AND THE KETTLE HAS NOT',
]

const MEDIUM_PHRASES = [
  'THE BEST PART OF THE DAY IS THE ONE YOU DID NOT PLAN',
  'A KIND WORD COSTS YOU LITTLE AND IS KEPT FOR YEARS',
  'THE LONG WAY ROUND IS THE ONLY WAY WORTH TAKING NOW',
  'A GARDEN ASKS ONLY THAT YOU TURN UP AND THEN SIT DOWN',
  'COUNT THE MORNINGS THAT BEGIN WITH NO PLAN AT ALL NOW',
  'THE YEARS YOU GAVE TO WORK ARE PAID BACK ONE DAY AT A TIME',
]

const LONG_PHRASES = [
  'THE ROAD IS LONGER WHEN YOU STOP FOR EVERY VIEW AND THAT IS THE POINT',
  'YOU SPEND YEARS SAVING TIME AND THEN ONE DAY YOU GET TO SPEND ALL OF IT',
  'A HOUSE FULL OF BOOKS AND A POT OF TEA IS ALL THAT A DAY REALLY NEEDS',
  'SUNDAY LUNCH WITH ALL OF THEM ROUND ONE TABLE IS WORTH A WHOLE WEEK',
  'COUNT THE MORNINGS YOU WAKE WITH NO PLAN AT ALL AND CALL THAT YOUR LUCK',
  'THE GARDEN DOES NOT ASK WHAT YOU DID FOR WORK IT ASKS ONLY THAT YOU COME',
]

export const FALLEN_PHRASE_FIXTURE_ITEMS: string[] = [
  ...SHORT_PHRASES,
  ...MEDIUM_PHRASES,
  ...LONG_PHRASES,
]

export function fallenPhraseFixtureResponse(): FallenPhraseResponse {
  return { items: FALLEN_PHRASE_FIXTURE_ITEMS }
}
