/** Public surface of the shared playing-card engine (§3). */

export * from './types'
export * from './deck'
export {
  CARD_BACK_FRAME_INSET,
  CARD_BACK_HATCH_PITCH_IN,
  MIN_CARD_WIDTH_PX,
  PIP_LAYOUT,
  RANK_CAP_HEIGHT_RATIO,
  RANK_CAP_TOP_RATIO,
  cardHeightForWidth,
  cardMetrics,
  cardWidthForHeight,
  courtPipCenters,
  deckPipSize,
  pipCenters,
  pipFieldBox,
  pipFieldSlack,
  pipSizeForRank,
  type CardBox,
  type CardMetrics,
  type PipAnchor,
} from './geometry'
export { suitGlyph, suitPolygons, type Pt, type SuitGlyph } from './suits'
export {
  MIN_COMPACT_CARD_WIDTH,
  renderBlankCard,
  renderCard,
  renderCompactCard,
  renderCardBack,
  renderCardWriteLabel,
  renderPartialCard,
  type CardRenderOptions,
  type CardWriteLabelOptions,
} from './render'
export {
  MIN_CARD_BAND_HEIGHT,
  MIN_LEGIBLE_CARD_WIDTH,
  arrangeCards,
  bestColumnCount,
  cardsFit,
  fitCardSizePreset,
  figureBands,
  fitFigureCount,
  maxCardBands,
  maxCardsInField,
  type ArrangeMode,
  type ArrangeOptions,
  type ArrangeResult,
  type CardSlot,
  type FigureBandOrientation,
  type FitOverrides,
} from './layout'
