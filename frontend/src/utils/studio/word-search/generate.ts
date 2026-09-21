/**
 * Compatibility shims — placement engine lives in word-search-core;
 * the Studio template lives in retirement-word-search.
 */
export {
  buildWordSearch,
  sanitizeWords,
  sanitizeWordEntries,
  sanitizeWordEntry,
  resolveWordSearch,
  packingBudget,
  readWord,
  placementMatchesWord,
  countPuzzleMix,
  directionsForDifficulty,
  reverseWord,
} from '@/utils/puzzles/word-search-core'
export type {
  Placement,
  Dir,
  WordEntry,
  WordSearchPuzzle,
  WordSearchDifficulty,
} from '@/utils/puzzles/word-search-core'

export { wordSearchTemplate } from '../retirement-word-search/generate'
