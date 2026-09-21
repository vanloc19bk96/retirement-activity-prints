import {
  Control,
  type FabricObject,
  type Line,
  Point,
  type TMat2D,
  type Transform,
  type TransformActionHandler,
} from 'fabric'

type LineEndpoint = 'start' | 'end'

const getLineEndpointCanvasPoint = (line: Line, endpoint: LineEndpoint): Point => {
  const points = line.calcLinePoints()
  const local =
    endpoint === 'start' ? new Point(points.x1, points.y1) : new Point(points.x2, points.y2)
  return local.transform(line.calcTransformMatrix())
}

const setLineCanvasEndpoints = (line: Line, start: Point, end: Point): void => {
  line.set({
    angle: 0,
    scaleX: 1,
    scaleY: 1,
    skewX: 0,
    skewY: 0,
    flipX: false,
    flipY: false,
    x1: start.x,
    y1: start.y,
    x2: end.x,
    y2: end.y,
    dirty: true,
  })
}

const createLineEndpointPositionHandler = (endpoint: LineEndpoint) => {
  return function (_dim: Point, _finalMatrix: TMat2D, fabricObject: FabricObject): Point {
    const line = fabricObject as Line
    return getLineEndpointCanvasPoint(line, endpoint).transform(line.getViewportTransform())
  }
}

const createLineEndpointActionHandler = (endpoint: LineEndpoint): TransformActionHandler => {
  return (_eventData, transform: Transform, x: number, y: number) => {
    const line = transform.target as Line
    const otherEndpoint: LineEndpoint = endpoint === 'start' ? 'end' : 'start'

    const fixedCanvas = getLineEndpointCanvasPoint(line, otherEndpoint)
    const movingCanvas = new Point(x, y)

    const start = endpoint === 'start' ? movingCanvas : fixedCanvas
    const end = endpoint === 'end' ? movingCanvas : fixedCanvas

    setLineCanvasEndpoints(line, start, end)
    line.setCoords()
    return true
  }
}

type CreateLineEndpointControlsOptions = {
  render: NonNullable<Control['render']>
}

export function createLineEndpointControls(
  options: CreateLineEndpointControlsOptions,
): Record<'p1' | 'p2', Control> {
  const { render } = options

  return {
    p1: new Control({
      positionHandler: createLineEndpointPositionHandler('start'),
      actionHandler: createLineEndpointActionHandler('start'),
      cursorStyleHandler: () => 'crosshair',
      actionName: 'modifyLine',
      render,
    }),
    p2: new Control({
      positionHandler: createLineEndpointPositionHandler('end'),
      actionHandler: createLineEndpointActionHandler('end'),
      cursorStyleHandler: () => 'crosshair',
      actionName: 'modifyLine',
      render,
    }),
  }
}

export const LINE_SHAPE_HIDDEN_CONTROLS = {
  tl: false,
  tr: false,
  bl: false,
  br: false,
  mt: false,
  mb: false,
  ml: false,
  mr: false,
  mtr: true,
  p1: true,
  p2: true,
} as const
