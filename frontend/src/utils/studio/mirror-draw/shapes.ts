import type { StudioRng } from '../studio-rng'
import {
  drawApple,
  drawBell,
  drawBoat,
  drawButterfly,
  drawCandle,
  drawCat,
  drawCloud,
  drawCrown,
  drawCup,
  drawDiamond,
  drawDuck,
  drawFace,
  drawFish,
  drawFlower,
  drawHeart,
  drawHouse,
  drawKite,
  drawLeaf,
  drawMountain,
  drawMushroom,
  drawOwl,
  drawRabbit,
  drawRocket,
  drawStar,
  drawSwan,
  drawTree,
  drawVase,
} from './shape-drawers'
import type { Bitmap, GridSize, MirrorTheme } from './types'
import { MIRROR_THEMES } from './types'

export interface ShapeSpec {
  id: string
  theme: (typeof MIRROR_THEMES)[number]
  draw: (size: GridSize, rng: StudioRng) => Bitmap
}

export const SHAPE_CATALOG: ShapeSpec[] = [
  { id: 'heart', theme: 'objects', draw: drawHeart },
  { id: 'house', theme: 'objects', draw: drawHouse },
  { id: 'star', theme: 'objects', draw: drawStar },
  { id: 'cup', theme: 'objects', draw: drawCup },
  { id: 'boat', theme: 'objects', draw: drawBoat },
  { id: 'crown', theme: 'objects', draw: drawCrown },
  { id: 'rocket', theme: 'objects', draw: drawRocket },
  { id: 'diamond', theme: 'objects', draw: drawDiamond },
  { id: 'vase', theme: 'objects', draw: drawVase },
  { id: 'bell', theme: 'objects', draw: drawBell },
  { id: 'kite', theme: 'objects', draw: drawKite },
  { id: 'candle', theme: 'objects', draw: drawCandle },
  { id: 'face', theme: 'objects', draw: drawFace },
  { id: 'tree', theme: 'nature', draw: drawTree },
  { id: 'flower', theme: 'nature', draw: drawFlower },
  { id: 'mushroom', theme: 'nature', draw: drawMushroom },
  { id: 'apple', theme: 'nature', draw: drawApple },
  { id: 'leaf', theme: 'nature', draw: drawLeaf },
  { id: 'mountain', theme: 'nature', draw: drawMountain },
  { id: 'cloud', theme: 'nature', draw: drawCloud },
  { id: 'butterfly', theme: 'animals', draw: drawButterfly },
  { id: 'fish', theme: 'animals', draw: drawFish },
  { id: 'cat', theme: 'animals', draw: drawCat },
  { id: 'owl', theme: 'animals', draw: drawOwl },
  { id: 'swan', theme: 'animals', draw: drawSwan },
  { id: 'rabbit', theme: 'animals', draw: drawRabbit },
  { id: 'duck', theme: 'animals', draw: drawDuck },
]

export function shapesForTheme(theme: MirrorTheme): ShapeSpec[] {
  if (theme === 'mixed') return SHAPE_CATALOG
  return SHAPE_CATALOG.filter((s) => s.theme === theme)
}

/** Seeded themed left-half silhouette (already symmetric-ready). */
export function drawThemedHalf(
  size: GridSize,
  theme: MirrorTheme,
  rng: StudioRng,
): { half: Bitmap; shapeId: string } {
  const pool = shapesForTheme(theme)
  const shape = rng.pick(pool.length > 0 ? pool : SHAPE_CATALOG)
  return { half: shape.draw(size, rng), shapeId: shape.id }
}

export function passesHalfQuality(half: Bitmap, size: GridSize): boolean {
  const cells = size * (size / 2)
  const filled = half.flat().filter(Boolean).length
  return filled >= Math.max(4, Math.floor(cells * 0.08)) && filled <= Math.floor(cells * 0.85)
}
