import type { FabricObject } from 'fabric'
import {
  createFabricIconGroupFromLucideNode,
  isLucideViewBoxFrame,
  LUCIDE_VIEWBOX_SIZE,
  type LucideIconNode,
} from '@/utils/lucide-fabric'
import type { StudioFabricObject, StudioRole } from '@/types/studio-template.types'
import { STUDIO_INK, STUDIO_STROKE_NORMAL } from '@/constants/studio.constants'
import { nextObjectId, type StudioTag } from './studio-fabric-builders'

/**
 * Eager sync load of curated lucide nodes used by Studio templates.
 * Keep the brace list in sync with `data/studio/icons/objects.json` names.
 * (Aliases like `home.js` re-export without `__iconNode` — use `house`.)
 */
const OBJECT_ICON_MODULES = import.meta.glob<{ __iconNode: LucideIconNode }>(
  '../../../node_modules/lucide-react/dist/esm/icons/{alarm-clock,ambulance,anchor,anvil,apple,armchair,atom,audio-lines,axe,baby,backpack,balloon,banana,bath,battery,beaker,bean,bed,beef,beer,bell,bike,binoculars,bird,birdhouse,bone,book,book-open,bottle-wine,bow-arrow,brain,briefcase,brush,bug,building,bus,cable-car,cake,calculator,camera,candy,car,caravan,carrot,cassette-tape,castle,cat,chef-hat,cherry,chess-pawn,church,circuit-board,citrus,clock,cloud,cloud-rain,cloud-sun,clover,coffee,compass,cookie,cooking-pot,cpu,croissant,cup-soda,dice-5,dices,disc-3,dna,dog,donut,door-closed,drill,droplet,drum,drumstick,dumbbell,earth,egg,eraser,factory,fan,feather,fence,fish,fishing-hook,fishing-rod,flag,flame,flashlight,flask-conical,flower,flower-2,folder,footprints,fuel,gamepad-2,gift,glasses,globe,graduation-cap,grape,guitar,hamburger,hammer,headphones,heart,heater,helicopter,hospital,hotel,house,ice-cream-bowl,ice-cream-cone,key,keyboard,lamp,lamp-desk,lamp-floor,landmark,laptop,leaf,library,lightbulb,lock,lollipop,luggage,magnet,mailbox,map,map-pin,martini,medal,mic,microscope,microwave,milk,monitor,moon,motorbike,mountain,mountain-snow,mouse,music,music-2,navigation,newspaper,notebook,nut,orbit,paintbrush,palette,panda,paperclip,parking-meter,paw-print,pen,pencil,phone,piano,piggy-bank,pill,pin,pipette,pizza,plane,plug,popcorn,printer,puzzle,rabbit,radiation,radio,rainbow,rat,recycle,refrigerator,rocket,roller-coaster,ruler,sailboat,salad,sandwich,satellite,scale,school,scissors,scooter,shell,shield,ship,shirt,shopping-cart,shovel,shower-head,shrimp,shrub,smartphone,snail,snowflake,sofa,soup,sparkles,speaker,sprout,squirrel,star,stethoscope,sticky-note,store,sun,sunrise,sunset,sword,swords,syringe,tablet,target,telescope,tent,test-tube,test-tubes,thermometer,tornado,traffic-cone,tram-front,trash-2,tree-deciduous,tree-pine,trees,trophy,truck,turtle,tv,umbrella,university,utensils,utensils-crossed,volleyball,wallet,washing-machine,watch,waves,weight,wheat,wind,wine,worm,wrench}.js',
  { eager: true },
)

/**
 * Extra nodes for Symbol Hunt (geometrics + arrows) — keep in sync with
 * `symbol-hunt/icons.ts` pools that are not already in objects.json.
 */
const HUNT_ICON_MODULES = import.meta.glob<{ __iconNode: LucideIconNode }>(
  '../../../node_modules/lucide-react/dist/esm/icons/{activity,arrow-big-down,arrow-big-left,arrow-big-right,arrow-big-up,arrow-down,arrow-down-left,arrow-down-right,arrow-left,arrow-left-right,arrow-right,arrow-up,arrow-up-down,arrow-up-left,arrow-up-right,asterisk,award,binary,bluetooth,bookmark,box,check,chevron-down,chevron-left,chevron-right,chevron-up,chevrons-down,chevrons-up,code,coins,cone,corner-down-left,corner-down-right,corner-up-left,corner-up-right,crown,cylinder,database,diamond,ear,equal,eye,gem,hand,hard-drive,hash,hexagon,infinity,lock-open,minus,move-down,move-horizontal,move-left,move-right,move-up,move-vertical,octagon,package,pentagon,percent,plus,pyramid,rectangle-horizontal,rectangle-vertical,redo-2,refresh-ccw,refresh-cw,rotate-ccw,rotate-cw,server,shopping-bag,slash,smile,square,square-dashed,terminal,thumbs-up,triangle,triangle-right,undo-2,wifi,x,zap}.js',
  { eager: true },
)

