// Temporary diagnostic: measures generated studio pages with real browser fonts + Fabric.
import { StaticCanvas, util, Group, type FabricObject } from 'fabric'
import '@/utils/fabric-text-vertical-metrics'
import { DPI, calculateDimensionsWithBleed, calculateMarginGuide } from '@/types/canvas-settings.types'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { ensureFontFamilyLoaded } from '@/utils/font-loader'
import { clearStudioTextMetricsCache } from './studio-text-metrics'
import { remeasureAllFabricEditableTextOnCanvas } from '@/utils/canvas-text'
import { resolveStudioMarginForPage } from './studio-margin'
import { resetObjectCounter } from './studio-fabric-builders'
import { clearStudioRecentContent } from './studio-variety'
import { withStudioGameName } from './studio-instance-pages'
import { buildAnswerPage } from './studio-answer-key'
import type { StudioFabricObject, StudioConfigField } from '@/types/studio-template.types'

export async function probe(options: { threshold?: number; only?: string[]; trims?: [number, number][]; bleeds?: boolean[]; seeds?: number[]; font?: string }) {
  const font = options.font ?? 'PT Serif'
  await ensureFontFamilyLoaded(font)
  await ensureFontFamilyLoaded('Inter')
  clearStudioTextMetricsCache()
  const rows: string[] = []
  let gens = 0
  for (const template of STUDIO_TEMPLATES) {
    if (options.only && !options.only.includes(template.key)) continue
    const base = { ...buildDefaultConfig(template), fontFamily: font, showInstructions: true, title: withStudioGameName('Game 12', template.label) }
    const variants: Record<string, unknown>[] = [{}]
    for (const f of (template.configSchema as StudioConfigField[]) ?? []) {
      if (f.type !== 'select' || !['level', 'difficulty', 'size', 'gridSize'].includes(f.key)) continue
      for (const opt of (f as { options?: { value: unknown }[] }).options ?? []) variants.push({ [f.key]: opt.value })
    }
    for (const [w, h] of options.trims ?? [[6, 9], [8.5, 11]]) {
      for (const bleed of options.bleeds ?? [false]) {
        for (const v of variants) {
          for (const seed of options.seeds ?? [42]) {
            const dims = calculateDimensionsWithBleed({ widthInches: w, heightInches: h, widthPixels: Math.round(w * DPI), heightPixels: Math.round(h * DPI) }, bleed)
            const margin = resolveStudioMarginForPage({ pageIndex: 0, pageWidth: dims.widthPixels, pageHeight: dims.heightPixels, marginGuide: calculateMarginGuide(24, bleed) })
            const ctx = { pageWidth: dims.widthPixels, pageHeight: dims.heightPixels, margin, seed, instanceId: 'probe' }
            clearStudioRecentContent()
            resetObjectCounter()
            gens++
            let pages
            try {
              pages = template.generate({ ...base, ...v, seed }, ctx)
            } catch (err) {
              rows.push(`${template.key} ${w}x${h} ${JSON.stringify(v)} THROW ${(err as Error).message}`)
              continue
            }
            const safe = { l: margin.left, t: margin.top, r: ctx.pageWidth - margin.right, b: ctx.pageHeight - margin.bottom }
            for (let pi = 0; pi < pages.length; pi++) {
              const page = pages[pi]!
              const sets: [string, StudioFabricObject[]][] = [['page', page.objects]]
              if (template.producesAnswerKey) sets.push(['answer', buildAnswerPage(page.answerSourceObjects ?? page.objects, '#c00', { contentWidth: ctx.pageWidth - margin.left - margin.right - 56 })])
              for (const [kind, objs] of sets) {
                const canvas = new StaticCanvas(undefined, { width: ctx.pageWidth, height: ctx.pageHeight })
                const live = (await util.enlivenObjects(objs as never[])) as FabricObject[]
                live.forEach((o) => canvas.add(o))
                remeasureAllFabricEditableTextOnCanvas(canvas)
                let worst = -Infinity
                let what = ''
                const walk = (o: FabricObject) => {
                  if (!o.visible) return
                  if (o instanceof Group) {
                    o.getObjects().forEach(walk)
                    return
                  }
                  const r = o.getBoundingRect()
                  const tb = o as unknown as { type: string; getLineWidth?: (i: number) => number; _textLines?: unknown[]; textAlign?: string }
                  if (tb.type === 'textbox' && tb.getLineWidth && tb._textLines && tb.textAlign === 'center' && !o.group) {
                    let widest = 0
                    for (let i = 0; i < tb._textLines.length; i++) widest = Math.max(widest, tb.getLineWidth(i))
                    const cx = r.left + r.width / 2
                    r.left = cx - widest / 2
                    r.width = widest
                  }
                  const over = Math.max(safe.l - r.left, safe.t - r.top, r.left + r.width - safe.r, r.top + r.height - safe.b)
                  if (over > worst) {
                    worst = over
                    const d = (o as unknown as { data?: Record<string, unknown> }).data ?? {}
                    what = `${o.type} "${String((o as unknown as { text?: string }).text ?? '').slice(0, 30)}" ${String(d.paPart ?? '')} rect=[${r.left.toFixed(0)},${r.top.toFixed(0)},${(r.left + r.width).toFixed(0)},${(r.top + r.height).toFixed(0)}] safe=[${safe.l},${safe.t},${safe.r},${safe.b}]`
                  }
                }
                live.forEach(walk)
                if (worst > (options.threshold ?? 1)) rows.push(`${template.key} ${w}x${h}${bleed ? ' bleed' : ''} ${JSON.stringify(v)} seed=${seed} p${pi} ${kind} over=${worst.toFixed(1)} ${what}`)
                canvas.dispose()
              }
            }
          }
        }
      }
    }
  }
  return { gens, rows }
}
