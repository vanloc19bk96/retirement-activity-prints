import { createRng, deriveSeed } from '../studio-rng'
import {
  COUNTRY_GROUPS,
  PLACE_GROUPS,
  US_STATE_GROUPS,
  WORLD_REGION_GROUPS,
  type TwmGroup,
} from './data'

export const TWM_TEMPLATE_KEY = 'travel-wish-map'
export const TWM_DEFAULT_TITLE = 'My Travel Wish Map'

export const TWM_INSTRUCTION =
  'Check each place you’d love to see someday and jot down why it appeals to you. Near or far, every wish counts.'

/** Beside every destination, on its first writing line. */
export const WHY_LABEL = 'Why I want to go:'

/** Longest destination name the data may hold; a name always sits on one line. */
export const TWM_MAX_NAME_CHARS = 34

export const TWM_PAGE_TOO_SMALL_MESSAGE =
  'This page size is too small for a travel wish map. Pick a larger page in Settings.'
export const TWM_BUILD_FAILED_MESSAGE = 'Could not lay out this travel wish map on your page. Please try again.'

export type TwmMode = 'states' | 'regions' | 'countries' | 'places'

export interface TwmModeSpec {
  value: TwmMode
  label: string
  help: string
  groups: readonly TwmGroup[]
  /** Fixed lists print every name; the others draw each heading's quota. */
  fixed: boolean
  /** What one entry is called in the form's notes. */
  noun: string
  /** Heading noun for the form's notes. */
  groupNoun: string
}

export const TWM_MODES: readonly TwmModeSpec[] = [
  {
    value: 'states',
    label: 'U.S. states',
    help: 'All 50 states, alphabetical under their four regions: Northeast, Midwest, South and West.',
    groups: US_STATE_GROUPS,
    fixed: true,
    noun: 'states',
    groupNoun: 'regions',
  },
  {
    value: 'regions',
    label: 'World regions',
    help: 'Broad areas to dream about, from the British Isles to the Pacific Islands, grouped by continent.',
    groups: WORLD_REGION_GROUPS,
    fixed: true,
    noun: 'regions',
    groupNoun: 'continents',
  },
  {
    value: 'countries',
    label: 'Countries of the world',
    help: 'Countries from every continent, drawn from about 100. Each list is a fresh mix, never repeating a country already in your book.',
    groups: COUNTRY_GROUPS,
    fixed: false,
    noun: 'countries',
    groupNoun: 'continents',
  },
  {
    value: 'places',
    label: 'Kinds of places, near or far',
    help: 'Places anyone can wish for, wherever they live: a national park, a harbor town, where an old friend lives, a café across town. A fresh mix every list.',
    groups: PLACE_GROUPS,
    fixed: false,
    noun: 'places',
    groupNoun: 'themes',
  },
]

export const TWM_DEFAULT_MODE: TwmMode = 'states'

export function parseTwmMode(raw: unknown): TwmMode {
  return TWM_MODES.some((m) => m.value === raw) ? (raw as TwmMode) : TWM_DEFAULT_MODE
}

export const twmModeSpec = (mode: TwmMode): TwmModeSpec => TWM_MODES.find((m) => m.value === mode)!

/** How many destinations a list of this mode prints. */
export const twmEntryCount = (mode: TwmMode): number =>
  twmModeSpec(mode).groups.reduce((sum, g) => sum + (g.quota ?? g.names.length), 0)

/** Every name the mode may print, for measuring the longest before a list exists. */
export const twmAllNames = (mode: TwmMode): string[] => twmModeSpec(mode).groups.flatMap((g) => [...g.names])

export interface TwmSection {
  key: string
  title: string
  names: string[]
}

// ─── Book and seller memory (sampled modes only) ─────────────────────────────

/**
 * Stamped on each printed destination of a sampled list, so a later list in
 * the same book can see it. Fixed lists (states, regions) are the same facts
 * every time and are never avoided.
 */
export const twmBookLabel = (mode: TwmMode, name: string) => `${mode}:${name}`

