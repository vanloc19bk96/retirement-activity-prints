import type {
  StudioConfig,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'
import { DPI, PDF_POINTS_PER_INCH } from '@/types/canvas-settings.types'
import { STUDIO_CONTENT_SAFE_INSET_X } from '@/constants/studio.constants'
import { contentBox, insetHorizontal, measureHeaderHeight, type Box } from '../studio-layout'
import {
  fabricLinePitch,
  fabricTextHeight,
  hugTextBoxWidth,
  measureRunWidth,
  wrapSafeWidth,
  wrapTextToWidth,
  type FontSpec,
} from '../studio-text-metrics'
import {
  FIF_BLANK_KINDS,
  FIF_KINDS,
  FIF_MAX_BLANKS,
  FIF_MAX_WORDS,
  FIF_STORY_INSTRUCTION,
  FIF_WORDS_INSTRUCTION,
  paragraphChunks,
  type FifAtom,
  type FifKind,
} from './content'

/**
 * Everything a Fill-in Funnies activity decides on the seller's behalf.
 *
 * The activity is two steps, and each gets its own page so the story cannot
 * give the game away while the words are being chosen:
 *
 * 1. **Your Words** — a numbered list of prompts ("Describing word — like
 *    “fluffy”") with a writing line beside each.
 * 2. **Your Story** — the title and story set in large print, each blank a
 *    writing line with its number in front of it, so the reader copies word 3
 *    onto blank 3. A story too long for one side of a small trim continues on
 *    a second page rather than shrinking below large print.
 *
 * Type size, how many columns the list runs in, blank width and line spacing
 * are all derived from the trim. Every search runs from a comfortable size
 * down to a large-print floor, so no trim can talk the page into small type.
 * The form reports what the trim produced (`fifPrintNote`), and generate lays
 * out against the same plan, so the two never disagree.
 */

export const ptToPx = (pt: number) => Math.round((pt * DPI) / PDF_POINTS_PER_INCH)
export const pxToPt = (px: number) => Math.round((px * PDF_POINTS_PER_INCH) / DPI)

/** Large-print floor for prompts and story text — nothing that must be read is smaller. */
export const FONT_MIN = ptToPx(14)
const WORD_FONT_MAX = ptToPx(18)
const STORY_FONT_MAX = ptToPx(18)
/** A story spread over two pages keeps at least this much size for the trouble. */
const STORY_FONT_COMFORT = ptToPx(16)
/** Hints ("like “fluffy”") and blank numbers are helpers, never below this. */
export const HELPER_FONT_MIN = ptToPx(11)

/**
 * Story line pitch, as a multiple of Fabric's line box. Every line may carry a
 * blank, so every line leaves a quarter inch or so above its rule for a
 * handwritten word.
 */
export const STORY_LINE_HEIGHT = 1.45
const TITLE_LINE_HEIGHT = 1.1

/** Past this a line runs wider than an eye tracks comfortably. */
const BLOCK_MAX_WIDTH = Math.round(DPI * 6.2)
/** Shortest writing line on the word list: room for "bird-watching" in pen. */
export const WRITE_RULE_MIN = Math.round(DPI * 1.25)
/** Shortest blank in the story. */
export const BLANK_MIN = Math.round(DPI * 1.1)
/** A blank never takes more than this share of a line, so a line keeps its words. */
const BLANK_MAX_SHARE = 0.45
/** Shortest measure a story may wrap into. */
export const STORY_TEXT_MIN = Math.round(DPI * 3)
export const MAX_STORY_PAGES = 2
/** Fewest lines a continued story carries onto its next page. */
const MIN_CARRIED_LINES = 4
const MAX_TITLE_LINES = 2

export const STEP_WORDS = 'Step 1: Your Words'
export const STEP_STORY = 'Step 2: Your Story'
export const STEP_STORY_CONTINUED = 'Step 2: Your Story (continued)'
export const WORDS_FOOTER = 'Now turn the page for your story!'
export const STORY_CONTINUES = 'Continued on the next page…'
export const STORY_END = 'The End — now read it out loud!'

export const boldSpec = (font: string): FontSpec => ({ fontFamily: font, fontWeight: 700 })
export const regularSpec = (font: string): FontSpec => ({ fontFamily: font })
export const italicSpec = (font: string): FontSpec => ({ fontFamily: font, fontStyle: 'italic' })

const helperSize = (font: number) => Math.max(HELPER_FONT_MIN, Math.round(font * 0.7))
const headingSize = (font: number) => Math.round(font * 1.1)

/* ------------------------------------------------------------------ *
 * Step 1 — the word list.
 * ------------------------------------------------------------------ */

export interface WordMetrics {
  font: number
  hint: number
  heading: number
  headingGap: number
  /** Width of the number gutter; numbers are right-aligned in it. */
  numberW: number
  numberGap: number
  /** Width of the label-and-hint column — the widest any kind needs. */
  labelW: number
  /** Space between the label column and the writing line. */
  ruleGap: number
  padY: number
  hintGap: number
  /** Label, hint and padding: one row. */
  rowH: number
  gutter: number
  footerGap: number
}

export interface WordPagePlan {
  count: number
  cols: 1 | 2
  rowsPerCol: number
  metrics: WordMetrics
  blockWidth: number
  colWidth: number
  ruleW: number
  footerLines: string[]
  bottomGuard: number
}

const numberLabel = (n: number) => `${n}.`

/** Label and hint of every kind the service can ask for, so every page of a run matches. */
function labelColumnWidth(font: number, hint: number, family: string, kinds: readonly FifKind[]): number {
  let widest = 0
  for (const kind of kinds) {
    const { label, hint: hintText } = FIF_BLANK_KINDS[kind]
    widest = Math.max(
      widest,
      hugTextBoxWidth(label, font, Infinity, boldSpec(family)),
      hugTextBoxWidth(hintText, hint, Infinity, italicSpec(family)),
    )
  }
  return widest
}

export function wordMetrics(font: number, family: string, kinds: readonly FifKind[] = FIF_KINDS): WordMetrics {
  const hint = helperSize(font)
  const padY = Math.round(font * 0.25)
  const hintGap = Math.round(font * 0.1)
  return {
    font,
    hint,
    heading: headingSize(font),
    headingGap: Math.round(font * 0.6),
    numberW: hugTextBoxWidth(numberLabel(FIF_MAX_BLANKS), font, Infinity, boldSpec(family)),
    numberGap: Math.round(font * 0.45),
    labelW: labelColumnWidth(font, hint, family, kinds),
    ruleGap: Math.round(font * 0.6),
    padY,
    hintGap,
    rowH: 2 * padY + fabricTextHeight(1, font) + hintGap + fabricTextHeight(1, hint),
    gutter: Math.round(font * 1.5),
    footerGap: Math.round(font * 0.9),
  }
}

export const headingHeight = (size: number) => fabricTextHeight(1, size)

export function wordFooterHeight(plan: Pick<WordPagePlan, 'metrics' | 'footerLines'>): number {
  return plan.metrics.footerGap + fabricTextHeight(plan.footerLines.length, plan.metrics.font)
}

/** Heading, rows and footer at the plan's natural padding. */
export function wordPageHeight(plan: WordPagePlan): number {
  const m = plan.metrics
  return headingHeight(m.heading) + m.headingGap + plan.rowsPerCol * m.rowH + wordFooterHeight(plan)
}

function wordPlanAt(
  field: Box,
  options: { count: number; font: number; cols: 1 | 2; fontFamily: string; kinds: readonly FifKind[] },
): WordPagePlan | null {
  const { count, font, cols, fontFamily, kinds } = options
  const metrics = wordMetrics(font, fontFamily, kinds)
  const blockWidth = Math.min(field.width, BLOCK_MAX_WIDTH * (cols === 2 ? 1.3 : 1))
  const colWidth = Math.floor((blockWidth - (cols - 1) * metrics.gutter) / cols)
  const ruleW = colWidth - metrics.numberW - metrics.numberGap - metrics.labelW - metrics.ruleGap
  if (ruleW < WRITE_RULE_MIN) return null
  if (hugTextBoxWidth(STEP_WORDS, metrics.heading, Infinity, boldSpec(fontFamily)) > blockWidth) return null

  const footerLines = wrapTextToWidth(
    WORDS_FOOTER,
    font,
    wrapSafeWidth(blockWidth, italicSpec(fontFamily)),
    italicSpec(fontFamily),
  )
  const plan: WordPagePlan = {
    count,
    cols,
    rowsPerCol: Math.ceil(count / cols),
    metrics,
    blockWidth,
    colWidth,
    // A writing line longer than a word needs reads as a form to fill in, not a game.
    ruleW: Math.min(ruleW, Math.round(DPI * 2.6)),
    footerLines,
    bottomGuard: Math.round(font * 0.6),
  }
  if (wordPageHeight(plan) > field.height - plan.bottomGuard) return null
  return plan
}

/**
 * The roomiest word list this field holds: one column before two, and within
 * that the largest type. Two columns only on a trim wide enough that each
 * still gets a full label and writing line.
 */
export function planWordPage(
  field: Box,
  options: { count: number; fontFamily: string; kinds?: readonly FifKind[] },
): WordPagePlan | null {
  const kinds = options.kinds ?? FIF_KINDS
  for (const cols of [1, 2] as const) {
    for (let font = WORD_FONT_MAX; font >= FONT_MIN; font--) {
      const plan = wordPlanAt(field, { ...options, font, cols, kinds })
      if (plan) return plan
    }
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Step 2 — the story.
 * ------------------------------------------------------------------ */

export interface StoryMetrics {
  font: number
  /** Distance from one line's top to the next. */
  pitch: number
  /** Size of the number printed in front of each blank. */
  number: number
  /** Slot the number is right-aligned in, so every blank's line starts alike. */
  numberW: number
  numberGap: number
  blankW: number
  spaceW: number
  heading: number
  headingGap: number
  title: number
  titleGap: number
  paraGap: number
  footerGap: number
}

export interface StoryPagePlan {
  metrics: StoryMetrics
  blockWidth: number
  /** Width every story line is held to. */
  textWidth: number
  /** Story pages the worst-case story needs at this size. */
  pages: number
  bottomGuard: number
}

export function storyMetrics(font: number, family: string, textWidth: number): StoryMetrics {
  return {
    font,
    pitch: fabricLinePitch(font, STORY_LINE_HEIGHT),
    number: helperSize(font),
    numberW: hugTextBoxWidth(String(FIF_MAX_BLANKS), helperSize(font), Infinity, boldSpec(family)),
    numberGap: Math.max(2, Math.round(font * 0.12)),
    blankW: Math.min(
      Math.max(BLANK_MIN, Math.round(font * 5.5)),
      Math.floor(textWidth * BLANK_MAX_SHARE),
    ),
    spaceW: measureRunWidth(' ', font, regularSpec(family)),
    heading: headingSize(font),
    headingGap: Math.round(font * 0.6),
    title: Math.round(font * 1.25),
    titleGap: Math.round(font * 0.8),
    paraGap: Math.round(font * 0.4),
    footerGap: Math.round(font * 0.9),
  }
}

/** A text run or a blank at its offset from the line's left edge. */
export type PlacedPiece =
  | { kind: 'text'; left: number; text: string; width: number }
  | { kind: 'blank'; left: number; n: number }

export interface PlacedLine {
  pieces: PlacedPiece[]
  /** Rightmost ink, text boxes included. */
  right: number
}

export const blankNumberText = (n: number) => String(n)

/** Number slot, gap and writing line: one blank's footprint. */
export const blankWidth = (metrics: StoryMetrics) => metrics.numberW + metrics.numberGap + metrics.blankW

/**
 * Where every piece of one line sits.
 *
 * Words run together into one text box; a blank breaks the run. Widths are
 * the text box each run will actually be set in, measured with Fabric's own
 * word-by-word widths, so a line that measures inside the column cannot print
 * outside it and no two boxes on a line overlap.
 */
export function placeLine(atoms: readonly FifAtom[], metrics: StoryMetrics, family: string): PlacedLine {
  const spec = regularSpec(family)
  const pieces: PlacedPiece[] = []
  let x = 0
  let run: { left: number; text: string } | null = null
  const flush = () => {
    if (!run) return
    const width = hugTextBoxWidth(run.text, metrics.font, Infinity, spec)
    pieces.push({ kind: 'text', left: run.left, text: run.text, width })
    // Past the box, not just the ink: a blank's number must not sit inside
    // the run's text box, or selecting one in the editor grabs the other.
    x = run.left + width
    run = null
  }
  atoms.forEach((atom, index) => {
    const space = index > 0 && atom.space
    if (atom.kind === 'text') {
      if (run) {
        run.text += `${space ? ' ' : ''}${atom.text}`
      } else {
        run = { left: x + (space ? metrics.spaceW : 0), text: atom.text }
      }
      return
    }
    flush()
    const left = x + (space ? metrics.spaceW : 0)
    pieces.push({ kind: 'blank', left, n: atom.n })
    x = left + blankWidth(metrics)
  })
  flush()
  let right = 0
  for (const piece of pieces) {
    right = Math.max(
      right,
      piece.kind === 'text' ? piece.left + piece.width : piece.left + blankWidth(metrics),
    )
  }
  return { pieces, right }
}

export interface StoryLine {
  atoms: FifAtom[]
  /** First line of a paragraph other than the story's first: gets a gap above. */
  paragraphStart: boolean
}

/**
 * Greedy wrap, one word (with its glued punctuation and blanks) at a time.
 * A word too wide for an empty line still gets a line of its own; the
 * preflight refuses the story rather than letting it print past the column.
 */
export function wrapStory(
  paragraphs: readonly string[],
  metrics: StoryMetrics,
  textWidth: number,
  family: string,
): StoryLine[] {
  const lines: StoryLine[] = []
  paragraphs.forEach((paragraph, index) => {
    let current: FifAtom[] = []
    let first = true
    const push = () => {
      lines.push({ atoms: current, paragraphStart: first && index > 0 })
      first = false
      current = []
    }
    for (const chunk of paragraphChunks(paragraph)) {
      const candidate = [...current, ...chunk]
      if (current.length === 0 || placeLine(candidate, metrics, family).right <= textWidth) {
        current = candidate
        continue
      }
      push()
      current = [...chunk]
    }
    if (current.length > 0) push()
  })
  return lines
}

/** Height of a block of story lines, paragraph gaps included. */
export function linesHeight(lines: readonly StoryLine[], metrics: StoryMetrics): number {
  if (lines.length === 0) return 0
  const gaps = lines.slice(1).filter((line) => line.paragraphStart).length
  return (lines.length - 1) * metrics.pitch + fabricTextHeight(1, metrics.font) + gaps * metrics.paraGap
}

export function wrapTitle(title: string, metrics: StoryMetrics, textWidth: number, family: string): string[] {
  const spec = boldSpec(family)
  return wrapTextToWidth(title, metrics.title, wrapSafeWidth(textWidth, spec), spec)
}

export const titleHeight = (lines: number, metrics: StoryMetrics) =>
  fabricTextHeight(lines, metrics.title, TITLE_LINE_HEIGHT) + metrics.titleGap

export function footerLines(text: string, metrics: StoryMetrics, width: number, family: string): string[] {
  const spec = italicSpec(family)
  return wrapTextToWidth(text, metrics.font, wrapSafeWidth(width, spec), spec)
}

export const footerHeight = (lines: number, metrics: StoryMetrics) =>
  metrics.footerGap + fabricTextHeight(lines, metrics.font)

/** One story page's lines, and what sits above and below them. */
export interface StoryPageLayout {
  lines: StoryLine[]
  /** The title's lines on the first page; empty after. */
  titleLines: string[]
  footer: string[]
  heading: string
}

/**
 * Break a story into pages.
 *
 * The first page carries the heading and title; a continuation page carries
 * only its heading. Each page ends in a footer — "continues on the next page"
 * or "The End" — and the page is filled line by line up to what is left.
 * Returns null when the title will not set or a line is wider than the
 * column.
 */
export function paginateStory(options: {
  title: string
  paragraphs: readonly string[]
  plan: Pick<StoryPagePlan, 'metrics' | 'textWidth' | 'blockWidth' | 'bottomGuard'>
  firstField: Box
  nextField: Box
  family: string
}): StoryPageLayout[] | null {
  const { title, paragraphs, plan, firstField, nextField, family } = options
  const m = plan.metrics
  const titleLines = wrapTitle(title, m, plan.textWidth, family)
  if (titleLines.length > MAX_TITLE_LINES) return null
  const lines = wrapStory(paragraphs, m, plan.textWidth, family)
  if (lines.some((line) => placeLine(line.atoms, m, family).right > plan.textWidth)) return null

  const endFooter = footerLines(STORY_END, m, plan.blockWidth, family)
  const moreFooter = footerLines(STORY_CONTINUES, m, plan.blockWidth, family)
  const pages: StoryPageLayout[] = []
  let index = 0
  while (index < lines.length) {
    const first = pages.length === 0
    const field = first ? firstField : nextField
    const top =
      headingHeight(m.heading) + m.headingGap + (first ? titleHeight(titleLines.length, m) : 0)
    const room = field.height - plan.bottomGuard - top
    const fits = (count: number, footer: string[]) =>
      linesHeight(lines.slice(index, index + count), m) + footerHeight(footer.length, m) <= room

    const remaining = lines.length - index
    if (fits(remaining, endFooter)) {
      pages.push({
        lines: lines.slice(index),
        titleLines: first ? titleLines : [],
        footer: endFooter,
        heading: first ? STEP_STORY : STEP_STORY_CONTINUED,
      })
      return pages
    }
    let count = 0
    while (count < remaining && fits(count + 1, moreFooter)) count++
    // Never strand a line or two on the next page: hand it a few more, so a
    // reader turning over finds a paragraph, not a leftover.
    if (remaining - count < MIN_CARRIED_LINES) count = remaining - MIN_CARRIED_LINES
    // Turn the page between paragraphs when that still keeps most of this
    // page full: a reader picks up a new paragraph, not half a sentence.
    for (let c = count; c >= Math.max(2, Math.ceil(count * 0.6)); c--) {
      if (lines[index + c]?.paragraphStart) {
        count = c
        break
      }
    }
    // A page that cannot hold two lines is not a page worth turning to.
    if (count < 2) return null
    pages.push({
      lines: lines.slice(index, index + count),
      titleLines: first ? titleLines : [],
      footer: moreFooter,
      heading: first ? STEP_STORY : STEP_STORY_CONTINUED,
    })
    index += count
  }
  return pages
}

/**
 * The longest story the service may return: every word the budget allows,
 * every blank, four paragraphs and a two-line title, in ordinary long-ish
 * words. Real stories are held to the same budget, so a trim that sets this
 * sets them — and one that happens to run long is re-fitted, not squeezed.
 */
const PROBE_WORDS = (
  'When the big morning finally arrived, everybody gathered around the garden table ' +
  'and cheered while the speeches began with several wonderful surprises for everyone'
).split(' ')
export const PROBE_TITLE = 'The Most Unforgettable Farewell Party'

export function probeParagraphs(words = FIF_MAX_WORDS, blanks = FIF_MAX_BLANKS, paragraphs = 4): string[] {
  const tokens: string[] = []
  const every = Math.floor(words / blanks)
  let n = 0
  for (let i = 0; i < words; i++) {
    if (n < blanks && i % every === every - 1) tokens.push(`[${++n}]`)
    else tokens.push(PROBE_WORDS[i % PROBE_WORDS.length]!)
  }
  const per = Math.ceil(words / paragraphs)
  const out: string[] = []
  for (let p = 0; p < paragraphs; p++) {
    const slice = tokens.slice(p * per, (p + 1) * per)
    if (slice.length) out.push(`${slice.join(' ')}.`)
  }
  return out
}

function storyPlanAt(
  fields: { first: Box; next: Box },
  font: number,
  family: string,
): StoryPagePlan | null {
  const blockWidth = Math.min(fields.first.width, BLOCK_MAX_WIDTH)
  const textWidth = blockWidth
  if (textWidth < STORY_TEXT_MIN) return null
  const metrics = storyMetrics(font, family, textWidth)
  if (hugTextBoxWidth(STEP_STORY_CONTINUED, metrics.heading, Infinity, boldSpec(family)) > blockWidth) {
    return null
  }
  const base = { metrics, blockWidth, textWidth, bottomGuard: Math.round(font * 0.6) }
  const pages = paginateStory({
    title: PROBE_TITLE,
    paragraphs: probeParagraphs(),
    plan: base,
    firstField: fields.first,
    nextField: fields.next,
    family,
  })
  if (!pages || pages.length > MAX_STORY_PAGES) return null
  return { ...base, pages: pages.length }
}

/**
 * The largest type that sets the worst-case story on one page; failing that,
 * the largest comfortable type that sets it across two. A small trim gets a
 * second page rather than small print.
 */
export function planStoryPage(
  fields: { first: Box; next: Box },
  fontFamily: string,
): StoryPagePlan | null {
  for (let font = STORY_FONT_MAX; font >= FONT_MIN; font--) {
    const plan = storyPlanAt(fields, font, fontFamily)
    if (plan?.pages === 1) return plan
  }
  for (let font = STORY_FONT_COMFORT; font >= FONT_MIN; font--) {
    const plan = storyPlanAt(fields, font, fontFamily)
    if (plan) return plan
  }
  return null
}

/* ------------------------------------------------------------------ *
 * Fields and the promise the form makes.
 * ------------------------------------------------------------------ */

/** The safe printable column every Fill-in Funnies page lays out inside. */
export function fifContentBox(page: StudioConfigLayoutContext): Box {
  return insetHorizontal(contentBox(page), STUDIO_CONTENT_SAFE_INSET_X)
}

/** What is left of the column once the title and instruction have been set. */
export function fifBodyField(
  page: StudioConfigLayoutContext,
  config: StudioConfig,
  instruction: string,
): Box {
  const content = fifContentBox(page)
  const headerHeight = measureHeaderHeight(config, instruction, content.width)
  return {
    ...content,
    top: content.top + headerHeight,
    height: Math.max(1, content.height - headerHeight),
  }
}

/** Header how-to lines as the pages will carry them. */
export function fifInstructions(config: StudioConfig): { words: string; story: string } {
  const show = config.showInstructions !== false
  return { words: show ? FIF_WORDS_INSTRUCTION : '', story: show ? FIF_STORY_INSTRUCTION : '' }
}

export interface FifPlan {
  words: WordPagePlan
  story: StoryPagePlan
  fields: { words: Box; storyFirst: Box; storyNext: Box }
}

/**
 * The activity these settings make, measured before a story exists.
 *
 * Probed with the most prompts and the longest story the service may return,
 * so the note is a promise: every real story is within that budget.
 */
export function fifWorstCasePlan(options: {
  page: StudioConfigLayoutContext
  config: StudioConfig
  font: string
}): FifPlan | null {
  const { page, config, font } = options
  const instructions = fifInstructions(config)
  const fields = {
    words: fifBodyField(page, config, instructions.words),
    storyFirst: fifBodyField(page, config, instructions.story),
    storyNext: fifBodyField(page, config, ''),
  }
  const words = planWordPage(fields.words, { count: FIF_MAX_BLANKS, fontFamily: font })
  if (!words) return null
  const story = planStoryPage({ first: fields.storyFirst, next: fields.storyNext }, font)
  if (!story) return null
  return { words, story, fields }
}

/** What an activity prints on the trim currently in Settings. */
export function fifPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  font: string
}): string {
  const { page } = options
  if (!page) return `Up to ${FIF_MAX_BLANKS} words to fill in, then the story — fitted to your page size.`
  const plan = fifWorstCasePlan({ ...options, page })
  if (!plan) {
    return 'This page size is too small for Fill-in Funnies — choose a larger one in Settings.'
  }
  const story =
    plan.story.pages === 1
      ? `a one-page story at ${pxToPt(plan.story.metrics.font)} pt`
      : `a story at ${pxToPt(plan.story.metrics.font)} pt that may run onto a second page`
  return `A word list at ${pxToPt(plan.words.metrics.font)} pt, then ${story}.`
}
