import type { WwAudience } from '../well-wishes/content'

/**
 * Everything the Advice for the Retiree cards say, bundled and original.
 *
 * No AI and no network: a card needs a heading, one line of how-to and a
 * sentence for the guest to finish. A few dozen well-chosen starters do that
 * better than a model, and they can be read and kept kind here. Variety comes
 * from combining them by seed (heading × intro × prompts × frame × motif ×
 * sign-off), steered away from what the book and the seller printed last.
 */

export const AC_TEMPLATE_KEY = 'advice-for-the-retiree'

/**
 * Shown in the title field. Left as it is, it means "choose a heading for
 * me": each set gets one of the headings below, named for the retiree when a
 * name is given.
 */
export const AC_DEFAULT_TITLE = 'Advice for the Retiree'

export const AC_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for advice cards. Pick a larger page in Settings.'
export const AC_BUILD_FAILED_MESSAGE =
  'Could not lay out these advice cards on your page size. Please try again.'

/** The form's warning, and the error page's text, when the chosen cards per page do not fit. */
export const acCrowdedMessage = (cards: number) =>
  `${cards} cards per page do not fit this page size with room to write. Choose fewer cards per page.`

export type AcAudience = WwAudience

export const AC_AUDIENCES: readonly { value: AcAudience; label: string; help: string }[] = [
  {
    value: 'everyone',
    label: 'Everyone',
    help: 'Advice anyone can write, from coworkers, friends or family. Ideal for a party.',
  },
  {
    value: 'coworkers',
    label: 'Coworkers',
    help: 'Adds work jokes and tips for life after work: no more meetings, alarm clocks or emails.',
  },
  {
    value: 'family',
    label: 'Friends & family',
    help: 'Adds warmer, personal prompts: time together, family plans, a loving tip.',
  },
]

export function parseAcAudience(raw: unknown): AcAudience {
  return AC_AUDIENCES.some((a) => a.value === raw) ? (raw as AcAudience) : 'everyone'
}

export const AC_PAGE_COUNTS = [1, 2, 3, 4, 6, 8] as const
export const AC_DEFAULT_PAGES = 2

export function parseAcPages(raw: unknown): number {
  const value = Number(raw)
  return (AC_PAGE_COUNTS as readonly number[]).includes(value) ? value : AC_DEFAULT_PAGES
}

export const AC_CARDS_PER_PAGE = [1, 2, 4] as const
export const AC_DEFAULT_CARDS = 2

export function parseAcCards(raw: unknown): number {
  const value = Number(raw)
  return (AC_CARDS_PER_PAGE as readonly number[]).includes(value) ? value : AC_DEFAULT_CARDS
}

/** "Linda’s", "James’". */
const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

type Audiences = readonly AcAudience[]
const ALL: Audiences = ['everyone', 'coworkers', 'family']
const WORK: Audiences = ['coworkers']
const HOME: Audiences = ['family']

const fits = (audience: AcAudience, item: { for: Audiences }) => item.for.includes(audience)

export interface AcHeading {
  id: string
  for: Audiences
  plain: string
  named: (name: string) => string
}

/** The page heading, and on cut-apart cards the small heading each card carries. */
export const AC_HEADINGS: readonly AcHeading[] = [
  { id: 'advice-for-the-retiree', for: ALL, plain: 'Advice for the Retiree', named: (n) => `Advice for ${n}` },
  { id: 'words-of-wisdom', for: ALL, plain: 'Words of Wisdom', named: (n) => `Words of Wisdom for ${n}` },
  { id: 'retirement-advice', for: ALL, plain: 'Retirement Advice', named: (n) => `Retirement Advice for ${n}` },
  {
    id: 'tips-next-chapter',
    for: ALL,
    plain: 'Tips for the Next Chapter',
    named: (n) => `Tips for ${possessive(n)} Next Chapter`,
  },
  { id: 'wise-words', for: ALL, plain: 'Wise Words for the Road Ahead', named: (n) => `Wise Words for ${n}` },
  { id: 'retiring-well', for: ALL, plain: 'How to Retire Well', named: (n) => `How to Retire Well, ${n}` },
  { id: 'advice-to-keep', for: ALL, plain: 'Good Advice to Keep', named: (n) => `Good Advice for ${n} to Keep` },
  { id: 'from-the-team', for: WORK, plain: 'Advice from the Team', named: (n) => `Advice for ${n}, from the Team` },
  { id: 'office-wisdom', for: WORK, plain: 'Wisdom from the Office', named: (n) => `Office Wisdom for ${n}` },
  { id: 'with-love', for: HOME, plain: 'Loving Advice for the Retiree', named: (n) => `Loving Advice for ${n}` },
]

export interface AcIntro {
  id: string
  for: Audiences
  plain: string
  named: (name: string) => string
}

