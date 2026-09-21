import topologiesJson from '@/data/studio/kakuro/topologies.json'

export type KakuroCellKind = 'white' | 'black'
export type KakuroSizeBucket = 'small' | 'medium' | 'large'

export interface KakuroTopology {
  id: string
  size: number
  cells: KakuroCellKind[][]
  difficulty: KakuroSizeBucket
}

interface RawTopology {
  id: string
  size: number
  difficulty: KakuroSizeBucket
  rows: string[]
}

function parseCells(rows: string[], size: number, id: string): KakuroCellKind[][] {
  if (rows.length !== size) {
    throw new Error(`Kakuro topology ${id}: row count ${rows.length} !== size ${size}`)
  }
  return rows.map((row, r) => {
    if (row.length !== size) {
      throw new Error(`Kakuro topology ${id}: row ${r} length ${row.length} !== ${size}`)
    }
    return [...row].map((ch, c) => {
      if (ch === 'W') return 'white'
      if (ch === 'B') return 'black'
      throw new Error(`Kakuro topology ${id}: invalid cell '${ch}' at (${r},${c})`)
    })
  })
}

/**
 * Drop empty black bands around the puzzle. Keeps one black strip above/left
 * for clue cells. Result stays square (pad with black, content centered).
 */
function trimToContent(cells: KakuroCellKind[][]): KakuroCellKind[][] {
  const size = cells.length
  let minR = size
  let maxR = -1
  let minC = size
  let maxC = -1

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (cells[r]![c] !== 'white') continue
      if (r < minR) minR = r
      if (r > maxR) maxR = r
      if (c < minC) minC = c
      if (c > maxC) maxC = c
    }
  }

  if (maxR < 0) return cells

  minR = Math.max(0, minR - 1)
  minC = Math.max(0, minC - 1)

  const height = maxR - minR + 1
  const width = maxC - minC + 1
  const newSize = Math.max(height, width)
  // Center the crop inside the square so draw/snap centers the visual puzzle.
  const offsetR = Math.floor((newSize - height) / 2)
  const offsetC = Math.floor((newSize - width) / 2)

  const next: KakuroCellKind[][] = Array.from({ length: newSize }, () =>
    Array.from({ length: newSize }, () => 'black' as KakuroCellKind),
  )

  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      next[offsetR + r]![offsetC + c] = cells[minR + r]![minC + c]!
    }
  }

  return next
}

const ALL: KakuroTopology[] = (topologiesJson as { topologies: RawTopology[] }).topologies.map(
  (raw) => {
    const cells = trimToContent(parseCells(raw.rows, raw.size, raw.id))
    return {
      id: raw.id,
      size: cells.length,
      difficulty: raw.difficulty,
      cells,
    }
  },
)

const BY_BUCKET: Record<KakuroSizeBucket, KakuroTopology[]> = {
  small: ALL.filter((t) => t.difficulty === 'small'),
  medium: ALL.filter((t) => t.difficulty === 'medium'),
  large: ALL.filter((t) => t.difficulty === 'large'),
}

export function loadTopologies(bucket: KakuroSizeBucket): KakuroTopology[] {
  const list = BY_BUCKET[bucket]
  if (!list?.length) {
    throw new Error(`No Kakuro topologies for bucket "${bucket}"`)
  }
  return list
}

export function allKakuroTopologies(): readonly KakuroTopology[] {
  return ALL
}

export function countWhiteCells(topology: KakuroTopology): number {
  let n = 0
  for (const row of topology.cells) {
    for (const kind of row) if (kind === 'white') n++
  }
  return n
}
