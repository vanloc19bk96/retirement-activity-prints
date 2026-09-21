import { createAvatar } from '@dicebear/core'
import { openPeeps } from '@dicebear/collection'
import { toMonochromeSvg } from './monochrome'
import { faceSpecFromMix, type FaceMixEntry } from './face-specs'
import type { FaceSpec } from './types'

/**
 * Open Peeps draws a whole standing person inside a 704×704 frame; arms and
 * hands sit far below it and are only hidden by the frame. We reframe to a
 * head-and-shoulders portrait: square, horizontally centred on the head, and
 * cut just under the collar line (the clothing starts at y≈585). Measured
 * against every curated head so no hairstyle loses more than the frame already
 * cropped.
 */
export const FACE_VIEW_BOX = { x: 32, y: 0, size: 640 } as const

/** Strip DiceBear RDF metadata — unused for print and can confuse some SVG parsers. */
export function stripSvgMetadata(svg: string): string {
  return svg.replace(/<metadata[\s\S]*?<\/metadata>/i, '')
}

/**
 * Reframe to the bust crop and give the root an intrinsic size — an `<img>`
 * (and Fabric) size a viewBox-only SVG inconsistently.
 */
export function cropFaceSvgToBust(svg: string): string {
  const { x, y, size } = FACE_VIEW_BOX
  return svg.replace(
    /<svg\s/,
    `<svg width="${size}" height="${size}" `,
  ).replace('viewBox="0 0 704 704"', `viewBox="${x} ${y} ${size} ${size}"`)
}

/** Draw one spec as the same black-and-white line art the printed page uses. */
export function renderFaceSvg(spec: FaceSpec): string {
  const avatar = createAvatar(openPeeps, { seed: spec.faceSeed, ...spec.options })
  return cropFaceSvgToBust(toMonochromeSvg(stripSvgMetadata(avatar.toString())))
}

/** Live preview / thumbnail for a hand-mixed face. */
export function renderFaceMixSvg(entry: FaceMixEntry): string {
  return renderFaceSvg(faceSpecFromMix(entry))
}

/**
 * `<img src>` form of an SVG. Percent-encoded rather than base64 so it stays
 * safe for the non-ASCII characters DiceBear can emit.
 */
export function svgToImgSrc(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
