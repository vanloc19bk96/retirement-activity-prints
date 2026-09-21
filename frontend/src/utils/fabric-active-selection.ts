/**
 * Fabric v6 uses class type `ActiveSelection` with `multiSelectionStacking`.
 * Comparing `type === 'activeSelection'` never matches, so multi-select branches must not rely on that string.
 */
export function isFabricActiveSelection(target: unknown): target is { getObjects: () => unknown[] } {
  if (typeof target !== 'object' || target === null) return false
  if (typeof (target as { getObjects?: unknown }).getObjects !== 'function') return false
  return 'multiSelectionStacking' in target
}
