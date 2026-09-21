import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  contentBox,
  splitTop,
  insetBox,
  insetHorizontal,
  drawHeader,
  unionObjectBounds,
} from '../studio-layout'
import { buildGroup, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_CONTENT_SAFE_INSET_X, STUDIO_DIGIT_FONT } from '@/constants/studio.constants'
import { kickOffFontFamilyLoading } from '@/utils/font-loader'
import {
  placeNodes,
  drawConnectors,
  drawRooms,
  drawNodes,
  nudgeBox,
  type RouteShape,
} from './layout-routes'
import { drawLociTable } from './layout-table'

const INSTRUCTION =
  'At each stop, write a familiar place, then the thing to remember there'

const ROUTE_SHAPES = new Set<RouteShape>(['house', 'street', 'path'])

function parseRouteShape(value: unknown): RouteShape {
  const shape = String(value ?? 'house') as RouteShape
  return ROUTE_SHAPES.has(shape) ? shape : 'house'
}

function clampLociCount(value: unknown): number {
  const n = Math.round(Number(value ?? 8))
  if (!Number.isFinite(n)) return 8
  return Math.min(12, Math.max(5, n))
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const n = clampLociCount(config.lociCount)
  const routeShape = parseRouteShape(config.routeShape)
  const font = String(config.fontFamily)
  void kickOffFontFamilyLoading(STUDIO_DIGIT_FONT)
  const rng = createRng(ctx.seed)

  const tag: StudioTag = {
    templateKey: 'memory-palace',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, INSTRUCTION)
  objects.push(...header.objects)

  const [routeBox, tableBox] = splitTop(header.body, header.body.height * 0.42)
  // Pad leaves room for a small seed nudge so bulk house sheets stay unique
  // without jittering individual stops (keeps connectors axis-aligned).
  const routePad = 24
  const houseNudgeMax = 10
  const routeBase = insetBox(routeBox, routePad)
  const routeInner =
    routeShape === 'house' ? nudgeBox(routeBase, rng, houseNudgeMax) : routeBase
  const nodes = placeNodes(routeShape, routeInner, n, rng)

  const routeObjects: StudioFabricObject[] = []
  drawConnectors(routeObjects, nodes, tag)
  if (routeShape === 'house') drawRooms(routeObjects, routeInner, n, tag)
  drawNodes(routeObjects, nodes, routeInner, tag)
  // structure — group origin enters bulk fingerprints (children are relative)
  objects.push(
    buildGroup(
      routeObjects,
      unionObjectBounds(routeObjects) ?? routeInner,
      tag,
      'structure',
    ),
  )

  const tableInner = insetBox(tableBox, 12)
  const tableObjects: StudioFabricObject[] = []
  drawLociTable(tableObjects, tableInner, n, font, tag)
  objects.push(buildGroup(tableObjects, unionObjectBounds(tableObjects) ?? tableInner, tag))

  return [{ pageRole: 'single', objects }]
}

export const memoryPalaceTemplate: StudioTemplateDefinition = {
  key: 'memory-palace',
  label: 'Memory Palace Builder',
  category: 'memory',
  description:
    'A method of loci worksheet. Plan a numbered route through a place you know well, then note each stop and the vivid image you leave there. You fill it in, so there is no single right answer.',
  pageCount: 1,
  producesAnswerKey: false,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.5">
      <path d="M8 12h12v10H8zM26 12h12v10H26zM44 12h12v10H44z"/>
      <path d="M14 22v6h36v-6M32 22v6" stroke-dasharray="3 3"/>
    </g>
    <g fill="currentColor" font-size="7" text-anchor="middle" font-family="sans-serif">
      <text x="14" y="19">1</text><text x="32" y="19">2</text><text x="50" y="19">3</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'lociCount',
      label: 'Number of stops',
      type: 'number',
      default: 8,
      min: 5,
      max: 12,
      step: 1,
      help: 'How many places along the route. 5–12 works best for one page.',
    },
    {
      key: 'routeShape',
      label: 'Route layout',
      type: 'select',
      default: 'house',
      options: [
        { label: 'House rooms', value: 'house' },
        { label: 'Street / journey', value: 'street' },
        { label: 'Winding path', value: 'path' },
      ],
      help: 'Shape of the journey diagram. Purely visual, so pick what feels familiar.',
    },
  ],
  generate,
}
