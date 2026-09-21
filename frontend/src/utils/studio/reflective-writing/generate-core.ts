import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import {
  boxBottom,
  contentBox,
  drawHeader,
  estimateTextBoxWidth,
  estimateWrappedLines,
  insetHorizontal,
  type Box,
} from '../studio-layout'
import { buildLine, buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE_MEDIUM,
} from '@/constants/studio.constants'
import {
  DATE_LINE_LABEL,
  JOURNAL_DATE_PROMPT_GAP,
  JOURNAL_FIRST_LINE_MIN_GAP,
  JOURNAL_LINE_GAP,
  JOURNAL_MUTED_SIZE,
  JOURNAL_PROMPT_LEADING,
  JOURNAL_PROMPT_SIZE,
  JOURNAL_RULE_STROKE,
} from './copy'
import { SAFETY_LINE } from './safety'

export type ReflectiveLayoutMode = 'life-story' | 'journal'

export interface BuildReflectivePagesOptions {
  mode: ReflectiveLayoutMode
  templateKey: string
  ctx: StudioGenerateContext
  config: StudioConfig
  /** One page = one array of prompts (1–2 for journal). */
  pages: string[][]
  showDateLine?: boolean
  /** Fixed prompt block height in wrapped lines (§4.5). */
  promptBlockLines?: number
}

interface JournalRhythm {
  dateTop: number | null
  promptTops: number[]
  promptBlockH: number
  firstRuleYs: number[]
  lineGap: number
  linesPerPrompt: number
  safetyTop: number
  field: Box
}

function promptBlockHeight(lines: number, fontSize: number): number {
  return lines * fontSize * JOURNAL_PROMPT_LEADING
}

/**
 * Vertical rhythm from the content box — identical on every page.
 * Prompt length must never move the writing lines.
 */
export function computeJournalRhythm(
  body: Box,
  options: {
    promptsPerPage: number
    showDateLine: boolean
    promptBlockLines: number
  },
): JournalRhythm {
  const fontSize = JOURNAL_PROMPT_SIZE
  const promptBlockH = promptBlockHeight(options.promptBlockLines, fontSize)
  const lineGap = JOURNAL_LINE_GAP
  const firstGap = Math.max(JOURNAL_FIRST_LINE_MIN_GAP, lineGap)
  const dateH = options.showDateLine ? JOURNAL_MUTED_SIZE * 1.6 : 0
  const datePromptGap = options.showDateLine ? JOURNAL_DATE_PROMPT_GAP : 0
  const safetyH = JOURNAL_MUTED_SIZE * 1.8
  const topPad = Math.min(28, body.height * 0.03)
  const bottomPad = Math.min(40, body.height * 0.045)
  const betweenPrompts = fontSize * 0.85
  const promptsPerPage = Math.min(2, Math.max(1, options.promptsPerPage))

  const fixedWithoutLines =
    topPad +
    dateH +
    datePromptGap +
    promptsPerPage * (promptBlockH + firstGap) +
    Math.max(0, promptsPerPage - 1) * betweenPrompts +
    safetyH +
    bottomPad
  const writable = Math.max(lineGap * 3 * promptsPerPage, body.height - fixedWithoutLines)
  const totalLines = Math.max(
    promptsPerPage * 3,
    Math.floor(writable / lineGap),
  )
  const linesPerPrompt = Math.max(3, Math.floor(totalLines / promptsPerPage))

  let y = body.top + topPad
  let dateTop: number | null = null
  if (options.showDateLine) {
    dateTop = y
    y += dateH + datePromptGap
  }

  const promptTops: number[] = []
  const firstRuleYs: number[] = []
  for (let i = 0; i < promptsPerPage; i++) {
    promptTops.push(y)
    y += promptBlockH + firstGap
    firstRuleYs.push(y)
    y += linesPerPrompt * lineGap
    if (i < promptsPerPage - 1) y += betweenPrompts
  }

  const safetyTop = Math.min(
    boxBottom(body) - bottomPad - JOURNAL_MUTED_SIZE,
    Math.max(y + lineGap * 0.25, boxBottom(body) - bottomPad - safetyH),
  )

  return {
    dateTop,
    promptTops,
    promptBlockH,
    firstRuleYs,
    lineGap,
    linesPerPrompt,
    safetyTop,
    field: body,
  }
}

