import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import { fabricTextHeight, measureRunWidth, wrapSafeWidth, wrapTextToWidth, type FontSpec } from '../studio-text-metrics'
import {
  WL_FINISH_LABEL,
  wlCaption,
  wlClue,
  wlInstruction,
  wlLevelClues,
  wlLevelLadders,
  wlLevelSpec,
  wlRungs,
  type WlLadder,
  type WlLevel,
} from './content'

/**
 * Where everything on a Word Ladder page goes.
 *
 * Each ladder is drawn as a real one: two rails, a rung between every pair
 * of words, and a row of letter squares on each step — the given words at
 * the top and bottom, empty squares between. To the right of the ladder,
 * level with each row: the caption ("1. From WORK to GOLF") beside the
 * first word, each rung's clue beside its squares, and "Finish" beside the
 * last word — each in at most two lines.
 *
 * The page decides how many ladders it holds (up to three) and how big they
 * print from the trim alone, before any ladder is dealt: squares as large as
 * the trim allows and never below the level's floor, letters never below
 * 16 pt, clues never below 14 pt. A trim that cannot hold two ladders at a
 * comfortable size prints one, larger; one that cannot hold one says so.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)
const inch = (n: number) => n * DPI

/** Largest letter square worth printing. */
export const WL_MAX_CELL = Math.round(inch(0.5))
/** Letters in the squares: a share of the square, never below 16 pt. */
export const WL_LETTER_MIN = ptToPx(16)
const LETTER_OF_CELL = 0.6
/** Clues: 14 pt floor, comfortable from 15 pt, up to 17 pt. */
export const WL_CLUE_MIN = ptToPx(14)
const WL_CLUE_COMFORT = ptToPx(15)
const WL_CLUE_MAX = ptToPx(17)
/** A clue past two lines stops sitting level with its rung. */
export const WL_CLUE_MAX_LINES = 2
export const WL_CLUE_LINE_HEIGHT = 1.08

/** Three ladders fill a page; a fourth would crowd it. */
export const WL_MAX_LADDERS = 3
/** A comfortable page holds at least this many before small sizes are tried. */
const COMFORT_MIN_LADDERS = 2
/** Past this a letter page's clue column runs further than the eye tracks. */
const BLOCK_MAX_WIDTH = Math.round(inch(6.4))
/** The narrowest clue column worth printing. */
const CLUE_MIN_WIDTH = Math.round(inch(1.6))
/** Every ladder in the library is four-letter words. */
const LENGTH = 4

export const clueSpec = (font: string): FontSpec => ({ fontFamily: font })
export const labelSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })
export const captionSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })

/** Height of a clue (or caption) of `lines` lines at `size`. */
export function clueHeight(lines: number, size: number): number {
  return fabricTextHeight(lines, size, WL_CLUE_LINE_HEIGHT)
}

export interface WlMetrics {
  cell: number
  letterSize: number
  clueSize: number
  /** Air between two words — where the rung goes. */
  rowGap: number
  /** Row to row. */
  pitch: number
  /** From the squares' edge to the inside of a rail. */
  railInset: number
  railWidth: number
  /** How far the rails run past the first and last word. */
  overhang: number
  /** Room kept above the first word and below the last: the overhang, or a two-line caption's reach. */
  pad: number
  /** From the outside of the right rail to the clues. */
  clueGap: number
  /** The least air between two ladders. */
  ladderGap: number
}

export function wlMetrics(cell: number, clueSize: number): WlMetrics {
  const rowGap = Math.max(12, Math.round(cell * 0.34))
  const overhang = Math.max(6, Math.round(rowGap * 0.5))
  // A two-line caption or clue, centred on its row, reaches past the squares.
  const reach = Math.ceil((clueHeight(WL_CLUE_MAX_LINES, clueSize) - cell) / 2)
  return {
    cell,
    letterSize: Math.max(WL_LETTER_MIN, Math.round(cell * LETTER_OF_CELL)),
    clueSize,
    rowGap,
    pitch: cell + rowGap,
    railInset: Math.max(8, Math.round(cell * 0.24)),
    railWidth: 4,
    overhang,
    pad: Math.max(overhang, reach),
    clueGap: Math.max(14, Math.round(cell * 0.4)),
    ladderGap: Math.max(22, Math.round(cell * 0.6)),
  }
}

/** Width of the ladder itself — rails and squares — for words of `length` letters. */
export const wlLadderWidth = (length: number, m: WlMetrics) => length * m.cell + 2 * (m.railInset + m.railWidth)

/** Height of one ladder of `words` words. */
export function wlLadderHeight(words: number, m: WlMetrics): number {
  return m.pad * 2 + words * m.cell + (words - 1) * m.rowGap
}

/** A clue as it will be set: hard breaks Fabric has no reason to redo. */
export function breakClue(text: string, size: number, width: number, font: string): string[] {
  const spec = clueSpec(font)
  return wrapTextToWidth(text, size, wrapSafeWidth(width, spec), spec)
}

