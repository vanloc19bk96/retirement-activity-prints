import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, deriveSeed } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  measureHeaderHeight,
  splitTop,
  boxCenterX,
  boxCenterY,
  estimateTextBoxWidth,
  type Box,
} from '../studio-layout'
import { buildText, type StudioTag } from '../studio-fabric-builders'
import {
  STUDIO_BODY_SIZE,
  STUDIO_CONTENT_SAFE_INSET_X,
  STUDIO_INK_MUTED,
} from '@/constants/studio.constants'
import {
  NUMBER_RULE_GROUP,
  pickNumberItem,
  pickNumberItemFromGroup,
  usableNumberGroups,
} from './rules-number'
import { pickLetterItem } from './rules-letter'
import { drawItemTable, PATTERN_EXAMPLE_H, tableMetricsField } from './draw'
import {
  PATTERN_GROUPS,
  type BlankPosition,
  type Difficulty,
  type Mode,
  type PatternGroup,
  type PatternItem,
} from './types'

export {
  pickNumberItem,
  pickNumberItemFromGroup,
  usableNumberGroups,
  NUMBER_RULES,
  NUMBER_RULE_GROUP,
  eligibleNumberRules,
} from './rules-number'
export { pickLetterItem, LETTER_RULES, isLetterItemForced } from './rules-letter'
export { isForced, solveMasked, NUMERIC_FAMILIES } from './families'

const MIN_ITEM = 4
const MAX_ITEM = 15

const ALL_GROUPS: PatternGroup[] = PATTERN_GROUPS.map((g) => g.value)

function parseMode(raw: unknown): Mode {
  if (raw === 'letter' || raw === 'mixed') return raw
  return 'number'
}

function parseDifficulty(raw: unknown): Difficulty {
  if (raw === 'easy' || raw === 'hard') return raw
  return 'medium'
}

function parseBlankPosition(raw: unknown): BlankPosition {
  if (raw === 'random' || raw === 'mixed') return raw
  // Legacy config value from older builds.
  if (raw === 'middle') return 'random'
  return 'end'
}

function clampItemCount(n: number): number {
  if (!Number.isFinite(n)) return 10
  return Math.min(MAX_ITEM, Math.max(MIN_ITEM, Math.round(n)))
}

function parsePatternGroups(raw: unknown): PatternGroup[] {
  if (!Array.isArray(raw)) return ALL_GROUPS
  // De-duplicated: a repeated value in a stored config would otherwise take
  // two slots on the sheet and crowd out another ticked type.
  const picked = [...new Set(raw)].filter((value): value is PatternGroup =>
    ALL_GROUPS.includes(value as PatternGroup),
  )
  return picked.length > 0 ? picked : ALL_GROUPS
}

/** Soft form warning when the sheet cannot fit every selected pattern type. */
export function patternTypesCoverageWarning(config: StudioConfig): string | null {
  const mode = parseMode(config.mode)
  if (mode === 'letter') return null
  const groupCount = parsePatternGroups(config.patternTypes).length
  const puzzleCount = clampItemCount(Number(config.itemCount ?? 10))
  if (puzzleCount < groupCount) {
    return (
      `Only ${puzzleCount} puzzles for ${groupCount} pattern types — ` +
      'some selected types will not appear on this sheet.'
    )
  }
  // Mixed sheets spend a slot on letters. Covering every ticked number type
  // wins that tie, so say so rather than quietly printing no letter rows.
  if (mode === 'mixed' && puzzleCount === groupCount) {
    return (
      `${puzzleCount} puzzles for ${groupCount} pattern types — every row goes to a number ` +
      'pattern, so this sheet has no letter sequences. Add a puzzle to fit both.'
    )
  }
  return null
}

interface ItemOptions {
  difficulty: Difficulty
  blankPosition: BlankPosition
  groups: PatternGroup[]
  itemCount: number
  /** Sequences already placed on this sheet — keeps a page free of repeats. */
  used: Set<string>
  /** Rule tally for the sheet — spreads puzzles across the available rules. */
  ruleUsage: Map<string, number>
}

/** One row of the sheet, assigned before any sequence is drawn. */
type Slot = { kind: 'letter' } | { kind: 'number'; group: PatternGroup }

/** Share of a mixed sheet aimed at letter rows, before coverage takes priority. */
const LETTER_SHARE = 0.4

