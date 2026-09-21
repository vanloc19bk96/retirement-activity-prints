export const SAFETY_LINE =
  "Skip any question you'd rather not answer. There are no wrong answers here"

const PUNCT = /[^\p{L}\p{N}\s]/gu

/** Lowercase + strip punctuation for near-duplicate detection. */
export function normalizePromptKey(prompt: string): string {
  return prompt
    .toLocaleLowerCase('en')
    .replace(PUNCT, '')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
}

/** Drop near-duplicates while preserving first-seen order. */
export function dedupePrompts(prompts: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of prompts) {
    const prompt = raw.trim()
    if (!prompt) continue
    const key = normalizePromptKey(prompt)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(prompt)
  }
  return out
}
