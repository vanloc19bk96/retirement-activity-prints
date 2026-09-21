import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { estimateTextBoxWidth } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { buildPhosphorIconPath } from '../studio-phosphor-icon'
import { isNBackIconSymbol } from './shapes'

/**
 * Draw a sequence symbol — Phosphor duotone icon (shapes) or text (letters/digits).
 */
export function drawNBackSymbol(
  sym: string,
  spec: {
    left: number
    top: number
    size: number
    fontFamily: string
    /** Max textbox width for letter/digit glyphs. */
    textWidth?: number
    fill?: string
    originX?: 'left' | 'center' | 'right'
    textAlign?: 'left' | 'center' | 'right'
  },
  tag: StudioTag,
  role: StudioRole = 'prompt',
): StudioFabricObject {
  if (isNBackIconSymbol(sym)) {
    return buildPhosphorIconPath(
      sym,
      { left: spec.left, top: spec.top, size: spec.size },
      tag,
      role,
    )
  }

  const originX = spec.originX ?? 'left'
  // Omit optional undefined fields — spreading them into buildText would wipe
  // defaults (textAlign/fill) and crash Fabric Textbox on enliven (blank canvas).
  return buildText(
    {
      left: spec.left,
      top: spec.top,
      text: sym,
      fontFamily: spec.fontFamily,
      fontSize: spec.size,
      fontWeight: 700,
      originX,
      originY: 'center',
      width: estimateTextBoxWidth(sym, spec.size, spec.textWidth ?? 80),
      ...(spec.fill != null ? { fill: spec.fill } : {}),
      ...(spec.textAlign != null ? { textAlign: spec.textAlign } : {}),
    },
    tag,
    role,
  )
}
