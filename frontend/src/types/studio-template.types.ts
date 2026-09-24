/** Plain-JSON Fabric object subset generators emit (never Fabric class instances). */

export type StudioFabricType =
  | 'rect'
  | 'circle'
  | 'line'
  | 'textbox'
  | 'path'
  | 'polygon'
  | 'polyline'
  | 'group'
  | 'image'

/**
 * Buyer-facing template taxonomy. Values match the tab labels in
 * `constants/studio-categories.ts` so code and UI never drift apart.
 */
export type StudioCategory =
  /** Deduction, number and pattern puzzles with one right answer. */
  | 'logic'
  /** Words and language. */
  | 'word'
  /** Visual-spatial reasoning and drawing. */
  | 'spatial'

export type StudioRole = 'prompt' | 'answer' | 'key' | 'decoration' | 'structure'

export type StudioPageRole = 'single' | 'study' | 'recall' | 'answers'

export type StudioFieldType =
  | 'number'
  | 'select'
  | 'multiSelect'
  | 'toggle'
  | 'text'
  | 'color'
  | 'wordList'
  | 'numberList'
  | 'seed'

/** Axis-aligned inset matching the editor safe-area overlay (canvas px). */
export interface StudioMargin {
  top: number
  right: number
  bottom: number
  left: number
}

export interface StudioFabricObject {
  type: StudioFabricType
  left: number
  top: number
  width?: number
  height?: number
  radius?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  points?: { x: number; y: number }[]
  path?: (string | number)[][]
  /** Fabric image source (URL or data-URI). */
  src?: string
  /** CORS mode for remote images (required for untainted canvas export). */
  crossOrigin?: 'anonymous' | 'use-credentials' | ''
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: 'normal' | 'italic' | 'oblique'
  /** Fabric line height multiplier — 1 locks single-glyph vertical metrics. */
  lineHeight?: number
  textAlign?: 'left' | 'center' | 'right' | 'justify'
  /** Fabric textbox character spacing (1/1000 em). */
  charSpacing?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  /** Keep ink weight when page resize scales the object (Fabric). */
  strokeUniform?: boolean
  strokeDashArray?: number[]
  strokeLineCap?: 'butt' | 'round' | 'square'
  strokeLineJoin?: 'miter' | 'round' | 'bevel'
  /** Rounded-rect corner radii (Fabric `Rect`). */
  rx?: number
  ry?: number
  opacity?: number
  angle?: number
  scaleX?: number
  scaleY?: number
  originX?: 'left' | 'center' | 'right'
  originY?: 'top' | 'center' | 'bottom'
  visible?: boolean
  /**
   * Fabric rasterises a cached object into a canvas the size of its own
   * bounds, so anything a child draws outside them is cut off mid-glyph.
   * Set false on groups whose bounds are computed at generate time from
   * predicted text metrics.
   */
  objectCaching?: boolean
  objects?: StudioFabricObject[]
  objectId?: string
  selectable?: boolean
  hasControls?: boolean
  editable?: boolean
  lockMovementX?: boolean
  lockMovementY?: boolean
  lockScalingX?: boolean
  lockScalingY?: boolean
  lockRotation?: boolean
  studioTemplateKey?: string
  studioRole?: StudioRole
  studioInstanceId?: string
  /**
   * Digest of this instance's content, stamped at generation time.
   * Persisted with the page so a later run can see what the book already
   * prints and refuse to repeat it.
   */
  studioContentHash?: string
  studioPageRole?: StudioPageRole
  /** Fabric custom data (e.g. lucide `iconName` for icon cells). */
  data?: Record<string, unknown>
}

export interface StudioSelectOption {
  label: string
  value: string | number
}

/** Page geometry for dynamic number bounds (e.g. itemCount max that still fits). */
export interface StudioConfigLayoutContext {
  pageWidth: number
  pageHeight: number
  margin: StudioMargin
}

