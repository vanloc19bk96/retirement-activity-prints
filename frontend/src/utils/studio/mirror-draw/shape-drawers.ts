import type { StudioRng } from '../studio-rng'
import {
  emptyBitmap,
  extractLeftHalf,
  fillDisk,
  fillRect,
  forceMirrorFromLeft,
  setCell,
  shiftVertical,
  sprinkleLeft,
} from './bitmap'
import type { Bitmap, GridSize } from './types'

function finishSymmetric(full: Bitmap, rng: StudioRng): Bitmap {
  sprinkleLeft(full, rng, 0.06)
  const dr = rng.int(-1, 1)
  const shifted = dr === 0 ? full : shiftVertical(full, dr)
  forceMirrorFromLeft(shifted)
  return extractLeftHalf(shifted)
}

export function drawHeart(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const x = ((c + 0.5) / size) * 2 - 1
      const y = ((r + 0.5) / size) * 2 - 1.05
      const a = (x * x + y * y - 0.35) ** 3 - x * x * y * y * y
      if (a <= 0) b[r]![c] = true
    }
  }
  return finishSymmetric(b, rng)
}

export function drawTree(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const cx = Math.floor(size / 2)
  const trunkW = Math.max(1, Math.floor(size / 8))
  const trunkH = Math.max(2, Math.floor(size * 0.28))
  fillRect(b, size - trunkH, cx - Math.floor(trunkW / 2), trunkH, trunkW)
  const layers = size <= 8 ? 2 : size <= 12 ? 3 : 4
  for (let i = 0; i < layers; i++) {
    const top = Math.floor((i * size) / (layers + 1.2))
    const half = Math.floor(size * (0.18 + i * 0.1))
    fillRect(b, top, cx - half, Math.max(2, Math.floor(size / 7)), half * 2 + 1)
  }
  return finishSymmetric(b, rng)
}

export function drawHouse(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const baseTop = Math.floor(size * 0.4)
  fillRect(b, baseTop, 1, size - baseTop - 1, size - 2)
  for (let r = 0; r < baseTop; r++) {
    const half = Math.floor(((r + 1) / baseTop) * (size / 2 - 1))
    fillRect(b, r, Math.floor(size / 2) - half, 1, half * 2 + 1)
  }
  const doorW = Math.max(1, Math.floor(size / 5))
  const doorH = Math.max(2, Math.floor(size / 3))
  fillRect(b, size - doorH - 1, Math.floor(size / 2) - Math.floor(doorW / 2), doorH, doorW, false)
  return finishSymmetric(b, rng)
}

export function drawButterfly(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const cx = size / 2
  const cy = size / 2
  fillDisk(b, cy * 0.55, cx * 0.45, size * 0.22)
  fillDisk(b, cy * 1.15, cx * 0.4, size * 0.2)
  fillRect(b, Math.floor(size * 0.15), Math.floor(cx) - 1, Math.floor(size * 0.7), 2)
  return finishSymmetric(b, rng)
}

export function drawFish(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const cy = Math.floor(size / 2)
  fillDisk(b, cy, Math.floor(size * 0.42), size * 0.28)
  const tx = Math.floor(size * 0.72)
  for (let r = 0; r < size; r++) {
    const dist = Math.abs(r - cy)
    if (dist <= size * 0.25) {
      fillRect(b, r, tx, 1, Math.max(1, Math.floor(size * 0.16 - dist * 0.25)))
    }
  }
  setCell(b, cy - 1, Math.floor(size * 0.28), false)
  return finishSymmetric(b, rng)
}

export function drawCat(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const head = Math.floor(size * 0.4)
  fillDisk(b, head, Math.floor(size / 2), size * 0.26)
  fillRect(b, 1, Math.floor(size * 0.22), Math.floor(size * 0.2), Math.floor(size * 0.14))
  fillRect(b, 1, Math.floor(size * 0.64), Math.floor(size * 0.2), Math.floor(size * 0.14))
  fillRect(b, Math.floor(size * 0.55), Math.floor(size * 0.3), Math.floor(size * 0.35), Math.floor(size * 0.4))
  return finishSymmetric(b, rng)
}

export function drawFlower(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const cx = size / 2
  const cy = size * 0.38
  const petalR = size * 0.14
  for (const [dr, dc] of [
    [-0.26, 0], [0.26, 0], [0, -0.26], [0, 0.26],
    [-0.18, -0.18], [-0.18, 0.18], [0.18, -0.18], [0.18, 0.18],
  ] as const) {
    fillDisk(b, cy + dr * size, cx + dc * size, petalR)
  }
  fillDisk(b, cy, cx, size * 0.1)
  fillRect(b, Math.floor(size * 0.5), Math.floor(cx), Math.floor(size * 0.45), 1)
  return finishSymmetric(b, rng)
}