/**
 * The caption as it will be set, bold: one line when it fits, otherwise
 * broken before "to", so the finish word never sits alone ("1. From TEAM" /
 * "to PLAY"). A half that cannot hold one line comes back wrapped, so the
 * caller sees it run long.
 */
export function breakCaption(text: string, size: number, width: number, font: string): string[] {
  const spec = captionSpec(font)
  const safe = wrapSafeWidth(width, spec)
  if (measureRunWidth(text, size, spec) <= safe) return [text]
  const at = text.lastIndexOf(' to ')
  const halves = at > 0 ? [text.slice(0, at), text.slice(at + 1)] : [text]
  return halves.flatMap((half) => wrapTextToWidth(half, size, safe, spec))
}

export interface WlPagePlan {
  count: number
  metrics: WlMetrics
  /** Letters in a word at this level. */
  length: number
  /** Ladder and clue column together — what gets centred. */
  blockWidth: number
  ladderWidth: number
  clueWidth: number
  /** Most words a ladder of the level has, for the height promise. */
  maxWords: number
}

interface LevelTexts {
  clues: readonly string[]
  captions: readonly string[]
}

/**
 * What a square size and clue size allow in this column: whether every clue
 * and caption the level holds sets in two lines beside its row, and the
 * finish label in one.
 */
function sizeFit(width: number, cell: number, clueSize: number, texts: LevelTexts, font: string) {
  const metrics = wlMetrics(cell, clueSize)
  const ladderWidth = wlLadderWidth(LENGTH, metrics)
  const room = Math.min(width, BLOCK_MAX_WIDTH) - ladderWidth - metrics.clueGap
  if (room < CLUE_MIN_WIDTH) return null
  if (clueHeight(WL_CLUE_MAX_LINES, clueSize) > metrics.pitch - 4) return null
  const set = (w: number) => ({
    clues: texts.clues.map((clue) => breakClue(clue, clueSize, w, font)),
    captions: texts.captions.map((caption) => breakCaption(caption, clueSize, w, font)),
  })
  const fitsIn = (lines: ReturnType<typeof set>) =>
    [...lines.clues, ...lines.captions].every((l) => l.length <= WL_CLUE_MAX_LINES)
  const atRoom = set(room)
  if (!fitsIn(atRoom)) return null
  if (measureRunWidth(WL_FINISH_LABEL, clueSize, labelSpec(font)) > wrapSafeWidth(room, labelSpec(font))) return null

  // Only as wide as the widest line needs, so the block centres on what it
  // prints rather than hugging the left of a wide page. Wrapping greedily at
  // a width every line already fits never takes more lines.
  const widest = Math.max(
    ...atRoom.clues.flat().map((line) => measureRunWidth(line, clueSize, clueSpec(font))),
    ...atRoom.captions.flat().map((line) => measureRunWidth(line, clueSize, captionSpec(font))),
  )
  let clueWidth = room
  for (let w = Math.max(CLUE_MIN_WIDTH, Math.ceil(widest)); w < room; w += 2) {
    if (wrapSafeWidth(w, captionSpec(font)) >= widest && fitsIn(set(w))) {
      clueWidth = w
      break
    }
  }
  return { metrics, ladderWidth, blockWidth: ladderWidth + metrics.clueGap + clueWidth, clueWidth }
}

/**
 * The fullest, roomiest page this field holds for the level.
 *
 * Two passes: at least two ladders with comfortable clues first, then
 * anything down to the floors. Within a pass the count comes first, then the
 * largest squares, then the largest clues. The answer page (same ladders,
 * no how-to line) must hold them too.
 */
export function planWlPage(field: Box, answerHeight: number, level: WlLevel, font: string): WlPagePlan | null {
  const spec = wlLevelSpec(level)
  const texts: LevelTexts = {
    clues: wlLevelClues(level),
    // The widest number a caption can carry, on every ladder of the level.
    captions: wlLevelLadders(level).map((ladder) => wlCaption(ladder, WL_MAX_LADDERS - 1)),
  }
  const maxWords = spec.maxRungs + 2
  const floor = Math.ceil(spec.minCell)
  const room = Math.min(field.height, answerHeight)
  const fits = new Map<string, ReturnType<typeof sizeFit>>()
  const fitAt = (cell: number, clueSize: number) => {
    const key = `${cell}:${clueSize}`
    if (!fits.has(key)) fits.set(key, sizeFit(field.width, cell, clueSize, texts, font))
    return fits.get(key)!
  }
  const passes = [
    { minCount: COMFORT_MIN_LADDERS, clueFloor: WL_CLUE_COMFORT },
    { minCount: 1, clueFloor: WL_CLUE_MIN },
  ]
  for (const pass of passes) {
    for (let count = WL_MAX_LADDERS; count >= pass.minCount; count--) {
      for (let cell = WL_MAX_CELL; cell >= floor; cell--) {
        for (let clueSize = WL_CLUE_MAX; clueSize >= pass.clueFloor; clueSize--) {
          const metrics = wlMetrics(cell, clueSize)
          if (count * wlLadderHeight(maxWords, metrics) + (count - 1) * metrics.ladderGap > room) continue
          const fit = fitAt(cell, clueSize)
          if (fit) return { count, length: LENGTH, maxWords, ...fit }
        }
      }
    }
  }
  return null
}