export interface StudioConfigField {
  key: string
  label: string
  type: StudioFieldType
  default: unknown
  help?: string
  /** Placeholder for text / wordList inputs. */
  placeholder?: string
  options?: StudioSelectOption[]
  /** Dynamic select options (overrides `options` when set). */
  optionsWhen?: (
    config: StudioConfig,
    layout?: StudioConfigLayoutContext,
  ) => StudioSelectOption[]
  min?: number
  max?: number
  step?: number
  visibleWhen?: (config: StudioConfig) => boolean
  /** Dynamic floor for number fields (overrides `min` when set). */
  minWhen?: (config: StudioConfig, layout?: StudioConfigLayoutContext) => number
  /** Dynamic ceiling for number fields (overrides `max` when set). */
  maxWhen?: (config: StudioConfig, layout?: StudioConfigLayoutContext) => number
  /** Dynamic help text (overrides `help` when set). */
  helpWhen?: (config: StudioConfig, layout?: StudioConfigLayoutContext) => string
  /** Soft warning under the field (does not block generate). */
  warning?: string
  /** Dynamic warning (overrides `warning` when set). Return null/undefined to clear. */
  warningWhen?: (
    config: StudioConfig,
    layout?: StudioConfigLayoutContext,
  ) => string | null | undefined
  /**
   * Discrete allowed values for a number slider (index-based step).
   * When set (or via `valuesWhen`), the control only lands on these numbers.
   */
  values?: number[]
  /** Dynamic discrete values (overrides `values` when set). */
  valuesWhen?: (config: StudioConfig, layout?: StudioConfigLayoutContext) => number[]
}

export type StudioConfig = Record<string, unknown>

/**
 * Optional async data-fetch run BEFORE generate(). Templates that need server
 * data (LLM, remote content) implement this; pure templates omit it.
 * The resolved value is passed to generate() as ctx.remoteData.
 */
export type StudioPrefetch = (
  config: StudioConfig,
  signal: AbortSignal,
  context?: StudioPrefetchContext,
) => Promise<unknown>

/**
 * What the book already holds, for a prefetch that must not repeat it.
 *
 * Optional and lazy: templates that ignore it pay nothing, and one that asks
 * scans the pages once per call.
 */
export interface StudioPrefetchContext {
  /**
   * Content labels this template stamped on the book's pages
   * (`data.studioContentLabel`), in page order. Bounded by the collector.
   */
  bookContentLabels: (templateKey: string) => string[]
}

export interface StudioGenerateContext {
  pageWidth: number
  pageHeight: number
  /** Safe printable inset — generators layout strictly inside this. */
  margin: StudioMargin
  seed: number
  instanceId: string
  /**
   * Stable seller/book identity for per-owner icon vocabularies (KDP uniqueness).
   * Prefer `user:{id}`; fall back to `book:{id}` or `anonymous`.
   */
  ownerKey?: string
  /**
   * Per-account 128-bit puzzle salt (`users.puzzle_salt`), hex encoded.
   *
   * Keys the HMAC that derives a puzzle's seed, so two sellers running the
   * same settings on the same day never generate the same puzzle — including
   * when both type the same variation code. Absent for guests and for accounts
   * predating the migration; seed derivation falls back to a digest of
   * `ownerKey`, which still separates accounts.
   */
  ownerSalt?: string
  /** Present only when the template declared a `prefetch`. Otherwise undefined. */
  remoteData?: unknown
}

export interface StudioPageOutput {
  pageRole: StudioPageRole
  objects: StudioFabricObject[]
  /**
   * Optional object tree used to build the solution page instead of `objects`.
   * Use when the key should omit study/reference content.
   */
  answerSourceObjects?: StudioFabricObject[]
}

export type StudioGenerator = (
  config: StudioConfig,
  ctx: StudioGenerateContext,
) => StudioPageOutput[]

