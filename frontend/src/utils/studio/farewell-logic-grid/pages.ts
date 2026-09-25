import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { boxBottom, drawHeader, toNonBreakingSpaces, type Box } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  drawClues,
  drawLgGrid,
  drawNote,
  drawSolution,
  drawStory,
  hugWidth,
  planSolution,
  puzzleGridLabels,
  type LgSetClue,
  type LgSolutionLayout,
} from './draw'
import {
  CELL_COMFORT,
  CELL_MIN,
  CLUE_FONTS,
  ONE_PAGE_CLUE_FLOOR,
  LABEL_FONT_MIN,
  MAX_CLUE_LINES,
  boldSpec,
  clueSlotHeight,
  fitGrid,
  footerHeight,
  lgContentBox,
  lgGridGeometry,
  lgTextMetrics,
  ptToPx,
  storyHeight,
  storyLines,
  textBlockHeight,
  textSpec,
  wrapLines,
  type LgGridGeometry,
  type LgGridLabels,
  type LgPagePlan,
} from './layout'
import type { LgPuzzle } from './puzzle'

export const NOTE_GRID_NEXT = 'The grid is on the next page.'
export const NOTE_CLUES_CONTINUE = 'The clues continue on the next page.'
export const CHART_HEADING = 'Final answers'

/** A write-in chart is only worth squares at least this big (about 0.31 in). */
const CHART_CELL_FLOOR = 30

/** Where everything landed, for the preflight to re-prove. */
export interface LgLaidOut {
  outputs: StudioPageOutput[]
  content: Box
  /** Clues on each puzzle page, in print order. */
  cluePages: LgSetClue[][]
  grid: LgGridGeometry
  gridBox: Box
  /** Whether the grid page carries the write-in answer chart. */
  chart: boolean
  /** The plan as set, with the clue type this puzzle's clues allowed. */
  plan: LgPagePlan
  answerGrid: LgGridGeometry | null
  solution: LgSolutionLayout
}

/**
 * The plan is sized for a heavy clue set; this puzzle's own clues may need
 * less. A two-page plan whose clues and a comfortable grid fit together
 * becomes one page. Otherwise, when every clue fits page one at a larger size
 * (up to 18 pt), they are set there: the page fills with bigger type rather
 * than white space. Grid squares never shrink below the plan's to allow it.
 */
function fitToPuzzle(options: {
  puzzle: LgPuzzle
  plan: LgPagePlan
  font: string
  first: Box
  labels: LgGridLabels
  gridHeight: number
}): LgPagePlan {
  const { puzzle, plan, font, first, labels, gridHeight } = options
  const set = (size: number) => {
    const text = lgTextMetrics(size)
    const textWidth = plan.blockWidth - text.numberW
    const lines = puzzle.clueTexts.map((clue) => wrapLines(clue, textWidth, size, textSpec(font)).length)
    const story = storyHeight(storyLines(puzzle.theme.name, puzzle.scenario, plan.blockWidth, font, text), text)
    const clues = lines.reduce((sum, n) => sum + clueSlotHeight(n, text), 0) - text.gap
    return { text, textWidth, fits: lines.every((n) => n <= MAX_CLUE_LINES), used: story + clues }
  }

  if (plan.pages === 2) {
    for (const size of CLUE_FONTS.filter((s) => s >= ONE_PAGE_CLUE_FLOOR)) {
      const m = set(size)
      if (!m.fits) continue
      const grid = fitGrid({
        shape: puzzle.shape,
        labels,
        labelFont: plan.labelFont,
        font,
        width: first.width,
        height: first.height - m.used - m.text.font,
        minCell: Math.max(plan.cell, CELL_COMFORT),
      })
      if (grid) {
        return { ...plan, pages: 1, text: m.text, textWidth: m.textWidth, cell: grid.cell, footerHeight: 0, secondCapacity: 0 }
      }
    }
  }

  for (const size of CLUE_FONTS) {
    if (size <= plan.text.font) break
    const m = set(size)
    if (!m.fits) continue
    const footer = plan.pages === 2 ? footerHeight(m.text) : 0
    const below = plan.pages === 1 ? m.text.font + gridHeight : footer
    if (m.used + below <= first.height) return { ...plan, text: m.text, textWidth: m.textWidth, footerHeight: footer }
  }
  return plan
}

/** Largest answer grid, no bigger than the puzzle's, that fits the box. */
function answerGridFor(puzzle: LgPuzzle, plan: LgPagePlan, font: string, width: number, height: number) {
  const labels = puzzleGridLabels(puzzle)
  for (let cell = plan.cell; cell >= CELL_MIN - 4; cell--) {
    for (let size = plan.labelFont; size >= LABEL_FONT_MIN; size--) {
      const grid = lgGridGeometry(puzzle.shape, cell, size, labels, font)
      if (grid && grid.width <= width && grid.height <= height) return grid
    }
  }
  return null
}

