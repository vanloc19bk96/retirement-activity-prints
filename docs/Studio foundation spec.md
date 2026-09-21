# Studio Foundation — Implementation Spec

> **Read this file BEFORE `STUDIO_TEMPLATES_SPEC.md`.**
>
> That file says **what** templates to build. This file says **how** the Studio layer works: the contracts, the shared utilities, the event wiring, and one complete reference template to copy.
>
> **Companion:** `EDITOR_ARCHITECTURE_SPEC.md` (editor shell, Fabric lifecycle, `CanvasStateStore`).
>
> **Prime directive:** adding template #53 must require **zero edits** to any file in this spec. One registry entry + one generator folder. If a new template forces a change to `StudioPanel.tsx`, `use-studio-generate.ts`, or `studio-events.ts` — the abstraction is wrong, fix the abstraction.

---

## 0. The one rule that breaks everything if ignored

**Generators MUST NOT touch Fabric.** Not `new fabric.Rect()`, not `canvas.add()`, not `canvas.renderAll()`.

Why: the editor lazy-mounts canvases (`use-fabric-canvas-visibility.ts`). At any moment only ~3 of 1000 pages have a live Fabric instance. Generating onto page 400 while the user is on page 1 means **there is no canvas object to call**.

The correct path is always:

```text
generator → plain JSON → CanvasStateStore.set(pageIndex, json)
                       → if that page happens to be live, also apply to the live canvas
                       → otherwise the lifecycle hook restores it on activate
```

`use-studio-generate.ts` is the **only** file that knows about this dual path. Generators return JSON and nothing else.

---

## 1. File map

```text
frontend/src/
├── types/
│   └── studio-template.types.ts          # §2  contracts
├── constants/
│   ├── studio.constants.ts               # §3  tokens, defaults
│   └── studio-templates.ts               # §4  THE REGISTRY
├── utils/studio/
│   ├── studio-rng.ts                     # §5  seeded PRNG
│   ├── studio-fabric-builders.ts         # §6  JSON builders
│   ├── studio-layout.ts                  # §7  layout math
│   ├── studio-events.ts                  # §8  DOM events
│   ├── studio-answer-key.ts              # §9  answer harvesting
│   └── grid-copy/
│       ├── generate.ts                   # §11 REFERENCE TEMPLATE
│       └── generate.test.ts              # §12
├── context/
│   └── StudioTargetContext.tsx           # §13.0 canvasStateStore + current page
├── hooks/studio/
│   ├── use-studio-templates.ts           # §10.1 registry query
│   ├── use-studio-generate.ts            # §10.3 orchestration
│   └── use-studio-page-writer.ts         # §10.2 the dual-path writer
└── components/panels/studio/
    ├── StudioPanel.tsx                   # §13.1 list + search + tabs
    ├── StudioCategoryTabs.tsx            # §13.2
    ├── StudioTemplateCard.tsx            # §13.3
    ├── StudioTemplateConfigDialog.tsx    # §13.4 the per-template form
    ├── StudioConfigField.tsx             # §13.5 field-type switch
    └── fields/                           # §13.6 one renderer per field type
        ├── NumberField.tsx
        ├── SelectField.tsx
        ├── ToggleField.tsx
        ├── TextField.tsx
        ├── FontField.tsx
        ├── ColorField.tsx
        ├── WordListField.tsx
        └── SeedField.tsx
```

**Files to modify (only these four, only once):**

| File | Change |
|------|--------|
| `components/layout/layout.types.ts` | add `'studio'` to `PanelKey` |
| `components/layout/Sidebar.tsx` | add Studio nav item → render `StudioPanel` (§13.7) |
| `components/layout/MainContent.tsx` | mount `StudioTargetProvider` + write-page listener (§10.4, §13.0) |
| `utils/canvas-state-store.ts` | append 4 props to `CUSTOM_OBJECT_PROPS` (§3.3) |

---

## 2. Contracts — `types/studio-template.types.ts`

```typescript
import type { MarginGuide } from '@/types/canvas-settings.types'

/* ---------- Fabric JSON (structural subset the generators emit) ---------- */

export type StudioFabricType =
  | 'rect' | 'circle' | 'line' | 'textbox' | 'path' | 'polygon' | 'group'

/**
 * Plain-JSON Fabric object. Matches what fabric.Canvas.loadFromJSON() accepts.
 * Generators build these; they never construct Fabric class instances.
 */
export interface StudioFabricObject {
  type: StudioFabricType
  left: number
  top: number
  width?: number
  height?: number
  radius?: number
  x1?: number; y1?: number; x2?: number; y2?: number
  points?: { x: number; y: number }[]
  path?: (string | number)[][]
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  textAlign?: 'left' | 'center' | 'right'
  fill?: string
  stroke?: string
  strokeWidth?: number
  strokeDashArray?: number[]
  opacity?: number
  angle?: number
  originX?: 'left' | 'center' | 'right'
  originY?: 'top' | 'center' | 'bottom'
  visible?: boolean
  objects?: StudioFabricObject[]      // when type === 'group'

  /* editor props (already in CUSTOM_OBJECT_PROPS) */
  objectId?: string
  selectable?: boolean
  hasControls?: boolean
  editable?: boolean
  lockMovementX?: boolean
  lockMovementY?: boolean
  lockScalingX?: boolean
  lockScalingY?: boolean
  lockRotation?: boolean

  /* studio props (added in §3.3) */
  studioTemplateKey?: string
  studioRole?: StudioRole
  studioInstanceId?: string
  studioPageRole?: StudioPageRole
}

/* ---------- Taxonomy ---------- */

export type StudioCategory =
  | 'memory' | 'logic' | 'word'
  | 'spatial' | 'reminiscence' | 'tracker'

export type StudioRole = 'prompt' | 'answer' | 'key' | 'decoration' | 'structure'

export type StudioPageRole = 'single' | 'study' | 'recall' | 'answers'

/* ---------- Config schema ---------- */

export type StudioFieldType =
  | 'number' | 'select' | 'toggle' | 'text'
  | 'font' | 'color' | 'wordList' | 'seed'

export interface StudioSelectOption {
  label: string
  value: string | number
}

export interface StudioConfigField {
  key: string
  label: string
  type: StudioFieldType
  default: unknown
  help?: string
  options?: StudioSelectOption[]
  min?: number
  max?: number
  step?: number
  /** Hide this field unless the predicate passes. Keeps forms short. */
  visibleWhen?: (config: StudioConfig) => boolean
}

export type StudioConfig = Record<string, unknown>

/* ---------- Generator I/O ---------- */

/** Everything a generator is allowed to know about the page it draws on. */
export interface StudioGenerateContext {
  /** Printable page box in canvas px, already inset by bleed. */
  pageWidth: number
  pageHeight: number
  /** Safe area. Generators lay out strictly inside this. */
  margin: MarginGuide
  /** Deterministic seed. Same seed + same config ⇒ identical output. */
  seed: number
  /** Stable id shared by every object of this run. */
  instanceId: string
}

export interface StudioPageOutput {
  pageRole: StudioPageRole
  objects: StudioFabricObject[]
}

/** A generator is a pure function. No React. No Fabric. No I/O. No Date.now(). */
export type StudioGenerator = (
  config: StudioConfig,
  ctx: StudioGenerateContext,
) => StudioPageOutput[]

/* ---------- Registry entry ---------- */

export interface StudioTemplateDefinition {
  /** kebab-case, unique, stable. Persisted in studioTemplateKey. Never rename. */
  key: string
  label: string
  category: StudioCategory
  description: string
  /** How many interior pages one run consumes (excluding the answer key page). */
  pageCount: 1 | 2
  /** True if the generator emits studioRole:'answer' objects. */
  producesAnswerKey: boolean
  /** Inline SVG string for the card thumbnail. Keep under ~2KB. */
  thumbnail: string
  configSchema: StudioConfigField[]
  generate: StudioGenerator
}

/* ---------- Generation request/result ---------- */

export interface StudioGenerateRequest {
  templateKey: string
  config: StudioConfig
  /** Page to write the first output onto. Subsequent outputs go to +1, +2… */
  startPageIndex: number
  /** Insert new pages vs overwrite existing ones. */
  mode: 'insert' | 'replace'
}

export interface StudioGenerateResult {
  instanceId: string
  pageIndices: number[]
}
```

