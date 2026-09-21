import type React from 'react'
import { Circle, Square, Triangle } from 'lucide-react'
import { setShapeDragData, type ShapeType } from '@/utils/shape-dnd'

type IconPoint = { x: number; y: number }

const VIEWBOX_SIZE = 24
const ICON_PADDING = 2

const toIconPointString = (points: IconPoint[]): string => {
  if (points.length === 0) return ''

  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y

  points.forEach((point) => {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  })

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  let maxOffsetX = 0
  let maxOffsetY = 0

  points.forEach((point) => {
    const offsetX = Math.abs(point.x - centerX)
    const offsetY = Math.abs(point.y - centerY)
    if (offsetX > maxOffsetX) maxOffsetX = offsetX
    if (offsetY > maxOffsetY) maxOffsetY = offsetY
  })

  const availableRadius = VIEWBOX_SIZE / 2 - ICON_PADDING
  const scale = availableRadius / Math.max(maxOffsetX || 1, maxOffsetY || 1)

  return points
    .map((point) => {
      const x = VIEWBOX_SIZE / 2 + (point.x - centerX) * scale
      const y = VIEWBOX_SIZE / 2 + (point.y - centerY) * scale
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

const createStarPoints = (numPoints: number, outerRadius: number, innerRadius: number): IconPoint[] => {
  const points: IconPoint[] = []
  const step = Math.PI / numPoints
  for (let i = 0; i < numPoints * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const angle = i * step - Math.PI / 2
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return points
}

const createRegularPolygonPoints = (sides: number, radius: number): IconPoint[] => {
  const points: IconPoint[] = []
  const angleStep = (2 * Math.PI) / sides
  for (let i = 0; i < sides; i += 1) {
    const angle = i * angleStep - Math.PI / 2
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return points
}

const regularPolygonIconPoints = (sides: number): string => {
  return toIconPointString(createRegularPolygonPoints(sides, 50))
}

const star5IconPoints = toIconPointString(createStarPoints(5, 50, 25))
const star6IconPoints = toIconPointString(createStarPoints(6, 50, 25))
const star4IconPoints = toIconPointString(createStarPoints(4, 50, 20))
const star8IconPoints = toIconPointString(createStarPoints(8, 50, 30))
const diamondIconPoints = toIconPointString([
  { x: 0, y: -50 },
  { x: 50, y: 0 },
  { x: 0, y: 50 },
  { x: -50, y: 0 },
])
const trapezoidIconPoints = toIconPointString([
  { x: -30, y: -40 },
  { x: 30, y: -40 },
  { x: 50, y: 40 },
  { x: -50, y: 40 },
])
const parallelogramIconPoints = toIconPointString([
  { x: -30, y: -40 },
  { x: 30, y: -40 },
  { x: 50, y: 40 },
  { x: -10, y: 40 },
])
const rhombusIconPoints = toIconPointString([
  { x: 0, y: -50 },
  { x: 40, y: 0 },
  { x: 0, y: 50 },
  { x: -40, y: 0 },
])
const kiteIconPoints = toIconPointString([
  { x: 0, y: -50 },
  { x: 30, y: 0 },
  { x: 0, y: 50 },
  { x: -30, y: 0 },
])
const rightTriangleIconPoints = toIconPointString([
  { x: -40, y: -40 },
  { x: -40, y: 40 },
  { x: 40, y: 40 },
])

type ShapeElement = {
  type: ShapeType
  label: string
  icon: React.ReactNode
}

const shapeElements: ShapeElement[] = [
  {
    type: 'line',
    label: 'Line',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    ),
  },
  {
    type: 'arrow',
    label: 'Arrow',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12H20" />
        <path d="M20 12L16 8" />
        <path d="M20 12L16 16" />
      </svg>
    ),
  },
  { type: 'rectangle', label: 'Rectangle', icon: <Square className="h-6 w-6" /> },
  { type: 'circle', label: 'Circle', icon: <Circle className="h-6 w-6" /> },
  {
    type: 'ellipse',
    label: 'Ellipse',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <ellipse cx="12" cy="12" rx="8" ry="5" />
      </svg>
    ),
  },
  { type: 'triangle', label: 'Triangle', icon: <Triangle className="h-6 w-6" /> },
  {
    type: 'star',
    label: 'Star 5',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={star5IconPoints} />
      </svg>
    ),
  },
  {
    type: 'star6',
    label: 'Star 6',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={star6IconPoints} />
      </svg>
    ),
  },
  {
    type: 'heart',
    label: 'Heart',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 50,30 C 50,20 40,10 30,10 C 20,10 10,20 10,30 C 10,45 25,60 50,80 C 75,60 90,45 90,30 C 90,20 80,10 70,10 C 60,10 50,20 50,30 Z" />
      </svg>
    ),
  },
  {
    type: 'cloud',
    label: 'Cloud',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 25,60 Q 10,60 10,45 Q 10,30 25,30 Q 25,15 40,15 Q 55,15 55,30 Q 70,30 70,45 Q 70,60 55,60 Z" />
      </svg>
    ),
  },
  {
    type: 'diamond',
    label: 'Diamond',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={diamondIconPoints} />
      </svg>
    ),
  },
  {
    type: 'pentagon',
    label: 'Pentagon',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={regularPolygonIconPoints(5)} />
      </svg>
    ),
  },
  {
    type: 'hexagon',
    label: 'Hexagon',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={regularPolygonIconPoints(6)} />
      </svg>
    ),
  },
  {
    type: 'octagon',
    label: 'Octagon',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={regularPolygonIconPoints(8)} />
      </svg>
    ),
  },
  {
    type: 'trapezoid',
    label: 'Trapezoid',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={trapezoidIconPoints} />
      </svg>
    ),
  },
  {
    type: 'parallelogram',
    label: 'Parallelogram',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={parallelogramIconPoints} />
      </svg>
    ),
  },
  {
    type: 'cross',
    label: 'Cross',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="10" strokeLinejoin="round">
        <path d="M 30,0 L 70,0 L 70,30 L 100,30 L 100,70 L 70,70 L 70,100 L 30,100 L 30,70 L 0,70 L 0,30 L 30,30 Z" />
      </svg>
    ),
  },
  {
    type: 'crescent',
    label: 'Crescent',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 80,50 A 35,35 0 1,1 50,15 A 25,25 0 1,0 50,85 A 35,35 0 0,1 80,50 Z" />
      </svg>
    ),
  },
  {
    type: 'heptagon',
    label: 'Heptagon',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={regularPolygonIconPoints(7)} />
      </svg>
    ),
  },
  {
    type: 'nonagon',
    label: 'Nonagon',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={regularPolygonIconPoints(9)} />
      </svg>
    ),
  },
  {
    type: 'decagon',
    label: 'Decagon',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={regularPolygonIconPoints(10)} />
      </svg>
    ),
  },
  {
    type: 'star4',
    label: 'Star 4',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={star4IconPoints} />
      </svg>
    ),
  },
  {
    type: 'star8',
    label: 'Star 8',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={star8IconPoints} />
      </svg>
    ),
  },
  {
    type: 'rhombus',
    label: 'Rhombus',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={rhombusIconPoints} />
      </svg>
    ),
  },
  {
    type: 'kite',
    label: 'Kite',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={kiteIconPoints} />
      </svg>
    ),
  },
  {
    type: 'chevron',
    label: 'Chevron',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M 6 4 L 12 12 L 6 20" />
        <path d="M 12 4 L 18 12 L 12 20" />
      </svg>
    ),
  },
  {
    type: 'rightTriangle',
    label: 'Right Triangle',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <polygon points={rightTriangleIconPoints} />
      </svg>
    ),
  },
  {
    type: 'semicircle',
    label: 'Semicircle',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M 4 14 A 8 8 0 0 1 20 14 L 4 14 Z" />
      </svg>
    ),
  },
  {
    type: 'quarterCircle',
    label: 'Quarter Circle',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M 4 20 L 4 8 A 12 12 0 0 1 16 20 L 4 20 Z" />
      </svg>
    ),
  },
  {
    type: 'ring',
    label: 'Ring',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
      </svg>
    ),
  },
  {
    type: 'arc',
    label: 'Arc',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M 4 18 A 10 10 0 0 1 20 18" />
      </svg>
    ),
  },
  {
    type: 'sector',
    label: 'Sector',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M 12 12 L 12 3 A 9 9 0 0 1 20 16 L 12 12 Z" />
      </svg>
    ),
  },
  {
    type: 'plus',
    label: 'Plus',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="4" y1="12" x2="20" y2="12" />
      </svg>
    ),
  },
  {
    type: 'xShape',
    label: 'X Shape',
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="4" y1="4" x2="20" y2="20" />
        <line x1="20" y1="4" x2="4" y2="20" />
      </svg>
    ),
  },
]

export function ShapePanel(): JSX.Element {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, element: ShapeElement) => {
    setShapeDragData(event.dataTransfer, { shapeType: element.type, label: element.label })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {shapeElements.map((element) => (
          <div
            key={element.type}
            draggable="true"
            onDragStart={(event) => handleDragStart(event, element)}
            className="flex cursor-grab flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-sm active:cursor-grabbing"
          >
            <div className="flex items-center justify-center text-muted-foreground">{element.icon}</div>
            <span className="w-full text-center text-sm font-medium text-foreground">{element.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

