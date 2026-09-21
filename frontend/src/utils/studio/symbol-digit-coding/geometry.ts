/** Pure geometry helpers for Symbol–Digit Coding glyphs (no Fabric). */

export type Point = { x: number; y: number }

export function regularPolygonPoints(
  sides: number,
  radius: number,
  rotationRad = -Math.PI / 2,
): Point[] {
  const points: Point[] = []
  const step = (2 * Math.PI) / sides
  for (let i = 0; i < sides; i++) {
    const angle = rotationRad + i * step
    points.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return points
}

export function starPoints(points: number, outer: number, inner: number): Point[] {
  const out: Point[] = []
  const step = Math.PI / points
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = i * step - Math.PI / 2
    out.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return out
}

export function ellipsePoints(rx: number, ry: number, segments = 20): Point[] {
  const out: Point[] = []
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2 - Math.PI / 2
    out.push({ x: rx * Math.cos(angle), y: ry * Math.sin(angle) })
  }
  return out
}

/** Closed plus outline sized to the same bounding box as other symbols. */
export function plusPoints(radius: number): Point[] {
  const t = radius * 0.28
  return [
    { x: -t, y: -radius },
    { x: t, y: -radius },
    { x: t, y: -t },
    { x: radius, y: -t },
    { x: radius, y: t },
    { x: t, y: t },
    { x: t, y: radius },
    { x: -t, y: radius },
    { x: -t, y: t },
    { x: -radius, y: t },
    { x: -radius, y: -t },
    { x: -t, y: -t },
  ]
}

export function rotatePoints(points: Point[], radians: number): Point[] {
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  return points.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }))
}

export function arrowPoints(radius: number): Point[] {
  const half = radius * 0.55
  return [
    { x: 0, y: -radius },
    { x: radius * 0.85, y: -radius * 0.15 },
    { x: half * 0.55, y: -radius * 0.15 },
    { x: half * 0.55, y: radius },
    { x: -half * 0.55, y: radius },
    { x: -half * 0.55, y: -radius * 0.15 },
    { x: -radius * 0.85, y: -radius * 0.15 },
  ]
}

export function chevronPoints(radius: number): Point[] {
  const t = radius * 0.32
  return [
    { x: 0, y: -radius },
    { x: radius, y: radius * 0.15 },
    { x: radius - t, y: radius * 0.15 + t * 1.1 },
    // Push inner tip away from apex so arms read as rectangular bands.
    { x: 0, y: -radius + t * 2.4 },
    { x: -radius + t, y: radius * 0.15 + t * 1.1 },
    { x: -radius, y: radius * 0.15 },
  ]
}

export function teePoints(radius: number): Point[] {
  const t = radius * 0.28
  return [
    { x: -radius, y: -radius },
    { x: radius, y: -radius },
    { x: radius, y: -radius + t * 2 },
    { x: t, y: -radius + t * 2 },
    { x: t, y: radius },
    { x: -t, y: radius },
    { x: -t, y: -radius + t * 2 },
    { x: -radius, y: -radius + t * 2 },
  ]
}

export function ellPoints(radius: number): Point[] {
  const t = radius * 0.32
  return [
    { x: -radius, y: -radius },
    { x: -radius + t * 2, y: -radius },
    { x: -radius + t * 2, y: radius - t * 2 },
    { x: radius, y: radius - t * 2 },
    { x: radius, y: radius },
    { x: -radius, y: radius },
  ]
}

/** Axis-aligned rect centered at (cx, cy). */
export function rectPoints(
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): Point[] {
  return [
    { x: cx - halfW, y: cy - halfH },
    { x: cx + halfW, y: cy - halfH },
    { x: cx + halfW, y: cy + halfH },
    { x: cx - halfW, y: cy + halfH },
  ]
}

/** Flat-base dome — clean semicircle arch (single closed path). */
export function archPoints(radius: number): Point[] {
  const rx = radius * 0.95
  const ry = radius * 0.85
  const out: Point[] = []
  for (let i = 0; i <= 12; i++) {
    const angle = -Math.PI + (i / 12) * Math.PI
    out.push({ x: rx * Math.cos(angle), y: ry * Math.sin(angle) })
  }
  return out
}

/** Thick crescent open to the right (single path, not nested rings). */
export function crescentPoints(radius: number): Point[] {
  const outerR = radius * 0.92
  const innerR = radius * 0.52
  const ox = -radius * 0.08
  const ix = ox + radius * 0.32
  const out: Point[] = []
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI * 0.82 + (i / steps) * Math.PI * 1.64
    out.push({ x: ox + outerR * Math.cos(angle), y: outerR * Math.sin(angle) })
  }
  for (let i = steps; i >= 0; i--) {
    const angle = -Math.PI * 0.72 + (i / steps) * Math.PI * 1.44
    out.push({ x: ix + innerR * Math.cos(angle), y: innerR * Math.sin(angle) })
  }
  return out
}

/** Pill / stadium — horizontal when rx ≥ ry. */
export function capsulePoints(rx: number, ry: number): Point[] {
  const capR = Math.min(rx, ry)
  const cx = Math.max(0, rx - capR)
  const out: Point[] = []
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI / 2 + (i / steps) * Math.PI
    out.push({ x: cx + capR * Math.cos(angle), y: ry * Math.sin(angle) })
  }
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI / 2 + (i / steps) * Math.PI
    out.push({ x: -cx + capR * Math.cos(angle), y: ry * Math.sin(angle) })
  }
  return out
}

/** Open-top U band. */
export function uShapePoints(radius: number): Point[] {
  const t = radius * 0.32
  const o = radius * 0.95
  return [
    { x: -o, y: -o },
    { x: -o + t * 2, y: -o },
    { x: -o + t * 2, y: o - t * 2 },
    { x: o - t * 2, y: o - t * 2 },
    { x: o - t * 2, y: -o },
    { x: o, y: -o },
    { x: o, y: o },
    { x: -o, y: o },
  ]
}

/** Z band — balanced top/bottom bars with diagonal bridge. */
export function zShapePoints(radius: number): Point[] {
  const t = radius * 0.28
  const o = radius * 0.9
  return [
    { x: -o, y: -o },
    { x: o, y: -o },
    { x: o, y: -o + t * 2 },
    { x: -o + t * 2.4, y: -o + t * 2 },
    { x: o, y: o - t * 2 },
    { x: o, y: o },
    { x: -o, y: o },
    { x: -o, y: o - t * 2 },
    { x: o - t * 2.4, y: o - t * 2 },
    { x: -o, y: -o + t * 2 },
  ]
}