---

## 3. Constants — `constants/studio.constants.ts`

```typescript
import type { StudioConfigField } from '@/types/studio-template.types'

/* ---------- Print tokens (all values in canvas px @ 300dpi basis) ---------- */

export const STUDIO_INK = '#000000'
export const STUDIO_INK_MUTED = '#6B7280'
export const STUDIO_RULE = '#111827'
export const STUDIO_RULE_LIGHT = '#D1D5DB'
export const STUDIO_PAPER = '#FFFFFF'
export const STUDIO_ANSWER_INK = '#1D4ED8'

/** Hairline for print. Below ~0.75px KDP may drop the line. */
export const STUDIO_STROKE_HAIRLINE = 1
export const STUDIO_STROKE_NORMAL = 2
export const STUDIO_STROKE_BOLD = 3

export const STUDIO_TITLE_SIZE = 42
export const STUDIO_INSTRUCTION_SIZE = 20
export const STUDIO_BODY_SIZE = 24

export const STUDIO_TITLE_GAP = 24
export const STUDIO_INSTRUCTION_GAP = 32
export const STUDIO_SECTION_GAP = 40

export const STUDIO_DEFAULT_FONT = 'Inter'

/* ---------- Fonts offered by the 'font' field type ---------- */

export const STUDIO_FONT_OPTIONS = [
  { label: 'Inter', value: 'Inter' },
  { label: 'Lato', value: 'Lato' },
  { label: 'Merriweather', value: 'Merriweather' },
  { label: 'Nunito', value: 'Nunito' },
  { label: 'Roboto Mono', value: 'Roboto Mono' },
  { label: 'Atkinson Hyperlegible', value: 'Atkinson Hyperlegible' },
] as const

/* ---------- Chunking (1000-page safety) ---------- */

export const STUDIO_BATCH_YIELD_EVERY = 25

/* ---------- Shared fields every template gets for free ---------- */

/**
 * Merged in FRONT of each template's own schema by the registry helper.
 * Templates never redeclare these.
 */
export const STUDIO_COMMON_FIELDS: StudioConfigField[] = [
  {
    key: 'title',
    label: 'Page title',
    type: 'text',
    default: '',
    help: 'Leave blank to omit.',
  },
  {
    key: 'showInstructions',
    label: 'Show instructions',
    type: 'toggle',
    default: true,
  },
  {
    key: 'fontFamily',
    label: 'Font',
    type: 'font',
    default: STUDIO_DEFAULT_FONT,
  },
  {
    key: 'seed',
    label: 'Seed',
    type: 'seed',
    default: 1,
    help: 'Same seed always produces the same page.',
  },
]

/**
 * Only shown when definition.producesAnswerKey is true.
 * Appended by the registry helper.
 */
export const STUDIO_ANSWER_KEY_FIELD: StudioConfigField = {
  key: 'includeAnswerKey',
  label: 'Add answer key page',
  type: 'toggle',
  default: false,
}
```

### 3.3 Patch `utils/canvas-state-store.ts`

```typescript
// Append to the existing CUSTOM_OBJECT_PROPS array — do not reorder existing entries.
export const CUSTOM_OBJECT_PROPS = [
  /* …existing editor + puzzle props… */
  'studioTemplateKey',
  'studioRole',
  'studioInstanceId',
  'studioPageRole',
]
```

These four props must round-trip through save/load or the answer-key page and regeneration both break.

---

## 4. The registry — `constants/studio-templates.ts`

This is the single source of truth. **The only file touched when adding a template.**

```typescript
import type {
  StudioTemplateDefinition,
  StudioConfigField,
} from '@/types/studio-template.types'
import {
  STUDIO_COMMON_FIELDS,
  STUDIO_ANSWER_KEY_FIELD,
} from '@/constants/studio.constants'

/* --- import generators (one line per template) --- */
import { gridCopyTemplate } from '@/utils/studio/grid-copy/generate'
// import { sequenceRecallTemplate } from '@/utils/studio/sequence-recall/generate'
// …

/** Raw list. Add new templates HERE and nowhere else. */
const RAW_TEMPLATES: StudioTemplateDefinition[] = [
  gridCopyTemplate,
  // sequenceRecallTemplate,
]

/** Injects common fields so templates only declare what's unique to them. */
function withCommonFields(def: StudioTemplateDefinition): StudioTemplateDefinition {
  const schema: StudioConfigField[] = [
    ...STUDIO_COMMON_FIELDS,
    ...def.configSchema,
    ...(def.producesAnswerKey ? [STUDIO_ANSWER_KEY_FIELD] : []),
  ]
  return { ...def, configSchema: schema }
}

export const STUDIO_TEMPLATES: StudioTemplateDefinition[] =
  RAW_TEMPLATES.map(withCommonFields)

const TEMPLATE_INDEX = new Map(STUDIO_TEMPLATES.map((t) => [t.key, t]))

export function getStudioTemplate(key: string): StudioTemplateDefinition | undefined {
  return TEMPLATE_INDEX.get(key)
}

/** Dev guard: duplicate keys silently corrupt persisted studioTemplateKey. */
if (import.meta.env.DEV) {
  const seen = new Set<string>()
  for (const t of RAW_TEMPLATES) {
    if (seen.has(t.key)) throw new Error(`Duplicate studio template key: ${t.key}`)
    seen.add(t.key)
  }
}

export function buildDefaultConfig(def: StudioTemplateDefinition) {
  return Object.fromEntries(def.configSchema.map((f) => [f.key, f.default]))
}
```

---

## 5. Seeded RNG — `utils/studio/studio-rng.ts`

`Math.random()` is banned. Every generator draws from this.

```typescript
export interface StudioRng {
  /** float in [0, 1) */
  next(): number
  /** integer in [min, max] inclusive */
  int(min: number, max: number): number
  /** true with probability p */
  chance(p: number): boolean
  pick<T>(items: readonly T[]): T
  /** Fisher–Yates, returns a new array */
  shuffle<T>(items: readonly T[]): T[]
  /** n distinct items (or all, if n >= items.length) */
  sample<T>(items: readonly T[], n: number): T[]
}

/** mulberry32 — small, fast, good enough for layout. */
export function createRng(seed: number): StudioRng {
  let s = (seed >>> 0) || 1

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1))

  const shuffle = <T,>(items: readonly T[]): T[] => {
    const out = [...items]
    for (let i = out.length - 1; i > 0; i--) {
      const j = int(0, i)
      ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
  }

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => items[int(0, items.length - 1)],
    shuffle,
    sample: (items, n) => shuffle(items).slice(0, Math.min(n, items.length)),
  }
}

/** Derives a sub-seed so page 2 of a spread differs from page 1 but stays deterministic. */
export function deriveSeed(seed: number, salt: string): number {
  let h = seed >>> 0
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x01000193) >>> 0
  }
  return h || 1
}
```

