/** One SVG uploaded in Components → SVG (client-only session state). */
export interface UploadedSvg {
  id: string
  fileName: string
  /** Raw SVG markup (UTF-8). */
  svgText: string
  /** `data:image/svg+xml;base64,…` for preview + Fabric image src. */
  dataUri: string
}