export function drawMushroom(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.35, size * 0.5, size * 0.32)
  fillRect(b, Math.floor(size * 0.45), Math.floor(size * 0.38), Math.floor(size * 0.45), Math.floor(size * 0.24))
  return finishSymmetric(b, rng)
}

export function drawBoat(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const mast = Math.floor(size * 0.55)
  fillRect(b, 1, Math.floor(size / 2), mast, 1)
  for (let r = 2; r < mast; r++) {
    const sail = Math.floor(((r - 1) / mast) * (size * 0.32))
    fillRect(b, r, Math.floor(size / 2) + 1, 1, sail)
  }
  const hullTop = Math.floor(size * 0.55)
  for (let r = 0; r < Math.floor(size * 0.28); r++) {
    const inset = Math.floor(r * 0.8)
    fillRect(b, hullTop + r, 1 + inset, 1, size - 2 - inset * 2)
  }
  return finishSymmetric(b, rng)
}

export function drawStar(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const cx = (size - 1) / 2
  const cy = (size - 1) / 2
  const outer = size * 0.46
  const inner = size * 0.18
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ang = Math.atan2(r - cy, c - cx)
      const tip = ((ang + Math.PI) / (Math.PI * 2)) * 5
      const t = tip - Math.floor(tip)
      const lim =
        t < 0.5
          ? outer * (1 - t * 2) + inner * (t * 2)
          : inner * (1 - (t - 0.5) * 2) + outer * ((t - 0.5) * 2)
      if (Math.hypot(r - cy, c - cx) <= lim) b[r]![c] = true
    }
  }
  return finishSymmetric(b, rng)
}

export function drawApple(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.55, size * 0.5, size * 0.36)
  fillRect(b, 1, Math.floor(size / 2), Math.floor(size * 0.18), 1)
  fillRect(b, 2, Math.floor(size / 2) + 1, 2, Math.max(1, Math.floor(size / 6)))
  return finishSymmetric(b, rng)
}

export function drawOwl(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.42, size * 0.5, size * 0.3)
  fillDisk(b, size * 0.38, size * 0.35, size * 0.08, false)
  fillDisk(b, size * 0.38, size * 0.65, size * 0.08, false)
  fillRect(b, Math.floor(size * 0.65), Math.floor(size * 0.35), Math.floor(size * 0.28), Math.floor(size * 0.3))
  return finishSymmetric(b, rng)
}

export function drawRocket(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const cx = Math.floor(size / 2)
  for (let r = 1; r < Math.floor(size * 0.7); r++) {
    const half = Math.max(1, Math.floor((r / size) * (size * 0.28)))
    fillRect(b, r, cx - half, 1, half * 2 + 1)
  }
  fillRect(b, Math.floor(size * 0.55), cx - Math.floor(size * 0.28), Math.floor(size * 0.2), Math.floor(size * 0.12))
  fillRect(b, Math.floor(size * 0.55), cx + Math.floor(size * 0.16), Math.floor(size * 0.2), Math.floor(size * 0.12))
  fillRect(b, Math.floor(size * 0.72), cx - 1, Math.floor(size * 0.2), 3)
  return finishSymmetric(b, rng)
}

export function drawMountain(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const peak = Math.floor(size * 0.35)
  for (let r = peak; r < size - 1; r++) {
    const t = (r - peak) / (size - peak)
    const half = Math.floor(t * (size * 0.45))
    fillRect(b, r, Math.floor(size / 2) - half, 1, half * 2 + 1)
  }
  return finishSymmetric(b, rng)
}

export function drawCrown(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const top = Math.floor(size * 0.25)
  const bot = Math.floor(size * 0.55)
  fillRect(b, top + 2, 1, bot - top, size - 2)
  for (let i = 0; i < 3; i++) {
    const c = 1 + i * Math.floor((size - 2) / 2)
    fillRect(b, top, c, 3, Math.max(1, Math.floor(size / 8)))
  }
  return finishSymmetric(b, rng)
}

export function drawLeaf(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.45, size * 0.5, size * 0.32)
  fillRect(b, Math.floor(size * 0.45), Math.floor(size / 2), Math.floor(size * 0.45), 1)
  return finishSymmetric(b, rng)
}

export function drawDiamond(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const mid = Math.floor(size / 2)
  for (let r = 0; r < size; r++) {
    const half = mid - Math.abs(r - mid)
    if (half >= 0) fillRect(b, r, mid - half, 1, half * 2 + 1)
  }
  return finishSymmetric(b, rng)
}

