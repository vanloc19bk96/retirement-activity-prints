export type HiddenMessageTone = 'funny' | 'heartfelt' | 'classy' | 'sassy'

/**
 * What the hidden message word search asks the content service for.
 *
 * Both bands are part of the request rather than something the page filters for
 * afterwards. The word band is the level's, and a pool written to a
 * three-to-eleven band comes back mostly unusable to a page whose grid is nine
 * cells across. The message band matters more here than it does anywhere else:
 * the leftover cells have to spell the saying exactly, so a saying five letters
 * longer than the page planned for is not a tight fit, it is an unusable one.
 *
 * Asking for both up front is what keeps one paid call enough.
 */
export interface HiddenMessageRequest {
  theme: string
  tone: HiddenMessageTone
  /** Candidates to write — far more than the page prints, so the packer has slack. */
  count: number
  minLetters: number
  maxLetters: number
  minMessageLetters: number
  maxMessageLetters: number
  seed: number
  /** When set, the model writes only the word pool and echoes this saying back. */
  customMessage?: string
  /** Sayings and words this seller's book has already printed for this theme. */
  avoid?: string[]
  locale?: string
}

export interface HiddenMessageResponse {
  message: string
  /** Display strings: spaces preserved for two-word entries. */
  words: string[]
}
