import type { StudioFabricObject } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_DIGIT_FONT, STUDIO_INK } from '@/constants/studio.constants'
import type { Box } from '../studio-layout'
import { sgSubjectById } from '../stained-glass/subjects'
import { cbnDesignEntry, cbnPageLabel, isValidCbnDesign, type CbnBookEntry, type CbnDesign, type CbnLevelSpec } from './content'
import { CBN_PART_KEY } from './draw'
import { CBN_INK_WIDTH, cbnNumberRadius, type CbnArt } from './paint'
import { CBN_MAX_COLORS, CBN_MIN_COLORS, cbnColor, cbnPaletteById, isCbnColorId } from './palette'
import {
  CBN_MIN_SUBJECT_INCHES,
  CBN_MIN_SUBJECT_SHARE,
  compositionDistance,
  isValidComposition,
  parseCompositionKey,
  settingFor,
} from './scene'

export interface KdpPreflightResult {
  ok: boolean
  errors: string[]
}

/**
 * Share of the scene covered by ink. Line art prints around 4–12%; above
 * this the lines crowd the spaces, below it the page is nearly blank.
 */
const MAX_INK_SHARE = 0.2
const MIN_INK_SHARE = 0.015
/** Two pages of one subject closer than this many composition axes are the same page with a detail moved. */
export const CBN_MIN_SCENE_DISTANCE = 3
/** No number anywhere on the page prints below 9 pt. */
export const CBN_NUMBER_FLOOR_PX = 12

/**
 * The last gate before a page is accepted.
 *
 * The scene has already been printed to a grid and every space measured
 * (`paint.ts`); this re-proves the result against the page as a whole: a real
 * subject in a real version, big enough to be the picture and inside its
 * frame; a key of six to eight distinct colors, every one of them used and
 * every space numbered from it; every number at a readable size with clear
 * paper round it; a scene that is neither a thicket nor half empty; and not
 * a page — or the same subject in nearly the same scene — the book already
 * has. Any failure sends the page back to be rebuilt, never into the book.
 */
