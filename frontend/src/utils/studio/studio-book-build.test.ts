import { describe, expect, it } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import type { StudioGenerateContext, StudioTemplateDefinition } from '@/types/studio-template.types'
import { calculateMarginGuide } from '@/types/canvas-settings.types'
import { STUDIO_BOOK_TEMPLATES } from './studio-book-plan'
import { resolveStudioMarginForPage } from './studio-margin'
import { resetObjectCounter } from './studio-fabric-builders'
import { studioBuildFailure } from './studio-unique-content'
import { BL_FIXTURE } from './bucket-list/fixture'
import { CBN_FIXTURE } from './career-by-the-numbers/fixture'
import { FIXTURE_PAIRS } from './crossword/fixture'
import { EON_FIXTURE } from './ever-or-never/fixture'
import { fallenPhraseFixtureResponse } from './fallen-phrase/fixture'
import { FIF_FIXTURE } from './fill-in-funnies/fixture'
import { HIDDEN_MESSAGE_FIXTURE } from './hidden-message-word-search/fixture'
import { missingVowelsFixtureResponse } from './missing-vowels/fixture'
import { OT_FIXTURE } from './occupation-trivia/fixture'
import { OA_FIXTURE } from './office-awards/fixture'
import { phraseFinderFixtureResponse } from './phrase-finder/fixture'
import { qcFixture } from './quote-coloring/fixture'
import { RN_FIXTURE } from './retired-name/fixture'
import { anagramFixtureResponse } from './retirement-anagram/fixture'
import { WORD_SEARCH_FIXTURE_POOL } from './retirement-word-search/fixture'
import { riddleScrambleFixtureResponse } from './riddle-scramble/fixture'
import { RJ_FIXTURE } from './riddles-and-jokes/fixture'
import { RD_FIXTURE } from './roll-a-day/fixture'
import { TOP_FIVE_FIXTURE } from './top-five-guess/fixture'
import { TRIVIA_FIXTURE } from './trivia-clue-word-search/fixture'
import { TTF_FIXTURE } from './two-truths-and-a-fib/fixture'
import { RQ_FIXTURE } from './what-kind-of-retiree/fixture'
import { WKB_FIXTURE } from './who-knows-retiree-best/fixture'
import { WL_FIXTURE } from './work-lingo-match/fixture'
import { WYR_FIXTURE } from './would-you-rather/fixture'

const AI_FIXTURES: Record<string, () => unknown> = {
  'bucket-list': () => BL_FIXTURE,
  'career-by-the-numbers': () => CBN_FIXTURE,
  crossword: () => FIXTURE_PAIRS,
  cryptogram: () => ({
    items: [
      'FREE TIME IS BEST SPENT DOING WHAT YOU LOVE',
      'A QUIET GARDEN IS A FINE PLACE TO SIT AND DREAM',
      'SLOW MORNINGS AT HOME NOW FEEL LIKE A GIFT',
      'GOOD NEIGHBOURS TURN A STREET INTO A HOME',
      'EVERY SUNDAY CAN BE A SUNDAY NOW MY FRIEND',
      'PACK A FLASK AND WALK THE LONG WAY ROUND',
      'FREE TIME FEELS BEST WITH FRIENDS',
      'A NEW CHAPTER BEGINS AT HOME',
    ],
  }),
  'ever-or-never': () => EON_FIXTURE,
  'fallen-phrase': () => fallenPhraseFixtureResponse(),
  'fill-in-funnies': () => FIF_FIXTURE,
  'hidden-message-word-search': () => HIDDEN_MESSAGE_FIXTURE,
  'missing-vowels': () => missingVowelsFixtureResponse(),
  'occupation-trivia': () => OT_FIXTURE,
  'office-awards': () => OA_FIXTURE,
  'phrase-finder': () => phraseFinderFixtureResponse(),
  'quote-coloring': () => qcFixture(),
  'retired-name': () => RN_FIXTURE,
  'retirement-anagram': () => anagramFixtureResponse(),
  'word-search': () => ({ words: WORD_SEARCH_FIXTURE_POOL }),
  'riddle-scramble': () => riddleScrambleFixtureResponse(),
  'riddles-and-jokes': () => RJ_FIXTURE,
  'roll-a-day': () => RD_FIXTURE,
  'top-five-guess': () => TOP_FIVE_FIXTURE,
  'trivia-clue-word-search': () => TRIVIA_FIXTURE,
  'two-truths-and-a-fib': () => TTF_FIXTURE,
  'what-kind-of-retiree': () => RQ_FIXTURE,
  'who-knows-retiree-best': () => WKB_FIXTURE,
  'work-lingo-match': () => WL_FIXTURE,
  'would-you-rather': () => WYR_FIXTURE,
}

const DPI = 96

/** The margin a real 100-page book hands a recto, safe-area padding included. */
const kdpCtx = (wIn: number, hIn: number, seed: number, remoteData: unknown): StudioGenerateContext => {
  const pageWidth = Math.round(wIn * DPI)
  const pageHeight = Math.round(hIn * DPI)
  return {
    pageWidth,
    pageHeight,
    margin: resolveStudioMarginForPage({
      pageIndex: 0,
      pageWidth,
      pageHeight,
      marginGuide: calculateMarginGuide(100, false),
    }),
    seed,
    instanceId: 'audit',
    remoteData,
  }
}

async function remoteFor(def: StudioTemplateDefinition, config: Record<string, unknown>) {
  const fixture = AI_FIXTURES[def.key]
  if (fixture) return fixture()
  if (!def.prefetch) return undefined
  return def.prefetch(config, new AbortController().signal, { bookContentLabels: () => [] })
}

/**
 * The trims a book is built on most. Smaller interiors are left out on purpose:
 * several large-print logic grids do not fit 5 x 8 at any level, and there a
 * book run steps the level down or skips the game with a note.
 */
const TRIMS: [number, number][] = [
  [6, 9],
  [7.5, 9.25],
  [8.5, 11],
]
const SEEDS = [1000, 8919]

/**
 * A book run writes whatever a template returns, so an apology page here is an
 * apology page in a seller's book. The runner redraws a failed sheet, but a
 * template that fails at its own defaults on an ordinary trim is a template
 * that will one day run out of redraws.
 */
describe('every book game builds at its defaults', () => {
  for (const def of STUDIO_BOOK_TEMPLATES) {
    it(def.key, { timeout: 60_000 }, async () => {
      const failures: string[] = []
      for (const [w, h] of TRIMS) {
        for (const seed of SEEDS) {
          const config = { ...buildDefaultConfig(def), seed }
          const remote = await remoteFor(def, config)
          resetObjectCounter()
          const failure = studioBuildFailure(def.generate(config, kdpCtx(w, h, seed, remote)))
          if (failure) failures.push(`${w}x${h} seed ${seed}: ${failure}`)
        }
      }
      expect(failures).toEqual([])
    })
  }
})