/** Re-rolls allowed per missing type when a slot's first draw fell through. */
const REPAIR_ATTEMPTS = 12

/**
 * Letter rows on a mixed sheet — never so many that a ticked type loses its row.
 *
 * A ticked pattern type that never prints is a broken promise to the seller;
 * a mixed sheet leaning number-heavy is not. Coverage wins the tie, and the
 * form warns when the puzzle count leaves no room for letters at all.
 */
export function letterSlotCount(itemCount: number, groupCount: number): number {
  const spare = itemCount - Math.min(itemCount, groupCount)
  if (spare <= 0) return 0
  return Math.min(spare, Math.max(1, Math.round(itemCount * LETTER_SHARE)))
}

/**
 * Hand every selected type a row, then spread the leftovers evenly.
 *
 * Drawing a rule per row and hoping the mix works out is what let a ticked type
 * miss the page: a heuristic that "prefers" unused types still loses the last
 * row to a coin flip, and across a whole book that lands on some page. Deciding
 * the whole plan first makes coverage arithmetic, not luck.
 */
function planNumberGroups(
  groups: readonly PatternGroup[],
  slots: number,
  rng: ReturnType<typeof createRng>,
): PatternGroup[] {
  if (slots <= 0) return []
  // Fewer rows than types: every row still gets a type of its own.
  if (slots <= groups.length) return rng.sample(groups, slots)

  const plan = [...groups]
  while (plan.length < slots) {
    // Whole shuffled rounds, so no type is ever two rows ahead of another.
    plan.push(...rng.shuffle(groups).slice(0, Math.min(groups.length, slots - plan.length)))
  }
  return rng.shuffle(plan)
}

function planSlots(options: {
  mode: Mode
  groups: readonly PatternGroup[]
  itemCount: number
  rng: ReturnType<typeof createRng>
}): Slot[] {
  const { mode, groups, itemCount, rng } = options
  if (mode === 'letter') {
    return Array.from({ length: itemCount }, (): Slot => ({ kind: 'letter' }))
  }
  const letters = mode === 'mixed' ? letterSlotCount(itemCount, groups.length) : 0
  const slots: Slot[] = [
    ...planNumberGroups(groups, itemCount - letters, rng).map(
      (group): Slot => ({ kind: 'number', group }),
    ),
    ...Array.from({ length: letters }, (): Slot => ({ kind: 'letter' })),
  ]
  return rng.shuffle(slots)
}

function buildSlot(
  slot: Slot,
  options: { letter: ItemOptions; number: ItemOptions },
  rng: ReturnType<typeof createRng>,
): PatternItem {
  if (slot.kind === 'letter') return pickLetterItem(options.letter, rng)
  // Assigned type first; only a type that cannot print at these settings falls
  // back — and the fallback still draws from the ticked types, never outside.
  return (
    pickNumberItemFromGroup(slot.group, options.number, rng) ??
    pickNumberItem(options.number, rng)
  )
}

/** Give a rejected item's sequence and rule tally back to the sheet. */
function releaseItem(item: PatternItem, options: ItemOptions): void {
  options.used.delete(item.terms.join(','))
  const count = options.ruleUsage.get(item.ruleId) ?? 0
  if (count <= 1) options.ruleUsage.delete(item.ruleId)
  else options.ruleUsage.set(item.ruleId, count - 1)
}

function reclaimItem(item: PatternItem, options: ItemOptions): void {
  options.used.add(item.terms.join(','))
  options.ruleUsage.set(item.ruleId, (options.ruleUsage.get(item.ruleId) ?? 0) + 1)
}

/** Row to sacrifice for a missing type: the last row of the most repeated type. */
function donorIndex(items: readonly PatternItem[]): number {
  const tally = new Map<PatternGroup, number>()
  for (const item of items) {
    const group = NUMBER_RULE_GROUP.get(item.ruleId)
    if (group) tally.set(group, (tally.get(group) ?? 0) + 1)
  }
  let best: PatternGroup | null = null
  let bestCount = 1
  for (const [group, count] of tally) {
    if (count > bestCount) {
      best = group
      bestCount = count
    }
  }
  if (!best) return -1
  for (let index = items.length - 1; index >= 0; index--) {
    if (NUMBER_RULE_GROUP.get(items[index]!.ruleId) === best) return index
  }
  return -1
}

