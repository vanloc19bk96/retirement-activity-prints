/** Public surface of the magic-square engine — construction, values, carving. */

export type {
  MagicOrder,
  MagicDifficulty,
  MagicNumberSet,
  MagicOperation,
  MagicValuedSquare,
  MagicPuzzle,
} from './types'

export {
  emptyMask,
  allCells,
  countBlanks,
  lineCells,
  lineTotal,
  normalConstant,
  magicConstant,
  magicProduct,
  isMagic,
  isMagicUnder,
  isPermutationOfRange,
  allValuesDistinct,
} from './grid'

export {
  MAGIC_ORDERS,
  BANK_ORDERS,
  siameseOddSquare,
  doublyEvenSquare,
  parametricOddSquare,
  parametricLayerGrids,
  magicLayers,
  diagonalLatinSpecs,
  bankLayers,
  supportsBank,
  searchMagicSquare,
  luxSinglyEvenSquare,
  applyRandomSymmetry,
  buildBaseSquare,
  buildMagicSquare,
} from './construct'
export type { BankLayers } from './construct'

export {
  MULTIPLY_ORDERS,
  supportsMultiply,
  supportsMixed,
  rollMapping,
  buildValuedSquare,
  multiplySpecProduct,
  pickMultiplySpecForVariety,
} from './values'
export type { MagicMapping } from './values'

export { solvableByElimination, countMagicSolutions } from './solver'

export { DIFF_BLANKS, carveBlanks } from './carve'
export type { CarveOptions } from './carve'

export { buildMagicPuzzle, gridVarietyLabel } from './puzzle'
export type { BuildPuzzleOptions } from './puzzle'