---

## 6. Fabric JSON builders — `utils/studio/studio-fabric-builders.ts`

Generators never write object literals by hand. These builders guarantee every object carries its studio props and sane print defaults.

```typescript
import type {
  StudioFabricObject,
  StudioRole,
} from '@/types/studio-template.types'
import {
  STUDIO_INK,
  STUDIO_RULE,
  STUDIO_STROKE_HAIRLINE,
  STUDIO_BODY_SIZE,
  STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'

/** Tagging context threaded through every builder call. */
export interface StudioTag {
  templateKey: string
  instanceId: string
  pageRole: StudioFabricObject['studioPageRole']
}

let objectCounter = 0
/** Deterministic within a run — do NOT use uuid/Date.now(), it breaks snapshot tests. */
export function nextObjectId(instanceId: string): string {
  return `${instanceId}-${(objectCounter++).toString(36)}`
}
export function resetObjectCounter(): void {
  objectCounter = 0
}

function tagged(
  obj: StudioFabricObject,
  tag: StudioTag,
  role: StudioRole,
): StudioFabricObject {
  return {
    ...obj,
    objectId: nextObjectId(tag.instanceId),
    studioTemplateKey: tag.templateKey,
    studioInstanceId: tag.instanceId,
    studioPageRole: tag.pageRole,
    studioRole: role,
    // Structure is furniture: visible, but not draggable.
    ...(role === 'structure'
      ? {
          selectable: false,
          hasControls: false,
          lockMovementX: true,
          lockMovementY: true,
        }
      : {}),
    // Answers are generated hidden; the answer-key page reveals them.
    ...(role === 'answer' ? { visible: false } : {}),
  }
}

/* ---------- primitives ---------- */

export interface RectSpec {
  left: number; top: number; width: number; height: number
  fill?: string; stroke?: string; strokeWidth?: number
  strokeDashArray?: number[]
}

export function buildRect(spec: RectSpec, tag: StudioTag, role: StudioRole = 'structure') {
  return tagged(
    {
      type: 'rect',
      fill: 'transparent',
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      ...spec,
    },
    tag,
    role,
  )
}

export interface LineSpec {
  x1: number; y1: number; x2: number; y2: number
  stroke?: string; strokeWidth?: number; strokeDashArray?: number[]
}

export function buildLine(spec: LineSpec, tag: StudioTag, role: StudioRole = 'structure') {
  return tagged(
    {
      type: 'line',
      left: Math.min(spec.x1, spec.x2),
      top: Math.min(spec.y1, spec.y2),
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      ...spec,
    },
    tag,
    role,
  )
}

export interface CircleSpec {
  left: number; top: number; radius: number
  fill?: string; stroke?: string; strokeWidth?: number
}

export function buildCircle(spec: CircleSpec, tag: StudioTag, role: StudioRole = 'structure') {
  return tagged(
    {
      type: 'circle',
      fill: 'transparent',
      stroke: STUDIO_RULE,
      strokeWidth: STUDIO_STROKE_HAIRLINE,
      originX: 'center',
      originY: 'center',
      ...spec,
    },
    tag,
    role,
  )
}

export interface TextSpec {
  left: number; top: number; text: string
  width?: number
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  textAlign?: 'left' | 'center' | 'right'
  fill?: string
  originX?: 'left' | 'center' | 'right'
  originY?: 'top' | 'center' | 'bottom'
}

export function buildText(spec: TextSpec, tag: StudioTag, role: StudioRole = 'prompt') {
  return tagged(
    {
      type: 'textbox',
      fontSize: STUDIO_BODY_SIZE,
      fontFamily: STUDIO_DEFAULT_FONT,
      fill: STUDIO_INK,
      textAlign: 'left',
      editable: true,
      ...spec,
    },
    tag,
    role,
  )
}

/** Wrap a finished block so the user moves/scales it as one unit. */
export function buildGroup(
  objects: StudioFabricObject[],
  bounds: { left: number; top: number; width: number; height: number },
  tag: StudioTag,
): StudioFabricObject {
  return tagged({ type: 'group', ...bounds, objects }, tag, 'decoration')
}
```

---

## 7. Layout helpers — `utils/studio/studio-layout.ts`

Hardcoded pixel positions are banned. Templates ask for boxes.

```typescript
import type {
  StudioConfig,
  StudioGenerateContext,
  StudioFabricObject,
} from '@/types/studio-template.types'
import type { StudioTag } from './studio-fabric-builders'
import { buildText } from './studio-fabric-builders'
import {
  STUDIO_TITLE_SIZE, STUDIO_TITLE_GAP,
  STUDIO_INSTRUCTION_SIZE, STUDIO_INSTRUCTION_GAP,
  STUDIO_INK_MUTED, STUDIO_DEFAULT_FONT,
} from '@/constants/studio.constants'

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export const boxRight = (b: Box) => b.left + b.width
export const boxBottom = (b: Box) => b.top + b.height
export const boxCenterX = (b: Box) => b.left + b.width / 2
export const boxCenterY = (b: Box) => b.top + b.height / 2

/** The safe printable area. Every generator starts here. */
export function contentBox(ctx: StudioGenerateContext): Box {
  const { margin, pageWidth, pageHeight } = ctx
  return {
    left: margin.left,
    top: margin.top,
    width: pageWidth - margin.left - margin.right,
    height: pageHeight - margin.top - margin.bottom,
  }
}

export function insetBox(box: Box, by: number): Box {
  return {
    left: box.left + by,
    top: box.top + by,
    width: box.width - by * 2,
    height: box.height - by * 2,
  }
}

/** Chop `amount` off the top; returns the strip and the remainder. */
export function splitTop(box: Box, amount: number): [Box, Box] {
  return [
    { ...box, height: amount },
    { ...box, top: box.top + amount, height: box.height - amount },
  ]
}

export function splitLeft(box: Box, amount: number): [Box, Box] {
  return [
    { ...box, width: amount },
    { ...box, left: box.left + amount, width: box.width - amount },
  ]
}

/** n equal columns with a gutter between. */
export function columns(box: Box, n: number, gutter = 0): Box[] {
  const w = (box.width - gutter * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => ({
    ...box,
    left: box.left + i * (w + gutter),
    width: w,
  }))
}

export function rows(box: Box, n: number, gutter = 0): Box[] {
  const h = (box.height - gutter * (n - 1)) / n
  return Array.from({ length: n }, (_, i) => ({
    ...box,
    top: box.top + i * (h + gutter),
    height: h,
  }))
}

/**
 * Largest square-cell grid that fits `box`, centered.
 * Returns cell size + a cellBox(r, c) accessor. Use this for ALL grid templates.
 */
export function fitSquareGrid(box: Box, cols: number, rowCount: number) {
  const cell = Math.floor(Math.min(box.width / cols, box.height / rowCount))
  const gridW = cell * cols
  const gridH = cell * rowCount
  const originX = box.left + (box.width - gridW) / 2
  const originY = box.top + (box.height - gridH) / 2
  return {
    cell,
    origin: { left: originX, top: originY },
    bounds: { left: originX, top: originY, width: gridW, height: gridH } as Box,
    cellBox: (r: number, c: number): Box => ({
      left: originX + c * cell,
      top: originY + r * cell,
      width: cell,
      height: cell,
    }),
  }
}

/**
 * Standard page header. Emits title + instruction and returns the remaining box.
 * Every generator should call this first so pages look consistent.
 */
export function drawHeader(
  box: Box,
  config: StudioConfig,
  tag: StudioTag,
  instructionText: string,
): { objects: StudioFabricObject[]; body: Box } {
  const objects: StudioFabricObject[] = []
  let body = box

  const title = String(config.title ?? '').trim()
  const font = String(config.fontFamily ?? STUDIO_DEFAULT_FONT)

  if (title) {
    objects.push(
      buildText(
        {
          left: boxCenterX(body),
          top: body.top,
          text: title,
          width: body.width,
          fontSize: STUDIO_TITLE_SIZE,
          fontFamily: font,
          fontWeight: 700,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
    )
    ;[, body] = splitTop(body, STUDIO_TITLE_SIZE + STUDIO_TITLE_GAP)
  }

  if (config.showInstructions !== false && instructionText) {
    objects.push(
      buildText(
        {
          left: boxCenterX(body),
          top: body.top,
          text: instructionText,
          width: body.width,
          fontSize: STUDIO_INSTRUCTION_SIZE,
          fontFamily: font,
          fill: STUDIO_INK_MUTED,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'decoration',
      ),
    )
    ;[, body] = splitTop(body, STUDIO_INSTRUCTION_SIZE + STUDIO_INSTRUCTION_GAP)
  }

  return { objects, body }
}
```

