import { describe, it, expect } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { FillInFunniesStoryPayload } from '@/types/studio-fill-in-funnies.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig, getStudioTemplate } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import { fabricTextHeight } from '../studio-text-metrics'
import { harvestAnswers } from '../studio-answer-key'
import { STUDIO_CONTENT_LABEL_KEY } from '../studio-content-history'
import { assertObjectsInSafeMargin, runGeneratorContractTests } from '../studio-generator-test'
import { fillInFunniesTemplate, validateFifConfig } from './generate'
import {
  FIF_AI_EMPTY_MESSAGE,
  FIF_BLANK_KINDS,
  FIF_DEFAULT_TITLE,
  FIF_MAX_BLANKS,
  bookStoryLabel,
  fifStoryProblem,
  fillStory,
  normalizeFifStory,
  paragraphChunks,
  selectFifStories,
  storiesRepeat,
  storyRepeatsLabel,
  compactStoryLabel,
  type FifKind,
  type FifStory,
} from './content'
import { fitFif } from './fit'
import { runFifKdpPreflight } from './kdp-preflight'
import {
  BLANK_MIN,
  FONT_MIN,
  HELPER_FONT_MIN,
  STEP_STORY,
  STEP_STORY_CONTINUED,
  STEP_WORDS,
  STORY_END,
  WRITE_RULE_MIN,
  fifPrintNote,
  fifWorstCasePlan,
} from './layout'
import { FIF_FIXTURE, FIF_FIXTURE_STORIES } from './fixture'

const FONT = 'PT Serif'

/** The draft a seller has in front of them — common header fields included. */
const base: StudioConfig = {
  ...buildDefaultConfig(fillInFunniesTemplate),
  showTitle: true,
  title: FIF_DEFAULT_TITLE,
  showInstructions: true,
  seed: 42,
  fontFamily: FONT,
}

/** A real KDP interior: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number, remoteData: unknown = FIF_FIXTURE): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed: 42,
  instanceId: 'kdp',
  remoteData,
})

const TRIMS = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [7, 10],
  [8.25, 11],
  [8.5, 11],
] as const

function generate(config: StudioConfig, ctx: StudioGenerateContext) {
  resetObjectCounter()
  return fillInFunniesTemplate.generate(config, ctx)
}

const only = (index: number) => ({ stories: [{ ...FIF_FIXTURE_STORIES[index]! }] })
const story = (index: number): FifStory => normalizeFifStory(FIF_FIXTURE_STORIES[index])!

const texts = (objects: StudioFabricObject[]) =>
  objects.map((o) => String(o.text ?? '').replace(/ /g, ' ')).filter(Boolean)

const rules = (objects: StudioFabricObject[]) =>
  objects.filter((o) => o.type === 'rect' && o.studioRole === 'structure')

function extent(o: StudioFabricObject) {
  const w = o.width ?? 0
  const h = o.type === 'textbox' ? fabricTextHeight(1, o.fontSize!, o.lineHeight) : (o.height ?? 0)
  return { left: o.left, top: o.top, right: o.left + w, bottom: o.top + h }
}

const overlaps = (a: ReturnType<typeof extent>, b: ReturnType<typeof extent>) =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5

/** Edit one fixture story without touching the shared fixture. */
function edited(index: number, change: Partial<FillInFunniesStoryPayload>): FillInFunniesStoryPayload {
  return { ...structuredClone(FIF_FIXTURE_STORIES[index]!), ...change }
}

// Content comes from the prefetch; with one fixed reply the activity is the
// same for every seed, and freshness is the prefetch's job (prefetch.test.ts).
runGeneratorContractTests(fillInFunniesTemplate, {
  expectSeedVariance: false,
  configOverrides: { showTitle: true, title: FIF_DEFAULT_TITLE, showInstructions: true },
  contextOverrides: { remoteData: FIF_FIXTURE },
})