const ICON_NODES = new Map<string, LucideIconNode>()

function ingestIconModules(
  modules: Record<string, { __iconNode: LucideIconNode }>,
): void {
  for (const [path, mod] of Object.entries(modules)) {
    const file = path.split('/').pop() ?? ''
    const name = file.replace(/\.js$/, '')
    if (mod?.__iconNode) ICON_NODES.set(name, mod.__iconNode)
  }
}

ingestIconModules(OBJECT_ICON_MODULES)
ingestIconModules(HUNT_ICON_MODULES)

export function hasLucideIconNode(iconName: string): boolean {
  return ICON_NODES.has(iconName)
}

export function getLucideIconNode(iconName: string): LucideIconNode {
  const node = ICON_NODES.get(iconName)
  if (!node) {
    throw new Error(`Unknown studio lucide icon: ${iconName}`)
  }
  return node
}

export type StudioIconFillMode = 'outline' | 'solid' | 'dashed'

/**
 * Paint glyph geometry only. Never stroke the Group shell — that draws an empty
 * bounding-box square (often oversized after scale) on top of the icon field.
 */
function paintMonochrome(
  obj: FabricObject,
  strokeWidth: number,
  fillMode: StudioIconFillMode = 'outline',
): void {
  if (isLucideViewBoxFrame(obj)) return

  const children = (
    obj as FabricObject & { getObjects?: () => FabricObject[] }
  ).getObjects?.()
  if (children && children.length > 0) {
    for (const child of children) paintMonochrome(child, strokeWidth, fillMode)
    obj.set({
      fill: 'transparent',
      stroke: undefined,
      strokeWidth: 0,
    })
    return
  }

  const dash =
    fillMode === 'dashed'
      ? [Math.max(4, strokeWidth * 2.5), Math.max(3, strokeWidth * 1.6)]
      : undefined

  obj.set({
    fill: fillMode === 'solid' ? STUDIO_INK : 'transparent',
    stroke: STUDIO_INK,
    strokeWidth,
    strokeUniform: true,
    strokeLineCap: 'round',
    strokeLineJoin: 'round',
    strokeDashArray: dash,
  })
}

/**
 * Lucide line icon → Studio Fabric JSON group, forced monochrome (KDP B&W).
 * Serializes via Fabric toObject() so enlivenObjects can round-trip it.
 * Do NOT rewrite nested `type` fields (e.g. layoutManager) — that breaks enliven.
 *
 * Scale once from the 24×24 viewBox (not content bbox). Path stroke is the
 * absolute visual weight with `strokeUniform` — do not divide by scale, or
 * smaller dense-grid icons read heavier than medium (~240).
 */
export function buildIconPath(
  iconName: string,
  spec: {
    left: number
    top: number
    size: number
    strokeWidth?: number
    /** Degrees — Fabric group angle (Change Detection rotations). */
    angle?: number
    /** Outline (default) or solid fill for closed Lucide paths. */
    fillMode?: StudioIconFillMode
  },
  tag: StudioTag,
  role: StudioRole = 'prompt',
): StudioFabricObject {
  const visualStroke = spec.strokeWidth ?? STUDIO_STROKE_NORMAL
  const fillMode = spec.fillMode ?? 'outline'
  const targetSize = Math.max(1, spec.size)
  const scale = targetSize / LUCIDE_VIEWBOX_SIZE
  // Single scale pass — avoid create@72 then rescale (bakes oversized group boxes).
  const group = createFabricIconGroupFromLucideNode(getLucideIconNode(iconName), {
    targetWidth: targetSize,
  })
  paintMonochrome(group, visualStroke, fillMode)
  // Re-pin after paint — child stroke padding must not inflate the group box.
  group.set({
    left: spec.left,
    top: spec.top,
    originX: 'center',
    originY: 'center',
    width: LUCIDE_VIEWBOX_SIZE,
    height: LUCIDE_VIEWBOX_SIZE,
    scaleX: scale,
    scaleY: scale,
    angle: spec.angle ?? 0,
  })
  group.setCoords()

  // Include `data` so viewBox-frame markers survive enliven.
  // Cast: Fabric Group.toObject typings omit custom props like `data`.
  const serialized = group.toObject(['data'] as never) as unknown as StudioFabricObject & {
    data?: Record<string, unknown>
  }
  group.dispose()

  return {
    ...serialized,
    data: {
      ...(serialized.data ?? {}),
      source: 'lucide-icon',
      iconName,
    },
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    ...(role === 'answer' ? { visible: false } : {}),
  }
}
