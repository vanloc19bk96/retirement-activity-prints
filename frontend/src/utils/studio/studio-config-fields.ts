import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigLayoutContext,
} from '@/types/studio-template.types'

/** Prefer the next allowed value at or above `raw` (matches pad-up layout rules). */
function snapToAllowedValue(values: number[], raw: number): number {
  for (const candidate of values) {
    if (candidate >= raw) return candidate
  }
  return values[values.length - 1] ?? raw
}

/** Resolve dynamic min/max/help/warning/values against the current config. */
export function resolveStudioConfigField(
  field: StudioConfigField,
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
): StudioConfigField {
  const min = field.minWhen ? field.minWhen(config, layout) : field.min
  const max = field.maxWhen ? field.maxWhen(config, layout) : field.max
  const help = field.helpWhen ? field.helpWhen(config, layout) : field.help
  const warningRaw = field.warningWhen ? field.warningWhen(config, layout) : field.warning
  const warning = warningRaw ?? undefined
  const values = field.valuesWhen ? field.valuesWhen(config, layout) : field.values
  const options = field.optionsWhen ? field.optionsWhen(config, layout) : field.options
  if (
    min === field.min &&
    max === field.max &&
    help === field.help &&
    warning === field.warning &&
    values === field.values &&
    options === field.options
  ) {
    return field
  }
  return { ...field, min, max, help, warning, values, options }
}

/**
 * Clamp number fields to resolved min/max (and snap to discrete `values`)
 * so dependent sliders stay valid when another field changes.
 *
 * `boundsConfig` resolves the bounds while the values are read from and written
 * back to `config`. Callers editing a partial draft (a bulk variation, a book
 * game) pass the full config the run will generate with — otherwise a max that
 * depends on the page header is measured without it and reads one item high.
 */
export function clampStudioConfigToSchema(
  schema: readonly StudioConfigField[],
  config: StudioConfig,
  layout?: StudioConfigLayoutContext,
  boundsConfig?: StudioConfig,
): StudioConfig {
  let next = config
  let bounds = boundsConfig ?? config
  for (const field of schema) {
    if (field.type !== 'number') continue
    const hasBounds =
      field.minWhen ||
      field.maxWhen ||
      field.min != null ||
      field.max != null ||
      field.valuesWhen ||
      field.values
    if (!hasBounds) continue

    const resolved = resolveStudioConfigField(field, bounds, layout)
    const raw = Number(next[field.key])
    if (!Number.isFinite(raw)) continue

    let nextValue = raw
    if (resolved.values && resolved.values.length > 0) {
      nextValue = snapToAllowedValue(resolved.values, raw)
    } else {
      const min = resolved.min ?? Number.NEGATIVE_INFINITY
      const max = resolved.max ?? Number.POSITIVE_INFINITY
      const lo = Math.min(min, max)
      const hi = Math.max(min, max)
      nextValue = Math.min(hi, Math.max(lo, raw))
    }

    if (nextValue === raw) continue
    next = { ...next, [field.key]: nextValue }
    // Later fields resolve against the value this one just landed on.
    bounds = { ...bounds, [field.key]: nextValue }
  }
  return next
}
