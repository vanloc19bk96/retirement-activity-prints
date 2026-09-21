import {
  cardinalAngle,
  cornerAngle,
  rotateParts,
  type Cardinal,
  type Corner,
} from './shape-rotate'
import type { ShapeParts } from './shape-parts-types'
import type { StudyRecallShapeId } from './shape-ids'

type Factory = (r: number) => ShapeParts

const CARDINALS: Cardinal[] = ['N', 'S', 'E', 'W']
const CORNERS: Corner[] = ['NE', 'NW', 'SE', 'SW']

function put(
  map: Partial<Record<StudyRecallShapeId, Factory>>,
  id: string,
  factory: Factory,
): void {
  map[id as StudyRecallShapeId] = factory
}

function putCardinals(
  map: Partial<Record<StudyRecallShapeId, Factory>>,
  prefix: string,
  facingNorth: Factory,
): void {
  for (const dir of CARDINALS) {
    put(map, `${prefix}${dir}`, (r) =>
      rotateParts(facingNorth(r), cardinalAngle(dir)),
    )
  }
}

function putCorners(
  map: Partial<Record<StudyRecallShapeId, Factory>>,
  prefix: string,
  facingNE: Factory,
): void {
  for (const corner of CORNERS) {
    put(map, `${prefix}${corner}`, (r) =>
      rotateParts(facingNE(r), cornerAngle(corner)),
    )
  }
}

function zed(r: number, mirror: boolean): ShapeParts {
  const s = r * 0.85
  return {
    lines: [
      [
        { x: -s, y: -s },
        { x: s, y: -s },
      ],
      mirror
        ? [
            { x: -s, y: -s },
            { x: s, y: s },
          ]
        : [
            { x: s, y: -s },
            { x: -s, y: s },
          ],
      [
        { x: -s, y: s },
        { x: s, y: s },
      ],
    ],
  }
}

function en(r: number, mirror: boolean): ShapeParts {
  const s = r * 0.85
  return {
    lines: [
      [
        { x: -s, y: s },
        { x: -s, y: -s },
      ],
      mirror
        ? [
            { x: -s, y: s },
            { x: s, y: -s },
          ]
        : [
            { x: -s, y: -s },
            { x: s, y: s },
          ],
      [
        { x: s, y: -s },
        { x: s, y: s },
      ],
    ],
  }
}

