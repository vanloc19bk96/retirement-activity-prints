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

export function starPoints(points: number, outerRadius: number, innerRadius: number): Point[] {
  const out: Point[] = []
  const step = Math.PI / points
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius
    const angle = i * step - Math.PI / 2
    out.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  return out
}

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
  const shaft = radius * 0.28
  const head = radius * 0.72
  return [
    { x: 0, y: -radius },
    { x: head, y: -radius * 0.05 },
    { x: shaft, y: -radius * 0.05 },
    { x: shaft, y: radius },
    { x: -shaft, y: radius },
    { x: -shaft, y: -radius * 0.05 },
    { x: -head, y: -radius * 0.05 },
  ]
}

export function chevronPoints(radius: number): Point[] {
  const t = radius * 0.35
  return [
    { x: -radius * 0.7, y: -radius },
    { x: -radius * 0.7 + t, y: -radius },
    { x: radius * 0.55, y: 0 },
    { x: -radius * 0.7 + t, y: radius },
    { x: -radius * 0.7, y: radius },
    { x: radius * 0.2, y: 0 },
  ]
}

export function crescentPoints(radius: number): Point[] {
  const outer: Point[] = []
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const angle = -Math.PI / 2 + (Math.PI * i) / steps
    outer.push({ x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
  }
  for (let i = steps; i >= 0; i--) {
    const angle = -Math.PI / 2 + (Math.PI * i) / steps
    outer.push({
      x: radius * 0.45 + radius * 0.55 * Math.cos(angle),
      y: radius * 0.55 * Math.sin(angle),
    })
  }
  return outer
}

export function hourglassPoints(radius: number): Point[] {
  const waist = radius * 0.14
  return [
    { x: -radius * 0.85, y: -radius },
    { x: radius * 0.85, y: -radius },
    { x: waist, y: 0 },
    { x: radius * 0.85, y: radius },
    { x: -radius * 0.85, y: radius },
    { x: -waist, y: 0 },
  ]
}

export function heartPoints(radius: number): Point[] {
  const points: Point[] = []
  const steps = 24
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * 2 * i) / steps
    const x = 16 * Math.sin(t) ** 3
    const y =
      -(
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t)
      )
    points.push({ x: (x / 17) * radius, y: (y / 17) * radius })
  }
  return points
}

export function housePoints(radius: number): Point[] {
  return [
    { x: 0, y: -radius },
    { x: radius, y: -radius * 0.15 },
    { x: radius * 0.7, y: -radius * 0.15 },
    { x: radius * 0.7, y: radius },
    { x: -radius * 0.7, y: radius },
    { x: -radius * 0.7, y: -radius * 0.15 },
    { x: -radius, y: -radius * 0.15 },
  ]
}

export function teardropPoints(radius: number): Point[] {
  const points: Point[] = [{ x: 0, y: -radius }]
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI * 0.15 + (Math.PI * 0.7 * i) / steps
    points.push({
      x: radius * 0.7 * Math.cos(angle),
      y: -radius * 0.15 + radius * 0.75 * Math.sin(angle),
    })
  }
  return points
}

export function bowtiePoints(radius: number): Point[] {
  return [
    { x: -radius, y: -radius * 0.75 },
    { x: -radius * 0.15, y: 0 },
    { x: -radius, y: radius * 0.75 },
    { x: radius, y: radius * 0.75 },
    { x: radius * 0.15, y: 0 },
    { x: radius, y: -radius * 0.75 },
  ]
}

export function semicirclePoints(radius: number): Point[] {
  const points: Point[] = [{ x: -radius, y: radius * 0.35 }]
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI + (Math.PI * i) / steps
    points.push({
      x: radius * Math.cos(angle),
      y: radius * 0.35 + radius * Math.sin(angle),
    })
  }
  return points
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
  const t = radius * 0.35
  return [
    { x: -radius, y: -radius },
    { x: -radius + t * 2, y: -radius },
    { x: -radius + t * 2, y: radius - t * 2 },
    { x: radius, y: radius - t * 2 },
    { x: radius, y: radius },
    { x: -radius, y: radius },
  ]
}

export function archPoints(radius: number): Point[] {
  const t = radius * 0.32
  const points: Point[] = [
    { x: -radius, y: radius },
    { x: -radius + t, y: radius },
  ]
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI + (Math.PI * i) / steps
    points.push({
      x: (radius - t) * Math.cos(angle),
      y: (radius - t) * Math.sin(angle) + t * 0.2,
    })
  }
  points.push({ x: radius - t, y: radius }, { x: radius, y: radius })
  for (let i = steps; i >= 0; i--) {
    const angle = Math.PI + (Math.PI * i) / steps
    points.push({
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle) + t * 0.2,
    })
  }
  return points
}

export function pillPoints(radius: number): Point[] {
  const points: Point[] = []
  const rx = radius
  const ry = radius * 0.45
  const steps = 16
  for (let i = 0; i <= steps; i++) {
    const angle = (Math.PI * 2 * i) / steps
    points.push({ x: rx * Math.cos(angle), y: ry * Math.sin(angle) })
  }
  return points
}

export function lightningPoints(radius: number): Point[] {
  return [
    { x: radius * 0.15, y: -radius },
    { x: -radius * 0.1, y: -radius * 0.1 },
    { x: radius * 0.35, y: -radius * 0.1 },
    { x: -radius * 0.2, y: radius },
    { x: radius * 0.05, y: radius * 0.15 },
    { x: -radius * 0.4, y: radius * 0.15 },
  ]
}

export function checkmarkPoints(radius: number): Point[] {
  const t = radius * 0.28
  return [
    { x: -radius, y: -radius * 0.05 },
    { x: -radius + t, y: -radius * 0.05 - t * 0.4 },
    { x: -radius * 0.25, y: radius * 0.35 },
    { x: radius - t, y: -radius },
    { x: radius, y: -radius + t * 0.5 },
    { x: -radius * 0.15, y: radius },
  ]
}

