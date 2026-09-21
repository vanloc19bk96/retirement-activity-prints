import type {
  StudioTemplateDefinition,
  StudioConfig,
  StudioGenerateContext,
  StudioPageOutput,
  StudioFabricObject,
} from '@/types/studio-template.types'
import { createRng, type StudioRng } from '../studio-rng'
import {
  contentBox,
  insetHorizontal,
  drawHeader,
  boxCenterX,
  boxCenterY,
  rows,
  type Box,
} from '../studio-layout'
import {
  buildText,
  buildLine,
  buildRect,
  buildImage,
  type StudioTag,
} from '../studio-fabric-builders'
import {
  STUDIO_INK,
  STUDIO_INK_MUTED,
  STUDIO_RULE,
  STUDIO_RULE_LIGHT,
  STUDIO_BODY_SIZE,
  STUDIO_STROKE_HAIRLINE,
} from '@/constants/studio.constants'
import { faceNamePrefetch } from './prefetch'
import { parseFaceMixEntries } from './face-specs'
import type { FaceAsset, FaceNamePrefetchResult } from './types'

/** One sheet holds between these many people, generated or hand-mixed. */
export const MIN_FACE_PAIRS = 4
export const MAX_FACE_PAIRS = 12

function isMixedFaceConfig(config: StudioConfig): boolean {
  return config.faceMode === 'custom'
}

interface Person {
  face: FaceAsset
  name: string
}

type RecallMode = 'write' | 'matching'

/** Explicit break keeps both lines roughly equal — avoids a lone “page” widow. */
const STUDY_INSTRUCTION =
  'Study each face with its name. You will be asked to recall the names.\n' +
  'Look for one memorable feature in each face. Then turn the page'

const WRITE_INSTRUCTION = "Write each person's name from memory. Do not look back"

const MATCH_INSTRUCTION = 'Match each face to its name. Do not look back'

/**
 * Horizontal inset inside the safe box. Smaller than STUDIO_CONTENT_SAFE_INSET_X
 * so the long study instruction can use more width and stay two balanced lines.
 */
const FACE_NAME_CONTENT_INSET_X = 12

/** Full names wrap to 2 lines — reserve that band so the next row's face cannot cover them. */
const NAME_LINE_HEIGHT = STUDIO_BODY_SIZE * 1.3
const NAME_LINES = 2
const NAME_BAND = Math.ceil(NAME_LINE_HEIGHT * NAME_LINES)
const FACE_TOP_INSET = 8
const FACE_NAME_GAP = 12
/** Extra air under the face on write-recall so the blank line is not cramped. */
const FACE_WRITE_LINE_GAP = 40
const CELL_BOTTOM_PAD = 10
const GRID_GUTTER_X = 16
const GRID_GUTTER_Y = 28
/** Face column stays left; names sit on the right — wide middle channel for pen lines. */
const MATCH_FACE_COL_RATIO = 0.28
const MATCH_NAME_COL_RATIO = 0.34
const MATCH_ROW_GUTTER = 14
const MATCH_CHIP_PAD_X = 12

function faceNameContentBox(ctx: StudioGenerateContext): Box {
  return insetHorizontal(contentBox(ctx), FACE_NAME_CONTENT_INSET_X)
}

function gridDims(pairCount: number): { cols: number; rowsN: number } {
  const cols = Math.min(pairCount, Math.max(3, Math.ceil(Math.sqrt(pairCount))))
  return { cols, rowsN: Math.ceil(pairCount / cols) }
}

/** Rectangular cells with row gutters — taller than square so face + 2-line name fit cleanly. */
function fitFaceNameGrid(box: Box, cols: number, rowCount: number) {
  const cellW = Math.floor((box.width - GRID_GUTTER_X * (cols - 1)) / cols)
  const cellH = Math.floor((box.height - GRID_GUTTER_Y * (rowCount - 1)) / rowCount)
  const gridW = cellW * cols + GRID_GUTTER_X * (cols - 1)
  const gridH = cellH * rowCount + GRID_GUTTER_Y * (rowCount - 1)
  const originX = box.left + (box.width - gridW) / 2
  const originY = box.top + (box.height - gridH) / 2
  return {
    cellBox: (r: number, c: number): Box => ({
      left: originX + c * (cellW + GRID_GUTTER_X),
      top: originY + r * (cellH + GRID_GUTTER_Y),
      width: cellW,
      height: cellH,
    }),
  }
}

