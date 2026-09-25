import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { DPI } from '@/types/canvas-settings.types'
import { contentBox, measureHeaderHeight, type Box } from '../studio-layout'
import type { Bounds } from '../stained-glass/geometry'
import { qcDetailSpec, qcInstructionOptions, type QcDetail } from './content'

/**
 * Where the page's design goes: everything the safe area leaves once the
 * heading and the one-line instruction are set. A hair of air keeps the
 * frame's heavy outline off the safe line, where it would read as a trimming
 * fault.
 */

/** Air between the safe area (or the heading) and the frame, canvas px. */
export const QC_EDGE_AIR = 6
/** Extra air under the instruction, so the frame does not crowd it. */
export const QC_HEADER_AIR = 10

/** The smallest panel worth printing: below this the saying cannot letter at a colorable size with a pattern round it. */
export const QC_MIN_PANEL_WIDTH = Math.round(3.6 * DPI)
export const QC_MIN_PANEL_HEIGHT = Math.round(4.4 * DPI)

export function qcPanelInBody(body: Box, headed: boolean): Box {
  const top = body.top + (headed ? QC_HEADER_AIR : QC_EDGE_AIR)
  return {
    left: body.left + QC_EDGE_AIR,
    top,
    width: body.width - QC_EDGE_AIR * 2,
    height: body.top + body.height - QC_EDGE_AIR - top,
  }
}

/** The panel's box on a page, measured without drawing (for the form). */
export function qcPanelBox(page: StudioConfigLayoutContext, config: StudioConfig, instruction: string): Box {
  const body = contentBox(page)
  const header = measureHeaderHeight(config, instruction, body.width)
  return qcPanelInBody({ ...body, top: body.top + header, height: body.height - header }, header > 0)
}

export const qcPanelFits = (b: Box) => b.width >= QC_MIN_PANEL_WIDTH && b.height >= QC_MIN_PANEL_HEIGHT

export const boxToBounds = (b: Box): Bounds => ({ minX: b.left, minY: b.top, maxX: b.left + b.width, maxY: b.top + b.height })

const inches = (px: number) => {
  const v = Math.round((px / DPI) * 20) / 20
  return `${v.toFixed(2).replace(/0$/, '')} in`
}

/** The level's help line: what this level prints on the page size in Settings. */
export function qcPrintNote(options: { page?: StudioConfigLayoutContext; config: StudioConfig; detail: QcDetail }): string {
  const { page, config, detail } = options
  const spec = qcDetailSpec(detail)
  const shapes = `Pattern shapes ${inches(spec.pack[0] * 2)} to ${inches(spec.pack[1] * 2)} across; every space at least ${inches(spec.floor.minWidth)} wide.`
  if (!page) return shapes
  const worst = (qcInstructionOptions(config).length > 0 ? qcInstructionOptions(config) : [''])
    .map((text) => qcPanelBox(page, config, text))
    .reduce((a, b) => (b.height < a.height ? b : a))
  if (!qcPanelFits(worst)) return 'This page size is too small for a quote coloring page — choose a larger one in Settings.'
  return shapes
}
