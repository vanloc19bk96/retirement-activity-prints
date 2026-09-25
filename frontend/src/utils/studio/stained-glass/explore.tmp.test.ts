import { it } from 'vitest'
import { DPI } from '@/types/canvas-settings.types'
import { createRngFromSeedInput } from '../_shared/uniqueness'
import { createRng } from '../studio-rng'
import type { SgComposition } from './composition'
import { sgVariantDrawing, sgVariants, sgLevelSpec } from './content'
import { buildMosaic, SG_FLOOR, type SgInkRun } from './mosaic'
import { SG_SUBJECTS } from './subjects'
import { SG_HAND_LIMITS, SG_INK_PROFILES, applySgHand, sgSubjectFlies, dealSgHand, dealSgStyle, sgMosaicStyle } from './style'

const box = { minX: 0, minY: 0, maxX: 5.8 * DPI, maxY: 7.6 * DPI }
const H = Number(process.env.H ?? 1)
const G = Number(process.env.G ?? 4)
function mask(runs: SgInkRun[], only?: Set<string>) {
  const set = new Set<number>()
  const w = Math.ceil(box.maxX / G)
  for (const run of runs) {
    if (only && !only.has(run.ink)) continue
    for (const line of run.lines) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!, b = line[i]!
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)))
        for (let t = 0; t <= n; t++) {
          const x = a.x + ((b.x - a.x) * t) / n, y = a.y + ((b.y - a.y) * t) / n
          set.add(Math.floor(y / G) * w + Math.floor(x / G))
        }
      }
    }
  }
  return set
}
const jac = (a: Set<number>, b: Set<number>) => {
  let i = 0
  for (const x of a) if (b.has(x)) i++
  return i / (a.size + b.size - i)
}
const salt = (n: number) => n.toString(16).padStart(32, '0')

it('explore similarity', () => {
  const comp: SgComposition = { frame: 'rect', border: 'tiles', pattern: 'even', sun: null, scenery: null, halo: false }
  const detail = sgLevelSpec('classic').detail
  const subj = new Set(['silhouette', 'part'])
  const rows: string[] = []
  for (const s of SG_SUBJECTS.filter((_, i) => i % 6 === 0)) {
    const v = sgVariants(s)[0]!
    const build = (n: number, styled: boolean) => {
      const rng = createRngFromSeedInput({ ownerSalt: salt(n), templateKey: 'x', configHash: 'y', pageNonce: 1 })
      if (!styled) return buildMosaic({ box, drawing: sgVariantDrawing(s, v), composition: comp, detail, rng })
      const style = dealSgStyle({ ownerSalt: salt(n), seed: 1 })
      const hand = dealSgHand(style, s, rng)
      return buildMosaic({ box, drawing: applySgHand(sgVariantDrawing(s, v), hand), composition: comp, detail, rng, style: sgMosaicStyle(style, hand) })
    }
    const out: number[] = []
    for (const styled of [false, true]) {
      let sumAll = 0, sumSub = 0, k = 0
      for (let n = 1; n <= 6; n += 2) {
        const a = build(n, styled), b = build(n + 1, styled)
        if (!a.ok || !b.ok) continue
        sumAll += jac(mask(a.runs), mask(b.runs))
        sumSub += jac(mask(a.runs, subj), mask(b.runs, subj))
        k++
      }
      out.push(sumAll / k, sumSub / k)
    }
    rows.push(`${s.id.padEnd(16)} before all=${out[0]!.toFixed(2)} subj=${out[1]!.toFixed(2)} | after all=${out[2]!.toFixed(2)} subj=${out[3]!.toFixed(2)}`)
  }
  console.log(rows.join('\n'))
}, 300_000)

it('explore extremes', () => {
  const alone: SgComposition = { frame: 'rect', border: 'none', pattern: 'even', sun: null, scenery: null, halo: false }
  const box2 = { minX: 0, minY: 0, maxX: 250, maxY: 287 }
  const detail = { cell: 10 * DPI, subjectCell: 10 * DPI, minWidth: SG_FLOOR.minWidth, minArea: SG_FLOOR.minArea }
  const hands = process.env.NEUTRAL ? [{ aspect: 1, taper: 0, tilt: 0, fill: Number(process.env.FILL ?? 1) }] : [
    { aspect: 1 + (SG_HAND_LIMITS.aspect[0] - 1) * H, taper: SG_HAND_LIMITS.taper[1] * H, tilt: 0, fill: Number(process.env.FILL ?? 1) },
    { aspect: 1 + (SG_HAND_LIMITS.aspect[1] - 1) * H, taper: SG_HAND_LIMITS.taper[0] * H, tilt: 0, fill: Number(process.env.FILL ?? 1) },
  ]
  const fails: string[] = []
  let total = 0
  for (const s of SG_SUBJECTS) {
    for (const v of sgVariants(s)) {
      for (const [hi, hand] of hands.entries()) {
        for (const tilt of sgSubjectFlies(s) ? [SG_HAND_LIMITS.tilt, -SG_HAND_LIMITS.tilt] : [0]) {
          total++
          const r = buildMosaic({ box: box2, drawing: applySgHand(sgVariantDrawing(s, v), { ...hand, tilt }), composition: alone, detail, rng: createRng(1), style: { ink: SG_INK_PROFILES[Number(process.env.INK ?? 1)] } })
          if (!r.ok) fails.push(`${s.id} ${hi} ${tilt}: ${r.reason}`)
        }
      }
    }
  }
  console.log(total, fails.length, [...new Set(fails)].slice(0, 60).join('\n'))
}, 600_000)
