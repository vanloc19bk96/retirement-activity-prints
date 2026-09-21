export type FaceNameGender = 'male' | 'female' | 'neutral'
export type FaceNameStyle = 'first' | 'full'

export interface FaceNameRequest {
  count: number
  nameStyle: FaceNameStyle
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface FaceNameItem {
  first: string
  last?: string
  gender: FaceNameGender
}

export interface FaceNameResponse {
  names: FaceNameItem[]
}
