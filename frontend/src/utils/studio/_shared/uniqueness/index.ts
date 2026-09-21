/** Public surface of the Uniqueness Engine (§4). */

export {
  hmacSha256,
  hmacSha256Hex,
  sha256Bytes,
  sha256Hex,
  toHex,
  utf8Bytes,
} from './sha256'
export {
  STUDIO_SALT_BYTES,
  createRngFromBytes,
  createRngFromSeedInput,
  deriveSeedBytes,
  deriveSeedHex,
  resolveOwnerSalt,
  stableConfigHash,
  studioCardRng,
  studioPuzzleRng,
  type DeriveSeedInput,
} from './seed'
export {
  canonicalGridForm,
  canonicalSequenceForm,
  canonicalSetForm,
  composeCanonicalForm,
  gridSymmetries,
  type CellSerialiser,
} from './canonical'
export {
  CANONICAL_HASH_HEX_LENGTH,
  STUDIO_CANONICAL_KEY,
  canonicalHash,
  canonicalKeyData,
} from './hash'
export {
  CANONICAL_HARD_LIMIT,
  CANONICAL_RESAMPLE_ATTEMPTS,
  CanonicalLedger,
  StudioUniquenessError,
  resolveUniquePuzzle,
  type UniquePuzzleAttempt,
  type UniquePuzzleResult,
} from './ledger'
export {
  BANNED_DECK_BRANDS,
  BANNED_GAMBLING_TERMS,
  MIN_PHRASING_VARIANTS,
  findBannedTerm,
  pickPhrase,
  poolForMode,
  type PhrasingPool,
} from './phrasing'
export {
  cardPageStyleToken,
  figureLabel,
  pickCardPageStyle,
  type CardAnswerAffordance,
  type CardDividerStyle,
  type CardInstructionPlacement,
  type CardLabelStyle,
  type CardPageStyle,
  type CardPageStyleAxes,
} from './page-style'
export {
  STUDIO_ENTROPY_FLOOR_BITS,
  birthdayEstimateBits,
  combineFigureEntropyBits,
  entropyFloorMessage,
  entropyReport,
  log2Choose,
  log2Factorial,
  log2Pow,
  type EntropyReport,
} from './entropy'