function cardFaceAndLabel(
  cell: Box,
  labelGap: number = FACE_NAME_GAP,
): { faceBox: Box; labelY: number } {
  const faceMaxH = cell.height - FACE_TOP_INSET - labelGap - NAME_BAND - CELL_BOTTOM_PAD
  const faceSize = Math.max(24, Math.min(cell.width * 0.72, faceMaxH))
  const faceBox: Box = {
    left: cell.left + (cell.width - faceSize) / 2,
    top: cell.top + FACE_TOP_INSET,
    width: faceSize,
    height: faceSize,
  }
  return { faceBox, labelY: faceBox.top + faceBox.height + labelGap }
}

function errorPage(ctx: StudioGenerateContext, config: StudioConfig): StudioPageOutput {
  const tag: StudioTag = {
    templateKey: 'face-name-recall',
    instanceId: ctx.instanceId,
    pageRole: 'single',
  }
  return {
    pageRole: 'single',
    objects: [
      buildText(
        {
          left: ctx.margin.left,
          top: ctx.margin.top,
          text: 'Faces could not be generated. Please try again.',
          fontFamily: String(config.fontFamily),
          fill: STUDIO_INK_MUTED,
          width: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
        },
        tag,
        'decoration',
      ),
    ],
  }
}

function drawFaceImage(objects: StudioFabricObject[], faceBox: Box, face: FaceAsset, tag: StudioTag): void {
  // Fabric treats width/height as source crop size. Pass natural pixels + scale to
  // the card box — otherwise a top-left crop of the face SVG is mostly empty.
  const naturalSize = face.naturalSize
  objects.push(
    buildImage(
      {
        left: faceBox.left,
        top: faceBox.top,
        width: naturalSize,
        height: naturalSize,
        scaleX: faceBox.width / naturalSize,
        scaleY: faceBox.height / naturalSize,
        src: face.dataUri,
      },
      tag,
      'prompt',
    ),
  )
}