describe('fill-in-funnies registry', () => {
  it('is registered once, in the word tab, as a two-step activity with no answer page', () => {
    expect(STUDIO_TEMPLATES.filter((t) => t.key === 'fill-in-funnies')).toHaveLength(1)
    const registered = getStudioTemplate('fill-in-funnies')!
    expect(registered.category).toBe('word')
    expect(registered.producesAnswerKey).toBe(false)
    expect(registered.pageCount).toBe(2)
    expect(registered.defaultPageTitle).toBe(FIF_DEFAULT_TITLE)
    expect(registered.prefetch).toBeTypeOf('function')
    expect(registered.label).not.toMatch(/mad\s*libs/i)
  })

  it('asks only for a theme', () => {
    expect(fillInFunniesTemplate.configSchema.map((field) => field.key)).toEqual(['theme', 'customTheme'])
    const custom = fillInFunniesTemplate.configSchema.find((f) => f.key === 'customTheme')!
    expect(custom.visibleWhen?.({ theme: 'mixed' })).toBe(false)
    expect(custom.visibleWhen?.({ theme: 'custom' })).toBe(true)
  })

  it('refuses an empty custom theme', () => {
    expect(validateFifConfig({ theme: 'custom', customTheme: '' })?.field).toBe('customTheme')
    expect(validateFifConfig({ theme: 'custom', customTheme: 'Caravan trips' })).toBeNull()
    expect(validateFifConfig({ theme: 'mixed' })).toBeNull()
  })

  it('reports what the trim prints in the theme help', () => {
    const help = fillInFunniesTemplate.configSchema[0]!.helpWhen!(base, kdpCtx(6, 9))
    expect(help).toMatch(/word list at \d+ pt/)
    expect(help).toMatch(/story at \d+ pt/)
  })
})

describe('fill-in-funnies content gates', () => {
  it('admits every fixture story', () => {
    for (const raw of FIF_FIXTURE_STORIES) expect(normalizeFifStory(raw)).not.toBeNull()
  })

  it('refuses a story the service did not verify', () => {
    expect(normalizeFifStory(edited(0, { verified: false }))).toBeNull()
    expect(normalizeFifStory(edited(0, { verified: undefined }))).toBeNull()
  })

  const problem = (s: FillInFunniesStoryPayload) =>
    fifStoryProblem(s.title, s.paragraphs, s.blanks as FifKind[])

  it('refuses "a" or "an" before a blank, and an article before a place or name', () => {
    const a = edited(0, {})
    a.paragraphs[1] = a.paragraphs[1]!.replace('a note from [6]', 'a note from a [6]')
    expect(problem(a)).toBe('article before a blank')
    const place = edited(1, {})
    place.paragraphs[0] = place.paragraphs[0]!.replace('from [1]', 'from the [1]')
    expect(problem(place)).toBe('article before a place or name')
  })

  it('refuses blanks out of order, unused, unknown or malformed', () => {
    const order = edited(0, {})
    order.paragraphs[0] = order.paragraphs[0]!.replace('[2]', '[3]').replace('bravest [3]', 'bravest [2]')
    expect(problem(order)).toBe('placeholder order')
    expect(problem(edited(0, { blanks: [...FIF_FIXTURE_STORIES[0]!.blanks, 'noun'] }))).not.toBeNull()
    expect(normalizeFifStory(edited(0, { blanks: ['body_part', ...FIF_FIXTURE_STORIES[0]!.blanks.slice(1)] }))).toBeNull()
    for (const broken of ['[10 ]', 'super[10]', '[10][9]']) {
      const s = edited(0, {})
      s.paragraphs[3] = s.paragraphs[3]!.replace('[10]', broken)
      expect(problem(s)).not.toBeNull()
    }
  })

  it('refuses a list of near-identical prompts', () => {
    expect(problem(edited(0, { blanks: Array(10).fill('noun') }))).toBe('one kind repeated')
  })

  it('refuses sensitive content, brands and the commercial game name', () => {
    for (const word of ['hospital', 'wine', 'Starbucks', 'lazy', 'Mad Libs']) {
      const s = edited(0, {})
      s.paragraphs[0] = s.paragraphs[0]!.replace('garage', word)
      expect(problem(s), word).toBe('unsafe')
    }
  })

  it('reconstructs the finished story from the word list', () => {
    const s = story(2)
    const words = s.blanks.map((kind, i) => `${FIF_BLANK_KINDS[kind].label}${i + 1}`)
    const filled = fillStory(s, words).join(' ')
    expect(filled).not.toMatch(/\[\d+\]/)
    // The callback prints the same word twice.
    expect(filled.split('Friend’s name2')).toHaveLength(3)
    expect(() => fillStory(s, words.slice(0, 3))).toThrow()
  })

  it('keeps punctuation glued to its blank', () => {
    const chunks = paragraphChunks('He said "[7]!" and left [8].')
    const glued = chunks.find((chunk) => chunk.some((a) => a.kind === 'blank' && a.n === 7))!
    expect(glued.map((a) => (a.kind === 'text' ? a.text : `[${a.n}]`)).join('')).toBe('"[7]!"')
    expect(glued[0]!.space).toBe(true)
    expect(glued.slice(1).every((a) => !a.space)).toBe(true)
  })
})

