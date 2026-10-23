import { useCallback, useState } from 'react'
import type { JSX } from 'react'
import type { Canvas } from 'fabric'
import type { LucideIcon } from 'lucide-react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  BookOpen,
  FileText,
  FlipHorizontal2,
  FlipVertical2,
  Grid2x2Check,
  Layers,
  Link2,
  Link2Off,
  Lock,
  MousePointerClick,
  RotateCw,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { useCanvasSettings } from '@/context/CanvasSettingsContext'
import { alignSelectionAction } from '@/hooks/canvas-editor/canvas-editor-actions'
import { useCanvasDerivedState } from '@/hooks/canvas-editor/use-canvas-derived-state'
import { DPI } from '@/types/canvas-settings.types'
import type { CanvasAlignmentAction } from '@/utils/canvas-align'
import { setLayerLocked, type LayerKind } from '@/utils/canvas-layers'
import { getActiveSelectionTargets } from '@/utils/canvas-selection'
import {
  areSelectionPropertiesEqual,
  readSelectionProperties,
  setSelectionAngle,
  setSelectionOpacity,
  setSelectionPosition,
  setSelectionSize,
  setSelectionTextAlign,
  setSelectionTextProperties,
  toggleSelectionFlip,
  type SelectionProperties,
  type TextParagraphAlign,
} from '@/utils/canvas-selection-properties'
import { InspectorFact, InspectorIconButton, InspectorSection, NumberField } from './inspector-controls'
import { PageBackgroundSection, RepeatOnPagesSection } from './InspectorPageTools'
import { LAYER_KIND_ICONS } from './InspectorLayersTab'

const KIND_LABELS: Record<LayerKind, string> = {
  text: 'Text',
  image: 'Image',
  shape: 'Shape',
  circle: 'Shape',
  triangle: 'Shape',
  line: 'Line',
  icon: 'Icon',
  group: 'Group',
  drawing: 'Drawing',
}

const ALIGN_ACTIONS: ReadonlyArray<{ align: CanvasAlignmentAction; label: string; Icon: LucideIcon }> = [
  { align: 'left', label: 'Align left', Icon: AlignStartVertical },
  { align: 'center', label: 'Align center', Icon: AlignCenterVertical },
  { align: 'right', label: 'Align right', Icon: AlignEndVertical },
  { align: 'top', label: 'Align top', Icon: AlignStartHorizontal },
  { align: 'middle', label: 'Align middle', Icon: AlignCenterHorizontal },
  { align: 'bottom', label: 'Align bottom', Icon: AlignEndHorizontal },
]

const DISTRIBUTE_ACTIONS: ReadonlyArray<{ align: CanvasAlignmentAction; label: string; Icon: LucideIcon }> = [
  { align: 'space-horizontal', label: 'Space horizontally', Icon: AlignHorizontalSpaceBetween },
  { align: 'space-vertical', label: 'Space vertically', Icon: AlignVerticalSpaceBetween },
  { align: 'tidy-up', label: 'Tidy up', Icon: Grid2x2Check },
]

const TEXT_ALIGN_ACTIONS: ReadonlyArray<{ textAlign: TextParagraphAlign; label: string; Icon: LucideIcon }> = [
  { textAlign: 'left', label: 'Align text left', Icon: TextAlignStart },
  { textAlign: 'center', label: 'Center text', Icon: TextAlignCenter },
  { textAlign: 'right', label: 'Align text right', Icon: TextAlignEnd },
  { textAlign: 'justify', label: 'Justify text', Icon: TextAlignJustify },
]

/** Sizes are edited in inches: the unit of the trim size, margins and bleed a KDP author works with. */
const INCH_STEP = 0.01
const toInches = (pixels: number): number => pixels / DPI
const toPixels = (inches: number): number => inches * DPI

function formatInches(pixels: number): string {
  return `${Number(toInches(pixels).toFixed(3))} in`
}

type InspectorDesignTabProps = {
  canvas: Canvas | null
  scopeLabel: string
  isCover: boolean
}

export function InspectorDesignTab({ canvas, scopeLabel, isCover }: InspectorDesignTabProps): JSX.Element {
  const selection = useCanvasDerivedState(canvas, readSelectionProperties, areSelectionPropertiesEqual, null)

  if (!canvas || !selection) {
    return <PageDetails canvas={canvas} scopeLabel={scopeLabel} isCover={isCover} isLoading={!canvas} />
  }
  return <SelectionDesign canvas={canvas} selection={selection} scopeLabel={scopeLabel} isCover={isCover} />
}

