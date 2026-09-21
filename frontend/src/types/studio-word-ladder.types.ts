export interface WordLadderRequest {
  theme: string
  /** Both end words must be exactly this long to be joinable at all. */
  wordLength: number
  /** Moves from top to bottom — also the furthest two end words can be apart. */
  steps: number
  pairCount: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface WordLadderPairPayload {
  /** Uppercase A–Z, `wordLength` letters. */
  start: string
  target: string
  /**
   * The model's suggested chain, start and target included. Already checked
   * server-side for shape (one letter per move); empty when it did not hold up,
   * and still unchecked against the dictionary.
   */
  path: string[]
}

export interface WordLadderResponse {
  pairs: WordLadderPairPayload[]
}