describe('fill-in-funnies repeats', () => {
  it('calls the same story with a few words swapped a repeat', () => {
    const swapped = edited(0, {
      title: 'The Big Shed Sort-Out',
      paragraphs: FIF_FIXTURE_STORIES[0]!.paragraphs.map((p) =>
        p.replace('first free Tuesday', 'second free Wednesday'),
      ),
    })
    expect(storiesRepeat(story(0), normalizeFifStory(swapped)!)).toBe(true)
  })

  it('does not confuse different stories', () => {
    expect(storiesRepeat(story(0), story(1))).toBe(false)
    expect(storiesRepeat(story(1), story(2))).toBe(false)
  })

  it('reads book labels and compact labels', () => {
    expect(storyRepeatsLabel(story(0), bookStoryLabel(story(0)))).toBe(true)
    expect(storyRepeatsLabel(story(0), compactStoryLabel(story(0)))).toBe(true)
    expect(storyRepeatsLabel(story(1), bookStoryLabel(story(0)))).toBe(false)
    expect(compactStoryLabel(story(0)).length).toBeLessThanOrEqual(60)
  })

  it('drops a story the book already prints', () => {
    const kept = selectFifStories(FIF_FIXTURE.stories, { cap: 3, avoid: [bookStoryLabel(story(0))] })
    expect(kept.map((s) => s.title)).toEqual([FIF_FIXTURE_STORIES[1]!.title, FIF_FIXTURE_STORIES[2]!.title])
  })
})

describe('fill-in-funnies activity', () => {
  it('prints the word list first, with no word of the story on it', () => {
    const [words] = generate(base, kdpCtx(6, 9))
    const all = texts(words!.objects)
    expect(all).toContain(STEP_WORDS)
    const s = story(0)
    s.blanks.forEach((kind, i) => {
      expect(all).toContain(`${i + 1}.`)
      expect(all).toContain(FIF_BLANK_KINDS[kind].label)
      expect(all).toContain(FIF_BLANK_KINDS[kind].hint)
    })
    expect(rules(words!.objects)).toHaveLength(s.blanks.length)
    const page = all.join(' ')
    expect(page).not.toContain(s.title)
    expect(page).not.toContain('garage')
  })

  it('prints the story next, one numbered writing line per blank', () => {
    const pages = generate(base, kdpCtx(6, 9))
    expect(pages).toHaveLength(2)
    const story0 = story(0)
    const objects = pages[1]!.objects
    const all = texts(objects)
    expect(all).toContain(STEP_STORY)
    expect(all).toContain(story0.title)
    expect(all).toContain(STORY_END)
    const blanks = story0.paragraphs.join(' ').match(/\[\d+\]/g)!
    expect(rules(objects)).toHaveLength(blanks.length)
    for (const token of blanks) expect(all).toContain(token.slice(1, -1))
    const labelled = objects.filter((o) => typeof o.data?.[STUDIO_CONTENT_LABEL_KEY] === 'string')
    expect(labelled).toHaveLength(1)
    expect(labelled[0]!.data![STUDIO_CONTENT_LABEL_KEY]).toBe(bookStoryLabel(story0))
  })

  it('prints a callback blank twice under the same number', () => {
    const pages = generate(base, kdpCtx(8.5, 11, only(2)))
    const objects = pages.slice(1).flatMap((p) => p.objects)
    const twos = objects.filter((o) => o.text === '2' && o.fontWeight === 700)
    expect(twos).toHaveLength(2)
    expect(rules(pages[0]!.objects)).toHaveLength(9)
  })

  it('sets the story words exactly as written', () => {
    const pages = generate(base, kdpCtx(6, 9))
    const printed = pages[1]!.objects
      .filter((o) => o.type === 'textbox' && o.studioRole === 'prompt')
      .map((o) => String(o.text).replace(/ /g, ' '))
      .join(' ')
    for (const word of ['garage.', 'overalls,', 'lawnmower', 'nap.']) expect(printed).toContain(word)
  })

  it('has no hidden answers and no answer page', () => {
    const pages = generate(base, kdpCtx(6, 9))
    for (const page of pages) {
      expect(harvestAnswers(page.objects)).toHaveLength(0)
      expect(page.answerSourceObjects).toBeUndefined()
      expect(page.pageRole).toBe('single')
    }
  })

  it('prints only black, white and grey', () => {
    const pages = generate(base, kdpCtx(8.5, 11))
    const colours = new Set(
      pages
        .flatMap((p) => p.objects)
        .flatMap((o) => [o.fill, o.stroke])
        .filter((c): c is string => !!c && c !== 'transparent'),
    )
    for (const colour of colours) {
      const hex = colour.replace('#', '')
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
      expect(Math.max(r!, g!, b!) - Math.min(r!, g!, b!)).toBeLessThanOrEqual(24)
    }
  })

  it('shows the empty message when the service sent nothing usable', () => {
    for (const remote of [null, {}, { stories: [] }, { stories: [edited(0, { verified: false })] }]) {
      const pages = generate(base, kdpCtx(6, 9, remote))
      expect(pages).toHaveLength(1)
      expect(texts(pages[0]!.objects)).toContain(FIF_AI_EMPTY_MESSAGE)
    }
  })

  it('works without a title or instructions', () => {
    const bare = { ...base, showTitle: false, title: '', showInstructions: false }
    const pages = generate(bare, kdpCtx(6, 9))
    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(texts(pages[0]!.objects)).toContain(STEP_WORDS)
  })
})

