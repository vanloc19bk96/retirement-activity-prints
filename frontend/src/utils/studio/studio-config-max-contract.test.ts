import { describe, it, expect } from 'vitest'
import { STUDIO_TEMPLATES, buildDefaultConfig } from '@/constants/studio-templates'
import { resolveStudioConfigField } from './studio-config-fields'
import { withStudioPageHeader } from './studio-page-header'
import { resetObjectCounter } from './studio-fabric-builders'
import { DPI } from '@/types/canvas-settings.types'
import type {
  StudioConfig,
  StudioConfigField,
  StudioGenerateContext,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'

/**
 * A number field's max is a promise: ask for it and the sheet prints it.
 *
 * Generators quietly shrink counts that do not fit (rows below a writing
 * minimum, blocks below a legibility floor). When the schema max sits above
 * what the page can hold, the form offers 10 items and the page draws 9 — and
 * turning the page title on is enough to cause it, because the heading eats
 * into the body the count was fitted against.
 *
 * The proxy: a page generated at `max` must differ from one generated at the
 * step below it. Identical output means both requests were clamped to the same
 * count, so `max` was never reachable.
 */
const TRIMS: ReadonlyArray<readonly [number, number]> = [
  [5, 8],
  [5.5, 8.5],
  [6, 9],
  [8.5, 11],
]

/** A real KDP interior page: DPI 96, inside margin 0.375", the rest 0.25". */
const kdpCtx = (wIn: number, hIn: number): StudioGenerateContext => ({
  pageWidth: Math.round(wIn * DPI),
  pageHeight: Math.round(hIn * DPI),
  margin: {
    top: Math.round(0.25 * DPI),
    right: Math.round(0.25 * DPI),
    bottom: Math.round(0.25 * DPI),
    left: Math.round(0.375 * DPI),
  },
  seed: 4242,
  instanceId: 'max-contract',
})

/** Cheap page identity — object count plus serialized size. */
function pageDigest(template: StudioTemplateDefinition, config: StudioConfig, ctx: StudioGenerateContext): string {
  resetObjectCounter()
  const objects = template.generate(config, ctx).flatMap((page) => page.objects)
  return `${objects.length}:${JSON.stringify(objects).length}`
}

/** Select-field combinations that change layout, capped so the sweep stays quick. */
function selectCombos(template: StudioTemplateDefinition, base: StudioConfig): StudioConfig[] {
  const selects = template.configSchema.filter(
    (f) =>
      f.type === 'select' &&
      f.options &&
      f.options.length > 1 &&
      f.key !== 'fontFamily' &&
      f.key !== 'source',
  )
  let combos: StudioConfig[] = [base]
  for (const field of selects) {
    const next: StudioConfig[] = []
    for (const combo of combos) {
      for (const option of field.options!) next.push({ ...combo, [field.key]: option.value })
    }
    combos = next
    if (combos.length >= 16) break
  }
  return combos.slice(0, 16)
}

/** Highest / next-highest allowed values for a resolved number field. */
function topTwo(field: StudioConfigField): [number, number] | null {
  if (field.values && field.values.length > 1) {
    const sorted = [...field.values].sort((a, b) => a - b)
    return [sorted[sorted.length - 1]!, sorted[sorted.length - 2]!]
  }
  const { min, max } = field
  if (min == null || max == null) return null
  const below = max - (field.step ?? 1)
  if (below < min) return null
  return [max, below]
}

describe('studio number-field max is reachable', () => {
  it.each(STUDIO_TEMPLATES.filter((t) => !t.prefetch).map((t) => [t.key, t] as const))(
    '%s prints the count its schema offers',
    (_key, template) => {
      for (const [wIn, hIn] of TRIMS) {
        const ctx = kdpCtx(wIn, hIn)
        const layout = {
          pageWidth: ctx.pageWidth,
          pageHeight: ctx.pageHeight,
          margin: ctx.margin,
        }
        for (const showTitle of [false, true]) {
          const root = withStudioPageHeader(
            { ...buildDefaultConfig(template), fontFamily: 'Inter' },
            { showTitle },
          )
          for (const base of selectCombos(template, root)) {
            if (template.validateConfig?.(base)) continue
            for (const rawField of template.configSchema) {
              if (rawField.type !== 'number') continue
              if (rawField.visibleWhen && !rawField.visibleWhen(base)) continue

              const bounds = topTwo(resolveStudioConfigField(rawField, base, layout))
              if (!bounds) continue
              const [max, below] = bounds
              const atMax = { ...base, [rawField.key]: max }
              const atBelow = { ...base, [rawField.key]: below }
              if (template.validateConfig?.(atMax) || template.validateConfig?.(atBelow)) continue

              const where = `${template.key}.${rawField.key} ${wIn}×${hIn} title=${showTitle} max=${max}`
              expect(pageDigest(template, atMax, ctx), where).not.toBe(
                pageDigest(template, atBelow, ctx),
              )
            }
          }
        }
      }
    },
    // Full generate on four trims per template — well past the 5 s default.
    60_000,
  )
})
