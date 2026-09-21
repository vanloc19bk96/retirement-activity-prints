import type { Canvas } from 'fabric'
import { Circle, Ellipse, Group, Line, Path, Polygon, Rect, Triangle } from 'fabric'
import type { ShapeType } from '@/utils/shape-dnd'

type AddShapeToCanvasOptions = {
  canvas: Canvas
  shapeType: ShapeType
  clientX: number
  clientY: number
}

type Point = { x: number; y: number }

const DEFAULT_STROKE = '#0f172a'
const DEFAULT_FILL = 'rgba(0,0,0,0)'
const DEFAULT_STROKE_WIDTH = 2

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function createStarPoints(numPoints: number, outerRadius: number, innerRadius: number): Point[] {
  const points: Point[] = []
  const step = Math.PI / numPoints
  for (let i = 0; i < numPoints * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const angle = i * step - Math.PI / 2
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return points
}

function createRegularPolygonPoints(sides: number, radius: number): Point[] {
  const points: Point[] = []
  const angleStep = (2 * Math.PI) / sides
  for (let i = 0; i < sides; i += 1) {
    const angle = i * angleStep - Math.PI / 2
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return points
}

function makePolygon(points: Point[]) {
  return new Polygon(points, {
    originX: 'center',
    originY: 'center',
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    strokeUniform: true,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
  })
}

function makePath(d: string, options?: { isFilled?: boolean }) {
  return new Path(d, {
    originX: 'center',
    originY: 'center',
    fill: options?.isFilled === false ? 'rgba(0,0,0,0)' : DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    strokeUniform: true,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
  })
}

function createShapeObject(shapeType: ShapeType) {
  if (shapeType === 'rectangle') {
    return new Rect({
      originX: 'center',
      originY: 'center',
      width: 140,
      height: 100,
      rx: 1,
      ry: 1,
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      strokeUniform: true,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    })
  }

  if (shapeType === 'circle') {
    return new Circle({
      originX: 'center',
      originY: 'center',
      radius: 60,
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      strokeUniform: true,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    })
  }

  if (shapeType === 'ellipse') {
    return new Ellipse({
      originX: 'center',
      originY: 'center',
      rx: 70,
      ry: 45,
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      strokeUniform: true,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    })
  }

  if (shapeType === 'triangle') {
    return new Triangle({
      originX: 'center',
      originY: 'center',
      width: 140,
      height: 120,
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      strokeUniform: true,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    })
  }

  if (shapeType === 'line') {
    return new Line([-80, 0, 80, 0], {
      originX: 'center',
      originY: 'center',
      stroke: DEFAULT_STROKE,
      strokeWidth: 4,
      strokeUniform: true,
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: false,
    })
  }

  if (shapeType === 'arrow') {
    // Simple arrow: shaft + head
    return makePath('M -80 0 L 55 0 M 55 0 L 25 -18 M 55 0 L 25 18', { isFilled: false })
  }

  if (shapeType === 'star') {
    return makePolygon(createStarPoints(5, 60, 28))
  }

  if (shapeType === 'star6') {
    return makePolygon(createStarPoints(6, 60, 28))
  }

  if (shapeType === 'star4') {
    return makePolygon(createStarPoints(4, 60, 24))
  }

  if (shapeType === 'star8') {
    return makePolygon(createStarPoints(8, 60, 30))
  }

  if (shapeType === 'pentagon') return makePolygon(createRegularPolygonPoints(5, 60))
  if (shapeType === 'hexagon') return makePolygon(createRegularPolygonPoints(6, 60))
  if (shapeType === 'heptagon') return makePolygon(createRegularPolygonPoints(7, 60))
  if (shapeType === 'octagon') return makePolygon(createRegularPolygonPoints(8, 60))
  if (shapeType === 'nonagon') return makePolygon(createRegularPolygonPoints(9, 60))
  if (shapeType === 'decagon') return makePolygon(createRegularPolygonPoints(10, 60))

  if (shapeType === 'diamond') {
    return makePolygon([
      { x: 0, y: -65 },
      { x: 65, y: 0 },
      { x: 0, y: 65 },
      { x: -65, y: 0 },
    ])
  }

  if (shapeType === 'rhombus') {
    return makePolygon([
      { x: 0, y: -65 },
      { x: 52, y: 0 },
      { x: 0, y: 65 },
      { x: -52, y: 0 },
    ])
  }

  if (shapeType === 'kite') {
    return makePolygon([
      { x: 0, y: -70 },
      { x: 45, y: 0 },
      { x: 0, y: 70 },
      { x: -45, y: 0 },
    ])
  }

  if (shapeType === 'trapezoid') {
    return makePolygon([
      { x: -52, y: -48 },
      { x: 52, y: -48 },
      { x: 74, y: 48 },
      { x: -74, y: 48 },
    ])
  }

  if (shapeType === 'parallelogram') {
    return makePolygon([
      { x: -52, y: -48 },
      { x: 52, y: -48 },
      { x: 74, y: 48 },
      { x: -30, y: 48 },
    ])
  }

  if (shapeType === 'rightTriangle') {
    return makePolygon([
      { x: -65, y: -65 },
      { x: -65, y: 65 },
      { x: 65, y: 65 },
    ])
  }

  if (shapeType === 'cross') {
    return makePath(
      'M -20 -70 L 20 -70 L 20 -20 L 70 -20 L 70 20 L 20 20 L 20 70 L -20 70 L -20 20 L -70 20 L -70 -20 L -20 -20 Z',
    )
  }

  if (shapeType === 'plus') {
    return makePath('M -12 -70 L 12 -70 L 12 -12 L 70 -12 L 70 12 L 12 12 L 12 70 L -12 70 L -12 12 L -70 12 L -70 -12 L -12 -12 Z')
  }

  if (shapeType === 'xShape') {
    return makePath('M -60 -40 L -40 -60 L 0 -20 L 40 -60 L 60 -40 L 20 0 L 60 40 L 40 60 L 0 20 L -40 60 L -60 40 L -20 0 Z')
  }

  if (shapeType === 'chevron') {
    // Match ShapePanel: two open strokes (>>), not a filled polygon (which self-intersected and read as an X).
    return makePath('M -36 -48 L -6 0 L -36 48 M -6 -48 L 24 0 L -6 48', { isFilled: false })
  }

  if (shapeType === 'semicircle') {
    return makePath('M -70 20 A 70 70 0 0 1 70 20 L -70 20 Z')
  }

  if (shapeType === 'quarterCircle') {
    return makePath('M -70 70 L -70 -10 A 80 80 0 0 1 10 70 L -70 70 Z')
  }

  if (shapeType === 'arc') {
    return makePath('M -70 35 A 80 80 0 0 1 70 35', { isFilled: false })
  }

  if (shapeType === 'sector') {
    return makePath('M 0 0 L 0 -75 A 75 75 0 0 1 65 35 L 0 0 Z')
  }

  if (shapeType === 'ring') {
    const outerCircle = new Circle({
      originX: 'center',
      originY: 'center',
      radius: 60,
      fill: DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      strokeUniform: true,
    })

    const innerCircle = new Circle({
      originX: 'center',
      originY: 'center',
      radius: 36,
      fill: 'rgba(255,255,255,1)',
      stroke: DEFAULT_STROKE,
      strokeWidth: DEFAULT_STROKE_WIDTH,
      strokeUniform: true,
    })

    return new Group([outerCircle, innerCircle], {
      originX: 'center',
      originY: 'center',
      selectable: true,
      evented: true,
      hasControls: true,
      hasBorders: true,
    })
  }

  if (shapeType === 'heart') {
    return makePath(
      'M 0 -20 C 0 -45 -25 -65 -50 -65 C -75 -65 -95 -45 -95 -20 C -95 15 -60 40 0 80 C 60 40 95 15 95 -20 C 95 -45 75 -65 50 -65 C 25 -65 0 -45 0 -20 Z',
    )
  }

  if (shapeType === 'cloud') {
    return makePath(
      'M -55 35 C -78 35 -95 20 -95 0 C -95 -20 -78 -35 -55 -35 C -50 -60 -25 -75 0 -75 C 25 -75 50 -60 55 -35 C 78 -35 95 -20 95 0 C 95 20 78 35 55 35 Z',
    )
  }

  if (shapeType === 'crescent') {
    return makePath(
      'M 55 0 A 55 55 0 1 1 0 -55 A 40 40 0 1 0 0 55 A 55 55 0 0 1 55 0 Z',
    )
  }

  return new Rect({
    originX: 'center',
    originY: 'center',
    width: 140,
    height: 100,
    rx: 1,
    ry: 1,
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    strokeUniform: true,
    selectable: true,
    evented: true,
    hasControls: true,
    hasBorders: true,
  })
}

export function addShapeToFabricCanvasAtClientPoint(options: AddShapeToCanvasOptions): void {
  const { canvas, shapeType, clientX, clientY } = options
  const pointer = canvas.getScenePoint({ clientX, clientY } as MouseEvent)
  const shape = createShapeObject(shapeType) as any

  const zoom = canvas.getZoom()
  const baseWidth = canvas.getWidth() / zoom
  const baseHeight = canvas.getHeight() / zoom

  shape.set?.({
    left: clamp(pointer.x, 0, baseWidth),
    top: clamp(pointer.y, 0, baseHeight),
  })

  canvas.add(shape)
  canvas.bringObjectToFront(shape)
  canvas.setActiveObject(shape)
  canvas.requestRenderAll()
}

