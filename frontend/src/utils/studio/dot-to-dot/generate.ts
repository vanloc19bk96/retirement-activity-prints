import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_DEFAULT_FONT,
  STUDIO_INK,
} from '@/constants/studio.constants'
import { createRngFromSeedInput, resolveOwnerSalt } from '../_shared/uniqueness'
import { sgVariantKey } from '../stained-glass/content'
import { boxCenterX, contentBox, drawHeaderOverFullWidth, toNonBreakingSpaces, type Box } from '../studio-layout'
import { hugTextBoxWidth, type FontSpec } from '../studio-text-metrics'
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
import { DTD_NAME_SIZE, dtdNameStrip, dtdNameText, dtdPanelFits, dtdPanelInBody } from './layout'
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
  const header = drawHeaderOverFullWidth(contentBox(ctx), config, tag, instruction)
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

/** The smallest the name line shrinks to on a narrow trim. */
const NAME_MIN_SIZE = 14

/**
 * The line under the instruction saying what the picture is. Always one line:
 * measured, not estimated (bold serif runs wider than the estimate, and the
 * textbox wrapped "Picture: Motorhome" in two), NBSP-joined, and set smaller
 * only when the column leaves no other way to fit.
 */
function nameLine(strip: Box, name: string, config: StudioConfig, tag: StudioTag) {
  const text = toNonBreakingSpaces(dtdNameText(name))
  const spec: FontSpec = { fontFamily: String(config.fontFamily ?? STUDIO_DEFAULT_FONT), fontWeight: 700 }
  const column = Math.max(1, strip.width - STUDIO_CONTENT_SAFE_INSET_X * 2)
  const natural = (size: number) => hugTextBoxWidth(text, size, Number.POSITIVE_INFINITY, spec)
  let fontSize = DTD_NAME_SIZE
  while (fontSize > NAME_MIN_SIZE && natural(fontSize) > column) fontSize -= 1
  return buildText(
    {
      left: boxCenterX(strip),
      // Centred in the strip when set smaller.
      top: strip.top + (DTD_NAME_SIZE - fontSize) / 2,
      text,
      fontFamily: spec.fontFamily,
      fontSize,
      fontWeight: 700,
      fill: STUDIO_INK,
      width: Math.min(column, natural(fontSize)),
      textAlign: 'center',
      originX: 'center',
    },
    tag,
    'prompt',
  )
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

  const header = drawHeaderOverFullWidth(contentBox(ctx), config, tag, instruction)
  const headed = header.objects.length > 0
  const panel = dtdPanelInBody(header.body, headed)
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
    const name = nameLine(dtdNameStrip(header.body, headed), design.subject.name, config, tag)
    return [{ pageRole: 'single', objects: [...header.objects, name, picture] }]
  }
  return fail(DTD_BUILD_FAILED_MESSAGE)
}

export const dotToDotTemplate: StudioTemplateDefinition = {
  key: DTD_TEMPLATE_KEY,
  label: 'Dot to Dot: Retirement Edition',
  category: 'visual',
  description:
    'A relaxing dot-to-dot page: join large numbered dots from 1 to reveal a retirement picture such as a teapot, a golf flag, a sailboat or a hammock. Big, clear numbers for older eyes; pick how many dots. Includes an answer page with the finished picture.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: DTD_DEFAULT_TITLE,
  prefetch: dotToDotPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 16.5C16.6 17.6 18.4 21.4 22.3 21.5A11.5 9.5 0 0 1 28 16.4A5 4 0 0 1 31.6 12.6A1.5 1.5 0 1 1 34.4 12.6A5 4 0 0 1 38 16.4A11.5 9.5 0 0 1 43.2 20.6C47 18.6 51.5 21 50.4 25.4C49.6 28.6 46.4 30.2 42.8 30A11.5 9.5 0 0 1 38.1 33.5H27.9A11.5 9.5 0 0 1 22.1 28C18.5 27 16 21.5 14 16.5Z" fill="none" stroke="currentColor" stroke-width="0.55" stroke-dasharray="0.9 1.3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M44.4 23.2C46.4 22.4 47.8 23.4 47.4 25S45.6 27.4 44.2 27.4C44.6 26 44.6 24.6 44.4 23.2Z" fill="none" stroke="currentColor" stroke-width="0.5" stroke-linejoin="round"/>
    <g fill="currentColor">
      <circle cx="14" cy="16.5" r="1"/><circle cx="22.3" cy="21.5" r="1"/><circle cx="28" cy="16.4" r="1"/>
      <circle cx="33" cy="10.5" r="1"/><circle cx="38" cy="16.4" r="1"/><circle cx="43.2" cy="20.6" r="1"/>
      <circle cx="50.4" cy="25.4" r="1"/><circle cx="42.8" cy="30" r="1"/><circle cx="38.1" cy="33.5" r="1"/>
      <circle cx="27.9" cy="33.5" r="1"/><circle cx="22.1" cy="28" r="1"/>
    </g>
    <circle cx="14" cy="16.5" r="2.2" fill="none" stroke="currentColor" stroke-width="0.55"/>
    <g fill="currentColor" font-family="sans-serif" font-size="3.2" text-anchor="middle">
      <text x="10.4" y="15.4" font-weight="bold">1</text><text x="20.6" y="18.4">2</text><text x="26" y="14">3</text>
      <text x="33" y="7.6">4</text><text x="40.2" y="14">5</text><text x="44.6" y="18">6</text>
      <text x="53.6" y="26.6">7</text><text x="45.8" y="33">8</text><text x="40.6" y="37.6">9</text>
      <text x="25.2" y="37.6">10</text><text x="18.6" y="30.6">11</text>
    </g>
  </svg>`,
  configSchema: DTD_CONFIG_SCHEMA,
  generate,
}