function drawCard(
  objects: StudioFabricObject[],
  cell: Box,
  person: Person,
  showName: boolean,
  writeLine: boolean,
  font: string,
  tag: StudioTag,
): void {
  const labelGap = writeLine ? FACE_WRITE_LINE_GAP : FACE_NAME_GAP
  const { faceBox, labelY } = cardFaceAndLabel(cell, labelGap)
  drawFaceImage(objects, faceBox, person.face, tag)

  if (showName) {
    objects.push(
      buildText(
        {
          left: boxCenterX(cell),
          top: labelY,
          text: person.name,
          width: cell.width * 0.9,
          fontFamily: font,
          fontSize: STUDIO_BODY_SIZE,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'prompt',
      ),
    )
  } else if (writeLine) {
    objects.push(
      buildLine(
        {
          x1: cell.left + cell.width * 0.12,
          y1: labelY + NAME_LINE_HEIGHT * 0.55,
          x2: cell.left + cell.width * 0.88,
          y2: labelY + NAME_LINE_HEIGHT * 0.55,
          stroke: STUDIO_RULE,
        },
        tag,
        'structure',
      ),
    )
  }
}

/** Matching recall: faces flush left, names on the right — wide middle for pen lines. */
function drawMatchingColumns(
  objects: StudioFabricObject[],
  area: Box,
  people: Person[],
  font: string,
  tag: StudioTag,
  rng: StudioRng,
): void {
  const faceColW = Math.floor(area.width * MATCH_FACE_COL_RATIO)
  const nameColW = Math.floor(area.width * MATCH_NAME_COL_RATIO)
  const faceCol: Box = { left: area.left, top: area.top, width: faceColW, height: area.height }
  const nameCol: Box = {
    left: area.left + area.width - nameColW,
    top: area.top,
    width: nameColW,
    height: area.height,
  }
  const faceRows = rows(faceCol, people.length, MATCH_ROW_GUTTER)
  const nameRows = rows(nameCol, people.length, MATCH_ROW_GUTTER)
  const shuffledNames = rng.shuffle(people.map((person) => person.name))

  people.forEach((person, index) => {
    const row = faceRows[index]
    const faceSize = Math.max(24, Math.min(row.width * 0.92, row.height * 0.88))
    const faceBox: Box = {
      left: row.left,
      top: row.top + (row.height - faceSize) / 2,
      width: faceSize,
      height: faceSize,
    }
    drawFaceImage(objects, faceBox, person.face, tag)
    objects.push(
      buildText(
        {
          left: boxCenterX(row),
          top: boxCenterY(row),
          text: person.name,
          width: row.width * 0.9,
          fontFamily: font,
          fontSize: STUDIO_BODY_SIZE,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
        },
        tag,
        'answer',
      ),
    )
  })

  shuffledNames.forEach((name, index) => {
    const row = nameRows[index]
    const chipH = Math.min(NAME_BAND + 8, row.height * 0.7)
    const chip: Box = {
      left: row.left,
      top: row.top + (row.height - chipH) / 2,
      width: row.width,
      height: chipH,
    }
    objects.push(
      buildRect(
        {
          left: chip.left,
          top: chip.top,
          width: chip.width,
          height: chip.height,
          stroke: STUDIO_RULE_LIGHT,
          strokeWidth: STUDIO_STROKE_HAIRLINE,
        },
        tag,
        'structure',
      ),
      buildText(
        {
          left: chip.left + chip.width / 2,
          top: chip.top + chip.height / 2,
          text: name,
          width: chip.width - MATCH_CHIP_PAD_X * 2,
          fontFamily: font,
          fontSize: STUDIO_BODY_SIZE * 0.85,
          textAlign: 'center',
          originX: 'center',
          originY: 'center',
          fill: STUDIO_INK,
        },
        tag,
        'prompt',
      ),
    )
  })
}

function buildStudyPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  people: Person[],
  cols: number,
  rowsN: number,
  font: string,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const header = drawHeader(faceNameContentBox(ctx), config, tag, STUDY_INSTRUCTION)
  objects.push(...header.objects)

  const g = fitFaceNameGrid(header.body, cols, rowsN)
  people.forEach((person, index) => {
    const cell = g.cellBox(Math.floor(index / cols), index % cols)
    drawCard(objects, cell, person, true, false, font, tag)
  })
  return { pageRole: 'study', objects }
}

function buildRecallPage(
  config: StudioConfig,
  ctx: StudioGenerateContext,
  tag: StudioTag,
  people: Person[],
  cols: number,
  rowsN: number,
  recallMode: RecallMode,
  font: string,
  rng: StudioRng,
): StudioPageOutput {
  const objects: StudioFabricObject[] = []
  const content = faceNameContentBox(ctx)

  if (recallMode === 'matching') {
    const header = drawHeader(content, config, tag, MATCH_INSTRUCTION)
    objects.push(...header.objects)
    drawMatchingColumns(objects, header.body, people, font, tag, rng)
    return { pageRole: 'recall', objects }
  }

  const header = drawHeader(content, config, tag, WRITE_INSTRUCTION)
  objects.push(...header.objects)

  const g = fitFaceNameGrid(header.body, cols, rowsN)
  people.forEach((person, index) => {
    const cell = g.cellBox(Math.floor(index / cols), index % cols)
    drawCard(objects, cell, person, false, true, font, tag)
    const { labelY } = cardFaceAndLabel(cell, FACE_WRITE_LINE_GAP)
    objects.push(
      buildText(
        {
          left: boxCenterX(cell),
          top: labelY,
          text: person.name,
          width: cell.width * 0.9,
          fontFamily: font,
          fontSize: STUDIO_BODY_SIZE,
          textAlign: 'center',
          originX: 'center',
        },
        tag,
        'answer',
      ),
    )
  })
  return { pageRole: 'recall', objects }
}

