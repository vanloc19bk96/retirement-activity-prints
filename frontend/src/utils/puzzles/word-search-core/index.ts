export type {
  Dir,
  Placement,
  WordEntry,
  WordSearchDifficulty,
  WordSearchPuzzle,
} from './types'

export {
  buildWordSearch,
  countPuzzleMix,
  directionsForDifficulty,
  packingBudget,
  placementMatchesWord,
  readWord,
  resolveWordSearch,
  reverseWord,
  sanitizeWordEntries,
  sanitizeWordEntry,
  sanitizeWords,
} from './placement'

export {
  interleavedCandidateStarts,
  isBackwardsWrite,
  isDiagonalDir,
  isLongForDiagonal,
  meetsMix,
  mixScore,
  mixTargets,
} from './mix'
export type { PlacementMix, MixTargets } from './mix'

export {
  findAccidentalDuplicates,
  placementKey,
  placementsIntact,
} from './scan'

export { createRng, type StudioRng } from './rng'
