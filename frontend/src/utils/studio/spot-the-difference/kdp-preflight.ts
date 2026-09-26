import type { StudioFabricObject } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INK } from '@/constants/studio.constants'
import { sdOverlap, type SdBookEntry, type SdGroupChoice, type SdLevelSpec } from './content'
import { SD_MARK_GAP, SD_MARK_OVERHANG, checkPair, markBounds, pictureParts, sdPairLines, type SdDifference } from './differences'
import { SD_PART_KEY } from './draw'
import { inkShare, type SdLines } from './render'
import { sdGroupRecipes, sdRecipeById } from './scenes'
import { growBounds, overlaps, partBounds, SD_FRAME_CLEAR, type SdScene } from './scene'
import { sdSceneEntry } from './variety'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
  /** Parts whose change failed; a retry can choose again without them. */
  offending: string[]
}

/** Line art's share of the picture: below this it is too bare to hide anything, above it too busy to search fairly. */
export const SD_MIN_INK_SHARE = 0.02
export const SD_MAX_INK_SHARE = 0.16
/** A page this alike a page the book already prints (same scene, the same things) is a repeat. */
export const SD_MAX_KIND_OVERLAP = 0.8
/** …and with this many of the same changes, it is the same puzzle. */
export const SD_MAX_CHANGE_OVERLAP = 0.5

/**
 * The last gate before a page is accepted.
 *
 * Nothing about the pair is taken on trust: the scene must be a real one of
 * the chosen kind; the count within the level; every change on its own
 * part, big enough and not too big, its ring on the page and clear of every
 * other ring; the two finished pictures compared whole, differing only
 * inside the rings and showing every change there (`checkPair`); both
 * pictures neither bare nor cluttered; every part wholly inside its frame;
 * and not a scene the book already prints with the same things and the same
 * changes. Any failure sends the page back.
 */
export function runSdKdpPreflight(options: {
  scene: SdScene
  differences: readonly SdDifference[]
  level: SdLevelSpec
  group: SdGroupChoice
  book?: readonly SdBookEntry[]
  /** True only when every scene of the group is already in the book with these things, so a repeat is unavoidable. */
  repeat?: boolean
  /** Both pictures' line art, when the caller has drawn them already. */
  lines?: { a: SdLines; b: SdLines }
}): KdpPreflightResult {
  const { scene, differences, level, group, book = [], repeat = false } = options
  const lines = options.lines ?? sdPairLines(scene, differences)
  const fair = level.fairness
  const errors: string[] = []
  const offending = new Set<string>()
  const p = scene.panel
  const H = p.maxY - p.minY

  const recipe = sdRecipeById(scene.recipe)
  if (!recipe) errors.push('The page shows a scene that is not in the library.')
  else if (!sdGroupRecipes(group).includes(recipe)) errors.push(`“${recipe.name}” is not one of the chosen scenes.`)

  // The count, one change per part.
  const n = differences.length
  if (n < fair.count[0] || n > fair.count[1]) errors.push(`The pair has ${n} differences; this level hides ${fair.count[0]} to ${fair.count[1]}.`)
  if (new Set(differences.map((d) => d.part)).size !== n) errors.push('One thing carries two differences.')
  if (scene.parts.length < n + 2) errors.push('The scene is hardly more than its differences.')

  // Every change, measured.
  const inside = growBounds(p, SD_MARK_OVERHANG + 0.5)
  differences.forEach((d, i) => {
    if (!scene.parts.some((part) => part.id === d.part)) {
      errors.push(`Difference ${i + 1} changes something the scene does not have.`)
      return
    }
    const extent = Math.max(d.box.maxX - d.box.minX, d.box.maxY - d.box.minY)
    if (d.ink < fair.minLine - 1e-9 || extent < fair.minExtent * DPI - 1e-6) {
      errors.push(`Difference ${i + 1} (“${d.label}”) is too small to see comfortably in print.`)
      offending.add(d.part)
    }
    if (extent > fair.maxExtentShare * H + 1e-6) {
      errors.push(`Difference ${i + 1} (“${d.label}”) is too big to be a puzzle.`)
      offending.add(d.part)
    }
    const mb = markBounds(d.mark)
    if (mb.minX < inside.minX || mb.maxX > inside.maxX || mb.minY < inside.minY || mb.maxY > inside.maxY) errors.push(`The ring round difference ${i + 1} runs off the picture.`)
    for (let j = i + 1; j < n; j++) {
      if (overlaps(mb, markBounds(differences[j]!.mark), SD_MARK_GAP - 1)) {
        errors.push(`Differences ${i + 1} and ${j + 1} are too close to count as two.`)
        offending.add(differences[j]!.part)
      }
    }
  })

  // Both finished pictures: only the intended differences, all of them showing.
  if (errors.length === 0) {
    const pair = checkPair(scene, differences, fair, lines)
    errors.push(...pair.errors)
    pair.offending.forEach((id) => offending.add(id))
  }

  // Neither picture bare nor cluttered, and nothing cut by its frame.
  const { a, b } = pictureParts(scene, differences)
  for (const [name, parts, art] of [
    ['top', a, lines.a],
    ['bottom', b, lines.b],
  ] as const) {
    const share = inkShare(art, p)
    if (share < SD_MIN_INK_SHARE) errors.push(`The ${name} picture is too bare.`)
    if (share > SD_MAX_INK_SHARE) errors.push(`The ${name} picture is too busy to search fairly.`)
    for (const part of parts) {
      const pb = partBounds(part)
      const clear = SD_FRAME_CLEAR - 0.5
      if (pb.minX < p.minX + clear || pb.maxX > p.maxX - clear || pb.minY < p.minY + clear || pb.maxY > p.maxY - clear) {
        errors.push(`Something in the ${name} picture is cut by its frame.`)
        break
      }
    }
  }

  // Not the same puzzle as one the book already prints.
  if (!repeat) {
    const entry = sdSceneEntry(scene, differences)
    const twin = book.find((e) => e.recipe === entry.recipe && sdOverlap(e.kinds, entry.kinds) > SD_MAX_KIND_OVERLAP && sdOverlap(e.changes, entry.changes) > SD_MAX_CHANGE_OVERLAP)
    if (twin) errors.push('This book already has a nearly identical pair of pictures.')
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)], offending: [...offending] }
}

