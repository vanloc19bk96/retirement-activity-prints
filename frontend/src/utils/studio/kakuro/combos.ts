/** Precomputed Kakuro blocks: (length, sum) → digit combinations. */

const COMBO_TABLE: number[][][][] = Array.from({ length: 10 }, () =>
  Array.from({ length: 46 }, () => [] as number[][]),
)

function buildTable(): void {
  function walk(start: number, path: number[]): void {
    if (path.length >= 2) {
      const sum = path.reduce((a, b) => a + b, 0)
      COMBO_TABLE[path.length]![sum]!.push([...path])
    }
    if (path.length >= 9) return
    for (let d = start; d <= 9; d++) {
      path.push(d)
      walk(d + 1, path)
      path.pop()
    }
  }
  walk(1, [])
}

buildTable()

export function combosFor(length: number, sum: number): readonly number[][] {
  if (length < 2 || length > 9 || sum < 0 || sum > 45) return []
  return COMBO_TABLE[length]![sum] ?? []
}

/** Digits still available in a run given already-placed values. */
export function remainingDigitsForRun(
  runLength: number,
  runSum: number,
  placed: number[],
): number {
  let mask = 0
  const placedSet = new Set(placed)
  if (placedSet.size !== placed.length) return 0

  for (const combo of combosFor(runLength, runSum)) {
    let ok = true
    for (const d of placed) {
      if (!combo.includes(d)) {
        ok = false
        break
      }
    }
    if (!ok) continue
    for (const d of combo) {
      if (!placedSet.has(d)) mask |= 1 << d
    }
  }
  return mask
}
