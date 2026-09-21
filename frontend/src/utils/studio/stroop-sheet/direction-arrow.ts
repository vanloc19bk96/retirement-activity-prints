import type { StudioFabricObject } from '@/types/studio-template.types'
import { buildPolygon, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_INK } from '@/constants/studio.constants'

export type StroopDirection = 'up' | 'down' | 'left' | 'right'

const DIRECTIONS: readonly StroopDirection[] = ['up', 'down', 'left', 'right']

export function isStroopDirection(value: string): value is StroopDirection {
  return (DIRECTIONS as readonly string[]).includes(value)
}

/** Slot width reserved beside the word for a path arrow. */
export function directionArrowSlot(promptSize: number): number {
  return Math.round(promptSize * 1.15)
}

/**
 * Filled arrow polygon — geometry survives PDF/SVG outline export.
 * Unicode ↑↓←→ differ in the editor (font fallback) vs download (ASCII stand-ins).
 */
export function buildDirectionArrow(
  left: number,
  top: number,
  size: number,
  direction: StroopDirection,
  tag: StudioTag,
  role: 'prompt' | 'decoration' = 'prompt',
): StudioFabricObject {
  const radius = Math.max(4, size * 0.42)
  return buildPolygon(
    {
      left,
      top,
      points: arrowPointsFor(direction, radius),
      fill: STUDIO_INK,
      stroke: 'transparent',
      strokeWidth: 0,
    },
    tag,
    role,
  )
}

function arrowPointsFor(
  direction: StroopDirection,
  radius: number,
): { x: number; y: number }[] {
  const shaft = radius * 0.28
  const head = radius * 0.72
  // Tip up from origin — rotate for the other three directions.
  const up = [
    { x: 0, y: -radius },
    { x: head, y: -radius * 0.05 },
    { x: shaft, y: -radius * 0.05 },
    { x: shaft, y: radius },
    { x: -shaft, y: radius },
    { x: -shaft, y: -radius * 0.05 },
    { x: -head, y: -radius * 0.05 },
  ]
  if (direction === 'up') return up
  if (direction === 'down') return rotatePoints(up, Math.PI)
  if (direction === 'left') return rotatePoints(up, -Math.PI / 2)
  return rotatePoints(up, Math.PI / 2)
}

function rotatePoints(
  points: { x: number; y: number }[],
  angle: number,
): { x: number; y: number }[] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return points.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }))
}