/**
 * Close any hole left by a slot whose assigned type refused to print — every
 * draw ambiguous, out of range, or already on the sheet. Such a slot falls back
 * to another ticked type, which doubles that type up and leaves one missing;
 * trade the doubled row back for the missing one.
 */
function repairCoverage(options: {
  items: PatternItem[]
  groups: readonly PatternGroup[]
  itemOptions: ItemOptions
  seed: number
}): void {
  const { items, groups, itemOptions, seed } = options
  const covered = (group: PatternGroup): boolean =>
    items.some((item) => NUMBER_RULE_GROUP.get(item.ruleId) === group)

  for (const missing of groups) {
    if (covered(missing)) continue
    for (let attempt = 0; attempt < REPAIR_ATTEMPTS; attempt++) {
      const donor = donorIndex(items)
      if (donor < 0) break
      const previous = items[donor]!
      // Free the donor first, or its own sequence blocks the redraw.
      releaseItem(previous, itemOptions)
      const rng = createRng(deriveSeed(seed, `pattern:repair:${missing}:${attempt}`))
      const replacement = pickNumberItemFromGroup(missing, itemOptions, rng)
      if (replacement) {
        items[donor] = replacement
        break
      }
      reclaimItem(previous, itemOptions)
    }
  }
}

function instructionFor(mode: Mode, usesLetterWrap: boolean): string {
  const base =
    'Find the rule in each sequence, then fill in the missing term. Each sequence follows one ' +
    'logical pattern. Figure out how it changes from one item to the next'
  if ((mode === 'letter' || mode === 'mixed') && usesLetterWrap) {
    return `${base}. If the letters go past Z, they continue from A`
  }
  return base
}

function exampleFor(mode: Mode, blankPosition: BlankPosition): string {
  // Match the example to the shape of the sheet: a blank that sits inside the
  // run needs a different demonstration than "what comes next".
  const interior = blankPosition !== 'end'
  const numbers = interior ? '2, 4, __, 8, 10  →  6' : '2, 4, 6, 8, __  →  10'
  const letters = interior ? 'A, C, __, G, I  →  E' : 'A, C, E, G, __  →  I'
  if (mode === 'letter') return `Example: ${letters}`
  if (mode === 'mixed') return `Example: ${numbers}   |   ${letters}`
  return `Example: ${numbers}`
}