/** One short line under the heading. Written to the guest filling in a card. */
export const AC_INTROS: readonly AcIntro[] = [
  {
    id: 'finish-the-sentence',
    for: ALL,
    plain: 'Pick a card, finish the sentence with your best advice, and sign your name.',
    named: (n) => `Pick a card, finish the sentence with your best advice for ${n}, and sign it.`,
  },
  {
    id: 'share-wisdom',
    for: ALL,
    plain: 'Share a little wisdom for the years ahead: complete a card and add your name.',
    named: (n) => `Share a little wisdom for ${possessive(n)} years ahead: complete a card and add your name.`,
  },
  {
    id: 'serious-or-silly',
    for: ALL,
    plain: 'Serious or silly, every tip counts. Fill in a card and sign it.',
    named: (n) => `Serious or silly, every tip for ${n} counts. Fill in a card and sign it.`,
  },
  {
    id: 'one-card-each',
    for: ALL,
    plain: 'One card each: finish the prompt, then sign below.',
    named: (n) => `One card each: finish the prompt for ${n}, then sign below.`,
  },
  {
    id: 'best-advice',
    for: ALL,
    plain: 'What’s your best advice for retirement? Write it on a card and sign it.',
    named: (n) => `What’s your best advice for ${n}? Write it on a card and sign it.`,
  },
  {
    id: 'team-tips',
    for: WORK,
    plain: 'Pass on your best tips for life after work, then add your name.',
    named: (n) => `Pass on your best tips to ${n} for life after work, then add your name.`,
  },
  {
    id: 'family-tips',
    for: HOME,
    plain: 'Write your best advice, a loving tip or a funny one, and sign your name.',
    named: (n) => `Write ${n} your best advice, a loving tip or a funny one, and sign your name.`,
  },
]

export interface AcPrompt {
  text: string
  for: Audiences
  /** A list card: every writing line is numbered, one idea per line. */
  list?: true
}

/**
 * The sentence a guest finishes, spoken to the retiree. A trailing ellipsis
 * carries the sentence on to the lines; a colon opens a numbered list. Gentle
 * or lightly funny, never a dose, a sum of money or anything that needs an
 * expert to say.
 */
export const AC_PROMPTS: readonly AcPrompt[] = [
  { text: 'My best advice for retirement is…', for: ALL },
  { text: 'The secret to a happy retirement is…', for: ALL },
  { text: 'Never miss a chance to…', for: ALL },
  { text: 'Always say yes to…', for: ALL },
  { text: 'Make time every week to…', for: ALL },
  { text: 'Don’t forget to…', for: ALL },
  { text: 'The best way to spend a Monday morning is…', for: ALL },
  { text: 'When you’re bored, try…', for: ALL },
  { text: 'Now that you’re the boss of your own time…', for: ALL },
  { text: 'Something new you should learn is…', for: ALL },
  { text: 'The best thing about no alarm clock is…', for: ALL },
  { text: 'Stay young at heart by…', for: ALL },
  { text: 'A new tradition you should start is…', for: ALL },
  { text: 'Treat yourself to…', for: ALL },
  { text: 'On a rainy day, you should…', for: ALL },
  { text: 'Every retiree needs…', for: ALL },
  { text: 'The one rule of retirement is…', for: ALL },
  { text: 'Say goodbye to…', for: ALL },
  { text: 'Say hello to…', for: ALL },
  { text: 'The best advice I ever got was…', for: ALL },
  { text: 'Take it from me…', for: ALL },
  { text: 'Life is too short not to…', for: ALL },
  { text: 'Places you should visit:', for: ALL, list: true },
  { text: 'Hobbies worth trying:', for: ALL, list: true },
  { text: 'Books or films you’ll love:', for: ALL, list: true },
  { text: 'Things to do in your first month:', for: ALL, list: true },
  { text: 'Ways to spend a lazy afternoon:', for: ALL, list: true },
  { text: 'Little luxuries you’ve earned:', for: ALL, list: true },
  { text: 'Now that there are no more meetings…', for: WORK },
  { text: 'Instead of answering emails, try…', for: WORK },
  { text: 'The first thing to do with your work clothes is…', for: WORK },
  { text: 'Whatever you do, don’t…', for: WORK },
  { text: 'Things you never have to do again:', for: WORK, list: true },
  { text: 'Let’s spend more time…', for: HOME },
  { text: 'Come visit us and let’s…', for: HOME },
  { text: 'Remember that we’ll always…', for: HOME },
  { text: 'Family adventures to plan:', for: HOME, list: true },
]

/** The closing on each card's signature line. One per set, so the cards match. */
export const AC_SIGNOFFS: readonly { text: string; for: Audiences }[] = [
  { text: 'From', for: ALL },
  { text: 'Signed', for: ALL },
  { text: 'Wisely yours,', for: ALL },
  { text: 'With best wishes,', for: ['everyone', 'coworkers'] },
  { text: 'Your coworker,', for: WORK },
  { text: 'With love,', for: HOME },
  { text: 'Love,', for: HOME },
]

export const acHeadingsFor = (audience: AcAudience) => AC_HEADINGS.filter((h) => fits(audience, h))
export const acIntrosFor = (audience: AcAudience) => AC_INTROS.filter((i) => fits(audience, i))
export const acPromptsFor = (audience: AcAudience) => AC_PROMPTS.filter((p) => fits(audience, p))
export const acSignoffsFor = (audience: AcAudience) =>
  AC_SIGNOFFS.filter((s) => fits(audience, s)).map((s) => s.text)

/** A printable heading for this set, named for the retiree when one is given. */
export const acHeadingText = (heading: AcHeading, name: string) => (name ? heading.named(name) : heading.plain)
export const acIntroText = (intro: AcIntro, name: string) => (name ? intro.named(name) : intro.plain)

/** Known printable text, so the preflight can refuse anything malformed. */
export const AC_PROMPT_TEXTS: ReadonlySet<string> = new Set(AC_PROMPTS.map((p) => p.text))
export const AC_LIST_PROMPTS: ReadonlySet<string> = new Set(AC_PROMPTS.filter((p) => p.list).map((p) => p.text))
export const AC_SIGNOFF_TEXTS: ReadonlySet<string> = new Set(AC_SIGNOFFS.map((s) => s.text))
