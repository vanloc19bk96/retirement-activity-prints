import type {
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { STUDIO_BODY_SIZE, STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import { resolveOwnerSalt } from '../_shared/uniqueness'
import { boxCenterX, drawHeader } from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import { rememberStudioContent, studioAvoidList, studioVarietyKey } from '../studio-variety'
import { PA_CONFIG_SCHEMA } from './config'
import {
  PA_BUILD_FAILED_MESSAGE,
  PA_DEFAULT_TITLE,
  PA_TEMPLATE_KEY,
  paGridRng,
  paInstruction,
  paLevelPictures,
  paLevelSpec,
  paPageLabel,
  paPageTooSmallMessage,
  parsePaBook,
  parsePaLevel,
  pickPaDesign,
} from './content'
import { buildPaPuzzle } from './draw'
import { checkPaDrawnPage, runPaKdpPreflight } from './kdp-preflight'
import { paContentBox, paPanelInBody, planPaPage } from './layout'
import { parsePaRemoteData, photoAlbumPrefetch } from './prefetch'
import { buildPaGrid } from './puzzle'

/** One ledger for the template: a seller's next book opens at other snapshots. */
const VARIETY_KEY = studioVarietyKey(PA_TEMPLATE_KEY, 'pictures')
/** Numbers streams tried on a snapshot before the page moves on to the next one. */
const STREAMS = 10
/** Snapshots tried before the page gives up and says so. */
const PICTURES = 3

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(paContentBox(ctx), config, tag, instruction)
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
 * One Photo Album page, and the answer page with the snapshot developed and
 * its name on the caption line.
 *
 * Planned, dealt, built, proven, drawn, checked. The trim alone fixes how
 * large the squares print, so the form's help line is what prints. The
 * snapshot is dealt against what the book and this seller have already
 * printed; which squares print their number is built fresh from the
 * seller's salt and the page seed and must pass the preflight (the level's
 * picture; every number counting its block; finished by the level's own
 * logic on exactly that picture and not by easier steps alone where the
 * level asks for more; large print; on the page; not a repeat) and the
 * drawn check (every number in its square, the picture and its name waiting
 * hidden). A grid that fails anywhere is set aside and another built — on
 * the next snapshot if this one will not come — and if none passes, the
 * page says so plainly instead of printing a grid a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parsePaLevel(config.level)
  const spec = paLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = paInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: PA_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(paContentBox(ctx), config, tag, instruction)
  const panel = paPanelInBody(header.body, header.objects.length > 0)
  const plan = planPaPage(panel, level, font)
  if (!plan) return fail(paPageTooSmallMessage(spec))

  const book = parsePaBook(parsePaRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of the level's snapshots: a seller's next book opens
  // at pictures their last one showed least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, Math.max(1, paLevelPictures(level).length - 4))
  const refused = new Set<string>()
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let tried = 0; tried < PICTURES; tried++) {
    const design = pickPaDesign({ level, seed: ctx.seed, ownerSalt, book, recent, exclude: refused })
    if (!design) break
    refused.add(design.picture.id)
    const way = `${design.picture.id}${design.mirrored ? ':m' : ''}`
    for (let attempt = 0; attempt < STREAMS; attempt++) {
      const built = buildPaGrid({
        ...spec,
        bitmap: design.bitmap,
        width: design.size,
        height: design.size,
        rng: paGridRng({ level, seed: ctx.seed, ownerSalt, picture: way, attempt }),
        exclude,
      })
      if (!built) continue
      exclude.add(built.signature)
      if (!runPaKdpPreflight({ built, design, plan, level, panel, font, book }).ok) continue

      const label = paPageLabel(design, level, built.signature)
      const draw = () => buildPaPuzzle({ built, design, plan, level, label, tag, font })
      const puzzle = draw()
      if (checkPaDrawnPage({ puzzle, built, design, plan }).length > 0) continue

      rememberStudioContent(VARIETY_KEY, [design.picture.id])
      return [
        {
          pageRole: 'single',
          objects: [...header.objects, puzzle],
          // Drawn afresh for the key, where the puzzle page put it: only the
          // how-to line goes, and the snapshot develops with its name written in.
          answerSourceObjects: [...drawHeader(paContentBox(ctx), config, tag, '').objects, draw()],
        },
      ]
    }
  }
  return fail(PA_BUILD_FAILED_MESSAGE)
}

export const photoAlbumTemplate: StudioTemplateDefinition = {
  key: PA_TEMPLATE_KEY,
  label: 'Photo Album: Develop the Snapshot',
  category: 'logic',
  description:
    'The count-the-neighbours picture puzzle loved as Fill-a-Pix (or Mosaic), mounted like an instant photo in a retiree’s album: each number tells how many squares of its block of nine are shaded, and shading them all develops a hidden snapshot, from reading glasses and a teddy bear for the grandkids to a steam train, a log cabin or the Eiffel Tower at last. Forty-nine hand-drawn pictures, every grid built fresh and proven to have one answer reached by logic alone. Three levels from a 10 × 10 with plenty of numbers to an 18 × 18 that needs a “what if”, a worked legend under every snapshot, and an answer page where the picture appears with its name on the caption.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: PA_DEFAULT_TITLE,
  prefetch: photoAlbumPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <rect x="18" y="4" width="28" height="33.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="0.9"/>
    <path d="M16.5 2.5H22.5L16.5 8.5Z M47.5 2.5H41.5L47.5 8.5Z M16.5 39H22.5L16.5 33Z M47.5 39H41.5L47.5 33Z" fill="currentColor"/>
    <g fill="currentColor" opacity="0.3"><rect x="29.8" y="11.9" width="4.4" height="4.4"/><rect x="25.4" y="16.3" width="4.4" height="4.4"/><rect x="29.8" y="16.3" width="4.4" height="4.4"/><rect x="34.2" y="16.3" width="4.4" height="4.4"/><rect x="29.8" y="20.7" width="4.4" height="4.4"/></g>
    <path d="M25.4 7.5V29.5 M29.8 7.5V29.5 M34.2 7.5V29.5 M38.6 7.5V29.5 M21.0 11.9H43.0 M21.0 16.3H43.0 M21.0 20.7H43.0 M21.0 25.1H43.0" fill="none" stroke="currentColor" stroke-width="0.4" opacity="0.5"/>
    <rect x="21.0" y="7.5" width="22.0" height="22.0" fill="none" stroke="currentColor" stroke-width="0.9"/>
    <g fill="currentColor" font-family="sans-serif" font-size="3"><text x="22.4" y="10.8">0</text><text x="26.8" y="15.2">3</text><text x="31.2" y="19.6">5</text><text x="35.6" y="24.0">3</text><text x="40.0" y="28.4">0</text><text x="40.0" y="10.8">0</text><text x="22.4" y="28.4">0</text></g>
    <path d="M24.5 34H39.5" stroke="currentColor" stroke-width="0.6"/>
  </svg>`,
  configSchema: PA_CONFIG_SCHEMA,
  generate,
}