export function drawCup(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillRect(b, Math.floor(size * 0.2), Math.floor(size * 0.18), Math.floor(size * 0.5), Math.floor(size * 0.5))
  fillRect(b, Math.floor(size * 0.3), Math.floor(size * 0.68), Math.floor(size * 0.28), Math.floor(size * 0.18))
  fillRect(b, Math.floor(size * 0.72), Math.floor(size * 0.28), Math.floor(size * 0.12), Math.floor(size * 0.35))
  return finishSymmetric(b, rng)
}

export function drawSwan(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.55, size * 0.48, size * 0.22)
  fillRect(b, Math.floor(size * 0.15), Math.floor(size * 0.45), Math.floor(size * 0.35), 2)
  fillDisk(b, size * 0.18, size * 0.55, size * 0.1)
  return finishSymmetric(b, rng)
}

export function drawFace(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size / 2, size / 2, size * 0.4)
  fillDisk(b, size * 0.4, size * 0.35, size * 0.06, false)
  fillDisk(b, size * 0.4, size * 0.65, size * 0.06, false)
  for (let c = Math.floor(size * 0.32); c <= Math.floor(size * 0.68); c++) {
    const dip = Math.floor(Math.abs(c - size / 2) * 0.12)
    setCell(b, Math.floor(size * 0.62) + dip, c, false)
  }
  return finishSymmetric(b, rng)
}

export function drawVase(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillRect(b, Math.floor(size * 0.15), Math.floor(size * 0.35), Math.floor(size * 0.12), Math.floor(size * 0.3))
  for (let r = Math.floor(size * 0.28); r < size - 1; r++) {
    const t = (r - size * 0.28) / (size * 0.7)
    const half = Math.floor(size * (0.18 + Math.sin(t * Math.PI) * 0.18))
    fillRect(b, r, Math.floor(size / 2) - half, 1, half * 2 + 1)
  }
  return finishSymmetric(b, rng)
}

export function drawCloud(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.48, size * 0.35, size * 0.18)
  fillDisk(b, size * 0.42, size * 0.5, size * 0.22)
  fillDisk(b, size * 0.48, size * 0.65, size * 0.18)
  fillRect(b, Math.floor(size * 0.48), Math.floor(size * 0.28), Math.floor(size * 0.2), Math.floor(size * 0.44))
  return finishSymmetric(b, rng)
}

export function drawBell(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.4, size * 0.5, size * 0.28)
  fillRect(b, Math.floor(size * 0.4), Math.floor(size * 0.22), Math.floor(size * 0.35), Math.floor(size * 0.56))
  fillRect(b, Math.floor(size * 0.75), Math.floor(size * 0.35), Math.floor(size * 0.12), Math.floor(size * 0.3))
  fillRect(b, Math.floor(size * 0.12), Math.floor(size / 2), Math.floor(size * 0.12), 1)
  return finishSymmetric(b, rng)
}

export function drawKite(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  const mid = Math.floor(size / 2)
  for (let r = 1; r < Math.floor(size * 0.65); r++) {
    const half = r < mid ? r : Math.floor(size * 0.65) - r
    if (half > 0) fillRect(b, r, mid - half, 1, half * 2 + 1)
  }
  fillRect(b, Math.floor(size * 0.6), mid, Math.floor(size * 0.3), 1)
  return finishSymmetric(b, rng)
}

export function drawRabbit(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.48, size * 0.5, size * 0.24)
  fillRect(b, 1, Math.floor(size * 0.32), Math.floor(size * 0.28), Math.floor(size * 0.12))
  fillRect(b, 1, Math.floor(size * 0.56), Math.floor(size * 0.28), Math.floor(size * 0.12))
  fillRect(b, Math.floor(size * 0.65), Math.floor(size * 0.35), Math.floor(size * 0.25), Math.floor(size * 0.3))
  return finishSymmetric(b, rng)
}

export function drawCandle(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillRect(b, Math.floor(size * 0.3), Math.floor(size * 0.4), Math.floor(size * 0.55), Math.floor(size * 0.2))
  fillDisk(b, size * 0.22, size * 0.5, size * 0.1)
  fillRect(b, Math.floor(size * 0.12), Math.floor(size / 2), Math.floor(size * 0.12), 1)
  return finishSymmetric(b, rng)
}

export function drawDuck(size: GridSize, rng: StudioRng): Bitmap {
  const b = emptyBitmap(size, size)
  fillDisk(b, size * 0.45, size * 0.45, size * 0.2)
  fillDisk(b, size * 0.32, size * 0.62, size * 0.12)
  fillRect(b, Math.floor(size * 0.55), Math.floor(size * 0.25), Math.floor(size * 0.22), Math.floor(size * 0.45))
  return finishSymmetric(b, rng)
}