/** The safe printable column every page of this game lays out inside. */
export function wlContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** Air between the heading and the first ladder. */
export const WL_HEADER_AIR = 8

/** The ladders' field inside what a heading left of the page (`body`, from `drawHeader`). */
export function wlFieldInBody(body: Box, headed: boolean): Box {
  const air = headed ? WL_HEADER_AIR : 0
  return { ...body, top: body.top + air, height: Math.max(1, body.height - air) }
}

/** What is left of the column once the title and instruction have been set, measured without drawing. */
export function wlBodyField(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const content = wlContentBox(page)
  const header = measureHeaderHeight(config, instruction, content.width)
  return wlFieldInBody({ ...content, top: content.top + header, height: Math.max(1, content.height - header) }, header > 0)
}

/** The page these settings make, measured before a ladder is dealt. */
export function wlWorstCasePlan(options: { page: StudioConfigLayoutContext; config: StudioConfig; level: WlLevel; font: string }): WlPagePlan | null {
  const { page, config, level, font } = options
  const field = wlBodyField(page, config, wlInstruction(config, level))
  const answer = wlBodyField(page, config, '')
  return planWlPage(field, answer.height, level, font)
}

/* ------------------------------------------------------------------ *
 * Placing the dealt ladders
 * ------------------------------------------------------------------ */

export interface WlLadderPlacement {
  ladder: WlLadder
  index: number
  /** The whole ladder block: rails, squares, caption and clues. */
  block: Box
  /** Top-left of the first word's squares. */
  squaresLeft: number
  squaresTop: number
  clueLeft: number
  /** The caption beside the first word, broken into its lines. */
  captionLines: string[]
  /** Each rung's clue, broken into its lines. */
  clueLines: string[][]
}

/**
 * The dealt ladders on the page, top to bottom: the block centred across
 * the column, and the room the plan kept for a taller ladder shared out
 * between them so a page of short ladders does not huddle at the top (a
 * lone ladder takes some of it above).
 */
export function placeWlLadders(options: { field: Box; plan: WlPagePlan; ladders: readonly WlLadder[]; font: string }): WlLadderPlacement[] {
  const { field, plan, ladders, font } = options
  const m = plan.metrics
  const heights = ladders.map((l) => wlLadderHeight(l.words.length, m))
  const used = heights.reduce((s, h) => s + h, 0) + (ladders.length - 1) * m.ladderGap
  const spare = Math.max(0, field.height - used)
  const extraGap = ladders.length > 1 ? Math.min(spare / ladders.length, m.cell * 1.5) : 0
  const left = Math.round(field.left + (field.width - plan.blockWidth) / 2)
  // A lone ladder sits a little down the page rather than under the heading.
  let top = field.top + (ladders.length === 1 ? Math.round(spare * 0.3) : 0)
  return ladders.map((ladder, index) => {
    const placement: WlLadderPlacement = {
      ladder,
      index,
      block: { left, top, width: plan.blockWidth, height: heights[index]! },
      squaresLeft: left + m.railWidth + m.railInset,
      squaresTop: top + m.pad,
      clueLeft: left + plan.ladderWidth + m.clueGap,
      captionLines: breakCaption(wlCaption(ladder, index), m.clueSize, plan.clueWidth, font),
      clueLines: wlRungs(ladder).map((word) => breakClue(wlClue(word), m.clueSize, plan.clueWidth, font)),
    }
    top += heights[index]! + m.ladderGap + extraGap
    return placement
  })
}

/* ------------------------------------------------------------------ *
 * The form's help line
 * ------------------------------------------------------------------ */

/** What the level prints on the trim in Settings. */
export function wlPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: WlLevel; font: string }): string {
  const { page, level } = options
  const count = wlLevelLadders(level).length
  const lead = `${count} hand-made ladders from work words to retirement words, a clue on every rung.`
  if (!page) return lead
  const plan = wlWorstCasePlan({ ...options, page })
  if (!plan) return 'This page size is too small for Word Ladders at large print — choose a larger page in Settings or an easier level.'
  const ladders = plan.count === 1 ? '1 ladder a page' : `${plan.count} ladders a page`
  const inches = (plan.metrics.cell / DPI).toFixed(2)
  return `${lead} ${ladders}, squares ${inches} in, letters ${pxToPt(plan.metrics.letterSize)} pt, clues ${pxToPt(plan.metrics.clueSize)} pt.`
}