---

## 8. Events — `utils/studio/studio-events.ts`

Follows the existing `utils/editor-page-events.ts` pattern: panels dispatch, `MainContent` listens. Panels never hold a Fabric ref.

```typescript
import type { StudioFabricObject } from '@/types/studio-template.types'

export const STUDIO_WRITE_PAGE_EVENT = 'studio:write-page'
export const STUDIO_GENERATION_DONE_EVENT = 'studio:generation-done'

export interface StudioWritePageDetail {
  pageIndex: number
  objects: StudioFabricObject[]
  /** 'replace' clears the page first; 'append' keeps existing objects. */
  mode: 'replace' | 'append'
}

export interface StudioGenerationDoneDetail {
  instanceId: string
  pageIndices: number[]
}

export function dispatchStudioWritePage(detail: StudioWritePageDetail): void {
  window.dispatchEvent(new CustomEvent(STUDIO_WRITE_PAGE_EVENT, { detail }))
}

export function onStudioWritePage(
  handler: (detail: StudioWritePageDetail) => void,
): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<StudioWritePageDetail>).detail)
  window.addEventListener(STUDIO_WRITE_PAGE_EVENT, listener)
  return () => window.removeEventListener(STUDIO_WRITE_PAGE_EVENT, listener)
}

export function dispatchStudioGenerationDone(detail: StudioGenerationDoneDetail): void {
  window.dispatchEvent(new CustomEvent(STUDIO_GENERATION_DONE_EVENT, { detail }))
}
```

---

## 9. Answer key — `utils/studio/studio-answer-key.ts`

```typescript
import type { StudioFabricObject } from '@/types/studio-template.types'
import type { Box } from './studio-layout'

/** Pull hidden answers out of a generated page and make them printable. */
export function harvestAnswers(objects: StudioFabricObject[]): StudioFabricObject[] {
  const out: StudioFabricObject[] = []
  for (const obj of objects) {
    if (obj.type === 'group' && obj.objects) {
      out.push(...harvestAnswers(obj.objects))
      continue
    }
    if (obj.studioRole === 'answer') out.push(obj)
  }
  return out
}

/**
 * Build the answer page: structure objects (grid lines etc.) stay visible,
 * answer objects are revealed and re-inked.
 */
export function buildAnswerPage(
  sourceObjects: StudioFabricObject[],
  answerInk: string,
): StudioFabricObject[] {
  const reveal = (obj: StudioFabricObject): StudioFabricObject => {
    if (obj.type === 'group' && obj.objects) {
      return { ...obj, objects: obj.objects.map(reveal) }
    }
    if (obj.studioRole === 'answer') {
      return { ...obj, visible: true, fill: answerInk, studioPageRole: 'answers' }
    }
    return { ...obj, studioPageRole: 'answers' }
  }
  return sourceObjects.map(reveal)
}
```

---

## 10. Hooks

### 10.1 `hooks/studio/use-studio-templates.ts`

```typescript
import { useMemo, useState } from 'react'
import { STUDIO_TEMPLATES } from '@/constants/studio-templates'
import {
  STUDIO_CATEGORY_LABELS,
  type StudioCategoryFilter,
} from '@/constants/studio-categories'

export function useStudioTemplates() {
  const [category, setCategory] = useState<StudioCategoryFilter>('all')
  const [query, setQuery] = useState('')

  const templates = useMemo(() => {
    const q = query.trim().toLowerCase()
    return STUDIO_TEMPLATES.filter((t) => {
      if (category !== 'all' && t.category !== category) return false
      if (!q) return true
      const keyText = t.key.replace(/-/g, ' ')
      return (
        t.label.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.key.toLowerCase().includes(q) ||
        keyText.includes(q) ||
        STUDIO_CATEGORY_LABELS[t.category].toLowerCase().includes(q)
      )
    })
  }, [category, query])

  return { templates, category, setCategory, query, setQuery }
}
```

### 10.2 `hooks/studio/use-studio-page-writer.ts` — **the dual path**

This is the file that solves the lazy-mount problem. Nothing else may write pages.

```typescript
import { useCallback } from 'react'
import { dispatchStudioWritePage } from '@/utils/studio/studio-events'
import type { StudioFabricObject } from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

interface Params {
  canvasStateStore: CanvasStateStore
}

/**
 * Writes generated objects to a page whether or not that page is live.
 *
 *  1. ALWAYS write to CanvasStateStore — this is the durable truth. An
 *     off-screen page has no Fabric instance; the lifecycle hook will restore
 *     from the store when the page activates.
 *  2. THEN dispatch the write event. MainContent applies it to the live canvas
 *     if (and only if) that page happens to be mounted, then marks the store
 *     entry untrusted so the live canvas wins.
 *
 * Never call canvas.add() from a generator or panel. See §0.
 */
export function useStudioPageWriter({ canvasStateStore }: Params) {
  return useCallback(
    (pageIndex: number, objects: StudioFabricObject[], mode: 'replace' | 'append') => {
      const existing = mode === 'append' ? canvasStateStore.get(pageIndex) : undefined
      const merged = {
        version: '6.0.0',
        objects: [...(existing?.objects ?? []), ...objects],
        background: '#FFFFFF',
      }

      canvasStateStore.set(pageIndex, merged)
      canvasStateStore.markFabricLiveUntrusted(pageIndex)

      // Live canvas, if mounted, syncs itself via this event.
      dispatchStudioWritePage({ pageIndex, objects, mode })
    },
    [canvasStateStore],
  )
}
```

### 10.3 `hooks/studio/use-studio-generate.ts`