function drawJournalPage(
  pagePrompts: string[],
  config: StudioConfig,
  ctx: StudioGenerateContext,
  templateKey: string,
  options: { showDateLine: boolean; promptBlockLines: number },
): StudioPageOutput {
  const tag: StudioTag = {
    templateKey,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, '')
  objects.push(...header.objects)

  const promptsPerPage = Math.min(2, Math.max(1, pagePrompts.length))
  const rhythm = computeJournalRhythm(header.body, {
    promptsPerPage,
    showDateLine: options.showDateLine,
    promptBlockLines: options.promptBlockLines,
  })
  const font = String(config.fontFamily)
  const field = rhythm.field

  if (rhythm.dateTop != null) {
    objects.push(
      buildText(
        {
          left: field.left,
          top: rhythm.dateTop,
          text: DATE_LINE_LABEL,
          fontFamily: font,
          fontSize: JOURNAL_MUTED_SIZE,
          fill: STUDIO_INK_MUTED,
          width: Math.min(field.width * 0.55, field.width),
        },
        tag,
        'decoration',
      ),
    )
  }

  for (let i = 0; i < promptsPerPage; i++) {
    const prompt = pagePrompts[i] ?? ''
    const promptTop = rhythm.promptTops[i]!
    const promptWidth = estimateTextBoxWidth(
      prompt,
      JOURNAL_PROMPT_SIZE,
      field.width,
    )
    const promptLines = Math.min(
      options.promptBlockLines,
      estimateWrappedLines(prompt, JOURNAL_PROMPT_SIZE, field.width),
    )
    objects.push(
      buildText(
        {
          left: field.left,
          top: promptTop,
          text: prompt,
          fontFamily: font,
          fontSize: JOURNAL_PROMPT_SIZE,
          lineHeight: JOURNAL_PROMPT_LEADING,
          fill: STUDIO_INK,
          width: promptWidth,
          height: promptBlockHeight(promptLines, JOURNAL_PROMPT_SIZE),
          textAlign: 'left',
        },
        tag,
        'prompt',
      ),
    )

    const rulesStart = rhythm.firstRuleYs[i]!
    for (let line = 0; line < rhythm.linesPerPrompt; line++) {
      const y = rulesStart + line * rhythm.lineGap
      if (y > rhythm.safetyTop - rhythm.lineGap * 0.35) break
      objects.push(
        buildLine(
          {
            x1: field.left,
            y1: y,
            x2: field.left + field.width,
            y2: y,
            stroke: STUDIO_RULE_MEDIUM,
            strokeWidth: JOURNAL_RULE_STROKE,
          },
          tag,
          'structure',
        ),
      )
    }
  }

  objects.push(
    buildText(
      {
        left: field.left,
        top: rhythm.safetyTop,
        text: SAFETY_LINE,
        fontFamily: font,
        fontSize: JOURNAL_MUTED_SIZE,
        fill: STUDIO_INK_MUTED,
        width: field.width,
      },
      tag,
      'decoration',
    ),
  )

  return { pageRole: 'single', objects }
}

/** Shared reflective page builder — journal mode owns §4 typography/rhythm. */
export function buildReflectivePages(
  options: BuildReflectivePagesOptions,
): StudioPageOutput[] {
  const showDateLine = options.showDateLine !== false
  const promptBlockLines = options.promptBlockLines ?? 2

  return options.pages.map((pagePrompts) =>
    drawJournalPage(pagePrompts, options.config, options.ctx, options.templateKey, {
      showDateLine: options.mode === 'journal' ? showDateLine : false,
      promptBlockLines,
    }),
  )
}

export function chunkPrompts(prompts: string[], size: number): string[][] {
  const n = Math.max(1, size)
  const pages: string[][] = []
  for (let i = 0; i < prompts.length; i += n) {
    pages.push(prompts.slice(i, i + n))
  }
  return pages
}
