import type { FabricObject } from 'fabric'
import {
  createFabricIconGroupFromPhosphorSvg,
  isPhosphorDuotoneSecondary,
  isPhosphorViewBoxFrame,
  PHOSPHOR_SERIALIZE_PROPS,
  PHOSPHOR_VIEWBOX_SIZE,
} from '@/utils/phosphor-fabric'
import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { nextObjectId, type StudioTag } from './studio-fabric-builders'

/** Soft gray fill inside the duotone glyph. */
const PHOSPHOR_DUOTONE_FILL = '#D6D6D6'
/** Softened dark outline — lighter than pure black so the rim reads thinner. */
const PHOSPHOR_DUOTONE_OUTLINE = '#4B4B4B'

/**
 * Full Phosphor duotone catalog (all icons in @phosphor-icons/core).
 * Eager sync load — keep worksheet generate synchronous.
 */
const PHOSPHOR_SVG_MODULES = import.meta.glob<string>(
  '../../../node_modules/@phosphor-icons/core/assets/duotone/*-duotone.svg',
  { eager: true, query: '?raw', import: 'default' },
)

const ICON_SVGS = new Map<string, string>()

for (const [path, svg] of Object.entries(PHOSPHOR_SVG_MODULES)) {
  const file = path.split('/').pop() ?? ''
  const name = file.replace(/-duotone\.svg$/, '')
  if (name && typeof svg === 'string' && svg.length > 0) ICON_SVGS.set(name, svg)
}

/** Sorted list of every loaded Phosphor duotone icon name. */
export const PHOSPHOR_DUOTONE_ICON_NAMES: readonly string[] = [
  ...ICON_SVGS.keys(),
].sort((a, b) => a.localeCompare(b))

if (PHOSPHOR_DUOTONE_ICON_NAMES.length < 1000) {
  throw new Error(
    `phosphor duotone catalog too small: ${PHOSPHOR_DUOTONE_ICON_NAMES.length}`,
  )
}

export function hasPhosphorIcon(iconName: string): boolean {
  return ICON_SVGS.has(iconName)
}

export function getPhosphorIconSvg(iconName: string): string {
  const svg = ICON_SVGS.get(iconName)
  if (!svg) {
    throw new Error(`Unknown studio phosphor icon: ${iconName}`)
  }
  return svg
}

/**
 * Duotone paint: light gray secondary fill + dark primary outline.
 * Never stroke the Group shell.
 */
function paintDuotone(obj: FabricObject): void {
  if (isPhosphorViewBoxFrame(obj)) return

  const children = (
    obj as FabricObject & { getObjects?: () => FabricObject[] }
  ).getObjects?.()
  if (children && children.length > 0) {
    for (const child of children) paintDuotone(child)
    obj.set({
      fill: 'transparent',
      stroke: undefined,
      strokeWidth: 0,
    })
    return
  }

  const isSecondary = isPhosphorDuotoneSecondary(obj)
  obj.set({
    fill: isSecondary ? PHOSPHOR_DUOTONE_FILL : PHOSPHOR_DUOTONE_OUTLINE,
    stroke: undefined,
    strokeWidth: 0,
    opacity: 1,
  })
}

/**
 * Phosphor duotone icon → Studio Fabric JSON group (gray fill + dark outline).
 */
export function buildPhosphorIconPath(
  iconName: string,
  spec: {
    left: number
    top: number
    size: number
    /** Degrees — Fabric group angle. */
    angle?: number
  },
  tag: StudioTag,
  role: StudioRole = 'prompt',
): StudioFabricObject {
  const targetSize = Math.max(1, spec.size)
  const scale = targetSize / PHOSPHOR_VIEWBOX_SIZE
  const group = createFabricIconGroupFromPhosphorSvg(getPhosphorIconSvg(iconName), {
    targetWidth: targetSize,
  })
  paintDuotone(group)
  group.set({
    left: spec.left,
    top: spec.top,
    originX: 'center',
    originY: 'center',
    width: PHOSPHOR_VIEWBOX_SIZE,
    height: PHOSPHOR_VIEWBOX_SIZE,
    scaleX: scale,
    scaleY: scale,
    angle: spec.angle ?? 0,
  })
  group.setCoords()

  // Include `data` so viewBox-frame / duotone-secondary markers survive enliven.
  // Cast: Fabric Group.toObject typings omit custom props like `data`.
  const serialized = group.toObject(PHOSPHOR_SERIALIZE_PROPS as never) as unknown as StudioFabricObject & {
    data?: Record<string, unknown>
  }
  group.dispose()

  return {
    ...serialized,
    data: {
      ...(serialized.data ?? {}),
      source: 'phosphor-icon',
      iconName,
      phosphorWeight: 'duotone',
    },
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    ...(role === 'answer' ? { visible: false } : {}),
  }
}