```typescript
import { useCallback, useState } from 'react'
import { getStudioTemplate } from '@/constants/studio-templates'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { addPagesAt } from '@/utils/editor-page-events'
import { invalidateThumbnail } from '@/utils/canvas-thumbnail-events'
import { dispatchStudioGenerationDone } from '@/utils/studio/studio-events'
import { buildAnswerPage } from '@/utils/studio/studio-answer-key'
import { resetObjectCounter } from '@/utils/studio/studio-fabric-builders'
import { STUDIO_ANSWER_INK } from '@/constants/studio.constants'
import { useStudioPageWriter } from './use-studio-page-writer'
import type {
  StudioGenerateRequest,
  StudioGenerateResult,
  StudioGenerateContext,
} from '@/types/studio-template.types'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

export function useStudioGenerate(canvasStateStore: CanvasStateStore) {
  const { pageDimensions, marginGuide } = useCanvasSettings()
  const writePage = useStudioPageWriter({ canvasStateStore })
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = useCallback(
    async (req: StudioGenerateRequest): Promise<StudioGenerateResult | null> => {
      const def = getStudioTemplate(req.templateKey)
      if (!def) {
        setError(`Unknown template: ${req.templateKey}`)
        return null
      }

      setIsGenerating(true)
      setError(null)
      try {
        const instanceId = `${def.key}-${req.startPageIndex}-${String(req.config.seed ?? 1)}`
        const ctx: StudioGenerateContext = {
          pageWidth: pageDimensions.width,
          pageHeight: pageDimensions.height,
          margin: marginGuide,
          seed: Number(req.config.seed ?? 1) || 1,
          instanceId,
        }

        resetObjectCounter()
        const outputs = def.generate(req.config, ctx)

        const wantsKey = def.producesAnswerKey && req.config.includeAnswerKey === true
        const totalPages = outputs.length + (wantsKey ? 1 : 0)

        if (req.mode === 'insert') {
          addPagesAt(req.startPageIndex, totalPages)
        }

        const pageIndices: number[] = []
        outputs.forEach((out, i) => {
          const pageIndex = req.startPageIndex + i
          writePage(pageIndex, out.objects, req.mode === 'insert' ? 'append' : 'replace')
          invalidateThumbnail(pageIndex)
          pageIndices.push(pageIndex)
        })

        if (wantsKey) {
          const keyPageIndex = req.startPageIndex + outputs.length
          const answerObjects = outputs.flatMap((o) =>
            buildAnswerPage(o.objects, STUDIO_ANSWER_INK),
          )
          writePage(keyPageIndex, answerObjects, 'replace')
          invalidateThumbnail(keyPageIndex)
          pageIndices.push(keyPageIndex)
        }

        dispatchStudioGenerationDone({ instanceId, pageIndices })
        return { instanceId, pageIndices }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Generation failed')
        return null
      } finally {
        setIsGenerating(false)
      }
    },
    [pageDimensions, marginGuide, writePage],
  )

  return { generate, isGenerating, error }
}
```

### 10.4 Wire into `MainContent.tsx`

```typescript
// MainContent already owns the CanvasStateStore instance.
useEffect(() => {
  return onStudioWritePage(({ pageIndex, objects, mode }) => {
    const live = getLiveCanvas(pageIndex)   // existing MainContent canvas registry
    if (!live) return                      // off-screen: store already has it (§10.2)

    if (mode === 'replace') live.clear()
    live.loadFromJSON({ objects }, () => {
      live.renderAll()
      canvasStateStore.markFabricLiveTrusted(pageIndex)
    })
  })
}, [canvasStateStore])
```

---

## 11. Reference template — `utils/studio/grid-copy/generate.ts`

**Copy this file's shape for every new template.** It demonstrates: header, layout via helpers, seeded RNG, structure vs answer roles, zero Fabric imports.

```typescript
import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng } from '../studio-rng'
import {
  contentBox, splitTop, columns, fitSquareGrid, drawHeader, boxCenterX, boxCenterY,
} from '../studio-layout'
import { buildRect, buildText, type StudioTag } from '../studio-fabric-builders'
import { STUDIO_RULE_LIGHT, STUDIO_INK } from '@/constants/studio.constants'

const INSTRUCTION = 'Copy the pattern from the left grid into the empty grid on the right.'

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const size = Number(config.gridSize ?? 5)
  const density = Number(config.fillDensity ?? 0.4)
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)

  const tag: StudioTag = {
    templateKey: 'grid-copy',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }

  const objects: StudioFabricObject[] = []

  // 1. Header — always first, returns the remaining body box.
  const { objects: headerObjects, body } = drawHeader(contentBox(ctx), config, tag, INSTRUCTION)
  objects.push(...headerObjects)

  // 2. Two side-by-side panels with a gutter.
  const [modelBox, copyBox] = columns(body, 2, 60)

  // 3. Decide the pattern once; both grids derive from it.
  const filled: boolean[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => rng.chance(density)),
  )

  // 4. Model grid — pattern is visible, role 'prompt'.
  const [modelLabel, modelGridArea] = splitTop(modelBox, 40)
  objects.push(
    buildText(
      { left: boxCenterX(modelBox), top: modelLabel.top, text: 'Model',
        width: modelBox.width, fontFamily: font, textAlign: 'center', originX: 'center' },
      tag, 'decoration',
    ),
  )
  const model = fitSquareGrid(modelGridArea, size, size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = model.cellBox(r, c)
      objects.push(buildRect({ ...cell, stroke: STUDIO_RULE_LIGHT }, tag, 'structure'))
      if (filled[r][c]) {
        objects.push(buildRect({ ...cell, fill: STUDIO_INK }, tag, 'prompt'))
      }
    }
  }

  // 5. Copy grid — empty for the reader; filled cells are hidden ANSWERS.
  const [copyLabel, copyGridArea] = splitTop(copyBox, 40)
  objects.push(
    buildText(
      { left: boxCenterX(copyBox), top: copyLabel.top, text: 'Your copy',
        width: copyBox.width, fontFamily: font, textAlign: 'center', originX: 'center' },
      tag, 'decoration',
    ),
  )
  const copy = fitSquareGrid(copyGridArea, size, size)
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cell = copy.cellBox(r, c)
      objects.push(buildRect({ ...cell, stroke: STUDIO_RULE_LIGHT }, tag, 'structure'))
      if (filled[r][c]) {
        // role 'answer' ⇒ builder sets visible:false; answer-key page reveals it.
        objects.push(buildRect({ ...cell, fill: STUDIO_INK }, tag, 'answer'))
      }
    }
  }

  return [{ pageRole: 'single', objects }]
}

export const gridCopyTemplate: StudioTemplateDefinition = {
  key: 'grid-copy',
  label: 'Grid Copy',
  category: 'spatial',
  description: 'Reproduce a shaded pattern from a model grid into an empty grid.',
  pageCount: 1,
  producesAnswerKey: true,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1">
      <rect x="4" y="8" width="24" height="24"/><rect x="36" y="8" width="24" height="24"/>
      <path d="M12 8v24M20 8v24M4 16h24M4 24h24"/>
      <path d="M44 8v24M52 8v24M36 16h24M36 24h24"/>
    </g>
    <g fill="currentColor"><rect x="4" y="8" width="8" height="8"/><rect x="20" y="16" width="8" height="8"/></g>
  </svg>`,
  // Only template-specific fields. title/seed/font/answerKey are injected by the registry.
  configSchema: [
    {
      key: 'gridSize',
      label: 'Grid size',
      type: 'number',
      default: 5,
      min: 3,
      max: 10,
      step: 1,
    },
    {
      key: 'fillDensity',
      label: 'Fill density',
      type: 'number',
      default: 0.4,
      min: 0.1,
      max: 0.8,
      step: 0.05,
      help: 'Higher = more shaded cells = harder.',
    },
  ],
  generate,
}
```

---

## 12. Test contract — `utils/studio/<key>/generate.test.ts`

Every generator ships with this. Non-negotiable; it's what keeps the catalog maintainable.

```typescript
import { describe, it, expect } from 'vitest'
import { gridCopyTemplate } from './generate'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { resetObjectCounter } from '../studio-fabric-builders'
import type { StudioGenerateContext } from '@/types/studio-template.types'