/**
 * Set a validated puzzle onto its pages.
 *
 * Page one: title, instruction, the scene and story, then the clues. On a
 * one-page plan the grid sits centred in the space under the clues. On two,
 * page one ends with a note, and page two carries the title, any clues that
 * did not fit, and the grid. The answer page — title, scene, a table of the
 * answer and the grid with its checks — is attached to the last page, so the
 * book adds it after the whole puzzle and never between its pages.
 *
 * Returns null if the real puzzle does not fit the plan; the caller refuses it.
 */
export function layoutLgPuzzle(options: {
  puzzle: LgPuzzle
  plan: LgPagePlan
  config: StudioConfig
  ctx: StudioGenerateContext
  font: string
  instruction: string
  tag: StudioTag
}): LgLaidOut | null {
  const { puzzle, config, ctx, font, instruction, tag } = options
  const content = lgContentBox(ctx)
  const blockLeft = Math.round(content.left + (content.width - options.plan.blockWidth) / 2)
  const labels = puzzleGridLabels(puzzle)
  const planned = lgGridGeometry(puzzle.shape, options.plan.cell, options.plan.labelFont, labels, font)
  if (!planned) return null
  const plan = fitToPuzzle({
    puzzle,
    plan: options.plan,
    font,
    first: drawHeader(content, config, tag, instruction).body,
    labels,
    gridHeight: planned.height,
  })
  const { text } = plan

  // One table geometry serves the write-in chart and the answer page alike.
  const solution = planSolution(puzzle, content.width, font, ptToPx)

  const clues: LgSetClue[] = puzzle.clueTexts.map((clue, index) => ({
    index,
    lines: wrapLines(clue, plan.textWidth, text.font, textSpec(font)),
  }))
  const slot = (c: LgSetClue) => clueSlotHeight(c.lines.length, text)

  // Page one: header, story, clues.
  const first = drawHeader(content, config, tag, instruction)
  const firstObjects: StudioFabricObject[] = [...first.objects]
  const story = storyLines(puzzle.theme.name, puzzle.scenario, plan.blockWidth, font, text)
  drawStory(firstObjects, { puzzle, lines: story, left: blockLeft, top: first.body.top, width: plan.blockWidth, text, font, tag })
  const cluesTop = first.body.top + storyHeight(story, text)

  let grid: LgGridGeometry | null = null
  let chart = false
  /**
   * The grid grows into whatever room the real clues leave (never below the
   * plan's squares), with the write-in chart under it when the squares can
   * stay generous. Grid, heading and chart share one left edge, and the
   * stack sits centred across the page, a little above centre down it.
   */
  const placeGrid = (objects: StudioFabricObject[], top: number, bottom: number): Box | null => {
    const room = bottom - top
    const fit = (height: number, minCell: number) =>
      fitGrid({ shape: puzzle.shape, labels, labelFont: plan.labelFont, font, width: content.width, height, minCell })
    const headingH = Math.round(textBlockHeight(1, text.font))
    const headingW = hugWidth([CHART_HEADING], text.font, boldSpec(font))
    const chartBlock =
      solution.mode === 'table' ? Math.round(text.font * 1.4 + headingH + text.gap + solution.height) : 0
    const best = fit(room, plan.cell)
    // The chart comes free when the grid is held back by the page's width;
    // otherwise it may cost the squares only down to a generous floor.
    const withChart =
      chartBlock <= 0 || !best
        ? null
        : room - best.height >= chartBlock
          ? best
          : fit(room - chartBlock, Math.max(plan.cell, CHART_CELL_FLOOR))
    const placed = withChart ?? best
    if (!placed) return null
    const block = placed.height + (withChart ? chartBlock : 0)
    const stackW = Math.min(content.width, withChart ? Math.max(placed.width, solution.width, headingW) : placed.width)
    const left = Math.round(content.left + (content.width - stackW) / 2)
    const box: Box = {
      left,
      top: Math.round(top + Math.min((room - block) * 0.35, text.font * 2.5)),
      width: placed.width,
      height: placed.height,
    }
    objects.push(drawLgGrid({ puzzle, geometry: placed, left: box.left, top: box.top, font, tag, answers: false }))
    if (withChart) {
      const headingTop = Math.round(box.top + placed.height + text.font * 1.4)
      objects.push(
        buildText(
          {
            left,
            top: headingTop,
            text: toNonBreakingSpaces(CHART_HEADING),
            width: Math.min(stackW, headingW),
            fontFamily: font,
            fontSize: text.font,
            fontWeight: 700,
            lineHeight: 1,
          },
          tag,
          'prompt',
        ),
      )
      drawSolution(objects, {
        puzzle,
        layout: solution,
        left,
        top: headingTop + headingH + text.gap,
        font,
        tag,
        blank: true,
      })
    }
    grid = placed
    chart = Boolean(withChart)
    return box
  }

  const outputs: StudioPageOutput[] = []
  let cluePages: LgSetClue[][]
  let gridBox: Box | null

  if (plan.pages === 1) {
    const end = drawClues(firstObjects, {
      clues,
      left: blockLeft,
      top: cluesTop,
      textWidth: plan.textWidth,
      gap: text.gap,
      text,
      font,
      tag,
    })
    gridBox = placeGrid(firstObjects, end + text.font, boxBottom(first.body))
    cluePages = [clues]
    outputs.push({ pageRole: 'single', objects: firstObjects })
  } else {
    const footerTop = boxBottom(first.body) - Math.round(textBlockHeight(1, text.noteFont))
    const room = boxBottom(first.body) - plan.footerHeight - cluesTop
    const onFirst: LgSetClue[] = []
    let used = 0
    for (const clue of clues) {
      if (used + slot(clue) - text.gap > room) break
      used += slot(clue)
      onFirst.push(clue)
    }
    if (onFirst.length === 0) return null
    const rest = clues.slice(onFirst.length)
    // Share any spare height out between the clues, up to half a gap more each.
    const spare = Math.max(0, room - (used - text.gap))
    const gap = text.gap + (onFirst.length > 1 ? Math.min(spare / (onFirst.length - 1), text.gap * 0.5) : 0)
    drawClues(firstObjects, { clues: onFirst, left: blockLeft, top: cluesTop, textWidth: plan.textWidth, gap, text, font, tag })
    drawNote(firstObjects, {
      text: rest.length > 0 ? NOTE_CLUES_CONTINUE : NOTE_GRID_NEXT,
      left: blockLeft,
      top: footerTop,
      width: plan.blockWidth,
      size: text.noteFont,
      font,
      tag,
    })
    outputs.push({ pageRole: 'single', objects: firstObjects })

    const second = drawHeader(content, config, tag, '')
    const secondObjects: StudioFabricObject[] = [...second.objects]
    let top = second.body.top
    if (rest.length > 0) {
      top = drawClues(secondObjects, {
        clues: rest,
        left: blockLeft,
        top,
        textWidth: plan.textWidth,
        gap: text.gap,
        text,
        font,
        tag,
      }) + text.font
    }
    gridBox = placeGrid(secondObjects, top, boxBottom(second.body))
    cluePages = [onFirst, rest]
    outputs.push({ pageRole: 'single', objects: secondObjects })
  }
  if (!gridBox || !grid) return null

  // The answer page, from the same puzzle object: the scene name, the answer
  // table and the checked grid as one stack on a shared left edge, centred
  // across the page and set a little above centre down it.
  const key = drawHeader(content, config, tag, '')
  const keyObjects: StudioFabricObject[] = [...key.objects]
  const keyStory = { subtitle: story.subtitle, scenario: [] as string[] }
  const subtitleH = Math.round(textBlockHeight(story.subtitle.length, text.subtitleFont))
  const subtitleW = hugWidth(story.subtitle, text.subtitleFont, boldSpec(font))
  const gridGap = Math.round(text.font * 1.4)
  const above = subtitleH + text.font + solution.height
  const answerGrid = answerGridFor(puzzle, plan, font, content.width, key.body.height - above - gridGap)
  const stackH = above + (answerGrid ? gridGap + answerGrid.height : 0)
  const stackW = Math.min(content.width, Math.max(subtitleW, solution.width, answerGrid?.width ?? 0))
  const keyLeft = Math.round(content.left + (content.width - stackW) / 2)
  const keyTop = Math.round(key.body.top + Math.max(0, Math.min((key.body.height - stackH) * 0.35, text.font * 4)))
  drawStory(keyObjects, { puzzle, lines: keyStory, left: keyLeft, top: keyTop, width: stackW, text, font, tag })
  const tableTop = keyTop + subtitleH + text.font
  drawSolution(keyObjects, { puzzle, layout: solution, left: keyLeft, top: tableTop, font, tag })
  if (answerGrid) {
    keyObjects.push(
      drawLgGrid({
        puzzle,
        geometry: answerGrid,
        left: keyLeft,
        top: tableTop + solution.height + gridGap,
        font,
        tag,
        answers: true,
      }),
    )
  }
  const last = outputs.length - 1
  outputs[last] = { ...outputs[last]!, answerSourceObjects: keyObjects }

  return { outputs, content, cluePages, grid, gridBox, chart, answerGrid, solution, plan }
}
