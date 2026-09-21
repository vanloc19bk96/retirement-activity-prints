import type {
  StudioFabricObject,
  StudioPageOutput,
} from '@/types/studio-template.types'
import {
  STUDIO_INSTRUCTION_SIZE,
  STUDIO_TITLE_SIZE,
} from '@/constants/studio.constants'
import {
  estimateTextBoxWidth,
  fitHeaderTitle,
  isStudioHeaderTitle,
  toNonBreakingSpaces,
  unionObjectBounds,
} from './studio-layout'
import { toStudioSolutionTitle } from './studio-instance-pages'

/** Fabric 7 toObject uses PascalCase (`Group`); generators use lowercase (`group`). */
function isFabricType(obj: { type?: string }, type: string): boolean {
  return String(obj.type ?? '').toLowerCase() === type.toLowerCase()
}

function objectHasAnswer(obj: StudioFabricObject): boolean {
  if (obj.studioRole === 'answer') return true
  if (isFabricType(obj, 'group') && obj.objects) {
    return obj.objects.some(objectHasAnswer)
  }
  return false
}

export function harvestAnswers(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const obj of objects) {
    // Answer groups (e.g. lucide icons) are atomic — do not flatten children.
    if (obj.studioRole === 'answer') {
      out.push(obj)
      continue
    }
    if (isFabricType(obj, 'group') && obj.objects) {
      out.push(...harvestAnswers(obj.objects))
    }
  }
  return out
}

/** Show nested group children without recoloring (Phosphor duotone paint). */
function revealVisibleTree(obj: StudioFabricObject): StudioFabricObject {
  if (isFabricType(obj, 'group') && obj.objects) {
    return {
      ...obj,
      visible: true,
      objects: obj.objects.map(revealVisibleTree),
    }
  }
  return { ...obj, visible: true }
}

/**
 * Groups that already paint themselves print-safe.
 *
 * Phosphor duotone is gray fill + dark outline; a playing card is black ink on
 * a white face. Flattening either to answerInk turns an icon into a black
 * square and a card into a black rectangle.
 */
const SELF_PAINTED_ANSWER_GROUPS = new Set(['phosphor-icon', 'playing-card'])

function revealAnswerObject(
  obj: StudioFabricObject,
  answerInk: string,
): StudioFabricObject {
  if (isFabricType(obj, 'group') && obj.objects) {
    if (SELF_PAINTED_ANSWER_GROUPS.has(String(obj.data?.source ?? ''))) {
      return {
        ...revealVisibleTree(obj),
        studioPageRole: 'answers',
      }
    }
    return {
      ...obj,
      visible: true,
      studioPageRole: 'answers',
      objects: obj.objects.map((child) => ({
        ...child,
        visible: true,
        // Line icons stay stroked; only tint non-transparent fills.
        stroke: child.stroke != null ? answerInk : child.stroke,
        fill:
          child.fill && child.fill !== 'transparent' ? answerInk : child.fill,
      })),
    }
  }
  // Circles mark by stroke; keep fill clear so the glyph stays readable.
  if (isFabricType(obj, 'circle')) {
    return { ...obj, visible: true, studioPageRole: 'answers' }
  }
  // Trail / connector answers are stroked lines — tint stroke, not fill.
  if (isFabricType(obj, 'line')) {
    return {
      ...obj,
      visible: true,
      stroke: answerInk,
      studioPageRole: 'answers',
    }
  }
  if (isFabricType(obj, 'path')) {
    return {
      ...obj,
      visible: true,
      stroke: answerInk,
      studioPageRole: 'answers',
    }
  }
  // Capsule / outline rects: tint stroke, keep transparent fill so letters show through.
  if (isFabricType(obj, 'rect') && (!obj.fill || obj.fill === 'transparent')) {
    return {
      ...obj,
      visible: true,
      stroke: obj.stroke != null ? answerInk : obj.stroke,
      studioPageRole: 'answers',
    }
  }
  return { ...obj, visible: true, fill: answerInk, studioPageRole: 'answers' }
}

