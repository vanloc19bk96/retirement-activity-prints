import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import type { StudioTag } from '../studio-fabric-builders'
import { CHANGE_DETECTION_MASTER_ICONS } from './icons'
import { buildChangePair } from './trials'
import { layoutMemory, layoutSolution } from './draw'

export { buildChangePair } from './trials'

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = Math.min(6, Math.max(3, Number(config.gridSize ?? 4)))
  const rawChanges = Number(config.changeCount ?? 3)
  const changeCount = Math.min(rawChanges, size * size - 1)
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)

  const tag: StudioTag = {
    templateKey: 'change-detection',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  // Full Phosphor duotone catalog — mutate shape and/or rotation.
  const { study, test, changed } = buildChangePair(
    size,
    changeCount,
    'mixed',
    rng,
    CHANGE_DETECTION_MASTER_ICONS,
  )
  const layout = { config, ctx, tag, study, test, changed, size, font }
  const puzzle = layoutMemory(layout)
  // Solution: test grid + rings only — no “Study this”.
  const solution = layoutSolution({
    config,
    ctx,
    tag,
    test,
    changed,
    size,
    font,
  })

  return [{ ...puzzle, answerSourceObjects: solution.objects }]
}

export const changeDetectionTemplate: StudioTemplateDefinition = {
  key: 'change-detection',
  label: 'Change Detection Pairs',
  category: 'memory',
  description:
    'Study a grid of symbols, cover it, then find the cells that changed in the second grid. A cell can change its symbol or its rotation. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="4" y="6" width="24" height="24"/><path d="M12 6v24M20 6v24M4 14h24M4 22h24"/>
      <rect x="36" y="6" width="24" height="24"/><path d="M44 6v24M52 6v24M36 14h24M36 22h24"/>
    </g>
    <g fill="currentColor"><circle cx="8" cy="10" r="2.5"/><circle cx="40" cy="10" r="2.5"/>
      <rect x="46" y="16" width="4" height="4"/></g>
    <g fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="48" cy="18" r="6"/></g>
  </svg>`,
  configSchema: [
    {
      key: 'gridSize',
      label: 'Grid size',
      type: 'number',
      default: 4,
      min: 3,
      max: 6,
      step: 1,
      help: 'A 4×4 grid holds 16 cells. Larger grids are much harder.',
    },
    {
      key: 'changeCount',
      label: 'Number of changes',
      type: 'number',
      default: 3,
      min: 1,
      max: 8,
      step: 1,
      help: 'How many cells differ. More changes = harder.',
    },
  ],
  generate,
}