function SelectionDesign({
  canvas,
  selection,
  scopeLabel,
  isCover,
}: {
  canvas: Canvas
  selection: SelectionProperties
  scopeLabel: string
  isCover: boolean
}): JSX.Element {
  const [keepAspectRatio, setKeepAspectRatio] = useState(true)
  const { isLocked, isTextbox, text } = selection
  const Icon = selection.kind ? LAYER_KIND_ICONS[selection.kind] : Layers
  const isMulti = selection.count > 1
  const opacityPercent = selection.opacity === null ? null : Math.round(selection.opacity * 100)

  const align = useCallback(
    (action: CanvasAlignmentAction) => alignSelectionAction({ getActiveCanvas: () => canvas, align: action }),
    [canvas],
  )

  const unlock = useCallback(() => {
    for (const object of getActiveSelectionTargets(canvas)) setLayerLocked(canvas, object, false)
  }, [canvas])

  const commitOpacityFromSlider = (value: string): void => {
    setSelectionOpacity(canvas, Number(value) / 100, true)
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-foreground">{selection.name}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {isMulti ? 'Selection' : KIND_LABELS[selection.kind ?? 'shape']} · {scopeLabel}
          </p>
        </div>
      </div>

      {isLocked && (
        <div className="mx-3 mt-3 flex items-center gap-2 rounded-md border border-border bg-muted/60 py-1.5 pl-2.5 pr-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden />
          <span className="flex-1">Locked, so it can't be moved or edited.</span>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2.5" onClick={unlock}>
            Unlock
          </Button>
        </div>
      )}

      <InspectorSection title="Align" hint={isMulti ? 'to each other' : 'to page'}>
        <div className="grid grid-cols-6 gap-0.5 rounded-md bg-muted/60 p-0.5">
          {ALIGN_ACTIONS.map(({ align: action, label, Icon: ActionIcon }) => (
            <InspectorIconButton
              key={action}
              label={label}
              Icon={ActionIcon}
              disabled={isLocked}
              onClick={() => align(action)}
            />
          ))}
        </div>
        {selection.count > 2 && (
          <div className="mt-1.5 grid grid-cols-3 gap-0.5 rounded-md bg-muted/60 p-0.5">
            {DISTRIBUTE_ACTIONS.map(({ align: action, label, Icon: ActionIcon }) => (
              <InspectorIconButton
                key={action}
                label={label}
                Icon={ActionIcon}
                disabled={isLocked}
                onClick={() => align(action)}
              />
            ))}
          </div>
        )}
      </InspectorSection>

      <InspectorSection title="Position and size" hint="inches">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <NumberField
            prefix="X"
            label="X position in inches"
            value={toInches(selection.x)}
            step={INCH_STEP}
            disabled={isLocked}
            onCommit={(value) => setSelectionPosition(canvas, 'x', toPixels(value))}
          />
          <NumberField
            prefix="Y"
            label="Y position in inches"
            value={toInches(selection.y)}
            step={INCH_STEP}
            disabled={isLocked}
            onCommit={(value) => setSelectionPosition(canvas, 'y', toPixels(value))}
          />
          <span aria-hidden className="w-8" />
          <NumberField
            prefix="W"
            label="Width in inches"
            value={toInches(selection.width)}
            step={INCH_STEP}
            min={0.01}
            disabled={isLocked}
            onCommit={(value) => setSelectionSize(canvas, 'width', toPixels(value), keepAspectRatio)}
          />
          <NumberField
            prefix="H"
            label="Height in inches"
            value={toInches(selection.height)}
            step={INCH_STEP}
            min={0.01}
            // A textbox's height follows its text; resize it by width.
            disabled={isLocked || isTextbox}
            onCommit={(value) => setSelectionSize(canvas, 'height', toPixels(value), keepAspectRatio)}
          />
          <InspectorIconButton
            label={keepAspectRatio ? 'Unlock aspect ratio' : 'Keep aspect ratio'}
            Icon={keepAspectRatio ? Link2 : Link2Off}
            isActive={keepAspectRatio}
            disabled={isLocked || isTextbox}
            className="w-8"
            onClick={() => setKeepAspectRatio((value) => !value)}
          />
          {!isMulti && (
            <>
              <NumberField
                prefix={<RotateCw className="size-3" />}
                label="Rotation in degrees"
                value={selection.angle}
                unit="°"
                decimals={1}
                min={-360}
                max={360}
                disabled={isLocked}
                onCommit={(value) => setSelectionAngle(canvas, value)}
              />
              <div className="col-span-2 flex gap-0.5">
                <InspectorIconButton
                  label="Flip horizontally"
                  Icon={FlipHorizontal2}
                  isActive={selection.flipX}
                  disabled={isLocked}
                  className="flex-1"
                  onClick={() => toggleSelectionFlip(canvas, 'x')}
                />
                <InspectorIconButton
                  label="Flip vertically"
                  Icon={FlipVertical2}
                  isActive={selection.flipY}
                  disabled={isLocked}
                  className="flex-1"
                  onClick={() => toggleSelectionFlip(canvas, 'y')}
                />
              </div>
            </>
          )}
        </div>
      </InspectorSection>

      <InspectorSection title="Opacity">
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={opacityPercent ?? 100}
            disabled={isLocked}
            aria-label="Opacity"
            // Dragging previews; letting go records one undo step.
            onChange={(event) => setSelectionOpacity(canvas, Number(event.target.value) / 100, false)}
            onPointerUp={(event) => commitOpacityFromSlider(event.currentTarget.value)}
            onKeyUp={(event) => commitOpacityFromSlider(event.currentTarget.value)}
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="w-[4.5rem] shrink-0">
            <NumberField
              label="Opacity in percent"
              value={opacityPercent}
              unit="%"
              decimals={0}
              min={0}
              max={100}
              disabled={isLocked}
              onCommit={(value) => setSelectionOpacity(canvas, value / 100, true)}
            />
          </div>
        </div>
      </InspectorSection>

      {text && (
        <InspectorSection title="Text">
          <div className="grid grid-cols-2 gap-1.5">
            <NumberField
              prefix="↕"
              label="Line height"
              value={text.lineHeight}
              step={0.05}
              min={0.5}
              max={5}
              disabled={isLocked}
              onCommit={(value) => setSelectionTextProperties(canvas, { lineHeight: value })}
            />
            <NumberField
              prefix="↔"
              label="Letter spacing in percent"
              value={text.letterSpacingPercent}
              unit="%"
              decimals={1}
              step={0.5}
              min={-50}
              max={100}
              disabled={isLocked}
              onCommit={(value) => setSelectionTextProperties(canvas, { letterSpacingPercent: value })}
            />
          </div>
          <div className="mt-1.5 grid grid-cols-4 gap-0.5 rounded-md bg-muted/60 p-0.5" role="group" aria-label="Paragraph alignment">
            {TEXT_ALIGN_ACTIONS.map(({ textAlign, label, Icon: ActionIcon }) => (
              <InspectorIconButton
                key={textAlign}
                label={label}
                Icon={ActionIcon}
                isActive={text.textAlign === textAlign}
                disabled={isLocked}
                onClick={() => setSelectionTextAlign(canvas, textAlign)}
              />
            ))}
          </div>
        </InspectorSection>
      )}

      {!isCover && <RepeatOnPagesSection canvas={canvas} />}
    </div>
  )
}

