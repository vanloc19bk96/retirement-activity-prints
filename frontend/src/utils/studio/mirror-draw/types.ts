export type Bitmap = boolean[][]

export type Axis = 'vertical' | 'horizontal' | 'both'
export type DrawStyle = 'pixel' | 'line'
export type PatternSource = 'library' | 'abstract'
export type MirrorTheme = 'mixed' | 'animals' | 'nature' | 'objects'
export type GridSize = 8 | 10 | 12 | 16

export interface Segment {
  r1: number
  c1: number
  r2: number
  c2: number
}

export interface HalfPattern {
  grid: Bitmap
  rows: number
  cols: number
}

export interface MirrorPattern {
  id: string
  name: string
  rows: number
  halfCols: number
  theme: string
  style: DrawStyle
  half: string[]
  segments?: Segment[]
}

export const MIRROR_GRID_SIZES = [8, 10, 12, 16] as const
export const MIRROR_THEMES = ['animals', 'nature', 'objects'] as const