const CTX: StudioGenerateContext = {
  pageWidth: 2550,
  pageHeight: 3300,
  margin: { top: 150, right: 150, bottom: 150, left: 225 },
  seed: 42,
  instanceId: 'test-run',
}

const config = { ...buildDefaultConfig(gridCopyTemplate), seed: 42, fontFamily: 'Inter' }

describe('grid-copy', () => {
  it('is deterministic for a given seed', () => {
    resetObjectCounter()
    const a = gridCopyTemplate.generate(config, CTX)
    resetObjectCounter()
    const b = gridCopyTemplate.generate(config, CTX)
    expect(a).toEqual(b)
  })

  it('produces different output for a different seed', () => {
    resetObjectCounter()
    const a = JSON.stringify(gridCopyTemplate.generate(config, CTX))
    resetObjectCounter()
    const b = JSON.stringify(gridCopyTemplate.generate({ ...config, seed: 7 }, CTX))
    expect(a).not.toEqual(b)
  })

  it('keeps every object inside the safe margin', () => {
    resetObjectCounter()
    const [page] = gridCopyTemplate.generate(config, CTX)
    for (const o of page.objects) {
      expect(o.left).toBeGreaterThanOrEqual(CTX.margin.left - 1)
      expect(o.top).toBeGreaterThanOrEqual(CTX.margin.top - 1)
      expect(o.left + (o.width ?? 0)).toBeLessThanOrEqual(CTX.pageWidth - CTX.margin.right + 1)
      expect(o.top + (o.height ?? 0)).toBeLessThanOrEqual(CTX.pageHeight - CTX.margin.bottom + 1)
    }
  })

  it('tags every object with the template key and instance id', () => {
    resetObjectCounter()
    const [page] = gridCopyTemplate.generate(config, CTX)
    for (const o of page.objects) {
      expect(o.studioTemplateKey).toBe('grid-copy')
      expect(o.studioInstanceId).toBe('test-run')
    }
  })

  it('emits hidden answer objects when it declares producesAnswerKey', () => {
    resetObjectCounter()
    const [page] = gridCopyTemplate.generate(config, CTX)
    const answers = page.objects.filter((o) => o.studioRole === 'answer')
    expect(answers.length).toBeGreaterThan(0)
    expect(answers.every((o) => o.visible === false)).toBe(true)
  })
})
```

Add a **uniqueness** test for any constraint puzzle (`sudoku`, `futoshiki`, `kenken`): the solver must find exactly one solution.

---

## 13. UI shell

The whole point of this section: **the UI never knows a template's name.** It reads the registry for the list, and reads `configSchema` for the form. Sudoku shows a size dropdown and Maze shows width/height sliders through the *same* two components.

```text
Sidebar
└── StudioPanel                       # list: search + category tabs + card grid
    ├── StudioCategoryTabs
    ├── StudioTemplateCard × N        # thumbnail + label, from registry
    └── StudioTemplateConfigDialog    # opens on card click
        └── StudioConfigField × N     # one per configSchema entry
            └── fields/*Field.tsx     # one renderer per field.type
```

### 13.0 `context/StudioTargetContext.tsx`

The Studio panel lives in `Sidebar`; the `CanvasStateStore` and the current page live in `MainContent`. This context is the bridge — without it the panel can't know where to write.

```typescript
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { CanvasStateStore } from '@/utils/canvas-state-store'

interface StudioTargetValue {
  canvasStateStore: CanvasStateStore
  /** Page the user is currently looking at. New pages are inserted after it. */
  currentPageIndex: number
  interiorPageCount: number
}

const StudioTargetContext = createContext<StudioTargetValue | null>(null)

interface Props extends StudioTargetValue {
  children: ReactNode
}

export function StudioTargetProvider({
  canvasStateStore,
  currentPageIndex,
  interiorPageCount,
  children,
}: Props) {
  const value = useMemo(
    () => ({ canvasStateStore, currentPageIndex, interiorPageCount }),
    [canvasStateStore, currentPageIndex, interiorPageCount],
  )
  return (
    <StudioTargetContext.Provider value={value}>{children}</StudioTargetContext.Provider>
  )
}

export function useStudioTarget(): StudioTargetValue {
  const ctx = useContext(StudioTargetContext)
  if (!ctx) throw new Error('useStudioTarget must be used inside StudioTargetProvider')
  return ctx
}
```

**Mounting note.** `MainLayout` renders `Sidebar` and `MainContent` as siblings, but `MainContent` owns the store. Two options — pick (a):

- **(a) Lift the store to `MainLayout`.** Create the `CanvasStateStore` in `MainLayout`, pass it down to `MainContent` as a prop, and wrap `Header + Sidebar + PageThumbnails + MainContent` in `StudioTargetProvider`. `currentPageIndex` comes from the existing scroll/active-page state — lift that too, or expose it via `EditorScrollContext`.
- (b) If lifting is too invasive, keep the store in `MainContent` and have it publish into a module-level ref that the provider reads. Works, but it's a hidden dependency — prefer (a).

### 13.1 `StudioPanel.tsx`

```typescript
import { useState } from 'react'
import { getStudioTemplate } from '@/constants/studio-templates'
import { useStudioTemplates } from '@/hooks/studio/use-studio-templates'
import { Input } from '@/components/ui/input'
import { StudioCategoryTabs } from './StudioCategoryTabs'
import { StudioTemplateCard } from './StudioTemplateCard'
import { StudioTemplateConfigDialog } from './StudioTemplateConfigDialog'

export function StudioPanel() {
  const { templates, category, setCategory, query, setQuery } = useStudioTemplates()
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const activeTemplate = activeKey ? getStudioTemplate(activeKey) : null

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search templates…"
        aria-label="Search templates"
      />

      <StudioCategoryTabs value={category} onChange={setCategory} />

      <div className="flex-1 overflow-y-auto">
        {templates.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            No templates match “{query}”.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => (
              <StudioTemplateCard
                key={t.key}
                template={t}
                onSelect={() => setActiveKey(t.key)}
              />
            ))}
          </div>
        )}
      </div>

      {activeTemplate && (
        <StudioTemplateConfigDialog
          template={activeTemplate}
          onClose={() => setActiveKey(null)}
        />
      )}
    </div>
  )
}
```

### 13.2 `StudioCategoryTabs.tsx`

Category labels live in `constants/studio-categories.ts`, in one array shared by
the tabs and the search filter. Adding a category = one entry there plus one
member of the `StudioCategory` union.

```typescript
// constants/studio-categories.ts
export type StudioCategoryFilter = StudioCategory | 'all'

export const STUDIO_CATEGORIES: { value: StudioCategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'memory', label: 'Memory' },
  { value: 'logic', label: 'Logic' },
  { value: 'word', label: 'Word' },
  { value: 'spatial', label: 'Spatial' },
  { value: 'reminiscence', label: 'Reminiscence' },
  { value: 'tracker', label: 'Trackers' },
]

// components/panels/studio/StudioCategoryTabs.tsx
interface Props {
  value: StudioCategoryFilter
  onChange: (value: StudioCategoryFilter) => void
}