/** With nothing selected the tab describes the page, so it is never an empty box. */
function PageDetails({
  canvas,
  scopeLabel,
  isCover,
  isLoading,
}: {
  canvas: Canvas | null
  scopeLabel: string
  isCover: boolean
  isLoading: boolean
}): JSX.Element {
  const { settings, bookCoverDimensions, projectBookInfo } = useCanvasSettings()
  const { trimDimensions, pageDimensions, addBleed, marginGuide } = settings

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 border-b border-border px-3 py-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {isCover ? <BookOpen className="size-4" aria-hidden /> : <FileText className="size-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-tight text-foreground">{scopeLabel}</p>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {isLoading ? 'Loading…' : 'Nothing selected'}
          </p>
        </div>
      </div>

      <InspectorSection title={isCover ? 'Cover' : 'Page'}>
        {isCover ? (
          <dl>
            <InspectorFact
              label="Full cover"
              value={`${Number(bookCoverDimensions.fullWidthInches.toFixed(3))} × ${Number(bookCoverDimensions.fullHeightInches.toFixed(3))} in`}
            />
            <InspectorFact
              label="Trim (each side)"
              value={`${bookCoverDimensions.trimWidthInches} × ${bookCoverDimensions.trimHeightInches} in`}
            />
            <InspectorFact label="Spine" value={`${Number(bookCoverDimensions.spineWidthInches.toFixed(3))} in`} />
            <InspectorFact label="Pages" value={projectBookInfo.pageCount} />
            <InspectorFact label="Paper" value={projectBookInfo.paperType} />
            <InspectorFact label="Bleed" value={formatInches(bookCoverDimensions.bleedPixels)} />
          </dl>
        ) : (
          <dl>
            <InspectorFact label="Trim size" value={`${trimDimensions.widthInches} × ${trimDimensions.heightInches} in`} />
            <InspectorFact
              label="Bleed"
              value={
                addBleed
                  ? `On · ${Number(pageDimensions.widthInches.toFixed(3))} × ${Number(pageDimensions.heightInches.toFixed(3))} in`
                  : 'Off'
              }
            />
            <InspectorFact label="Top / bottom margin" value={formatInches(marginGuide.topPixels)} />
            <InspectorFact label="Inside margin" value={formatInches(marginGuide.insidePixels)} />
            <InspectorFact label="Outside margin" value={formatInches(marginGuide.outsidePixels)} />
          </dl>
        )}
      </InspectorSection>

      {!isCover && <PageBackgroundSection canvas={canvas} />}

      <div className="m-3 flex gap-2.5 rounded-md border border-dashed border-border px-3 py-2.5 text-xs leading-snug text-muted-foreground">
        <MousePointerClick className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>Select something on the {isCover ? 'cover' : 'page'} to set its exact position, size, rotation and opacity.</p>
      </div>
    </div>
  )
}
