import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import {
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'
import { deriveSeed } from '../studio-rng'
import { contentBox, drawHeader, insetBox, insetHorizontal } from '../studio-layout'
import type { StudioTag } from '../studio-fabric-builders'
import { generateRoute, routeStepsKey, type RouteSpec } from './route'
import { buildFigure, figureSlots } from './layout'
import { FOLLOW_THE_ROUTE_FIELDS } from './schema'
import { FIELD_INSET, FOLLOW_THE_ROUTE_KEY, pageInstruction, routeSpec } from './spec'
import { resolveRouteSettings, type Route, type RouteSettings } from './types'

export { FOLLOW_THE_ROUTE_KEY } from './spec'
export { printedCellSize } from './schema'

/** Re-rolls before a figure is allowed to repeat a move list already on the page. */
const MAX_ROUTE_ATTEMPTS = 12

/**
 * One route per figure.
 *
 * The seed is salted with the seller's owner key, so two sellers who happen to
 * draw the same seed do not ship the same page; and a figure re-rolls while its
 * move list repeats one already on the page, because a duplicated list reads as
 * a printing mistake even when the grids differ.
 */
export function buildRoutes(options: {
  count: number
  spec: RouteSpec
  seed: number
  ownerKey?: string
}): Route[] {
  const { count, spec, seed, ownerKey } = options
  const salt = ownerKey ? `${ownerKey}:` : ''
  const seen = new Set<string>()
  const routes: Route[] = []

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < MAX_ROUTE_ATTEMPTS; attempt++) {
      const route = generateRoute(deriveSeed(seed, `${salt}route:${i}:${attempt}`), spec)
      const key = routeStepsKey(route)
      // Give up on the last attempt rather than print a short page.
      if (attempt < MAX_ROUTE_ATTEMPTS - 1 && seen.has(key)) continue
      seen.add(key)
      routes.push(route)
      break
    }
  }
  return routes
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  routes: readonly Route[]
  settings: RouteSettings
  font: string
  instruction: string
}): StudioFabricObject[] {
  const { config, ctx, tag, routes, settings, font, instruction } = options
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  const slots = figureSlots(insetBox(header.body, FIELD_INSET), settings.figures)

  const objects: StudioFabricObject[] = [...header.objects]
  routes.forEach((route, index) => {
    const slot = slots[index]
    if (!slot) return
    const figure = buildFigure({
      slot,
      route,
      settings,
      font,
      tag,
    })
    if (figure) objects.push(figure)
  })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const settings = resolveRouteSettings(config)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const tag: StudioTag = {
    templateKey: FOLLOW_THE_ROUTE_KEY,
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const routes = buildRoutes({
    count: settings.figures,
    spec: routeSpec(settings),
    seed: ctx.seed,
    ownerKey: ctx.ownerKey,
  })

  const page = { config, ctx, tag, routes, settings, font }
  return [
    {
      pageRole: 'single',
      objects: layoutPage({
        ...page,
        instruction: pageInstruction(settings.mode, settings.instructionStyle),
      }),
      // No how-to on the key — the taller body re-fits the same figures.
      answerSourceObjects: layoutPage({ ...page, instruction: '' }),
    },
  ]
}

export const followTheRouteTemplate: StudioTemplateDefinition = {
  key: FOLLOW_THE_ROUTE_KEY,
  label: 'Follow the Route',
  category: 'spatial',
  description:
    'Start on the dot and follow a list of moves across the grid — up 2, right 3, down 1 — then shade the square you land on or write its coordinate. Trains spatial tracking; every route stays inside the grid. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <rect x="5" y="6" width="28" height="28"/>
      <path d="M12 6v28M19 6v28M26 6v28M5 13h28M5 20h28M5 27h28"/>
    </g>
    <circle cx="8.5" cy="9.5" r="2.4" fill="currentColor"/>
    <rect x="19.8" y="20.8" width="5.4" height="5.4" fill="currentColor"/>
    <g fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M41 13h11M48.5 9.5L52 13l-3.5 3.5"/>
      <path d="M46 22v11M42.5 29.5L46 33l3.5-3.5"/>
    </g>
  </svg>`,
  configSchema: FOLLOW_THE_ROUTE_FIELDS,
  generate,
}