export function StudioCategoryTabs({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-1" role="tablist" aria-label="Template categories">
      {CATEGORIES.map((c) => (
        <button
          key={c.value}
          type="button"
          role="tab"
          aria-selected={value === c.value}
          onClick={() => onChange(c.value)}
          className={cn(
            'rounded-full px-2.5 py-1 text-xs transition-colors',
            value === c.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  )
}
```

### 13.3 `StudioTemplateCard.tsx`

`thumbnail` is an inline SVG string from the registry, drawn with `currentColor` so it themes for free.

```typescript
import { memo } from 'react'
import type { StudioTemplateDefinition } from '@/types/studio-template.types'

interface Props {
  template: StudioTemplateDefinition
  onSelect: () => void
}

function StudioTemplateCardBase({ template, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={template.description}
      className="group flex flex-col gap-1.5 rounded-lg border border-border p-2 text-left
                 transition-colors hover:border-primary hover:bg-accent
                 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div
        className="aspect-[8/5] w-full rounded bg-muted p-2 text-foreground/70
                   [&>svg]:h-full [&>svg]:w-full group-hover:text-foreground"
        // Safe: thumbnails are static strings authored in the registry, never user input.
        dangerouslySetInnerHTML={{ __html: template.thumbnail }}
      />
      <span className="line-clamp-2 text-xs font-medium leading-tight">{template.label}</span>
      {template.pageCount === 2 && (
        <span className="text-[10px] text-muted-foreground">2-page spread</span>
      )}
    </button>
  )
}

export const StudioTemplateCard = memo(StudioTemplateCardBase)
```

### 13.4 `StudioTemplateConfigDialog.tsx` — **the per-template form**

This is the answer to "each template has a different form". There is no `switch` on template key. The form *is* `configSchema`.

```typescript
import { useMemo, useState } from 'react'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { useStudioGenerate } from '@/hooks/studio/use-studio-generate'
import { useStudioTarget } from '@/context/StudioTargetContext'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { StudioConfigField } from './StudioConfigField'
import type { StudioConfig, StudioTemplateDefinition } from '@/types/studio-template.types'

interface Props {
  template: StudioTemplateDefinition
  onClose: () => void
}

export function StudioTemplateConfigDialog({ template, onClose }: Props) {
  const { canvasStateStore, currentPageIndex } = useStudioTarget()
  const { generate, isGenerating, error } = useStudioGenerate(canvasStateStore)

  // Defaults come from the schema — the dialog knows nothing about the template.
  const [config, setConfig] = useState<StudioConfig>(() => buildDefaultConfig(template))
  const [mode, setMode] = useState<'insert' | 'replace'>('insert')

  // Conditional fields: e.g. sudoku's `givenCount` only when difficulty === 'custom'.
  const visibleFields = useMemo(
    () => template.configSchema.filter((f) => !f.visibleWhen || f.visibleWhen(config)),
    [template, config],
  )

  const setField = (key: string, value: unknown) =>
    setConfig((c) => ({ ...c, [key]: value }))

  const pageWord = template.pageCount === 2 ? '2 pages' : '1 page'

  const handleGenerate = async () => {
    const result = await generate({
      templateKey: template.key,
      config,
      startPageIndex: mode === 'insert' ? currentPageIndex + 1 : currentPageIndex,
      mode,
    })
    if (result) onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{template.label}</DialogTitle>
          <DialogDescription>{template.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {visibleFields.map((field) => (
            <StudioConfigField
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(v) => setField(field.key, v)}
            />
          ))}
        </div>

        <div className="flex gap-2 rounded-md bg-muted p-1">
          {(['insert', 'replace'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={
                mode === m
                  ? 'flex-1 rounded bg-background px-2 py-1.5 text-xs font-medium shadow-sm'
                  : 'flex-1 rounded px-2 py-1.5 text-xs text-muted-foreground'
              }
            >
              {m === 'insert' ? `Insert ${pageWord} after current` : 'Replace current page'}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? 'Generating…' : 'Add to book'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### 13.5 `StudioConfigField.tsx`

One `switch` on `field.type`. **The only place a field type is handled.** New field type = one case, and every template can use it immediately. The `never` default makes a missing case a compile error, not a blank form row.

```typescript
import type { StudioConfigField as FieldDef } from '@/types/studio-template.types'
import { NumberField } from './fields/NumberField'
import { SelectField } from './fields/SelectField'
import { ToggleField } from './fields/ToggleField'
import { TextField } from './fields/TextField'
import { FontField } from './fields/FontField'
import { ColorField } from './fields/ColorField'
import { WordListField } from './fields/WordListField'
import { SeedField } from './fields/SeedField'

export interface StudioFieldProps<T = unknown> {
  field: FieldDef
  value: T
  onChange: (value: T) => void
}

export function StudioConfigField({ field, value, onChange }: StudioFieldProps) {
  switch (field.type) {
    case 'number':
      return <NumberField field={field} value={Number(value)} onChange={onChange} />
    case 'select':
      return <SelectField field={field} value={value as string | number} onChange={onChange} />
    case 'toggle':
      return <ToggleField field={field} value={Boolean(value)} onChange={onChange} />
    case 'text':
      return <TextField field={field} value={String(value ?? '')} onChange={onChange} />
    case 'font':
      return <FontField field={field} value={String(value ?? '')} onChange={onChange} />
    case 'color':
      return <ColorField field={field} value={String(value ?? '#000000')} onChange={onChange} />
    case 'wordList':
      return <WordListField field={field} value={String(value ?? '')} onChange={onChange} />
    case 'seed':
      return <SeedField field={field} value={Number(value ?? 1)} onChange={onChange} />
    default: {
      // Exhaustiveness guard — adding a StudioFieldType without a case fails the build.
      const exhaustive: never = field.type
      return exhaustive
    }
  }
}
```

### 13.6 Field renderers — `components/panels/studio/fields/`

All share one label/help wrapper so the form looks uniform regardless of template.

```typescript
// fields/FieldShell.tsx
import type { ReactNode } from 'react'
import { Label } from '@/components/ui/label'

interface Props {
  htmlFor?: string
  label: string
  help?: string
  action?: ReactNode
  children: ReactNode
}

export function FieldShell({ htmlFor, label, help, action, children }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={htmlFor} className="text-xs font-medium">{label}</Label>
        {action}
      </div>
      {children}
      {help && <p className="text-[11px] leading-snug text-muted-foreground">{help}</p>}
    </div>
  )
}
```

```typescript
// fields/NumberField.tsx — slider + live value. Handles ints and 0–1 ratios via `step`.
import { Slider } from '@/components/ui/slider'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

export function NumberField({ field, value, onChange }: StudioFieldProps<number>) {
  const min = field.min ?? 0
  const max = field.max ?? 100
  const step = field.step ?? 1
  const display = step < 1 ? value.toFixed(2) : String(value)

  return (
    <FieldShell
      label={field.label}
      help={field.help}
      action={<span className="text-xs tabular-nums text-muted-foreground">{display}</span>}
    >
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        aria-label={field.label}
      />
    </FieldShell>
  )
}
```

```typescript
// fields/SelectField.tsx — options come from the schema, values may be string or number.
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

export function SelectField({ field, value, onChange }: StudioFieldProps<string | number>) {
  const options = field.options ?? []
  // Radix Select is string-only; map back to the original typed value on change.
  const toValue = (raw: string) =>
    options.find((o) => String(o.value) === raw)?.value ?? raw

  return (
    <FieldShell label={field.label} help={field.help}>
      <Select value={String(value)} onValueChange={(raw) => onChange(toValue(raw))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={String(o.value)} value={String(o.value)}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}
```

```typescript
// fields/ToggleField.tsx
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import type { StudioFieldProps } from '../StudioConfigField'

export function ToggleField({ field, value, onChange }: StudioFieldProps<boolean>) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <Label htmlFor={field.key} className="text-xs font-medium">{field.label}</Label>
        {field.help && (
          <p className="text-[11px] leading-snug text-muted-foreground">{field.help}</p>
        )}
      </div>
      <Switch id={field.key} checked={value} onCheckedChange={onChange} />
    </div>
  )
}
```

```typescript
// fields/TextField.tsx
import { Input } from '@/components/ui/input'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

export function TextField({ field, value, onChange }: StudioFieldProps<string>) {
  return (
    <FieldShell htmlFor={field.key} label={field.label} help={field.help}>
      <Input
        id={field.key}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={String(field.default ?? '')}
      />
    </FieldShell>
  )
}
```

```typescript
// fields/FontField.tsx — previews each font in its own face; ensures it's loaded before generate.
import { useEffect } from 'react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { STUDIO_FONT_OPTIONS } from '@/constants/studio.constants'
import { loadFont } from '@/utils/font-loader'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

export function FontField({ field, value, onChange }: StudioFieldProps<string>) {
  // Fabric measures text at generate time; the face must already be resident.
  useEffect(() => { void loadFont(value) }, [value])

  return (
    <FieldShell label={field.label} help={field.help}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {STUDIO_FONT_OPTIONS.map((f) => (
            <SelectItem key={f.value} value={f.value} style={{ fontFamily: f.value }}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}
```

```typescript
// fields/ColorField.tsx
import { Input } from '@/components/ui/input'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

export function ColorField({ field, value, onChange }: StudioFieldProps<string>) {
  return (
    <FieldShell label={field.label} help={field.help}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
          aria-label={field.label}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-xs"
        />
      </div>
    </FieldShell>
  )
}
```

```typescript
// fields/WordListField.tsx — value is a wordlist key from data/studio/wordlists/index.json.
import { useEffect, useState } from 'react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

interface WordListMeta {
  key: string
  label: string
  locale: string
  count: number
}

export function WordListField({ field, value, onChange }: StudioFieldProps<string>) {
  const [lists, setLists] = useState<WordListMeta[]>([])

  useEffect(() => {
    let cancelled = false
    import('@/data/studio/wordlists/index.json')
      .then((m) => { if (!cancelled) setLists(m.default as WordListMeta[]) })
      .catch(() => { if (!cancelled) setLists([]) })
    return () => { cancelled = true }
  }, [])

  return (
    <FieldShell label={field.label} help={field.help}>
      <Select value={value} onValueChange={onChange} disabled={lists.length === 0}>
        <SelectTrigger>
          <SelectValue placeholder={lists.length ? 'Choose a list' : 'Loading…'} />
        </SelectTrigger>
        <SelectContent>
          {lists.map((l) => (
            <SelectItem key={l.key} value={l.key}>
              {l.label} <span className="text-muted-foreground">({l.count})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  )
}
```

```typescript
// fields/SeedField.tsx — the ONE place a random value is allowed. Generators stay pure.
import { Shuffle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { FieldShell } from './FieldShell'
import type { StudioFieldProps } from '../StudioConfigField'

export function SeedField({ field, value, onChange }: StudioFieldProps<number>) {
  const randomize = () => onChange(Math.floor(Math.random() * 1_000_000) + 1)

  return (
    <FieldShell
      htmlFor={field.key}
      label={field.label}
      help={field.help}
      action={
        <button
          type="button"
          onClick={randomize}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Shuffle className="h-3 w-3" /> Randomize
        </button>
      }
    >
      <Input
        id={field.key}
        type="number"
        min={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 1)}
        className="font-mono text-xs"
      />
    </FieldShell>
  )
}
```

### 13.7 Sidebar wiring

```typescript
// components/layout/layout.types.ts
export type PanelKey =
  | 'generate' | 'studio' | 'components' | 'photos' | 'tools'
  | 'setting' | 'download' | 'save' | 'alignment' | 'bookInfo'
```

```typescript
// components/layout/Sidebar.tsx — add to the existing nav array and panel switch.
import { Wand2 } from 'lucide-react'
import { StudioPanel } from '@/components/panels/studio/StudioPanel'

const NAV_ITEMS = [
  /* …existing… */
  { key: 'studio' as const, label: 'Studio', icon: Wand2 },
]

// in the panel renderer:
case 'studio': return <StudioPanel />
```

### 13.8 What the user sees

1. Click **Studio** in the sidebar → panel opens with a search box, category pills, and a 2-column card grid built from `STUDIO_TEMPLATES`.
2. Filter by category or type to search — `use-studio-templates` filters the registry, nothing else changes.
3. Click a card → `StudioTemplateConfigDialog` opens with **that template's fields**:
   - *Grid Copy* → Title, Instructions, Font, Seed, Grid size, Fill density, Add answer key
   - *Sudoku* → Title, Instructions, Font, Seed, Size, Difficulty, (Given numbers — only if Difficulty = Custom), Add answer key
   - Same component both times. The difference is entirely `configSchema`.
4. Choose Insert vs Replace → **Add to book** → `useStudioGenerate` runs the pure generator, writes via the §10.2 dual path, and the thumbnail strip updates.

---

## 14. Build order

| Step | Deliverable | Done when |
|------|-------------|-----------|
| 1 | §2 types, §3 constants + `CUSTOM_OBJECT_PROPS` patch | Compiles |
| 2 | §5 rng, §6 builders, §7 layout | Unit tested |
| 3 | §8 events, §10.2 page writer, §10.4 `MainContent` listener | Writing to an off-screen page survives scroll-away → scroll-back |
| 4 | §11 `grid-copy` + §12 tests | All 5 tests pass |
| 5 | §4 registry, §10.1/§10.3 hooks | `grid-copy` generates from the panel |
| 6a | §13.0 `StudioTargetContext` + `MainLayout` lift | `useStudioTarget()` returns a real store + page index |
| 6b | §13.1–13.3 list UI + §13.7 sidebar wiring | Click Studio → card grid renders from registry |
| 6c | §13.4–13.6 dialog + all 8 field renderers | Click card → form renders from `configSchema` |
| 7 | §9 answer key | `includeAnswerKey` produces a correct extra page |
| 8 | Second template (`sequence-recall`) | **Adds zero lines to §4 except one import + one array entry.** If more is needed, the abstraction failed — fix it now, before template #3 |

Step 8 is the real acceptance test for this whole spec.

---

## 15. Rules for Cursor

1. **Never** import `fabric` inside `utils/studio/**`. Generators emit JSON.
2. **Never** import React inside `utils/studio/**`.
3. **Never** call `Math.random()`, `Date.now()`, or `crypto.randomUUID()` inside a generator. Use `createRng(ctx.seed)` and `nextObjectId()`.
4. **Never** hardcode coordinates. Derive from `contentBox(ctx)` and the helpers in §7.
5. **Never** add a `if (templateKey === 'x')` branch in a hook, panel, or the registry. Behaviour differences belong in the generator or the schema.
5b. **Never** write a template name in `components/panels/studio/**`. If a template needs a form the schema can't express, add a `StudioFieldType` (§2) + one case in §13.5 — never a bespoke form component.
6. Adding a template touches exactly: one new `utils/studio/<key>/` folder, one import line + one array entry in §4, optional `data/studio/**` entries.
7. File ≤ 300 lines, function ≤ 50 lines, ≤ 4 params (options object beyond that).
8. Every generator ships with the §12 test contract.
9. `key` values are persisted in saved canvas JSON. **Never rename an existing key.** Deprecate instead.
10. When generating across many pages, chunk with `yieldToMainThread()` every `STUDIO_BATCH_YIELD_EVERY` pages.