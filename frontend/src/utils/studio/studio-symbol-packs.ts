import symbolPacksJson from '@/data/studio/symbols/index.json'

/**
 * Curated BMP glyph packs (print-safe).
 * Source: `data/studio/symbols/index.json` — regenerate via
 * `node scripts/build-studio-symbol-packs.mjs` after curation edits.
 */
export const DEFAULT_SYMBOL_PACK_KEY = 'mixed'

export interface StudioSymbolPackMeta {
  key: string
  label: string
  count: number
}

interface StudioSymbolPackRecord {
  key: string
  label: string
  count: number
  items: string[]
}

const PACKS = symbolPacksJson as StudioSymbolPackRecord[]

const PACK_BY_KEY = new Map(PACKS.map((pack) => [pack.key, pack]))

/** Force text (monochrome) presentation — avoids color-emoji fonts on KDP print. */
const TEXT_PRESENTATION = '\uFE0E'

/** Append U+FE0E so geometric glyphs stay ink, not color emoji. */
export function asPrintableSymbol(glyph: string): string {
  if (glyph.endsWith(TEXT_PRESENTATION)) return glyph
  return `${glyph}${TEXT_PRESENTATION}`
}

const MIXED_ITEMS = Array.from(
  new Set(PACKS.flatMap((pack) => pack.items.map(asPrintableSymbol))),
)

function assertPackCounts(): void {
  for (const pack of PACKS) {
    if (pack.items.length !== pack.count) {
      throw new Error(
        `Symbol pack "${pack.key}" count mismatch: declared ${pack.count}, got ${pack.items.length}`,
      )
    }
  }
}

assertPackCounts()

export function listSymbolPacks(): StudioSymbolPackMeta[] {
  return [
    { key: DEFAULT_SYMBOL_PACK_KEY, label: 'Mixed (all)', count: MIXED_ITEMS.length },
    ...PACKS.map(({ key, label, count }) => ({ key, label, count })),
  ]
}

/** All curated glyphs, deduped across packs — default pool for random sampling. */
export function getAllSymbolItems(): string[] {
  return MIXED_ITEMS
}

export function getSymbolPackItems(key: string): string[] {
  if (key === DEFAULT_SYMBOL_PACK_KEY) {
    return MIXED_ITEMS
  }

  const pack = PACK_BY_KEY.get(key)
  if (!pack) {
    throw new Error(`Unknown symbol pack: ${key}`)
  }
  return pack.items.map(asPrintableSymbol)
}
