import { PHOSPHOR_DUOTONE_ICON_NAMES } from '../studio-phosphor-icon'

/**
 * Phosphor duotone names that draw their own outer ring/disc — clash with
 * cancel answer circles (double halo). Keep out of the hunt icon pool.
 */
export const SHAPE_RING_ICON_NAMES = [
  'circle',
  'circle-dashed',
  'circle-half',
  'circle-half-tilt',
  'circle-notch',
  'target',
  'radio-button',
  'disc',
  'record',
  'dot',
  'dot-outline',
  'yin-yang',
] as const

const RING_ICON_SET = new Set<string>(SHAPE_RING_ICON_NAMES)

/**
 * Full Phosphor duotone catalog for Symbol Hunt, minus ring/disc glyphs
 * that collide with cancel answer circles.
 */
export const HUNT_ICON_ICONS: string[] = PHOSPHOR_DUOTONE_ICON_NAMES.filter(
  (name) => !RING_ICON_SET.has(name),
)

if (HUNT_ICON_ICONS.length < 1000) {
  throw new Error(
    `symbol-hunt phosphor pool too small: ${HUNT_ICON_ICONS.length}`,
  )
}
