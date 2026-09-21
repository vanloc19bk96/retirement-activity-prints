import type { StudioConfig } from '@/types/studio-template.types'
import type { StudioRng } from '../studio-rng'
import type { CrosswordPair } from './types'
import indexJson from '@/data/studio/crossword/index.json'
import animalsEn from '@/data/studio/crossword/animals-en.json'
import foodEn from '@/data/studio/crossword/food-en.json'
import natureEn from '@/data/studio/crossword/nature-en.json'
import householdEn from '@/data/studio/crossword/household-en.json'
import bodyEn from '@/data/studio/crossword/body-en.json'
import sportsEn from '@/data/studio/crossword/sports-en.json'
import travelEn from '@/data/studio/crossword/travel-en.json'
import schoolEn from '@/data/studio/crossword/school-en.json'
import musicEn from '@/data/studio/crossword/music-en.json'
import spaceEn from '@/data/studio/crossword/space-en.json'

export interface CrosswordThemeMeta {
  key: string
  label: string
  locale: string
  count: number
}

export type CrosswordDifficulty = 'easy' | 'medium' | 'hard'

interface RawEntry {
  word: string
  clue: string
}

const THEME_ENTRIES: Record<string, readonly RawEntry[]> = {
  animals: animalsEn as RawEntry[],
  food: foodEn as RawEntry[],
  nature: natureEn as RawEntry[],
  household: householdEn as RawEntry[],
  body: bodyEn as RawEntry[],
  sports: sportsEn as RawEntry[],
  travel: travelEn as RawEntry[],
  school: schoolEn as RawEntry[],
  music: musicEn as RawEntry[],
  space: spaceEn as RawEntry[],
}

const META_BY_KEY = new Map(
  (indexJson as CrosswordThemeMeta[]).map((entry) => [entry.key, entry]),
)

export function listCrosswordThemeMeta(): CrosswordThemeMeta[] {
  return indexJson as CrosswordThemeMeta[]
}

export function crosswordThemeLabel(key: string): string {
  return META_BY_KEY.get(key)?.label ?? 'Crossword'
}

export function loadThemeEntries(themeKey: string): CrosswordPair[] {
  const pool = THEME_ENTRIES[themeKey] ?? THEME_ENTRIES.animals
  return pool.map((e) => ({
    word: e.word.toUpperCase(),
    clue: String(e.clue).trim(),
  }))
}

export function lengthHintClue(word: string): string {
  return `${Array.from({ length: word.length }, () => '_').join(' ')} (${word.length} letters)`
}

function customWordLines(raw: unknown): string[] {
  const lines: string[] = Array.isArray(raw)
    ? raw.map((w) => String(w))
    : String(raw ?? '')
        .split('\n')
        .map((w) => w.trim())
  return lines.map((line) => line.trim()).filter(Boolean)
}

function splitWordClue(line: string): { wordPart: string; cluePart: string; hasSep: boolean } {
  const pipe = line.indexOf('|')
  const colon = line.indexOf(':')
  const sep =
    pipe >= 0 && (colon < 0 || pipe < colon)
      ? pipe
      : colon >= 0
        ? colon
        : -1
  if (sep < 0) return { wordPart: line, cluePart: '', hasSep: false }
  return {
    wordPart: line.slice(0, sep),
    cluePart: line.slice(sep + 1).trim(),
    hasSep: true,
  }
}

function normalizeAnswerWord(wordPart: string): string {
  return wordPart.toUpperCase().replace(/[^A-Z]/g, '')
}

/**
 * Blocking check for custom WORD | clue lines.
 * Bare answers without `|` / `:` are rejected so Add to book stays disabled.
 */
export function validateCustomWordLines(raw: unknown): string | null {
  const lines = customWordLines(raw)
  if (lines.length === 0) return null

  const seen = new Set<string>()
  for (const line of lines) {
    const { wordPart, hasSep } = splitWordClue(line)
    if (!hasSep) {
      return `“${line}” needs WORD | clue format (e.g. TIGER | Big striped cat).`
    }
    const word = normalizeAnswerWord(wordPart)
    if (word.length < 3 || word.length > 12) {
      return `“${line}” needs a 3–12 letter A–Z answer before the |.`
    }
    if (seen.has(word)) {
      return `“${word}” is listed more than once. Remove the duplicate.`
    }
    seen.add(word)
  }
  return null
}

/** Uppercase A–Z, length 3–12, deduped. Requires `WORD | clue` / `WORD: clue`. */
export function sanitizeCustomPairs(raw: unknown): CrosswordPair[] {
  const seen = new Set<string>()
  const out: CrosswordPair[] = []
  for (const line of customWordLines(raw)) {
    const { wordPart, cluePart, hasSep } = splitWordClue(line)
    if (!hasSep) continue
    const word = normalizeAnswerWord(wordPart)
    if (word.length < 3 || word.length > 12) continue
    if (seen.has(word)) continue
    seen.add(word)
    out.push({ word, clue: cluePart })
  }
  return out
}

const CUSTOM_THEME_MAX_LENGTH = 120

export function parseDifficulty(raw: unknown): CrosswordDifficulty {
  const v = String(raw ?? 'medium')
  if (v === 'easy' || v === 'medium' || v === 'hard') return v
  return 'medium'
}

