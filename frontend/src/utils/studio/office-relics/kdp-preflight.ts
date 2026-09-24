import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from '../studio-layout'
import { measureRunWidth, wrapSafeWidth } from '../studio-text-metrics'
import { RELIC_ART } from './drawings'
import { MAX_PER_CATEGORY, relicFaults, relicsClash, type PlacedRelic } from './content'
import {
  ALIAS_FONT_MIN,
  ANSWER_INSET,
  ANSWER_FONT_MIN,
  PICTURE_MIN_H,
  PICTURE_MIN_W,
  breakAnswer,
  bankSpec,
  BANK_FONT,
  BANK_PAD,
  BANK_SEPARATOR,
  lineWidth,
  orGridWidth,
  packBank,
  type OrPagePlan,
} from './layout'
import { bankNames } from './draw'
import { relicInkBox, relicPictureScale } from './picture'
import { isValidVariant, relicArtDrawing } from './variants'

export interface KdpPreflightResult {
  ok: boolean
  warnings: string[]
  errors: string[]
}

/**
 * The last gate before a page is considered export-ready.
 *
 * Fit is structural, so this re-proves it, then checks what a reader only
 * finds with the book in hand: an object with no drawing, or a drawing of
 * something else, or a version of a drawing that does not exist; two pictures a reader could mistake for each other; the same
 * object twice; an answer that does not fit its line; a word bank that does
 * not list exactly the page's answers; a picture printed smaller than the
 * busiest drawing can survive. Any one of those is a refund.
 */
export function runOrKdpPreflight(options: {
  items: readonly PlacedRelic[]
  plan: OrPagePlan
  font: string
  wordBank: boolean
  book?: readonly string[]
}): KdpPreflightResult {
  const { items, plan, font, wordBank, book = [] } = options
  const errors: string[] = []
  const warnings: string[] = []

  if (items.length === 0) return { ok: false, warnings, errors: ['No pictures were laid out.'] }
  if (items.length !== plan.count) errors.push('The page holds a different number of pictures than it was laid out for.')

  const printed = new Set(book)
  items.forEach(({ relic, drawing, variant }, index) => {
    if (relicFaults(relic).length > 0) errors.push(`“${relic.name}” is not a valid Office Relic.`)
    if (!relic.drawings.includes(drawing) || !RELIC_ART[drawing]) {
      errors.push(`“${relic.name}” has no matching picture.`)
    } else if (!isValidVariant(drawing, variant)) {
      errors.push(`The picture of “${relic.name}” is not a version its drawing has.`)
    } else {
      const art = relicArtDrawing(drawing, variant)
      const scale = relicPictureScale(art, {
        centerX: 0,
        centerY: 0,
        boxWidth: plan.pictureWidth,
        boxHeight: plan.pictureHeight,
        stroke: plan.stroke,
        fineStroke: plan.fineStroke,
      })
      const ink = relicInkBox(art)
      if (ink.width * scale > plan.pictureWidth || ink.height * scale > plan.pictureHeight) {
        errors.push(`The picture of “${relic.name}” does not fit its box.`)
      }
      // A drawing fitted to its box fills it one way or the other.
      if (Math.max((ink.width * scale) / plan.pictureWidth, (ink.height * scale) / plan.pictureHeight) < 0.9) {
        errors.push(`The picture of “${relic.name}” prints too small.`)
      }
    }
    const answerLines = breakAnswer(relic.name, lineWidth(plan) - ANSWER_INSET, plan.answerFont, font)
    if (answerLines.length > plan.answerLines || answerLines.join(' ') !== relic.name) {
      errors.push(`“${relic.name}” does not fit its answer line.`)
    }
    if (printed.has(relic.id)) errors.push(`“${relic.name}” is already in this book.`)
    items.slice(0, index).forEach((earlier) => {
      if (earlier.relic.id === relic.id) errors.push(`“${relic.name}” is on this page twice.`)
      else if (relicsClash(earlier.relic, relic)) {
        errors.push(`“${earlier.relic.name}” and “${relic.name}” are too easy to confuse on one page.`)
      }
    })
  })

  const perCategory = new Map<string, number>()
  for (const { relic } of items) perCategory.set(relic.category, (perCategory.get(relic.category) ?? 0) + 1)
  if ([...perCategory.values()].some((n) => n > MAX_PER_CATEGORY)) errors.push('Too many pictures on this page are the same kind of thing.')
  if (items.length >= 4 && perCategory.size < 3) warnings.push('This page shows little variety.')

  if (wordBank) {
    const names = bankNames(items)
    const width = orGridWidth(plan) - BANK_PAD * 2
    const lines = packBank(names, width, font)
    if (lines.length > plan.bankLines) errors.push('The word bank needs more lines than the page reserved.')
    const listed = lines.flatMap((line) => line.split(BANK_SEPARATOR))
    if (listed.join('|') !== names.join('|')) errors.push('The word bank does not list exactly this page’s answers.')
    if (lines.some((line) => measureRunWidth(line, BANK_FONT, bankSpec(font)) > wrapSafeWidth(width, bankSpec(font)) + 0.5)) {
      errors.push('A word bank line runs past its box.')
    }
  }

  if (plan.pictureWidth < PICTURE_MIN_W || plan.pictureHeight < PICTURE_MIN_H) {
    errors.push('Pictures must print large enough to recognise.')
  }
  if (plan.answerFont < ANSWER_FONT_MIN || plan.aliasFont < ALIAS_FONT_MIN) errors.push('Answers must stay large print.')

  return { ok: errors.length === 0, warnings, errors }
}

interface Extent {
  left: number
  top: number
  right: number
  bottom: number
}

function pictureExtent(o: StudioFabricObject): Extent {
  const w = (o.width ?? 0) * (o.scaleX ?? 1)
  const h = (o.height ?? 0) * (o.scaleY ?? 1)
  return { left: o.left - w / 2, top: o.top - h / 2, right: o.left + w / 2, bottom: o.top + h / 2 }
}

const overlaps = (a: Extent, b: Extent) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

/**
 * The drawn page, checked as drawn: every picture present, inside the body
 * field, clear of every other picture and of every writing line.
 */
export function checkOrDrawnPage(objects: readonly StudioFabricObject[], field: Box, expected: number): string[] {
  const errors: string[] = []
  const pictures = objects.filter((o) => o.data?.source === 'office-relic')
  if (pictures.length !== expected) errors.push('A picture is missing from the page.')
  const extents = pictures.map(pictureExtent)
  const rules = objects
    .filter((o) => o.type === 'rect' && o.studioRole === 'structure' && o.fill && o.fill !== 'transparent')
    .map((o) => ({ left: o.left, top: o.top, right: o.left + (o.width ?? 0), bottom: o.top + (o.height ?? 0) }))
  const slack = 1
  extents.forEach((e, i) => {
    if (e.left < field.left - slack || e.right > field.left + field.width + slack) errors.push('A picture runs outside the page.')
    if (e.top < field.top - slack || e.bottom > field.top + field.height + slack) errors.push('A picture runs outside the page.')
    if (extents.slice(0, i).some((other) => overlaps(e, other))) errors.push('Two pictures overlap.')
    if (rules.some((rule) => overlaps(e, rule))) errors.push('A picture touches a writing line.')
  })
  return errors
}