function generate(config: StudioConfig, ctx: StudioGenerateContext): StudioPageOutput[] {
  const recallMode = String(config.recallMode ?? 'write') as RecallMode
  const font = String(config.fontFamily)
  const rng = createRng(ctx.seed)

  const data = ctx.remoteData as FaceNamePrefetchResult | undefined
  if (!data?.faces?.length || !data.names?.length) {
    return [errorPage(ctx, config)]
  }

  // Hand-mixed sheets hold exactly the faces the user picked; generated ones use the slider.
  const pairCount = isMixedFaceConfig(config)
    ? data.faces.length
    : Number(config.pairCount ?? 6)

  const people: Person[] = data.faces.slice(0, pairCount).map((face, index) => ({
    face,
    name: data.names[index] ?? `Person ${index + 1}`,
  }))

  const { cols, rowsN } = gridDims(people.length)
  const studyTag: StudioTag = {
    templateKey: 'face-name-recall',
    instanceId: ctx.instanceId,
    pageRole: 'study',
  }
  const recallTag: StudioTag = { ...studyTag, pageRole: 'recall' }

  return [
    buildStudyPage(config, ctx, studyTag, people, cols, rowsN, font),
    buildRecallPage(config, ctx, recallTag, people, cols, rowsN, recallMode, font, rng),
  ]
}

export const faceNameTemplate: StudioTemplateDefinition = {
  key: 'face-name-recall',
  label: 'Face–Name Association',
  category: 'memory',
  description:
    'Study a set of faces with their names, then name each face from the drawing alone. Faces are simple black and white line art, never photos. Turn back to the study page to check.',
  pageCount: 2,
  producesAnswerKey: false,
  prefetch: faceNamePrefetch,
  thumbnail: `<svg viewBox="0 0 64 40" xmlns="http://www.w3.org/2000/svg">
    <g fill="none" stroke="currentColor" stroke-width="1.3">
      <circle cx="16" cy="14" r="8"/><path d="M12 13a1 1 0 010 2M20 13a1 1 0 010 2" stroke-width="2"/>
      <path d="M13 18q3 2 6 0"/>
      <circle cx="46" cy="14" r="8"/><path d="M42 13a1 1 0 010 2M50 13a1 1 0 010 2" stroke-width="2"/>
      <path d="M8 30h16M40 30h16"/>
    </g>
  </svg>`,
  configSchema: [
    {
      key: 'faceMode',
      label: 'Faces',
      type: 'select',
      default: 'auto',
      options: [
        { label: 'Generate faces for me', value: 'auto' },
        { label: 'Mix my own faces', value: 'custom' },
      ],
      help: 'Mix your own to hand-pick every hairstyle, expression, beard and pair of glasses.',
    },
    {
      key: 'pairCount',
      label: 'Number of people',
      type: 'number',
      default: 6,
      min: MIN_FACE_PAIRS,
      max: MAX_FACE_PAIRS,
      step: 1,
      help: 'How many face–name pairs to remember. More = harder.',
      visibleWhen: (config) => !isMixedFaceConfig(config),
    },
    {
      key: 'faceMix',
      label: 'Your faces',
      type: 'faceMix',
      default: [],
      help:
        `Add ${MIN_FACE_PAIRS}–${MAX_FACE_PAIRS} faces and type a name under each. ` +
        'Leave a name blank to have one written for you.',
      visibleWhen: isMixedFaceConfig,
    },
    {
      key: 'nameStyle',
      label: 'Name format',
      type: 'select',
      default: 'first',
      options: [
        { label: 'First name only', value: 'first' },
        { label: 'First + last (harder)', value: 'full' },
      ],
      // Hand-mixed faces use the names typed under each thumbnail.
      visibleWhen: (config) => !isMixedFaceConfig(config),
    },
    {
      key: 'recallMode',
      label: 'Recall format',
      type: 'select',
      default: 'write',
      options: [
        { label: 'Write the name', value: 'write' },
        { label: 'Match faces to names', value: 'matching' },
      ],
    },
  ],
  validateConfig: (config) => {
    if (!isMixedFaceConfig(config)) return null
    const mixed = parseFaceMixEntries(config.faceMix).length
    if (mixed < MIN_FACE_PAIRS) {
      return {
        field: 'faceMix',
        message: `Add at least ${MIN_FACE_PAIRS} faces (you have ${mixed}).`,
      }
    }
    if (mixed > MAX_FACE_PAIRS) {
      return {
        field: 'faceMix',
        message: `Remove a few — a sheet holds up to ${MAX_FACE_PAIRS} faces.`,
      }
    }
    return null
  },
  generate,
}
