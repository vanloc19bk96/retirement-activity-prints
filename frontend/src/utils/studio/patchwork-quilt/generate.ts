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
import { PQ_CONFIG_SCHEMA } from './config'
import {
  PQ_BUILD_FAILED_MESSAGE,
  PQ_DEFAULT_TITLE,
  PQ_QUILTS,
  PQ_TEMPLATE_KEY,
  parsePqBook,
  parsePqLevel,
  pickPqQuilt,
  pqInstruction,
  pqLevelSpec,
  pqPageLabel,
  pqPageTooSmallMessage,
  pqQuiltRng,
} from './content'
import { buildPqPuzzle } from './draw'
import { checkPqDrawnPage, runPqKdpPreflight } from './kdp-preflight'
import { pqContentBox, pqPanelInBody, planPqPage } from './layout'
import { parsePqRemoteData, patchworkQuiltPrefetch } from './prefetch'
import { buildPqQuilt } from './puzzle'

/** One ledger for the template: a seller's next book opens at other quilts. */
const VARIETY_KEY = studioVarietyKey(PQ_TEMPLATE_KEY, 'quilts')
/** Piecing streams tried before the page gives up and says so. */
const ATTEMPTS = 4

function errorPage(ctx: StudioGenerateContext, config: StudioConfig, tag: StudioTag, message: string, instruction: string): StudioPageOutput {
  const header = drawHeader(pqContentBox(ctx), config, tag, instruction)
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
 * One Patchwork Quilt page, and the answer page with the whole quilt sewn.
 *
 * Planned, pieced, proven, drawn, checked. The trim alone fixes how large
 * the quilt prints, so the form's help line is what prints. The quilt's
 * name is dealt against what the book and this seller have already
 * printed; the patches are pieced fresh from the seller's salt and the page
 * seed and must pass the preflight (every rule kept, finished by the
 * level's own logic on exactly that answer and not by easier steps alone
 * where the level asks for more, large print, on the page, not a repeat)
 * and the drawn check (every number on its square, a fabric on exactly
 * every patch of the answer, seams exactly where patches meet). A quilt
 * that fails anywhere is set aside and another pieced; if none passes, the
 * page says so plainly instead of printing a quilt a reader cannot finish.
 */
function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const level = parsePqLevel(config.level)
  const spec = pqLevelSpec(level)
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)
  const instruction = pqInstruction(config, level)
  const ownerSalt = resolveOwnerSalt(ctx)
  const tag: StudioTag = { templateKey: PQ_TEMPLATE_KEY, instanceId: ctx.instanceId, pageRole: 'single' }
  const fail = (message: string) => [errorPage(ctx, config, tag, message, instruction)]

  const header = drawHeader(pqContentBox(ctx), config, tag, instruction)
  const panel = pqPanelInBody(header.body, header.objects.length > 0)
  const plan = planPqPage(panel, level, font)
  if (!plan) return fail(pqPageTooSmallMessage(spec))

  const book = parsePqBook(parsePqRemoteData(ctx.remoteData).bookLabels)
  // All but a handful of names: a seller's next book opens at quilts
  // their last one used least lately, and the list never runs dry.
  const recent = studioAvoidList(VARIETY_KEY, PQ_QUILTS.length - 6)
  const quilt = pickPqQuilt({ level, seed: ctx.seed, ownerSalt, book, recent })
  const exclude = new Set(book.map((e) => e.signature).filter(Boolean))

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const built = buildPqQuilt({ ...spec, rng: pqQuiltRng({ level, seed: ctx.seed, ownerSalt, attempt }), exclude })
    if (!built) continue
    exclude.add(built.signature)
    if (!runPqKdpPreflight({ built, plan, level, quilt, panel, font, book }).ok) continue

    const label = pqPageLabel(quilt, level, built.signature)
    const draw = () => buildPqPuzzle({ built, plan, quilt, level, label, tag, font })
    const puzzle = draw()
    if (checkPqDrawnPage({ puzzle, built, quilt }).length > 0) continue

    rememberStudioContent(VARIETY_KEY, [quilt.id])
    return [
      {
        pageRole: 'single',
        objects: [...header.objects, puzzle],
        // Drawn afresh for the key, where the puzzle page put it: only the
        // how-to line goes, and the whole quilt is sewn.
        answerSourceObjects: [...drawHeader(pqContentBox(ctx), config, tag, '').objects, draw()],
      },
    ]
  }
  return fail(PQ_BUILD_FAILED_MESSAGE)
}

export const patchworkQuiltTemplate: StudioTemplateDefinition = {
  key: PQ_TEMPLATE_KEY,
  label: 'Patchwork Quilt: Piece the Patches',
  category: 'logic',
  description:
    'The classic Shikaku puzzle, pieced for retirement: sew the quilt into rectangular patches so every patch holds exactly one number, and that number is how many squares it covers. Every quilt is pieced fresh, proven to have one answer reached by logic alone, and labelled with a retiree’s quilt, like Sunday Porch Quilt, Log Cabin Quilt or Grandkids’ Nap Quilt. Three levels, large print, and an answer page that turns the solution into a finished patchwork quilt in plain grays.',
  pageCount: 1,
  producesAnswerKey: true,
  defaultPageTitle: PQ_DEFAULT_TITLE,
  prefetch: patchworkQuiltPrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g stroke="none" fill="currentColor">
      <path opacity="0.16" d="M16 4h12v8H16zM36 12h12v12H36zM24 28h12v8H24z"/>
      <path opacity="0.3" d="M36 4h12v8H36zM24 20h12v8H24z"/>
      <path opacity="0.08" d="M16 12h12v8H16zM36 24h12v12H36z"/>
      <path opacity="0.22" d="M16 20h8v16h-8z"/>
    </g>
    <g stroke="currentColor" stroke-width="0.5" opacity="0.55">
      <path d="M28 8l4-4M28 12l8-8M28 16l8-8M28 20l8-8M32 20l4-4"/>
    </g>
    <g stroke="currentColor" stroke-width="0.4" opacity="0.4">
      <path d="M20 4v32M24 4v32M28 4v32M32 4v32M36 4v32M40 4v32M44 4v32M16 8h32M16 12h32M16 16h32M16 20h32M16 24h32M16 28h32M16 32h32"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square">
      <rect x="16" y="4" width="32" height="32"/>
      <path d="M28 4v16M36 4v32M16 12h12M16 20h20M24 20v16M24 28h12M36 12h12M36 24h12"/>
    </g>
    <g fill="currentColor" font-family="sans-serif" font-size="3.6" font-weight="700" text-anchor="middle">
      <text x="22" y="9.3">6</text>
      <text x="30" y="17.3">8</text>
      <text x="46" y="9.3">6</text>
      <text x="18" y="17.3">6</text>
      <text x="42" y="21.3">9</text>
      <text x="22" y="33.3">8</text>
      <text x="26" y="25.3">6</text>
      <text x="38" y="33.3">9</text>
      <text x="34" y="33.3">6</text>
    </g>
  </svg>`,
  configSchema: PQ_CONFIG_SCHEMA,
  generate,
}