function layoutPage(options: {
  config: StudioConfig
  ctx: StudioGenerateContext
  tag: StudioTag
  items: PatternItem[]
  font: string
  mode: Mode
  blankPosition: BlankPosition
  instruction: string
  showExample: boolean
  /** Size rows from this field (puzzle page) so question and solution grids match. */
  metricsField?: Box
}): StudioFabricObject[] {
  const {
    config,
    ctx,
    tag,
    items,
    font,
    mode,
    blankPosition,
    instruction,
    showExample,
    metricsField,
  } = options
  const objects: StudioFabricObject[] = []
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  const header = drawHeader(content, config, tag, instruction)
  objects.push(...header.objects)

  let field = header.body
  if (showExample) {
    const [exampleBox, rest] = splitTop(header.body, PATTERN_EXAMPLE_H)
    field = rest
    const example = exampleFor(mode, blankPosition)
    const exampleSize = Math.round(STUDIO_BODY_SIZE * 0.7)
    objects.push(
      buildText(
        {
          left: boxCenterX(exampleBox),
          top: boxCenterY(exampleBox),
          text: example,
          width: estimateTextBoxWidth(example, exampleSize, exampleBox.width),
          fontFamily: font,
          fontSize: exampleSize,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'decoration',
      ),
    )
  }

  drawItemTable(objects, field, items, font, tag, {
    metricsField: metricsField ?? field,
  })
  return objects
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const mode = parseMode(config.mode)
  const difficulty = parseDifficulty(config.difficulty)
  const itemCount = clampItemCount(Number(config.itemCount ?? 10))
  const blankPosition = parseBlankPosition(config.blankPosition)
  const groups = parsePatternGroups(config.patternTypes)
  const font = String(config.fontFamily)

  const tag: StudioTag = {
    templateKey: 'pattern-continuation',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const used = new Set<string>()
  const ruleUsage = new Map<string, number>()
  const plannedGroups = usableNumberGroups(groups, difficulty)
  const slots = planSlots({
    mode,
    groups: plannedGroups,
    itemCount,
    rng: createRng(deriveSeed(ctx.seed, 'pattern:plan')),
  })
  // The types this sheet actually promised — a sheet with fewer rows than
  // ticked types carries a random subset, and only those need covering.
  const promised = [
    ...new Set(
      slots.flatMap((slot) => (slot.kind === 'number' ? [slot.group] : [])),
    ),
  ]
  const numberSlots = slots.filter((slot) => slot.kind === 'number').length
  const shared = { difficulty, blankPosition, groups: plannedGroups, used, ruleUsage }
  // Per-kind counts so each pool spreads over its own rules, not the sheet total.
  const itemOptions = {
    number: { ...shared, itemCount: Math.max(1, numberSlots) },
    letter: { ...shared, itemCount: Math.max(1, itemCount - numberSlots) },
  }

  const items: PatternItem[] = slots.map((slot, index) =>
    buildSlot(slot, itemOptions, createRng(deriveSeed(ctx.seed, `pattern:${index}`))),
  )
  if (promised.length > 0) {
    repairCoverage({
      items,
      groups: promised,
      itemOptions: itemOptions.number,
      seed: ctx.seed,
    })
  }

  const usesLetterWrap = items.some((item) => item.usesLetterWrap)
  const instruction = instructionFor(mode, usesLetterWrap)
  const content = insetHorizontal(contentBox(ctx), STUDIO_CONTENT_SAFE_INSET_X)
  // Shared sizing from the puzzle page (title + instructions + example) so the
  // answer key keeps the same grid even though its body is taller.
  const metricsField = tableMetricsField(
    content,
    measureHeaderHeight(config, instruction, content.width),
    true,
  )
  const layout = { config, ctx, tag, items, font, mode, blankPosition, metricsField }
  const objects = layoutPage({
    ...layout,
    instruction,
    showExample: true,
  })
  const answerSourceObjects = layoutPage({
    ...layout,
    instruction: '',
    showExample: false,
  })

  return [{ pageRole: 'single', objects, answerSourceObjects }]
}

export const patternContinuationTemplate: StudioTemplateDefinition = {
  key: 'pattern-continuation',
  label: 'Pattern Continuation',
  category: 'logic',
  description:
    'Work out the rule behind each row of numbers or letters, then fill in the missing term. Rules cover adding, multiplying, squares, Fibonacci, alternating series and more. Includes an answer key.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g font-size="8" fill="currentColor" font-family="sans-serif" text-anchor="middle">
      <text x="32" y="16">2 5 8 11 ?</text>
      <text x="32" y="32">A D G J ?</text>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'mode',
      label: 'Sequence type',
      type: 'select',
      default: 'number',
      options: [
        { label: 'Numbers', value: 'number' },
        { label: 'Letters', value: 'letter' },
        { label: 'Mixed', value: 'mixed' },
      ],
    },
    {
      key: 'difficulty',
      label: 'Difficulty',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Easy', value: 'easy' },
        { label: 'Medium', value: 'medium' },
        { label: 'Hard', value: 'hard' },
      ],
    },
    {
      key: 'itemCount',
      label: 'Number of puzzles',
      type: 'number',
      default: 10,
      min: MIN_ITEM,
      max: MAX_ITEM,
      step: 1,
      warningWhen: patternTypesCoverageWarning,
    },
    {
      key: 'patternTypes',
      label: 'Pattern types',
      type: 'multiSelect',
      default: ALL_GROUPS,
      visibleWhen: (c) => c.mode !== 'letter',
      options: PATTERN_GROUPS.map((group) => ({ label: group.label, value: group.value })),
      help: 'Which number rules to draw from. Multiplying & dividing is pure ×/÷ only; ×m+k sequences sit under Growing & shrinking steps. The sheet spreads across the types you pick.',
      warningWhen: patternTypesCoverageWarning,
    },
    {
      key: 'blankPosition',
      label: 'Blank position',
      type: 'select',
      default: 'end',
      options: [
        { label: 'At the end (what comes next)', value: 'end' },
        { label: 'Random position', value: 'random' },
        { label: 'Mixed', value: 'mixed' },
      ],
    },
  ],
  generate,
}
