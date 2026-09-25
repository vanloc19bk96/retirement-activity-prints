import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { createRngFromSeedInput, resolveOwnerSalt } from '../_shared/uniqueness'
import { sgVariantKey } from '../stained-glass/content'
import { boxCenterX, contentBox, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { DTD_CONFIG_SCHEMA } from './config'
import {
  DTD_BUILD_FAILED_MESSAGE,
  DTD_DEFAULT_TITLE,
  DTD_PAGE_TOO_SMALL_MESSAGE,
  DTD_TEMPLATE_KEY,
  dtdDesignEntry,
  dtdInstruction,
  dtdLevelSpec,
  dtdPageLabel,
  parseDtdBook,
  parseDtdLevel,
  parseDtdTheme,
  pickDtdDesign,
} from './content'
import { buildDtdPicture } from './draw'
import { checkDtdDrawnPage, runDtdKdpPreflight } from './kdp-preflight'
import { dtdPanelFits, dtdPanelInBody } from './layout'
import { dotToDotPrefetch, parseDtdRemoteData } from './prefetch'
import { buildPuzzle } from './puzzle'

/** One ledger for the whole template: a seller's next book opens with other subjects. */
const VARIETY_KEY = studioVarietyKey(DTD_TEMPLATE_KEY, 'subjects')
/** About two thirds of the library: recent subjects wait, but a theme never runs dry. */
const RECENT_WINDOW = 30
/** The shapes this seller printed (`subject:shape`); a few books' worth. */
const SHAPE_VARIETY_KEY = studioVarietyKey(DTD_TEMPLATE_KEY, 'shapes')
const RECENT_SHAPE_WINDOW = 200
/** Pictures tried before the page gives up and says so. */
const ATTEMPTS = 12

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(contentBox(ctx), config, tag, instruction)
  return {
    pageRole: 'single',
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
 * One Dot to Dot page.
 *
 * Chosen, dotted, measured, checked. The picture (subject and version) is
 * dealt against what the book and this seller have already printed; its
 * outline is traced and dotted for the level, and every number placed; then
 * the whole page must pass the preflight (numbering exactly 1 to N, dots and
 * numbers clear of each other and of every line, an outline true to the
 * picture that never crosses itself, big enough, not a shape the book
 * already has) and the drawn check. A picture that fails anywhere is set
 * aside and another dealt, and if none passes the page says so plainly
 * instead of printing a broken puzzle.
 *
 * The answer page is the same picture with the outline drawn in.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = dtdLevelSpec(parseDtdLevel(config.level))
  const theme = parseDtdTheme(config.theme)
  const ownerSalt = resolveOwnerSalt(ctx)
  const instruction = dtdInstruction(config, ownerSalt)
  const tag: StudioTag = { templateKey: DTD_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(contentBox(ctx), config, tag, instruction)
  const panel = dtdPanelInBody(header.body, header.objects.length > 0)
  if (!dtdPanelFits(panel)) return fail(DTD_PAGE_TOO_SMALL_MESSAGE)

  const book = parseDtdBook(parseDtdRemoteData(ctx.remoteData).bookLabels)
  const recent = studioAvoidList(VARIETY_KEY, RECENT_WINDOW)
  const recentShapes = studioAvoidList(SHAPE_VARIETY_KEY, RECENT_SHAPE_WINDOW)
  const exclude = new Set<string>()
  const excludeVersions = new Set<string>()
  const failures = new Map<string, number>()

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const design = pickDtdDesign({ theme, seed: ctx.seed, ownerSalt, book, recent, recentShapes, exclude, excludeVersions, attempt })
    if (!design) break
    const versionKey = `${design.subject.id}:${sgVariantKey(design.subject, { ...design.variant, mirrored: false })}`
    const setAside = () => {
      // A version that will not dot cleanly is set aside; a subject that fails twice, too.
      excludeVersions.add(versionKey)
      const count = (failures.get(design.subject.id) ?? 0) + 1
      failures.set(design.subject.id, count)
      if (count >= 2) exclude.add(design.subject.id)
    }
    const rng = createRngFromSeedInput({
      ownerSalt,
      templateKey: DTD_TEMPLATE_KEY,
      configHash: `dots:${level.value}`,
      pageNonce: ctx.seed,
      stream: String(attempt),
    })
    const build = buildPuzzle(design.outline, panel, level.rules, rng)
    if (!build.ok) {
      setAside()
      continue
    }
    const puzzle = build.puzzle
    if (!runDtdKdpPreflight({ design, puzzle, level, panel, book }).ok) {
      setAside()
      continue
    }

    const entry = dtdDesignEntry(design)
    const picture = buildDtdPicture({
      puzzle,
      rules: level.rules,
      box: panel,
      tag,
      label: dtdPageLabel(entry),
      // The same subject's same shape at the same level is the same puzzle,
      // however it faces or wherever dot 1 falls.
      canonical: `${entry.subject}|${entry.shape}|${level.value}`,
      name: design.subject.name,
    })
    if (checkDtdDrawnPage({ picture, box: panel, puzzle, numberSize: level.rules.numberSize }).length > 0) {
      setAside()
      continue
    }

    rememberStudioContent(VARIETY_KEY, [design.subject.id])
    rememberStudioContent(SHAPE_VARIETY_KEY, [`${entry.subject}:${entry.shape}`])
    return [{ pageRole: 'single', objects: [...header.objects, picture] }]
  }
  return fail(DTD_BUILD_FAILED_MESSAGE)
}

export const dotToDotTemplate: StudioTemplateDefinition = {
  key: DTD_TEMPLATE_KEY,
  label: 'Dot to Dot: Retirement Edition',
  category: 'spatial',
  description:
    'A relaxing dot-to-dot page: join large numbered dots from 1 to reveal a retirement picture — a teapot, a golf flag, a sailboat, a hammock. Big, clear numbers for older eyes; pick how many dots. Includes an answer page with the finished picture.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: DTD_DEFAULT_TITLE,
  prefetch: dotToDotPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 11h20l3 6 7-3-3 9-3 1v8H18v-8l-5-4 6-2z" fill="none" stroke="currentColor" stroke-width="0.6" stroke-dasharray="1.2 1.6" stroke-linejoin="round"/>
    <g fill="currentColor">
      <circle cx="22" cy="11" r="1.1"/><circle cx="42" cy="11" r="1.1"/><circle cx="45" cy="17" r="1.1"/>
      <circle cx="52" cy="14" r="1.1"/><circle cx="49" cy="23" r="1.1"/><circle cx="46" cy="24" r="1.1"/>
      <circle cx="46" cy="32" r="1.1"/><circle cx="18" cy="32" r="1.1"/><circle cx="18" cy="24" r="1.1"/>
      <circle cx="13" cy="20" r="1.1"/><circle cx="19" cy="18" r="1.1"/>
    </g>
    <circle cx="22" cy="11" r="2.4" fill="none" stroke="currentColor" stroke-width="0.6"/>
    <g fill="currentColor" font-family="sans-serif" font-size="3.4" text-anchor="middle">
      <text x="20" y="8" font-weight="bold">1</text><text x="42" y="8.4">2</text><text x="44.6" y="21.6">3</text>
      <text x="55" y="13">4</text><text x="53" y="25">5</text><text x="49" y="35.5">7</text>
      <text x="15" y="35.5">8</text><text x="9.6" y="21.4">10</text>
    </g>
  </svg>`,
  configSchema: DTD_CONFIG_SCHEMA,
  generate,
}