const walk = (objects: readonly StudioFabricObject[], visit: (o: StudioFabricObject) => void) => {
  for (const o of objects) {
    visit(o)
    if (o.objects) walk(o.objects, visit)
  }
}

/**
 * The page as drawn: two pictures the same size, one above the other; line
 * art in black only; in each, one hidden ring per difference, numbered 1 to
 * N once each; and, on the puzzle page, a tick circle per difference.
 */
export function checkSdDrawnPage(options: { objects: readonly StudioFabricObject[]; count: number; tally: boolean }): string[] {
  const { objects, count, tally } = options
  const errors: string[] = []
  const top = objects.find((o) => o.data?.[SD_PART_KEY] === 'top')
  const bottom = objects.find((o) => o.data?.[SD_PART_KEY] === 'bottom')
  if (!top || !bottom) return ['The page does not have both pictures.']
  if (Math.abs((top.width ?? 0) - (bottom.width ?? 0)) > 0.5 || Math.abs((top.height ?? 0) - (bottom.height ?? 0)) > 0.5) errors.push('The two pictures are not the same size.')
  if (Math.abs(top.left - bottom.left) > 0.5) errors.push('The two pictures are not aligned.')
  if (bottom.top < top.top + (top.height ?? 0) - SD_MARK_OVERHANG * 2 - 0.5) errors.push('The pictures overlap.')
  for (const picture of [top, bottom]) {
    const rings: number[] = []
    const numbers: number[] = []
    walk(picture.objects ?? [], (o) => {
      const part = o.data?.[SD_PART_KEY]
      if (o.type === 'path') {
        if (o.stroke !== STUDIO_INK || (o.fill && o.fill !== 'transparent')) errors.push('A line is not plain black ink.')
        if (part === 'ring') {
          rings.push(Number(o.data?.n))
          if (o.visible !== false || o.studioRole !== 'answer') errors.push('An answer ring shows on the puzzle page.')
        } else if (o.studioRole !== 'prompt') errors.push('The picture holds an unexpected line.')
      } else if (o.type === 'textbox' && part === 'number') {
        numbers.push(Number(o.text))
        if (o.visible !== false) errors.push('An answer number shows on the puzzle page.')
      } else if (o.type === 'circle' && part === 'badge') {
        if (o.visible !== false) errors.push('An answer badge shows on the puzzle page.')
      } else errors.push('The picture holds something other than its lines and answers.')
    })
    const want = Array.from({ length: count }, (_, i) => i + 1)
    if (JSON.stringify([...rings].sort((x, y) => x - y)) !== JSON.stringify(want)) errors.push('The answer rings do not number 1 to N once each.')
    if (JSON.stringify([...numbers].sort((x, y) => x - y)) !== JSON.stringify(want)) errors.push('The answer numbers do not run 1 to N once each.')
  }
  if (tally) {
    const row = objects.find((o) => o.data?.[SD_PART_KEY] === 'tally')
    const ticks = (row?.objects ?? []).filter((o) => o.data?.[SD_PART_KEY] === 'tick').length
    if (ticks !== count) errors.push('The tick row does not match the number of differences.')
  }
  return [...new Set(errors)]
}
