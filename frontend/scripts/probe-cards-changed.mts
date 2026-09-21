import { buildDefaultConfig } from '../src/constants/studio-templates.ts'
import { cardsChangedTemplate } from '../src/utils/studio/cards-changed/generate.ts'
import { buildAnswerPage } from '../src/utils/studio/studio-answer-key.ts'
import { STUDIO_ANSWER_INK_MONO } from '../src/constants/studio.constants.ts'
import { resetObjectCounter } from '../src/utils/studio/studio-fabric-builders.ts'
import { clearStudioRecentContent } from '../src/utils/studio/studio-variety.ts'
import { writeFileSync } from 'node:fs'

function extent(o: any) {
  const scaleX = o.scaleX ?? 1
  const scaleY = o.scaleY ?? 1
  const width = (o.width ?? (o.radius != null ? o.radius * 2 : 0)) * scaleX
  const height = (o.height ?? (o.radius != null ? o.radius * 2 : 0)) * scaleY
  let left = o.left ?? 0
  let top = o.top ?? 0
  if (o.originX === 'center') left -= width / 2
  if (o.originX === 'right') left -= width
  if (o.originY === 'center') top -= height / 2
  if (o.originY === 'bottom') top -= height
  const sw = (o.strokeWidth ?? 0) / 2
  return { left: left - sw, top: top - sw, right: left + width + sw, bottom: top + height + sw }
}

function walkAbsolute(objects: any[], dx = 0, dy = 0, acc: any[] = []) {
  for (const o of objects) {
    if (o.type === 'group' && o.objects) {
      const cx = (o.left ?? 0) + (o.width ?? 0) / 2
      const cy = (o.top ?? 0) + (o.height ?? 0) / 2
      walkAbsolute(o.objects, dx + cx, dy + cy, acc)
    } else {
      acc.push(extent({ ...o, left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy }))
    }
  }
  return acc
}

const base = { ...buildDefaultConfig(cardsChangedTemplate), fontFamily: 'PT Serif' }
const ctxs = [
  { name: '5x8', pageWidth: 576, pageHeight: 864, margin: { top: 36, right: 36, bottom: 36, left: 48 } },
  { name: 'letter', pageWidth: 816, pageHeight: 1056, margin: { top: 48, right: 48, bottom: 48, left: 96 } },
]

const lines: string[] = []
for (const page of ctxs) {
  let worst = { left: Infinity, right: Infinity, top: Infinity, bottom: Infinity }
  let viol = 0
  for (let seed = 0; seed < 20; seed++) {
    for (const tier of ['easy', 'medium', 'hard']) {
      clearStudioRecentContent()
      resetObjectCounter()
      const ctx = { ...page, seed, instanceId: 't' + seed, ownerKey: 'u' }
      const [pg] = cardsChangedTemplate.generate({ ...base, tier, changeTypes: ['rank', 'suit', 'swap'], seed }, ctx as any)
      const key = buildAnswerPage(pg.answerSourceObjects!, STUDIO_ANSWER_INK_MONO)
      for (const objs of [pg.objects, key]) {
        for (const e of walkAbsolute(objs)) {
          const dl = e.left - page.margin.left
          const dr = page.pageWidth - page.margin.right - e.right
          const dt = e.top - page.margin.top
          const db = page.pageHeight - page.margin.bottom - e.bottom
          worst.left = Math.min(worst.left, dl)
          worst.right = Math.min(worst.right, dr)
          worst.top = Math.min(worst.top, dt)
          worst.bottom = Math.min(worst.bottom, db)
          if (dl < -0.5 || dr < -0.5 || dt < -0.5 || db < -0.5) viol++
        }
      }
    }
  }
  lines.push(`${page.name} worst L/R/T/B=${JSON.stringify(worst)} violations=${viol}`)
}
writeFileSync('probe-out.txt', lines.join('\n'))
console.log(lines.join('\n'))
