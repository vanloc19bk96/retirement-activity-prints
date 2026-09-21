export type CryptogramSayingLength = 'short' | 'medium' | 'long'

export interface CryptogramRequest {
  theme: string
  itemCount: number
  length: CryptogramSayingLength
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface CryptogramResponse {
  /** Uppercase A–Z sayings with single spaces. */
  items: string[]
}
