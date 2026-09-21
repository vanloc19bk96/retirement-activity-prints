import { DPI } from '@/types/canvas-settings.types'
import { STUDIO_BODY_SIZE } from '@/constants/studio.constants'
import { SAFETY_LINE } from '../reflective-writing/safety'

const MM_PER_INCH = 25.4

function mm(value: number): number {
  return (value * DPI) / MM_PER_INCH
}

export const LARGE_PRINT = STUDIO_BODY_SIZE * 1.2

/** Comfortable handwriting gap between writing rules (~12 mm). */
export const WRITING_LINE_GAP = mm(12)
/** Floor when packing many prompts — still writeable. */
export const WRITING_LINE_GAP_MIN = mm(8)

export { SAFETY_LINE }

export const STAGE_INSTRUCTION =
  `Write as much or as little as you like. ${SAFETY_LINE}`
