import type { StudioRng } from '../studio-rng'

/**
 * Everything the Well Wishes pages say, bundled and original.
 *
 * No AI and no network: a signature page needs a warm heading, one short line
 * of how-to and a gentle prompt per box — a few dozen well-chosen phrases do
 * that better than a model, and they can be read, checked and kept kind here.
 * Variety comes from combining them by seed (heading × intro × prompts ×
 * frame × motif × sign-off), steered away from what the book and the seller
 * printed last.
 */

export const WW_TEMPLATE_KEY = 'well-wishes-signatures'

/**
 * Shown in the title field. Left as it is, it means "choose a heading for
 * me": each set gets one of the headings below, named for the retiree when a
 * name is given.
 */
export const WW_DEFAULT_TITLE = 'Well Wishes'

export const WW_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for signature boxes. Pick a larger page in Settings.'
export const WW_BUILD_FAILED_MESSAGE =
  'Could not lay out these well-wishes pages on your page size. Please try again.'

export type WwAudience = 'everyone' | 'coworkers' | 'family'

export const WW_AUDIENCES: readonly { value: WwAudience; label: string; help: string }[] = [
  {
    value: 'everyone',
    label: 'Everyone',
    help: 'Wording that suits coworkers, friends and family alike — ideal for a party book.',
  },
  {
    value: 'coworkers',
    label: 'Coworkers',
    help: 'Adds prompts about working together: a favorite work memory, what they taught the team.',
  },
  {
    value: 'family',
    label: 'Friends & family',
    help: 'Adds warmer, personal prompts: a favorite family memory, what I love most about you.',
  },
]

export function parseWwAudience(raw: unknown): WwAudience {
  return WW_AUDIENCES.some((a) => a.value === raw) ? (raw as WwAudience) : 'everyone'
}

export const WW_PAGE_COUNTS = [1, 2, 3, 4] as const
export const WW_DEFAULT_PAGES = 2

export function parseWwPages(raw: unknown): number {
  const value = Number(raw)
  return (WW_PAGE_COUNTS as readonly number[]).includes(value) ? value : WW_DEFAULT_PAGES
}

