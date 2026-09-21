export interface PictureRef {
  id: string
  /** Permanent public URL — never a signed/expiring link. */
  url: string
  name?: string | null
  /** Used for aspect-preserving Fabric scale (probed in prefetch when missing). */
  naturalWidth?: number | null
  naturalHeight?: number | null
}

export interface PictureSetRequest {
  targetCount: number
  distractorCount: number
  seed: number
}

export interface PictureSetResponse {
  targets: PictureRef[]
  /** Targets + distractors, pre-shuffled for the recall page. */
  options: PictureRef[]
}
