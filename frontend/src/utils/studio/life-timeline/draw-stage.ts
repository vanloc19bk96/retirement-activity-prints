import type { StudioConfig, StudioFabricObject } from '@/types/studio-template.types'
import {
  boxBottom,
  estimateWrappedLines,
  unionObjectBounds,
  type Box,
} from '../studio-layout'
import {
  buildGroup,
  buildLine,
  buildText,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_RULE_LIGHT,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_BODY_SIZE,
} from '@/constants/studio.constants'
import {
  LARGE_PRINT,
  WRITING_LINE_GAP,
  WRITING_LINE_GAP_MIN,
} from './copy'

const MIN_PRINT = STUDIO_BODY_SIZE * 0.85
const HARD_MIN_PRINT = 14
/** Fixed writing room under each prompt — not a form control. */
const WRITING_LINES_PER_PROMPT = 2

interface StageLayout {
  fontSize: number
  linesPerPrompt: number
  writingGap: number
  between: number
  prompts: string[]
  blockH: number
}

function promptBlockHeight(
  prompts: string[],
  width: number,
  fontSize: number,
  linesPerPrompt: number,
  writingGap: number,
  between: number,
): number {
  let h = 0
  for (const prompt of prompts) {
    const wraps = estimateWrappedLines(prompt, fontSize, width)
    h += wraps * fontSize * 1.28
    // Gap above first rule equals the gap between writing rules.
    h += writingGap
    h += linesPerPrompt * writingGap
    h += between
  }
  return h
}

function tryLayout(
  body: Box,
  prompts: string[],
  fieldH: number,
  fontSize: number,
  writingGap: number,
  between: number,
): StageLayout | null {
  const blockH = promptBlockHeight(
    prompts,
    body.width,
    fontSize,
    WRITING_LINES_PER_PROMPT,
    writingGap,
    between,
  )
  if (blockH > fieldH) return null
  return {
    fontSize,
    linesPerPrompt: WRITING_LINES_PER_PROMPT,
    writingGap,
    between,
    prompts,
    blockH,
  }
}

/**
 * Fit every prompt into the field. Never drops prompts.
 * Prefer shrinking font / between-prompt air before compressing writing lines.
 */
export function fitStageLayout(body: Box, prompts: string[]): StageLayout {
  const fieldH = Math.max(1, body.height)
  const list = prompts.slice()

  for (let fontSize = LARGE_PRINT; fontSize >= MIN_PRINT; fontSize -= 1) {
    const between = fontSize * 1.15
    const fit = tryLayout(body, list, fieldH, fontSize, WRITING_LINE_GAP, between)
    if (fit) return fit
  }

  // Compress space between prompt blocks before touching writing-line rhythm.
  for (let betweenScale = 1; betweenScale >= 0.35; betweenScale -= 0.05) {
    const between = MIN_PRINT * 1.15 * betweenScale
    const fit = tryLayout(body, list, fieldH, MIN_PRINT, WRITING_LINE_GAP, between)
    if (fit) return fit
  }

  for (
    let writingGap = WRITING_LINE_GAP;
    writingGap >= WRITING_LINE_GAP_MIN;
    writingGap -= 1
  ) {
    const fit = tryLayout(body, list, fieldH, MIN_PRINT, writingGap, MIN_PRINT * 0.4)
    if (fit) return fit
  }

  for (let fontSize = MIN_PRINT - 1; fontSize >= HARD_MIN_PRINT; fontSize -= 1) {
    const fit = tryLayout(
      body,
      list,
      fieldH,
      fontSize,
      WRITING_LINE_GAP_MIN,
      fontSize * 0.35,
    )
    if (fit) return fit
  }

  const writingGap = WRITING_LINE_GAP_MIN
  const between = HARD_MIN_PRINT * 0.35
  return {
    fontSize: HARD_MIN_PRINT,
    linesPerPrompt: WRITING_LINES_PER_PROMPT,
    writingGap,
    between,
    prompts: list,
    blockH: promptBlockHeight(
      list,
      body.width,
      HARD_MIN_PRINT,
      WRITING_LINES_PER_PROMPT,
      writingGap,
      between,
    ),
  }
}

function buildPromptUnit(
  prompt: string,
  top: number,
  field: Box,
  layout: StageLayout,
  font: string,
  tag: StudioTag,
): { group: StudioFabricObject; nextTop: number } {
  const parts: StudioFabricObject[] = []
  const wraps = estimateWrappedLines(prompt, layout.fontSize, field.width)
  const promptH = wraps * layout.fontSize * 1.28
  let y = top

  parts.push(
    buildText(
      {
        left: field.left,
        top: y,
        text: prompt,
        fontFamily: font,
        fontSize: layout.fontSize,
        width: field.width,
        fill: STUDIO_INK,
      },
      tag,
      'prompt',
    ),
  )
  y += promptH + layout.writingGap

  const fieldBottom = boxBottom(field)
  for (let i = 0; i < layout.linesPerPrompt; i++) {
    if (y > fieldBottom + 0.5) break
    parts.push(
      buildLine(
        {
          x1: field.left,
          y1: y,
          x2: field.left + field.width,
          y2: y,
          stroke: STUDIO_RULE_LIGHT,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
        },
        tag,
        'structure',
      ),
    )
    y += layout.writingGap
  }

  const bounds = unionObjectBounds(parts)
  if (!bounds) {
    return { group: parts[0]!, nextTop: y + layout.between }
  }
  return {
    group: buildGroup(parts, bounds, tag, 'prompt'),
    nextTop: y + layout.between,
  }
}

export function drawStageContent(
  objects: StudioFabricObject[],
  body: Box,
  prompts: string[],
  config: StudioConfig,
  tag: StudioTag,
): void {
  const font = String(config.fontFamily)
  const layout = fitStageLayout(body, prompts)
  const stackTop = body.top + Math.max(0, (body.height - layout.blockH) / 2)
  const field: Box = {
    left: body.left,
    top: stackTop,
    width: body.width,
    height: Math.max(1, body.height - (stackTop - body.top)),
  }

  const stageParts: StudioFabricObject[] = []
  let y = field.top
  for (const prompt of layout.prompts) {
    const unit = buildPromptUnit(prompt, y, field, layout, font, tag)
    stageParts.push(unit.group)
    y = unit.nextTop
  }

  const outerBounds = unionObjectBounds(stageParts)
  if (outerBounds) {
    objects.push(buildGroup(stageParts, outerBounds, tag))
    return
  }
  objects.push(...stageParts)
}