/** A first name or nickname: long enough for "Aunt Josephine", short enough for a heading. */
export const WW_NAME_MAX = 24
const NAME_RE = /^\p{L}[\p{L}\p{M} .'’-]*$/u

/** The retiree's name as printed, or '' — blank, too long, or not a name. */
export function parseWwName(raw: unknown): string {
  const text = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text || text.length > WW_NAME_MAX || !NAME_RE.test(text)) return ''
  return text.replace(/'/g, '’')
}

export function wwNameProblem(raw: unknown): string | null {
  const text = String(raw ?? '').trim()
  if (!text || parseWwName(text)) return null
  return `Use a first name or nickname: letters only, up to ${WW_NAME_MAX} characters.`
}

/** "Linda’s", "James’". */
const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`)

type Audiences = readonly WwAudience[]
const ALL: Audiences = ['everyone', 'coworkers', 'family']
const WORK: Audiences = ['coworkers']
const HOME: Audiences = ['family']

const fits = (audience: WwAudience, item: { for: Audiences }) => item.for.includes(audience)

export interface WwHeading {
  id: string
  for: Audiences
  plain: string
  named: (name: string) => string
  /** Heading for the pages after the first, so they read as one section. */
  more: string
}

export const WW_HEADINGS: readonly WwHeading[] = [
  { id: 'well-wishes', for: ALL, plain: 'Well Wishes', named: (n) => `Well Wishes for ${n}`, more: 'More Well Wishes' },
  {
    id: 'next-chapter',
    for: ALL,
    plain: 'Messages for the Next Chapter',
    named: (n) => `Messages for ${possessive(n)} Next Chapter`,
    more: 'More Messages for the Next Chapter',
  },
  {
    id: 'retirement-wishes',
    for: ALL,
    plain: 'Retirement Wishes',
    named: (n) => `Retirement Wishes for ${n}`,
    more: 'More Retirement Wishes',
  },
  {
    id: 'notes-good-wishes',
    for: ALL,
    plain: 'Notes & Good Wishes',
    named: (n) => `Notes & Good Wishes for ${n}`,
    more: 'More Notes & Good Wishes',
  },
  {
    id: 'memories-wishes',
    for: ALL,
    plain: 'Memories & Good Wishes',
    named: (n) => `Memories & Wishes for ${n}`,
    more: 'More Memories & Wishes',
  },
  {
    id: 'here-is-to-you',
    for: ALL,
    plain: 'Here’s to the Next Chapter',
    named: (n) => `Here’s to You, ${n}`,
    more: 'More Wishes for the Next Chapter',
  },
  {
    id: 'road-ahead',
    for: ALL,
    plain: 'Wishes for the Road Ahead',
    named: (n) => `Wishes for ${possessive(n)} Road Ahead`,
    more: 'More Wishes for the Road Ahead',
  },
  {
    id: 'words-to-keep',
    for: ALL,
    plain: 'Kind Words to Keep',
    named: (n) => `Kind Words for ${n} to Keep`,
    more: 'More Kind Words to Keep',
  },
  {
    id: 'cheers',
    for: ALL,
    plain: 'Cheers to Retirement',
    named: (n) => `Cheers to ${n}`,
    more: 'More Cheers & Wishes',
  },
  {
    id: 'signed-best-wishes',
    for: ALL,
    plain: 'Signed with Best Wishes',
    named: (n) => `For ${n}, with Best Wishes`,
    more: 'More Best Wishes',
  },
  {
    id: 'from-the-team',
    for: WORK,
    plain: 'Notes from the Team',
    named: (n) => `For ${n}, from the Team`,
    more: 'More Notes from the Team',
  },
  {
    id: 'from-colleagues',
    for: WORK,
    plain: 'From Your Colleagues',
    named: (n) => `For ${n}, from Your Colleagues`,
    more: 'More from Your Colleagues',
  },
  {
    id: 'with-love',
    for: HOME,
    plain: 'With Love & Best Wishes',
    named: (n) => `For ${n}, with Love`,
    more: 'More Love & Best Wishes',
  },
  {
    id: 'from-all-of-us',
    for: HOME,
    plain: 'From All of Us, with Love',
    named: (n) => `To ${n}, from All of Us`,
    more: 'More Love from All of Us',
  },
]

export interface WwIntro {
  id: string
  for: Audiences
  plain: string
  named: (name: string) => string
}

/** One short line under the heading. Written to the person signing. */
export const WW_INTROS: readonly WwIntro[] = [
  {
    id: 'wish-memory-thanks',
    for: ALL,
    plain: 'Write a wish, a memory or a word of thanks, then sign your name.',
    named: (n) => `Write ${n} a wish, a memory or a word of thanks, then sign your name.`,
  },
  {
    id: 'pick-a-box',
    for: ALL,
    plain: 'Pick any box, leave a few kind words and add your name.',
    named: (n) => `Pick any box, leave ${n} a few kind words and add your name.`,
  },
  {
    id: 'hope-years-ahead',
    for: ALL,
    plain: 'Share a favorite memory or a hope for the years ahead, and sign below it.',
    named: (n) => `Share a memory of ${n} or a hope for the years ahead, and sign below it.`,
  },
  {
    id: 'from-the-heart',
    for: ALL,
    plain: 'Choose a box, write from the heart and sign your name.',
    named: (n) => `Choose a box, write to ${n} from the heart and sign your name.`,
  },
  {
    id: 'note-to-keep',
    for: ALL,
    plain: 'Leave a note to keep: a wish, a thank-you or a story, and sign it.',
    named: (n) => `Leave ${n} a note to keep: a wish, a thank-you or a story, and sign it.`,
  },
  {
    id: 'one-box-each',
    for: ALL,
    plain: 'One box each: a message, a memory if you like, and your signature.',
    named: (n) => `One box each: a message for ${n}, a memory if you like, and your signature.`,
  },
  {
    id: 'work-story',
    for: WORK,
    plain: 'Add a thank-you, a favorite work story or a wish for what comes next, then sign.',
    named: (n) => `Add a thank-you, a favorite work story or a wish for ${n}, then sign.`,
  },
  {
    id: 'team-send-off',
    for: WORK,
    plain: 'A send-off from the team: write a few words and sign your name.',
    named: (n) => `A send-off for ${n} from the team: write a few words and sign your name.`,
  },
  {
    id: 'family-memory',
    for: HOME,
    plain: 'Write a loving wish or a favorite memory together, then sign your name.',
    named: (n) => `Write ${n} a loving wish or a favorite memory together, then sign your name.`,
  },
]

export interface WwPrompt {
  text: string
  for: Audiences
}

/**
 * The small label at the top of each box — one gentle idea, never a form to
 * fill in. Spoken to the retiree, so a signer knows at a glance what to write.
 * A trailing ellipsis invites the signer to carry the sentence on.
 */
export const WW_PROMPTS: readonly WwPrompt[] = [
  { text: 'My wish for you', for: ALL },
  { text: 'A favorite memory', for: ALL },
  { text: 'For your next chapter', for: ALL },
  { text: 'Something I’ll always remember', for: ALL },
  { text: 'What I’ll miss most', for: ALL },
  { text: 'A wish for the years ahead', for: ALL },
  { text: 'Thank you for…', for: ALL },
  { text: 'I hope retirement brings you…', for: ALL },
  { text: 'A little advice for retirement', for: ALL },
  { text: 'Here’s to you', for: ALL },
  { text: 'A note to keep', for: ALL },
  { text: 'May your days be full of…', for: ALL },
  { text: 'A memory I treasure', for: ALL },
  { text: 'Something you taught me', for: ALL },
  { text: 'Your next adventure should be…', for: ALL },
  { text: 'A toast to you', for: ALL },
  { text: 'Now you finally have time to…', for: ALL },
  { text: 'Words of cheer', for: ALL },
  { text: 'I’ll always be grateful for…', for: ALL },
  { text: 'Wishing you plenty of…', for: ALL },
  { text: 'A favorite memory from work', for: WORK },
  { text: 'What I learned from you', for: WORK },
  { text: 'My favorite work story', for: WORK },
  { text: 'What the team will miss', for: WORK },
  { text: 'Advice for life after work', for: WORK },
  { text: 'Thanks for being a great colleague', for: WORK },
  { text: 'A favorite family memory', for: HOME },
  { text: 'What I love most about you', for: HOME },
  { text: 'Let’s make time to…', for: HOME },
  { text: 'My hope for you', for: HOME },
  { text: 'A moment I’ll never forget', for: HOME },
  { text: 'You make every day better by…', for: HOME },
]

/** The closing on each box's signature line. One per set, so the boxes match. */
export const WW_SIGNOFFS: readonly { text: string; for: Audiences }[] = [
  { text: 'From', for: ALL },
  { text: 'Signed', for: ALL },
  { text: 'Warmly,', for: ALL },
  { text: 'With best wishes,', for: ['everyone', 'coworkers'] },
  { text: 'All the best,', for: WORK },
  { text: 'With love,', for: HOME },
  { text: 'Love,', for: HOME },
]

export type WwFrameStyle = 'line' | 'rounded' | 'double' | 'brackets' | 'notched' | 'scalloped'
export const WW_FRAME_STYLES: readonly WwFrameStyle[] = [
  'line',
  'rounded',
  'double',
  'brackets',
  'notched',
  'scalloped',
]

/** Where a box's prompt sits: inside the frame, or set into its top edge. */
export type WwLabelPlacement = 'inside' | 'tab'
export const WW_LABEL_PLACEMENTS: readonly WwLabelPlacement[] = ['inside', 'tab']

/** The small line-art motif in the rule under the heading. */
export type WwMotif = 'sprig' | 'sparkle' | 'sunrise' | 'wave' | 'bloom' | 'plane' | 'diamond'
export const WW_MOTIFS: readonly WwMotif[] = [
  'sprig',
  'sparkle',
  'sunrise',
  'wave',
  'bloom',
  'plane',
  'diamond',
]

export const wwHeadingsFor = (audience: WwAudience) => WW_HEADINGS.filter((h) => fits(audience, h))
export const wwIntrosFor = (audience: WwAudience) => WW_INTROS.filter((i) => fits(audience, i))
export const wwPromptsFor = (audience: WwAudience) => WW_PROMPTS.filter((p) => fits(audience, p))
export const wwSignoffsFor = (audience: WwAudience) =>
  WW_SIGNOFFS.filter((s) => fits(audience, s)).map((s) => s.text)

/** A printable heading for this set, named for the retiree when one is given. */
export const headingText = (heading: WwHeading, name: string) => (name ? heading.named(name) : heading.plain)
export const introText = (intro: WwIntro, name: string) => (name ? intro.named(name) : intro.plain)

/**
 * Book and seller memory labels — short, stable tokens so a later set can
 * tell what an earlier one printed. Prompts are keyed by a slug of their text.
 */
export const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

export const wwLabel = {
  heading: (id: string) => `h:${id}`,
  intro: (id: string) => `i:${id}`,
  frame: (style: WwFrameStyle) => `f:${style}`,
  placement: (placement: WwLabelPlacement) => `l:${placement}`,
  motif: (motif: WwMotif) => `m:${motif}`,
  signoff: (text: string) => `s:${slug(text)}`,
  prompt: (text: string) => `p:${slug(text)}`,
}

/** What an earlier set printed, as the label sets `pickFresh` scores against. */
export interface WwMemory {
  book: ReadonlySet<string>
  recent: ReadonlySet<string>
}

const freshness = (label: string, memory: WwMemory) =>
  (memory.book.has(label) ? 2 : 0) + (memory.recent.has(label) ? 1 : 0)

/**
 * The option this book has not printed, then one this seller has not printed
 * lately, ties broken by seed. Bounded by the pool — never a search of
 * everything ever made.
 */
export function pickFresh<T>(
  rng: StudioRng,
  items: readonly T[],
  label: (item: T) => string,
  memory: WwMemory,
): T {
  let best = items[0] as T
  let bestScore = Number.POSITIVE_INFINITY
  for (const item of rng.shuffle(items)) {
    const score = freshness(label(item), memory)
    if (score < bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}

/**
 * One prompt per box, in page order. The book's and seller's recent prompts
 * go last; a set with more boxes than prompts deals the pool again, never
 * repeating a prompt on the same page or in the box next to it.
 */
export function dealPrompts(
  rng: StudioRng,
  pool: readonly string[],
  boxesPerPage: readonly number[],
  memory: WwMemory,
): string[][] | null {
  if (pool.length === 0) return null
  const ranked = () => {
    const shuffled = rng.shuffle(pool)
    return shuffled
      .map((text, order) => ({ text, order, score: freshness(wwLabel.prompt(text), memory) }))
      .sort((a, b) => a.score - b.score || a.order - b.order)
      .map((entry) => entry.text)
  }
  let queue = ranked()
  const pages: string[][] = []
  let previous = ''
  for (const count of boxesPerPage) {
    const page: string[] = []
    for (let n = 0; n < count; n++) {
      if (queue.length === 0) queue = ranked()
      let at = queue.findIndex((text) => text !== previous && !page.includes(text))
      if (at < 0) {
        // The pool is smaller than the page: accept a repeat, but not next door.
        const fresh = ranked()
        queue.push(...fresh)
        at = queue.findIndex((text) => text !== previous)
        if (at < 0) return null
      }
      const [text] = queue.splice(at, 1)
      page.push(text!)
      previous = text!
    }
    pages.push(page)
  }
  return pages
}

/** Known printable text, so the preflight can refuse anything malformed. */
export const WW_PROMPT_TEXTS: ReadonlySet<string> = new Set(WW_PROMPTS.map((p) => p.text))
export const WW_SIGNOFF_TEXTS: ReadonlySet<string> = new Set(WW_SIGNOFFS.map((s) => s.text))