/** Names this mode already prints somewhere in the book. */
export function twmBookNames(mode: TwmMode, labels: readonly string[]): Set<string> {
  const prefix = `${mode}:`
  const known = new Set(twmAllNames(mode))
  const out = new Set<string>()
  for (const label of labels) {
    if (!label.startsWith(prefix)) continue
    const name = label.slice(prefix.length)
    if (known.has(name)) out.add(name)
  }
  return out
}

/** Most recent destinations a seller's next list leans away from: about two lists' worth. */
export const twmRecentWindow = (mode: TwmMode) => twmEntryCount(mode) * 2

const byName = (a: string, b: string) =>
  a.replace(/^The /, '').localeCompare(b.replace(/^The /, ''), 'en')

/**
 * The list for this mode.
 *
 * Fixed modes print every name of every group. Sampled modes deal each
 * group's quota from its pool: names the book already prints go last, then
 * the seller's recent lists, then everything else in a seeded order — so a
 * list only repeats a name once the pool is spent, and never within itself.
 * Countries are then alphabetical; kinds of places keep their curated order,
 * which reads from the everyday to the far-flung.
 */
export function pickTwmSections(options: {
  mode: TwmMode
  seed: number
  book?: ReadonlySet<string>
  recent?: readonly string[]
}): TwmSection[] {
  const { mode, seed } = options
  const spec = twmModeSpec(mode)
  if (spec.fixed) {
    return spec.groups.map((g) => ({ key: g.key, title: g.title, names: [...g.names] }))
  }
  const book = options.book ?? new Set<string>()
  const recent = new Set(options.recent ?? [])
  const tier = (name: string) => (book.has(name) ? 2 : recent.has(name) ? 1 : 0)
  return spec.groups.map((g) => {
    const rng = createRng(deriveSeed(seed, `${TWM_TEMPLATE_KEY}:${mode}:${g.key}`))
    const dealt = rng
      .shuffle(g.names)
      .map((name, order) => ({ name, order, tier: tier(name) }))
      .sort((a, b) => a.tier - b.tier || a.order - b.order)
      .slice(0, g.quota ?? g.names.length)
      .map((d) => d.name)
    const names =
      mode === 'countries' ? dealt.sort(byName) : g.names.filter((name) => dealt.includes(name))
    return { key: g.key, title: g.title, names }
  })
}

// ─── Validation ──────────────────────────────────────────────────────────────

/** Letters (any accent), spaces and the few marks real place names use. */
const NAME_SHAPE = /^[\p{L}][\p{L} ’'&.,-]*[\p{L}.]$/u

/** Why a destination name may not print, or null. */
export function twmNameProblem(name: string): string | null {
  if (typeof name !== 'string' || !name) return 'A destination has no name.'
  if (name !== name.trim() || /\s{2,}/.test(name)) return `“${name}” is not cleanly spaced.`
  if (name.length > TWM_MAX_NAME_CHARS) return `“${name}” is too long to print on one line.`
  if (!NAME_SHAPE.test(name)) return `“${name}” is not a place name.`
  return null
}

/**
 * Why a list may not print, or null.
 *
 * Every name must come from its own heading in the bundled data (nothing
 * invented, nothing filed under the wrong continent), headings must be the
 * mode's own in order, no name may appear twice, a fixed list must be
 * complete and a sampled one must hold each heading's full share.
 */
export function twmSectionsProblem(mode: TwmMode, sections: readonly TwmSection[]): string | null {
  const spec = twmModeSpec(mode)
  if (sections.length !== spec.groups.length) return 'The list does not carry every heading.'
  const seen = new Set<string>()
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!
    const group = spec.groups[i]!
    if (section.key !== group.key || section.title !== group.title) {
      return 'The list’s headings are not in order.'
    }
    const expected = group.quota ?? group.names.length
    if (section.names.length !== expected) {
      return spec.fixed
        ? `${group.title} is missing some of its ${spec.noun}.`
        : `${group.title} does not hold its ${expected} ${spec.noun}.`
    }
    for (const name of section.names) {
      const problem = twmNameProblem(name)
      if (problem) return problem
      if (!group.names.includes(name)) return `“${name}” is not one of the ${spec.noun} under ${group.title}.`
      const folded = name.toLowerCase()
      if (seen.has(folded)) return `“${name}” is listed twice.`
      seen.add(folded)
    }
  }
  return null
}