function shouldOmitFromAnswerPage(obj: StudioFabricObject): boolean {
  // Puzzle how-to copy is not needed on the key — keep title + answers only.
  if (obj.studioRole === 'decoration') {
    if (obj.fontSize === STUDIO_INSTRUCTION_SIZE) return true
    if (/^Example\s*:/i.test(String(obj.text ?? '').trim())) return true
  }
  // Legacy cancellation only: older sheets tagged the Targets legend as `key`.
  // Symbol Hunt keeps Targets on the solution page (rings + legend).
  if (obj.studioTemplateKey === 'cancellation' && obj.studioRole === 'key') {
    return true
  }
  // Symbol–Digit Coding: solution shows the filled grid only — drop the key table.
  if (
    obj.studioTemplateKey === 'symbol-digit-coding' &&
    isFabricType(obj, 'group') &&
    !objectHasAnswer(obj)
  ) {
    return true
  }
  // Word Search: solution shows circled words only — drop the word bank + label.
  if (obj.studioTemplateKey === 'word-search') {
    if (obj.studioRole === 'decoration') {
      const text = String(obj.text ?? '').replace(/\u00a0/g, ' ').trim()
      if (/^Words to find:/i.test(text)) return true
    }
    if (isFabricType(obj, 'group') && !objectHasAnswer(obj)) return true
  }
  // Change Detection: drop study labels when key is built from the puzzle page.
  // Do not omit groups without answers — Lucide glyphs are prompt groups and must stay.
  if (obj.studioTemplateKey === 'change-detection' && obj.studioRole === 'decoration') {
    const text = String(obj.text ?? '').replace(/\u00a0/g, ' ').trim()
    if (text === 'Study this') return true
  }
  if (obj.studioTemplateKey === 'story-recall') {
    // Writing lines stay on the recall page only.
    if (obj.studioRole === 'structure') return true
  }
  // Missing-vowels answers sit on the same cell as prompts — hide blanks on the key.
  if (obj.studioTemplateKey === 'missing-vowels' && obj.studioRole === 'prompt') {
    return true
  }
  // Decade trivia solution mirrors the puzzle (questions + options) with rings —
  // drop write-in lines; fill-blank prompts are replaced by in-blank answer text.
  if (obj.studioTemplateKey === 'decade-trivia') {
    if (obj.studioRole === 'structure') return true
    if (obj.studioRole === 'prompt' && /_{2,}/.test(String(obj.text ?? ''))) {
      return true
    }
  }
  // Title-complete keys keep the grid; drop prompts, blanks, and letter-count hints.
  if (obj.studioTemplateKey === 'title-complete') {
    if (obj.studioRole === 'prompt') return true
    if (obj.studioRole === 'structure' && isFabricType(obj, 'line')) return true
    if (obj.studioRole === 'decoration') {
      const text = String(obj.text ?? '').replace(/\u00a0/g, ' ').trim()
      if (/^\(\d+\)$/.test(text)) return true
    }
  }
  // Category Fluency / First Letter Recall: sample list only — drop banner, write-in lines, score.
  if (
    obj.studioTemplateKey === 'category-fluency' ||
    obj.studioTemplateKey === 'first-letter-recall'
  ) {
    if (obj.studioRole === 'prompt') return true
    if (obj.studioRole === 'structure') return true
    if (obj.studioRole === 'decoration') {
      const text = String(obj.text ?? '').replace(/\u00a0/g, ' ').trim()
      if (/^\d+\.$/.test(text)) return true
      if (/^Time:/i.test(text)) return true
    }
  }
  // Perfect Pairs write-in blanks sit under the revealed partner — hide on the key.
  if (obj.studioTemplateKey === 'paired-associates' && obj.studioRole === 'structure') {
    return true
  }
  // Anagram sheets: keep the grid; drop puzzle write-in lines under revealed answers.
  if (
    (obj.studioTemplateKey === 'anagram-sheet' ||
      obj.studioTemplateKey === 'retirement-anagram') &&
    obj.studioRole === 'structure' &&
    isFabricType(obj, 'line')
  ) {
    return true
  }
  return false
}

/**
 * Header title from drawHeader. Prefer the tag it stamps: a title fitted down on
 * a narrow trim no longer sits at STUDIO_TITLE_SIZE, and the size check is only
 * the fallback for sheets generated before that tag existed.
 */
function isPageTitleObject(obj: StudioFabricObject): boolean {
  if (isStudioHeaderTitle(obj)) return true
  if (obj.studioRole !== 'decoration') return false
  if (obj.fontSize !== STUDIO_TITLE_SIZE) return false
  const weight = obj.fontWeight
  return weight === 700 || weight === 'bold' || weight === '700'
}