/** Cap so the packer + clue lists can always honor the slider. */
export const CROSSWORD_WORD_COUNT_MIN = 6
export const CROSSWORD_WORD_COUNT_MAX = 15
export const CROSSWORD_WORD_COUNT_DEFAULT = 14

/**
 * Reliable ceiling for typed custom lists (interlocking + clue-band layout).
 * Theme slider stays at 15; custom may use a larger 19×19 canvas up to this cap.
 * Above ~22, clue lists start clipping on the page.
 */
export const CROSSWORD_CUSTOM_WORDS_MAX = 20

/**
 * Hard limit for one printable crossword.
 * `validateConfig` surfaces this; resolve also slices to it.
 */
export function packingBudget(): number {
  return CROSSWORD_CUSTOM_WORDS_MAX
}

export function parseWordCount(raw: unknown): number {
  const n = Number(raw ?? CROSSWORD_WORD_COUNT_DEFAULT)
  if (!Number.isFinite(n)) return CROSSWORD_WORD_COUNT_DEFAULT
  return Math.min(
    CROSSWORD_WORD_COUNT_MAX,
    Math.max(CROSSWORD_WORD_COUNT_MIN, Math.round(n)),
  )
}

/** Non-empty raw lines from the custom word list field. */
export function rawCustomWordLines(raw: unknown): string[] {
  return customWordLines(raw)
}

/** Extra candidates so the packer can swap words that will not interlock. */
export function candidatePoolSize(wordCount: number): number {
  const extra = Math.min(8, Math.max(4, Math.ceil(wordCount * 0.5)))
  return wordCount + extra
}

/** Letter bounds for AI theme-word generation. */
export function letterBoundsForDifficulty(
  difficulty: CrosswordDifficulty,
): { min: number; max: number } {
  if (difficulty === 'easy') return { min: 3, max: 6 }
  if (difficulty === 'hard') return { min: 5, max: 12 }
  return { min: 3, max: 10 }
}

/** Own typed word list (not AI theme). */
export function isCustomWords(config: StudioConfig): boolean {
  return String(config.source ?? 'theme') === 'custom'
}

/** Preset theme off → AI generates words from a typed theme phrase. */
export function isCustomAiTheme(config: StudioConfig): boolean {
  return config.customTheme === true && !isCustomWords(config)
}

export function resolveCustomThemeText(config: StudioConfig): string {
  return String(config.customThemeText ?? '')
    .trim()
    .slice(0, CUSTOM_THEME_MAX_LENGTH)
}

export function customThemeTitle(config: StudioConfig): string {
  const raw = resolveCustomThemeText(config)
  if (!raw) return ''
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export { CUSTOM_THEME_MAX_LENGTH }

function lengthScore(word: string, difficulty: CrosswordDifficulty): number {
  const len = word.length
  if (difficulty === 'easy') {
    if (len <= 5) return 3
    if (len <= 7) return 1
    return 0
  }
  if (difficulty === 'hard') {
    // Prefer longer answers, but keep mid-length words so the grid can interlock.
    if (len >= 7 && len <= 10) return 3
    if (len >= 5) return 2
    return 1
  }
  if (len >= 4 && len <= 8) return 2
  return 1
}

function sampleThemePairs(
  themeKey: string,
  wordCount: number,
  difficulty: CrosswordDifficulty,
  rng: StudioRng,
): CrosswordPair[] {
  const pool = loadThemeEntries(themeKey).filter(
    (e) => e.word.length >= 3 && e.word.length <= 12 && e.clue.length > 0,
  )
  if (pool.length === 0) return []

  // Weighted sample: prefer difficulty-appropriate lengths, then shuffle.
  const scored = pool.map((e) => ({
    entry: e,
    score: lengthScore(e.word, difficulty) + rng.next() * 0.01,
  }))
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, Math.min(pool.length, wordCount * 3)).map((s) => s.entry)
  return rng.sample(top, Math.min(candidatePoolSize(wordCount), top.length))
}

/**
 * Local fallback pairs (bundled themes / typed custom words).
 * Live generation prefers AI via prefetch → `ctx.remoteData`.
 */
export function resolveWordsAndClues(config: StudioConfig, rng: StudioRng): CrosswordPair[] {
  const difficulty = parseDifficulty(config.difficulty)

  if (isCustomWords(config)) {
    const custom = sanitizeCustomPairs(config.words).slice(0, packingBudget())
    return custom.map((p) => ({
      word: p.word,
      clue: p.clue || lengthHintClue(p.word),
    }))
  }

  return sampleThemePairs(
    String(config.theme ?? 'animals'),
    parseWordCount(config.wordCount),
    difficulty,
    rng,
  )
}

export function mergeClues(
  pairs: CrosswordPair[],
  aiClues: { word: string; clue: string }[] | undefined,
): CrosswordPair[] {
  if (!aiClues?.length) return pairs
  const byWord = new Map(
    aiClues.map((c) => [c.word.toUpperCase().replace(/[^A-Z]/g, ''), String(c.clue).trim()]),
  )
  return pairs.map((p) => {
    const ai = byWord.get(p.word)
    if (!ai) return p
    // Drop clues that echo the answer word.
    if (ai.toUpperCase().includes(p.word)) return p
    return { word: p.word, clue: ai }
  })
}
