export interface StudioRng {
  next(): number
  int(min: number, max: number): number
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  shuffle<T>(items: readonly T[]): T[]
  sample<T>(items: readonly T[], n: number): T[]
}

/** mulberry32 — small, fast, good enough for layout. */
export function createRng(seed: number): StudioRng {
  let s = (seed >>> 0) || 1

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1))

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => items[int(0, items.length - 1)],
    shuffle,
    sample: (items, n) => shuffle(items).slice(0, Math.min(n, items.length)),
  }
}

/** Derives a sub-seed so page 2 of a spread differs from page 1 but stays deterministic. */
export function deriveSeed(seed: number, salt: string): number {
  let h = seed >>> 0
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0
  }
  return h || 1
}
