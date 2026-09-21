export interface FirstLetterRecallRequest {
  /** Uppercase A–Z letters to generate sample words for. */
  letters: string[]
  /** Sample answers must match printable answer lines (8–30). */
  lineCount: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface FirstLetterRecallResponse {
  /** Sample words keyed by uppercase letter. */
  byLetter: Record<string, string[]>
}