/**
 * Puzzle "Game N" -> solution "Solution Game N", re-fitted to the content column.
 *
 * The longer heading has to be measured against the column it prints in: kept at
 * full title size it ran past the safe margin on a 5 x 8 trim. Without a column
 * width no shrink is possible, so the caller gets the old hug-the-run width.
 */
function rewriteAnswerPageTitle(
  obj: StudioFabricObject,
  contentWidth?: number,
): StudioFabricObject {
  if (!isPageTitleObject(obj)) return obj
  const next = toNonBreakingSpaces(toStudioSolutionTitle(String(obj.text ?? '')))
  const prev = String(obj.text ?? '')
  if (!next || next.replace(/\u00a0/g, ' ').trim() === prev.replace(/\u00a0/g, ' ').trim()) {
    return obj
  }
  if (contentWidth != null && contentWidth > 0) {
    const fitted = fitHeaderTitle(
      next,
      contentWidth,
      obj.fontFamily != null ? String(obj.fontFamily) : undefined,
    )
    const prevSize = typeof obj.fontSize === 'number' ? obj.fontSize : fitted.fontSize
    return {
      ...obj,
      text: fitted.text,
      width: fitted.width,
      fontSize: fitted.fontSize,
      // drawHeader centres the title inside a strip of STUDIO_TITLE_SIZE; keep it
      // centred there when the solution heading fits at a different size.
      top: obj.top + (prevSize - fitted.fontSize) / 2,
    }
  }
  const maxWidth =
    typeof obj.width === 'number' && obj.width > 0
      ? Math.max(obj.width * 3, 400)
      : 2000
  return {
    ...obj,
    text: next,
    width: estimateTextBoxWidth(next, STUDIO_TITLE_SIZE, maxWidth),
  }
}

/**
 * Column width to fit the solution heading into when the caller passes none.
 * Generators fill the safe area, so the page's own bounds are a safe proxy --
 * but only once there is content beside the heading to measure.
 */
function inferContentWidth(
  sourceObjects: StudioFabricObject[],
  explicit?: number,
): number | undefined {
  if (explicit != null && explicit > 0) return explicit
  const bounds = unionObjectBounds(sourceObjects)
  if (!bounds) return undefined
  const titleWidth = sourceObjects.reduce(
    (max, obj) =>
      isPageTitleObject(obj) && typeof obj.width === 'number'
        ? Math.max(max, obj.width)
        : max,
    0,
  )
  return bounds.width > titleWidth ? bounds.width : undefined
}

export interface BuildAnswerPageOptions {
  /** Safe-area column width of the key page -- the heading is fitted to it. */
  contentWidth?: number
}

export function buildAnswerPage(
  sourceObjects: StudioFabricObject[],
  answerInk: string,
  options?: BuildAnswerPageOptions,
): StudioFabricObject[] {
  const contentWidth = inferContentWidth(sourceObjects, options?.contentWidth)
  const retitle = (obj: StudioFabricObject) => rewriteAnswerPageTitle(obj, contentWidth)
  const reveal = (obj: StudioFabricObject): StudioFabricObject => {
    if (obj.studioRole === 'answer') {
      return revealAnswerObject(obj, answerInk)
    }
    if (isFabricType(obj, 'group') && obj.objects) {
      return {
        ...obj,
        studioPageRole: 'answers',
        objects: obj.objects
          .filter((child) => !shouldOmitFromAnswerPage(child))
          .map(reveal)
          .map(retitle),
      }
    }
    return retitle({ ...obj, studioPageRole: 'answers' })
  }
  return sourceObjects
    .filter((obj) => !shouldOmitFromAnswerPage(obj))
    .map(reveal)
}

/**
 * Build answer-key objects from generator outputs.
 * Prefer pages that carry answers (e.g. recall) so study content is not stacked
 * on top of questions on a single key page.
 */
export function buildAnswerKeyFromOutputs(
  outputs: StudioPageOutput[],
  answerInk: string,
  options?: BuildAnswerPageOptions,
): StudioFabricObject[] {
  const withAnswers = outputs.filter((page) => {
    const source = page.answerSourceObjects ?? page.objects
    return source.some(objectHasAnswer)
  })
  const source = withAnswers.length > 0 ? withAnswers : outputs
  return source.flatMap((page) =>
    buildAnswerPage(page.answerSourceObjects ?? page.objects, answerInk, options),
  )
}
