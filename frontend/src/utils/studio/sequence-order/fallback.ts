import type {
  SequenceResponse,
  SequenceSet,
  SequenceType,
} from '@/types/studio-sequence.types'
import fallbackBank from '@/data/studio/sequences/fallback.json'
import { createRng } from '../studio-rng'

interface FallbackEntry {
  sequenceType: SequenceType
  title?: string
  items: Array<{ text: string }>
}

const BANK = fallbackBank as FallbackEntry[]

function asType(value: unknown): SequenceType {
  if (
    value === 'steps' ||
    value === 'story' ||
    value === 'everyday' ||
    value === 'arbitrary'
  ) {
    return value
  }
  return 'arbitrary'
}

function toSet(entry: FallbackEntry, itemCount: number): SequenceSet {
  const items = entry.items.slice(0, itemCount).map((i) => ({ text: i.text }))
  return entry.title ? { title: entry.title, items } : { items }
}

/** Hand-checked bank for curated mode and API outage fallback. */
export function resolveSequenceFallback(
  sequenceType: unknown,
  itemCount: number,
  sequenceCount: number,
  seed: number,
): SequenceResponse {
  const type = asType(sequenceType)
  const count = Math.min(40, Math.max(1, Math.floor(sequenceCount)))
  const items = Math.min(8, Math.max(4, Math.floor(itemCount)))

  const matches = BANK.filter(
    (e) => e.sequenceType === type && e.items.length >= items,
  )
  const pool = matches.length > 0 ? matches : BANK.filter((e) => e.items.length >= items)
  const source = pool.length > 0 ? pool : BANK

  const rng = createRng(seed)
  const shuffled = rng.shuffle(source)
  const sequences: SequenceSet[] = []
  for (let i = 0; i < count; i++) {
    const entry = shuffled[i % shuffled.length]
    sequences.push(toSet(entry, Math.min(items, entry.items.length)))
  }
  return { sequences }
}
