import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { HT_CONFIG_SCHEMA, validateHtConfig } from './config'
import {
  HT_DEFAULT_TITLE,
  HT_MEDS_CONTACTS,
  HT_MEDS_INSTRUCTION,
  HT_MEDS_TITLE,
  HT_NO_HABITS_MESSAGE,
  HT_PHONE_LABEL,
  HT_TEMPLATE_KEY,
  htInstruction,
  htRows,
  parseHtCustomHabits,
  parseHtDoseTimes,
  parseHtGlasses,
  parseHtHabits,
  parseHtWeekStart,
  parseHtWeeks,
} from './content'
import { drawMeds, drawTracker, type DrawContext } from './draw'
import { htContentBox, planMeds, planTracker, wrapInstruction, type HtPageHead } from './layout'

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string): StudioPageOutput {
  const header = drawHeader(htContentBox(ctx), config, tag, '')
  return {
    pageRole: 'single',
    buildFailed: message,
    objects: [
      ...header.objects,
      buildText(
        {
          left: boxCenterX(header.body),
          top: header.body.top + header.body.height * 0.35,
          text: message,
          fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
          fontSize: STUDIO_BODY_SIZE - 4,
          width: header.body.width * 0.85,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
    ],
  }
}

/**
 * A set of habit pages: an optional medicines list, then one page per week.
 *
 * A weekly page is a "Week of" line, then a table with one row per habit and
 * one column per day: a box to tick, a glass to fill in for each glass of
 * water, or room to write the hours slept. What the page has left becomes
 * ruled notes. Every week is the same form, so the set is fixed by its
 * settings, not its seed: a seller printing twelve weeks wants twelve
 * matching pages.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const tag: StudioTag = { templateKey: HT_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message)]
  const content = htContentBox(ctx)
  const showInstructions = config.showInstructions !== false
  const title = String(config.title ?? '').trim()

  const rows = htRows({
    habits: parseHtHabits(config.habits),
    doseTimes: parseHtDoseTimes(config.doseTimes),
    custom: parseHtCustomHabits(config.customHabits),
  })
  if (rows.length === 0) return fail(HT_NO_HABITS_MESSAGE)

  const trackerHead: HtPageHead = {
    title,
    instruction: showInstructions ? wrapInstruction(htInstruction(rows), content.width, font) : '',
  }
  const tracker = planTracker(ctx, {
    head: trackerHead,
    rows,
    glasses: parseHtGlasses(config.glasses),
    weekStart: parseHtWeekStart(config.weekStart),
    font,
  })
  if (!tracker.ok) return fail(tracker.message)

  const pages: StudioPageOutput[] = []
  const page = (head: HtPageHead, draw: (inner: DrawContext) => void): StudioPageOutput => {
    const header = drawHeader(content, { ...config, title: head.title }, tag, head.instruction)
    const inner: DrawContext = { objects: header.objects, tag, font }
    draw(inner)
    return { pageRole: 'single', objects: inner.objects }
  }

  if (config.medsPage !== false) {
    // The list keeps its own heading; a page set printed without titles prints none.
    const medsHead: HtPageHead = {
      title: title ? HT_MEDS_TITLE : '',
      instruction: showInstructions ? wrapInstruction(HT_MEDS_INSTRUCTION, content.width, font) : '',
    }
    const meds = planMeds(ctx, { head: medsHead, contacts: HT_MEDS_CONTACTS, phoneLabel: HT_PHONE_LABEL, font })
    if (!meds.ok) return fail(meds.message)
    pages.push(page(medsHead, (inner) => drawMeds(inner, meds.plan)))
  }

  for (let week = 0; week < parseHtWeeks(config.weeks); week++) {
    pages.push(page(trackerHead, (inner) => drawTracker(inner, tracker.plan)))
  }
  return pages
}

export const habitTrackerTemplate: StudioTemplateDefinition = {
  key: HT_TEMPLATE_KEY,
  label: 'Daily Habits Tracker',
  category: 'keepsake',
  description:
    'Weekly pages that help a retiree keep up healthy routines: drinking water, exercise, sleep, vitamins and medicines, plus up to three habits of your own. Each habit is a row with a large box to tick for every day, a glass to fill in for each glass of water, and room to write the hours slept. Add a blank medicines list with doctor and pharmacy phone lines. Large print, black ink, print-ready.',
  pageCount: 1,
  producesAnswerKey: false,
  defaultPageTitle: HT_DEFAULT_TITLE,
  pageTitleHelp: `Printed on every weekly page. Leave as “${HT_DEFAULT_TITLE}” or type your own. The medicines list keeps its own heading.`,
  seedInvariant: true,
  validateConfig: validateHtConfig,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <text x="32" y="6" font-family="serif" font-weight="700" font-size="4.2" text-anchor="middle" fill="currentColor">My Daily Habits</text>
    <g stroke="currentColor" fill="none">
      <rect x="4" y="9" width="56" height="28" stroke-width="0.6"/>
      <path d="M4 13h56M25 9v28" stroke-width="0.5"/>
      <path d="M30 9v28M35 9v28M40 9v28M45 9v28M50 9v28M55 9v28M4 19h56M4 25h56M4 31h56" stroke-width="0.3" opacity="0.6"/>
    </g>
    <g font-family="serif" font-size="2.4" fill="currentColor">
      <text x="5.5" y="17">Water</text>
      <text x="5.5" y="23">Exercise</text>
      <text x="5.5" y="29">Sleep</text>
      <text x="5.5" y="35">Medicines</text>
    </g>
    <g font-family="serif" font-weight="700" font-size="2.4" fill="currentColor" text-anchor="middle">
      <text x="27.5" y="12">M</text><text x="32.5" y="12">T</text><text x="37.5" y="12">W</text><text x="42.5" y="12">T</text><text x="47.5" y="12">F</text><text x="52.5" y="12">S</text><text x="57.5" y="12">S</text>
    </g>
    <g font-family="serif" font-size="2" fill="currentColor" opacity="0.6" text-anchor="middle">
      <text x="27.5" y="29.6">hrs</text><text x="32.5" y="29.6">hrs</text><text x="37.5" y="29.6">hrs</text><text x="42.5" y="29.6">hrs</text><text x="47.5" y="29.6">hrs</text><text x="52.5" y="29.6">hrs</text><text x="57.5" y="29.6">hrs</text>
    </g>
    <g stroke="currentColor" stroke-width="0.4" fill="none">
      <path d="M26.6 14.6h1.8l-0.3 2.6h-1.2zM31.6 14.6h1.8l-0.3 2.6h-1.2zM36.6 14.6h1.8l-0.3 2.6h-1.2zM41.6 14.6h1.8l-0.3 2.6h-1.2zM46.6 14.6h1.8l-0.3 2.6h-1.2zM51.6 14.6h1.8l-0.3 2.6h-1.2zM56.6 14.6h1.8l-0.3 2.6h-1.2z"/>
      <rect x="26.4" y="20.9" width="2.2" height="2.2" rx="0.4"/><rect x="31.4" y="20.9" width="2.2" height="2.2" rx="0.4"/><rect x="36.4" y="20.9" width="2.2" height="2.2" rx="0.4"/><rect x="41.4" y="20.9" width="2.2" height="2.2" rx="0.4"/><rect x="46.4" y="20.9" width="2.2" height="2.2" rx="0.4"/><rect x="51.4" y="20.9" width="2.2" height="2.2" rx="0.4"/><rect x="56.4" y="20.9" width="2.2" height="2.2" rx="0.4"/>
      <rect x="26.4" y="32.9" width="2.2" height="2.2" rx="0.4"/><rect x="31.4" y="32.9" width="2.2" height="2.2" rx="0.4"/><rect x="36.4" y="32.9" width="2.2" height="2.2" rx="0.4"/><rect x="41.4" y="32.9" width="2.2" height="2.2" rx="0.4"/><rect x="46.4" y="32.9" width="2.2" height="2.2" rx="0.4"/><rect x="51.4" y="32.9" width="2.2" height="2.2" rx="0.4"/><rect x="56.4" y="32.9" width="2.2" height="2.2" rx="0.4"/>
    </g>
  </svg>`,
  configSchema: HT_CONFIG_SCHEMA,
  generate,
}