export interface StudioTemplateDefinition {
  key: string
  label: string
  category: StudioCategory
  description: string
  pageCount: 1 | 2
  producesAnswerKey: boolean
  /**
   * Cross-cutting labels for search and filter chips.
   *
   * A tag is not a category: templates still register under one cognitive
   * category so the Build-a-book planner stays honest, while a tag can give
   * sellers a one-click filter across that taxonomy.
   */
  tags?: readonly string[]
  /**
   * When true, form shows a tip: ungroup the grid, then add from Components.
   * Override copy with `canvasEditHint` when the default tip does not fit.
   */
  showsCanvasEditHint?: boolean
  /** Custom canvas-edit tip; used when `showsCanvasEditHint` is true. */
  canvasEditHint?: string
  /**
   * Fixed default for Page title text (e.g. cryptogram).
   * When set, the form uses this instead of auto “Game N”, until the user edits.
   */
  defaultPageTitle?: string
  /**
   * Blank / fixed forms whose layout does not change with seed.
   * Book and bulk runs skip content-fingerprint uniqueness so the same sheet
   * can appear more than once — retries cannot invent a different page.
   */
  seedInvariant?: boolean
  thumbnail: string
  configSchema: StudioConfigField[]
  generate: StudioGenerator
  /** Optional. If present, runs before generate() and populates ctx.remoteData. */
  prefetch?: StudioPrefetch
  /**
   * Optional. Return an error to block generate.
   * If `field` is set, the form shows the message under that config field.
   */
  validateConfig?: (config: StudioConfig) => StudioConfigValidationError | null
}

/** One bulk row: variant config (template fields) × how many instances to add. */
export interface StudioBulkJob {
  id: string
  config: StudioConfig
  quantity: number
}

/** Config validation result for studio template forms. */
export interface StudioConfigValidationError {
  message: string
  /** When set, message renders under this configSchema field (below its help). */
  field?: string
}

export interface StudioGenerateRequest {
  templateKey: string
  config: StudioConfig
  startPageIndex: number
  mode: 'insert' | 'replace'
  /** Book size at generate time — used to resolve instance page spans. */
  interiorPageCount: number
}

export interface StudioBulkGenerateRequest {
  templateKey: string
  /** Shared fields (title toggles, instructions) applied to every instance. */
  sharedConfig: StudioConfig
  jobs: StudioBulkJob[]
  startPageIndex: number
  /** First instance uses this mode; further instances always insert after it. */
  mode: 'insert' | 'replace'
  interiorPageCount: number
}

/** One planned game in a whole-book run: which template + its config. */
export interface StudioBookPlanItem {
  templateKey: string
  config: StudioConfig
}

/** One editable row in the "Choose games" book builder. */
export interface StudioBookGameRow {
  id: string
  templateKey: string
  quantity: number
  config: StudioConfig
}

export type StudioBookMode = 'random' | 'choose'

export type StudioBookOrder = 'sequential' | 'shuffle'

/** Whole-book generation: an ordered, possibly mixed-template plan. */
export interface StudioBookGenerateRequest {
  plan: StudioBookPlanItem[]
  startPageIndex: number
  /** First game uses this mode (reuse an empty page 0); the rest always insert. */
  mode: 'insert' | 'replace'
  interiorPageCount: number
  /** Auto-number pages as "Game N" across the whole book. */
  showTitle: boolean
  /** First "Game N" title when `showTitle` is on. */
  titleStart?: string
}

export interface StudioGenerateProgress {
  completed: number
  total: number
  /**
   * `instance` — completed/total are game counts (“1 of 5”).
   * `phase` — internal steps for a single game (drive % only; do not show as game count).
   */
  countKind?: 'instance' | 'phase'
}

export interface StudioGenerateResult {
  instanceId: string
  pageIndices: number[]
  /** Pages inserted into the book during this run (0 when replace fits existing slots). */
  pagesAdded: number
  /** Bulk: how many game instances were written (partial on cancel). */
  instancesCompleted?: number
  /** Book: games skipped because their content failed to generate. */
  instancesSkipped?: number
  /** True when this sheet repeats content already in the book. */
  isDuplicate?: boolean
  /** Book/bulk: how many written games repeat content already in the book. */
  instancesDuplicated?: number
}