function buildExtraOpen(): Partial<Record<StudyRecallShapeId, Factory>> {
  const map: Partial<Record<StudyRecallShapeId, Factory>> = {}

  put(map, 'zed', (r) => zed(r, false))
  put(map, 'zedMirror', (r) => zed(r, true))
  put(map, 'en', (r) => en(r, false))
  put(map, 'enMirror', (r) => en(r, true))
  put(map, 'aitch', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: -s },
          { x: -s, y: s },
        ],
        [
          { x: -s, y: 0 },
          { x: s, y: 0 },
        ],
        [
          { x: s, y: -s },
          { x: s, y: s },
        ],
      ],
    }
  })
  put(map, 'piMark', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: -s },
          { x: s, y: -s },
        ],
        [
          { x: -s * 0.45, y: -s },
          { x: -s * 0.45, y: s },
        ],
        [
          { x: s * 0.45, y: -s },
          { x: s * 0.45, y: s },
        ],
      ],
    }
  })
  put(map, 'zigzagH', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: s * 0.35 },
          { x: -s * 0.2, y: -s * 0.35 },
        ],
        [
          { x: -s * 0.2, y: -s * 0.35 },
          { x: s * 0.2, y: s * 0.35 },
        ],
        [
          { x: s * 0.2, y: s * 0.35 },
          { x: s, y: -s * 0.35 },
        ],
      ],
    }
  })
  put(map, 'zigzagV', (r) =>
    rotateParts(map.zigzagH!(r), Math.PI / 2),
  )
  put(map, 'waveH', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: 0 },
          { x: -s * 0.35, y: -s * 0.55 },
        ],
        [
          { x: -s * 0.35, y: -s * 0.55 },
          { x: s * 0.35, y: s * 0.55 },
        ],
        [
          { x: s * 0.35, y: s * 0.55 },
          { x: s, y: 0 },
        ],
      ],
    }
  })
  put(map, 'waveV', (r) => rotateParts(map.waveH!(r), Math.PI / 2))

  putCardinals(map, 'bolt', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: s * 0.2, y: -s },
          { x: -s * 0.35, y: -s * 0.05 },
        ],
        [
          { x: -s * 0.35, y: -s * 0.05 },
          { x: s * 0.35, y: s * 0.05 },
        ],
        [
          { x: s * 0.35, y: s * 0.05 },
          { x: -s * 0.2, y: s },
        ],
      ],
    }
  })
  putCardinals(map, 'hook', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s * 0.15, y: -s },
          { x: -s * 0.15, y: s * 0.45 },
        ],
        [
          { x: -s * 0.15, y: s * 0.45 },
          { x: s * 0.7, y: s * 0.45 },
        ],
        [
          { x: s * 0.7, y: s * 0.45 },
          { x: s * 0.7, y: s * 0.05 },
        ],
      ],
    }
  })
  putCardinals(map, 'jay', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: s * 0.35, y: -s },
          { x: s * 0.35, y: s * 0.35 },
        ],
        [
          { x: s * 0.35, y: s * 0.35 },
          { x: -s * 0.55, y: s * 0.35 },
        ],
        [
          { x: -s * 0.55, y: s * 0.35 },
          { x: -s * 0.55, y: s * 0.05 },
        ],
      ],
    }
  })
  putCardinals(map, 'fan', (r) => {
    const s = r * 0.85
    const c = { x: 0, y: s * 0.35 }
    return {
      lines: [
        [c, { x: -s, y: -s * 0.55 }],
        [c, { x: 0, y: -s }],
        [c, { x: s, y: -s * 0.55 }],
      ],
    }
  })
  putCardinals(map, 'tick', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: 0, y: -s },
          { x: 0, y: s },
        ],
        [
          { x: -s * 0.35, y: -s },
          { x: s * 0.35, y: -s },
        ],
      ],
    }
  })
  putCardinals(map, 'spur', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: 0, y: -s },
          { x: 0, y: s },
        ],
        [
          { x: 0, y: 0 },
          { x: s * 0.7, y: 0 },
        ],
      ],
    }
  })
  putCardinals(map, 'forkFlat', (r) => {
    const s = r * 0.85
    const c = { x: 0, y: s * 0.2 }
    return {
      lines: [
        [c, { x: 0, y: s }],
        [c, { x: -s, y: -s * 0.55 }],
        [c, { x: s, y: -s * 0.55 }],
      ],
    }
  })
  putCardinals(map, 'cusp', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: s * 0.4 },
          { x: 0, y: -s },
        ],
        [
          { x: 0, y: -s },
          { x: s, y: s * 0.4 },
        ],
        [
          { x: 0, y: -s },
          { x: 0, y: s * 0.55 },
        ],
      ],
    }
  })
  putCardinals(map, 'triDash', (r) => {
    const s = r * 0.7
    const gap = r * 0.4
    return {
      lines: [-gap, 0, gap].map((y) => [
        { x: -s, y },
        { x: s, y },
      ]),
    }
  })
  putCardinals(map, 'rail', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s * 0.45, y: -s },
          { x: -s * 0.45, y: s },
        ],
        [
          { x: s * 0.45, y: -s },
          { x: s * 0.45, y: s },
        ],
        [
          { x: -s * 0.45, y: -s },
          { x: s * 0.45, y: -s },
        ],
      ],
    }
  })

  putCorners(map, 'ellWide', (r) => {
    const s = r * 0.9
    return {
      lines: [
        [
          { x: -s, y: -s },
          { x: s, y: -s },
        ],
        [
          { x: s, y: -s },
          { x: s, y: s },
        ],
      ],
    }
  })
  putCorners(map, 'hinge', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: 0 },
          { x: s * 0.15, y: 0 },
        ],
        [
          { x: s * 0.15, y: 0 },
          { x: s * 0.15, y: -s },
        ],
        [
          { x: s * 0.15, y: 0 },
          { x: s, y: s * 0.7 },
        ],
      ],
    }
  })
  putCorners(map, 'zigStep', (r) => {
    const s = r * 0.8
    return {
      lines: [
        [
          { x: -s, y: s },
          { x: -s * 0.15, y: s },
        ],
        [
          { x: -s * 0.15, y: s },
          { x: s * 0.15, y: -s },
        ],
        [
          { x: s * 0.15, y: -s },
          { x: s, y: -s },
        ],
      ],
    }
  })
  putCorners(map, 'angleFlat', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: -s * 0.35 },
          { x: s * 0.2, y: -s * 0.35 },
        ],
        [
          { x: s * 0.2, y: -s * 0.35 },
          { x: s * 0.2, y: s },
        ],
      ],
    }
  })

  put(map, 'tripod', (r) => {
    const s = r * 0.85
    const c = { x: 0, y: 0 }
    return {
      lines: [
        [c, { x: 0, y: -s }],
        [c, { x: -s * 0.85, y: s * 0.6 }],
        [c, { x: s * 0.85, y: s * 0.6 }],
      ],
    }
  })
  put(map, 'hatchSlash', (r) => {
    const s = r * 0.75
    const gap = r * 0.28
    return {
      lines: [-gap, 0, gap].map((o) => [
        { x: s + o * 0.7, y: -s + o * 0.7 },
        { x: -s + o * 0.7, y: s + o * 0.7 },
      ]),
    }
  })
  put(map, 'hatchBackslash', (r) => {
    const s = r * 0.75
    const gap = r * 0.28
    return {
      lines: [-gap, 0, gap].map((o) => [
        { x: -s + o * 0.7, y: -s - o * 0.7 },
        { x: s + o * 0.7, y: s - o * 0.7 },
      ]),
    }
  })
  put(map, 'dashGapH', (r) => {
    const s = r * 0.9
    const g = r * 0.18
    return {
      lines: [
        [
          { x: -s, y: 0 },
          { x: -g, y: 0 },
        ],
        [
          { x: g, y: 0 },
          { x: s, y: 0 },
        ],
      ],
    }
  })
  put(map, 'dashGapV', (r) => rotateParts(map.dashGapH!(r), Math.PI / 2))
  put(map, 'strutH', (r) => {
    const s = r * 0.85
    return {
      lines: [
        [
          { x: -s, y: -s * 0.45 },
          { x: s, y: -s * 0.45 },
        ],
        [
          { x: -s, y: s * 0.45 },
          { x: s, y: s * 0.45 },
        ],
        [
          { x: 0, y: -s * 0.45 },
          { x: 0, y: s * 0.45 },
        ],
      ],
    }
  })
  put(map, 'strutV', (r) => rotateParts(map.strutH!(r), Math.PI / 2))

  return map
}

export const EXTRA_OPEN = buildExtraOpen()

export function extraOpenShapeParts(
  id: StudyRecallShapeId,
  radius: number,
): ShapeParts | null {
  const factory = EXTRA_OPEN[id]
  return factory ? factory(radius) : null
}
