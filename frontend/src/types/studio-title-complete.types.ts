export type TitleCompleteCategory = 'songs' | 'films' | 'tv' | 'mixed'

export type TitleItemCategory = 'song' | 'film' | 'tv'

/** Preset values shown in the Era select (custom era accepts any decade label). */
export type TitleCompletePresetEra =
  | '1950s'
  | '1960s'
  | '1970s'
  | '1980s'
  | '1990s'
  | '2000s'
  | 'any'

/** @deprecated Use TitleCompletePresetEra — request era is a free-form decade label or "any". */
export type TitleCompleteEra = TitleCompletePresetEra

export type TitleCompleteDifficulty = 'easy' | 'standard'

export interface TitleCompleteRequest {
  /** Preset key, or a short custom focus phrase (e.g. "Broadway musicals"). */
  category: TitleCompleteCategory | string
  /** Preset decade, "any", or a custom decade label like "2010s". */
  era?: string
  difficulty: TitleCompleteDifficulty
  itemCount: number
  seed: number
  /** Recently printed labels for this template + theme; the model is told not to reuse them. */
  avoid?: string[]
  locale?: string
}

export interface TitleItem {
  displayTitle: string
  answer: string
  fullTitle: string
  category: TitleItemCategory
  year?: number
}

export interface TitleCompleteResponse {
  items: TitleItem[]
}

/** Bank entry before blanking (curated JSON). */
export interface TitleBankEntry {
  fullTitle: string
  answer: string
  category: TitleItemCategory
  year?: number
  era?: string
}