export function runCbnKdpPreflight(options: {
  design: CbnDesign
  art: CbnArt
  level: CbnLevelSpec
  book?: readonly CbnBookEntry[]
}): KdpPreflightResult {
  const { design, art, level, book = [] } = options
  const errors: string[] = []
  const name = design.subject.name

  const known = sgSubjectById(design.subject.id)
  if (!known || known !== design.subject) errors.push('The page shows a subject that is not in the library.')
  else if (!isValidCbnDesign(design)) errors.push(`“${name}” is not a version its drawing has.`)
  if (!isValidComposition(design.composition) || design.composition.setting !== settingFor(design.subject)) {
    errors.push('The page uses a scene the builder cannot print for this subject.')
  }
  const palette = cbnPaletteById(design.palette.id)
  if (!palette || palette !== design.palette || palette.setting !== (design.composition.setting === 'room' ? 'indoor' : 'outdoor')) {
    errors.push('The page uses a mood that does not suit its scene.')
  }

  // The subject is the picture.
  const panelW = art.panel.maxX - art.panel.minX
  const panelH = art.panel.maxY - art.panel.minY
  const subjW = art.subject.maxX - art.subject.minX
  const subjH = art.subject.maxY - art.subject.minY
  if (Math.max(subjW / panelW, subjH / panelH) < CBN_MIN_SUBJECT_SHARE - 1e-6 || Math.max(subjW, subjH) < CBN_MIN_SUBJECT_INCHES * DPI - 1e-6) {
    errors.push(`“${name}” prints too small to be the picture.`)
  }
  if (art.subject.minX < art.panel.minX || art.subject.minY < art.panel.minY || art.subject.maxX > art.panel.maxX || art.subject.maxY > art.panel.maxY) {
    errors.push(`“${name}” runs outside the scene's frame.`)
  }

  // The key: six to eight distinct colors, each one used.
  const n = art.legend.length
  if (n < CBN_MIN_COLORS || n > CBN_MAX_COLORS) errors.push(`The key has ${n} colors; a page needs ${CBN_MIN_COLORS} to ${CBN_MAX_COLORS}.`)
  if (new Set(art.legend).size !== n || !art.legend.every((id) => isCbnColorId(id))) errors.push('The key lists a color twice, or a color it cannot name.')
  if (art.perNumber.length !== n || art.perNumber.some((count) => count < 1)) errors.push('The key lists a color no space uses.')

  // Every space has exactly one number from the key, readable and clear of every line.
  if (art.labels.length !== art.spaces) errors.push('A space has no number, or has two.')
  const counts = art.legend.map(() => 0)
  for (const label of art.labels) {
    if (!Number.isInteger(label.n) || label.n < 1 || label.n > n) {
      errors.push('A space carries a number the key does not have.')
      continue
    }
    counts[label.n - 1]! += 1
    if (label.size !== level.rules.numberSize && label.size !== level.rules.minNumberSize) errors.push('A number prints at an unexpected size.')
    if (label.size < CBN_NUMBER_FLOOR_PX) errors.push('A number prints too small to read.')
    if (label.clearance < cbnNumberRadius(label.size) - 1e-6) errors.push('A number sits against a line.')
    if (label.x < art.panel.minX || label.x > art.panel.maxX || label.y < art.panel.minY || label.y > art.panel.maxY) errors.push('A number sits outside the scene.')
  }
  if (counts.some((c, i) => c !== art.perNumber[i])) errors.push('The key and the numbered spaces disagree.')
  if (art.clashes > 0) errors.push('Two touching parts of the scene share a number, so the line between them would vanish.')

  // A scene, not a thicket or a blank.
  if (art.spaces < level.spaces.min) errors.push('The scene has too few spaces.')
  if (art.spaces > level.spaces.max) errors.push('The scene has too many spaces to color comfortably.')
  if (art.largestShare > level.maxSpaceShare) errors.push('One space takes up so much of the scene that the page looks unfinished.')
  if (art.inkShare > MAX_INK_SHARE) errors.push('The lines are too crowded to color between.')
  if (art.inkShare < MIN_INK_SHARE) errors.push('The scene is nearly blank.')

  // Not a page the book already has — nor the same subject in nearly the same scene.
  const entry = cbnDesignEntry(design)
  const label = cbnPageLabel(entry)
  if (book.some((e) => cbnPageLabel(e) === label)) errors.push('This book already has this exact page.')
  else {
    for (const e of book) {
      if (e.subject !== entry.subject) continue
      if (e.variant === entry.variant) {
        errors.push(`This book already shows this drawing of “${name}”.`)
        break
      }
      const other = parseCompositionKey(e.composition)
      if (other && compositionDistance(other, design.composition) < CBN_MIN_SCENE_DISTANCE) {
        errors.push(`This book already shows “${name}” in nearly the same scene.`)
        break
      }
    }
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

const PRINT_WEIGHTS: ReadonlySet<number> = new Set(Object.values(CBN_INK_WIDTH))

/**
 * The page as drawn. The scene: every line black at a print weight, nothing
 * filled, everything inside its box, and its only text the space numbers —
 * single digits from the key, black, in the digit face. The key: one entry
 * per color, numbered 1 to N in order, each naming its color.
 */
export function checkCbnDrawnPage(options: {
  scene: StudioFabricObject
  key: StudioFabricObject
  box: Box
  keyBox: Box
  legend: readonly string[]
}): string[] {
  const { scene, key, box, keyBox, legend } = options
  const errors: string[] = []
  if (scene.type !== 'group' || !scene.objects?.length) return ['The scene was not drawn.']
  const cx = scene.left + (scene.width ?? 0) / 2
  const cy = scene.top + (scene.height ?? 0) / 2
  const inside = (x: number, y: number, pad: number) =>
    x - pad >= box.left - 0.5 && x + pad <= box.left + box.width + 0.5 && y - pad >= box.top - 0.5 && y + pad <= box.top + box.height + 0.5
  let lines = 0
  const numbers = new Set<number>()
  for (const child of scene.objects) {
    if (child.type === 'path') {
      lines++
      if (child.stroke !== STUDIO_INK) errors.push('A line in the scene is not black.')
      if (child.fill && child.fill !== 'transparent') errors.push('A space in the scene is filled in.')
      if (!PRINT_WEIGHTS.has(child.strokeWidth ?? 0)) errors.push('A line in the scene is not at a print weight.')
      const half = (child.strokeWidth ?? 0) / 2
      // Path commands keep page coordinates; only the path's own left/top is group-relative.
      for (const command of child.path ?? []) {
        const x = Number(command[1])
        const y = Number(command[2])
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          errors.push('The scene has a broken line.')
          break
        }
        if (!inside(x, y, half)) {
          errors.push('A line runs outside the scene.')
          break
        }
      }
      continue
    }
    if (child.type === 'textbox' && child.data?.[CBN_PART_KEY] === 'number') {
      const value = Number(child.text)
      if (!/^[1-9]$/.test(String(child.text)) || value > legend.length) errors.push('A space carries a number the key does not have.')
      else numbers.add(value)
      if (child.fill !== STUDIO_INK || child.fontFamily !== STUDIO_DIGIT_FONT) errors.push('A number is not printed in black lining digits.')
      if ((child.fontSize ?? 0) < CBN_NUMBER_FLOOR_PX) errors.push('A number prints too small to read.')
      if (!inside(child.left + cx, child.top + cy, 0)) errors.push('A number sits outside the scene.')
      continue
    }
    errors.push('The scene holds something other than lines and numbers.')
  }
  if (lines === 0) errors.push('The scene has no lines.')
  if (numbers.size !== legend.length) errors.push('Not every color on the key is used in the scene.')
  if (Math.abs(cx - (box.left + box.width / 2)) > 0.5 || Math.abs(cy - (box.top + box.height / 2)) > 0.5) {
    errors.push('The scene is not where it was laid out.')
  }

  if (key.type !== 'group' || !key.objects?.length) errors.push('The color key was not drawn.')
  else {
    const names = key.objects.filter((o) => o.data?.[CBN_PART_KEY] === 'name')
    const expected = legend.map((id, i) => ({ id, n: i + 1 }))
    const matches =
      names.length === expected.length &&
      expected.every(({ id, n }) => names.some((o) => o.data?.color === id && o.data?.n === n && isCbnColorId(id) && o.text === cbnColor(id).name))
    if (!matches) errors.push('The color key does not match the numbers in the scene.')
    const kx = key.left + (key.width ?? 0) / 2
    const ky = key.top + (key.height ?? 0) / 2
    if (Math.abs(kx - (keyBox.left + keyBox.width / 2)) > 0.5 || Math.abs(ky - (keyBox.top + keyBox.height / 2)) > 0.5) {
      errors.push('The color key is not where it was laid out.')
    }
  }
  return [...new Set(errors)]
}