describe.each(TRIMS)('fill-in-funnies on a %s x %s trim', (w, h) => {
  const plan = fifWorstCasePlan({ page: kdpCtx(w, h), config: base, font: FONT })!

  it('plans large print within the budget', () => {
    expect(plan).not.toBeNull()
    expect(plan.words.metrics.font).toBeGreaterThanOrEqual(FONT_MIN)
    expect(plan.story.metrics.font).toBeGreaterThanOrEqual(FONT_MIN)
    expect(plan.words.metrics.hint).toBeGreaterThanOrEqual(HELPER_FONT_MIN)
    expect(plan.story.metrics.number).toBeGreaterThanOrEqual(HELPER_FONT_MIN)
    expect(plan.words.ruleW).toBeGreaterThanOrEqual(WRITE_RULE_MIN)
    expect(plan.story.metrics.blankW).toBeGreaterThanOrEqual(BLANK_MIN)
    expect(plan.words.count).toBe(FIF_MAX_BLANKS)
  })

  it.each([0, 1, 2])('lays out fixture story %s inside the margins without collisions', (index) => {
    const ctx = kdpCtx(w, h, only(index))
    const pages = generate(base, ctx)
    expect(pages.length).toBeGreaterThanOrEqual(2)
    expect(pages.length).toBeLessThanOrEqual(3)
    for (const page of pages) {
      assertObjectsInSafeMargin(page.objects, ctx)
      const inks = page.objects.filter((o) => o.type === 'textbox').map(extent)
      inks.forEach((a, i) => inks.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
      for (const o of page.objects.filter((x) => x.type === 'textbox')) {
        expect(o.fontSize!).toBeGreaterThanOrEqual(HELPER_FONT_MIN)
      }
    }
    if (pages.length === 3) expect(texts(pages[2]!.objects)).toContain(STEP_STORY_CONTINUED)
    const s = story(index)
    const fitted = fitFif([s], plan, FONT)!
    expect(runFifKdpPreflight({ fitted, fields: plan.fields, family: FONT }).ok).toBe(true)
  })

  it('says in the form what it prints', () => {
    expect(fifPrintNote({ page: kdpCtx(w, h), config: base, font: FONT })).toMatch(/word list at \d+ pt/)
  })
})

describe('fill-in-funnies preflight', () => {
  const plan = fifWorstCasePlan({ page: kdpCtx(6, 9), config: base, font: FONT })!

  it('refuses a word list that does not match the story', () => {
    const fitted = fitFif([story(0)], plan, FONT)!
    const broken = { ...fitted, words: { ...fitted.words, count: fitted.words.count - 1 } }
    expect(runFifKdpPreflight({ fitted: broken, fields: plan.fields, family: FONT }).ok).toBe(false)
  })

  it('refuses a story set differently from the one checked', () => {
    const fitted = fitFif([story(0)], plan, FONT)!
    const pages = structuredClone(fitted.pages)
    pages[0]!.lines.pop()
    expect(runFifKdpPreflight({ fitted: { ...fitted, pages }, fields: plan.fields, family: FONT }).ok).toBe(false)
  })

  it('says the page is too small rather than printing small type', () => {
    const pages = generate(base, kdpCtx(4, 6))
    expect(pages).toHaveLength(1)
    expect(texts(pages[0]!.objects).join(' ')).toMatch(/too small/)
  })
})
