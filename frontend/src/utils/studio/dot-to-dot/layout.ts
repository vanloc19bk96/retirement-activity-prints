import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_INSTRUCTION_SIZE } from '@/constants/studio.constants'
import { contentBox, measureHeaderHeightOverFullWidth, type Box } from '../studio-layout'
import { dtdInstructionOptions, dtdLevelSpec, type DtdLevel } from './content'
import { labelRoom } from './puzzle'

/**
 * Where the picture goes: everything under the heading, the one-line
 * instruction and the line naming the picture. No frame, no border, no
 * decoration — the dots and their numbers are the page, and the paper round
 * them is where they breathe.
 */

/** Air between the safe area (or the heading) and the picture's panel, canvas px. */
export const DTD_EDGE_AIR = 4
/** Extra air under the instruction. */
export const DTD_HEADER_AIR = 12

/** The line naming the picture ("Picture: Teapot"), so a reader knows what they are drawing. */
export const DTD_NAME_SIZE = STUDIO_INSTRUCTION_SIZE
/** Its strip: one line. */
export const DTD_NAME_STRIP = Math.ceil(DTD_NAME_SIZE * 1.35)

export const dtdNameText = (name: string) => `Picture: ${name}`

/** The smallest panel worth printing a picture in. */
export const DTD_MIN_PANEL_WIDTH = Math.round(3.2 * DPI)
export const DTD_MIN_PANEL_HEIGHT = Math.round(3.6 * DPI)

/** The strip for the picture's name, at the top of what a heading left of the page. */
export function dtdNameStrip(body: Box, headed: boolean): Box {
  return {
    left: body.left,
    top: body.top + (headed ? 0 : DTD_EDGE_AIR),
    width: body.width,
    height: DTD_NAME_STRIP,
  }
}

/** The picture's panel inside what a heading left of the page (`body`, from `drawHeader`), under the name. */
export function dtdPanelInBody(body: Box, headed: boolean): Box {
  const name = dtdNameStrip(body, headed)
  const top = name.top + name.height + DTD_HEADER_AIR
  return {
    left: body.left + DTD_EDGE_AIR,
    top,
    width: body.width - DTD_EDGE_AIR * 2,
    height: body.top + body.height - DTD_EDGE_AIR - top,
  }
}

export const dtdPanelFits = (b: Box) => b.width >= DTD_MIN_PANEL_WIDTH && b.height >= DTD_MIN_PANEL_HEIGHT

/** The panel on a page, measured without drawing (for the form). */
export function dtdPanelFor(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const body = contentBox(page)
  const header = measureHeaderHeightOverFullWidth(config, instruction, body.width)
  return dtdPanelInBody({ ...body, top: body.top + header, height: body.height - header }, header > 0)
}

/** The level's help line: what it prints on the page size in Settings. */
export function dtdPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; level: DtdLevel }): string {
  const { page, config, level } = options
  const rules = dtdLevelSpec(level).rules
  const pt = (px: number) => Math.round(((px * 72) / DPI) * 2) / 2
  const numbers = `Numbers print at ${pt(rules.numberSize)} pt, dots at least ${(rules.minGap / DPI).toFixed(2)} in apart`
  if (!page) return `${numbers}.`
  const texts = dtdInstructionOptions(config)
  const panels = (texts.length > 0 ? texts : ['']).map((text) => dtdPanelFor(page, config, text))
  const worst = panels.reduce((a, b) => (b.height < a.height ? b : a))
  if (!dtdPanelFits(worst)) return 'This page size is too small for a dot-to-dot picture. Choose a larger one in Settings.'
  const room = labelRoom(rules) * 2
  const inches = (px: number) => (px / DPI).toFixed(1)
  return `${numbers}; the picture fills up to ${inches(worst.width - room)} × ${inches(worst.height - room)} in.`
}
