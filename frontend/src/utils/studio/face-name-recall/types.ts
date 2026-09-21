export interface FaceAsset {
  /** DiceBear seed used — stored so the face can be regenerated identically. */
  faceSeed: string
  /** Monochrome SVG string (already color-stripped). */
  svg: string
  /** Data-URI form for embedding as a Fabric image (PNG in browser, SVG in tests). */
  dataUri: string
  /** Pixel size of `dataUri` (width = height). Used for Fabric scaleX/scaleY. */
  naturalSize: number
}

export interface FaceNamePrefetchResult {
  faces: FaceAsset[]
  names: string[]
}

/** DiceBear Open Peeps option set + seed used for distinctness. */
export interface FaceSpec {
  faceSeed: string
  options: Record<string, unknown>
}
