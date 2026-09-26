import type { StudioRng } from '../studio-rng'
import { sha256Hex } from '../_shared/uniqueness'
import { sdOverlap, sdToken, type SdBookEntry, type SdGroupChoice } from './content'
import type { SdChange } from './differences'
import { sdGroupRecipes, type SdRecipe } from './scenes'
import type { SdScene } from './scene'

/**
 * Keeping a book varied, cheaply.
 *
 * A page is remembered as its scene, the kinds of things in it and the
 * changes it hid (`SdBookEntry`, stamped on the page). A new page takes the
 * group's least-used scene in the book (never the previous page's), then the
 * one this seller has not printed lately; a scene dealt too like a page the
 * book already has (the same things, by more than the threshold) is dealt
 * again. Everything here is bounded by one book and one seller's recent
 * history — never a comparison with every page ever made.
 */

/** The page as the book remembers it. */
export function sdSceneEntry(scene: SdScene, changes: readonly SdChange[]): SdBookEntry {
  const kindOf = new Map(scene.parts.map((p) => [p.id, p.kind]))
  return {
    recipe: scene.recipe,
    kinds: [...new Set(scene.parts.map((p) => sdToken(p.kind)))].sort(),
    changes: [...new Set(changes.map((c) => sdToken(`${kindOf.get(c.part)}:${c.kind}`)))].sort(),
  }
}

/** How like the book's pages a scene is: the highest share of its kinds any same-scene page holds, 0..1. */
export function sdSimilarity(scene: SdScene, book: readonly SdBookEntry[]): number {
  const kinds = sdSceneEntry(scene, []).kinds
  let worst = 0
  for (const e of book) if (e.recipe === scene.recipe) worst = Math.max(worst, sdOverlap(e.kinds, kinds))
  return worst
}

/** The scene's kinds as one short signature (for the seller's recent history). */
export const sdKindsSignature = (scene: SdScene) => `${scene.recipe}:${sha256Hex(sdSceneEntry(scene, []).kinds.join('.')).slice(0, 8)}`

/**
 * The scene for a page: the group's least-used in this book, never the
 * previous page's, not one this seller printed lately where it can, the
 * salted stream deciding among equals; `exclude` drops scenes an earlier
 * attempt at this page could not fill.
 */
export function pickSdRecipe(options: {
  group: SdGroupChoice
  rng: StudioRng
  book?: readonly SdBookEntry[]
  recent?: readonly string[]
  exclude?: ReadonlySet<string>
}): SdRecipe | null {
  const { group, rng, book = [], recent = [], exclude } = options
  const pool = sdGroupRecipes(group).filter((r) => !exclude?.has(r.id))
  if (pool.length === 0) return null
  const uses = (id: string) => book.filter((e) => e.recipe === id).length
  const lately = new Set(recent)
  const last = book[book.length - 1]?.recipe
  const rank = (r: SdRecipe) => uses(r.id) * 4 + (lately.has(r.id) ? 2 : 0) + (last === r.id ? 8 : 0)
  const low = Math.min(...pool.map(rank))
  return rng.pick(pool.filter((r) => rank(r) === low))
}

/**
 * The pair's canonical form: the scene's parts (kind, version, facing,
 * place to the pixel) and the changes. Two pages with the same canonical form
 * print the same puzzle, whatever their headings.
 */
export function sdCanonical(scene: SdScene, changes: readonly SdChange[]): string {
  const r = (n: number) => Math.round(n)
  const parts = scene.parts.map((p) => `${p.kind}/${Object.values(p.knobs).join('')}/${p.mirrored ? 'm' : ''}/${r(p.ax)},${r(p.ay)},${Math.round(p.k * 100)}`)
  const diffs = changes.map((c) => `${c.part}:${c.kind}:${c.side}:${c.to ? `${c.to.kind}/${Object.values(c.to.knobs).join('')}/${c.to.mirrored ? 'm' : ''}` : '-'}`)
  return sha256Hex(`${scene.recipe}|${parts.join(';')}|${diffs.join(';')}`).slice(0, 16)
}
