import type { JSX } from 'react'

import type { ShapeBorderStyle } from '@/utils/fabric-selection'
import { ToolbarHintButton } from './ToolbarHintButton'

type ShapeSelection = {
  strokeWidth: number
  borderStyle: ShapeBorderStyle
  strokeColor: string
  fillColor: string
  canEditCornerRadius: boolean
  cornerRadius: number
  cornerRadiusMax?: number
}

type ToolbarShapeSettingsControlsProps = {
  shapeSelection: ShapeSelection
  isSettingsDisabled?: boolean
  onStrokeWidthChange?: (strokeWidth: number) => void
  onBorderStyleChange?: (borderStyle: ShapeBorderStyle) => void
  onStrokeColorChange?: (strokeColor: string) => void
  onFillColorChange?: (fillColor: string) => void
  onCornerRadiusChange?: (cornerRadius: number) => void
  withDivider?: boolean
}

const COLOR_INPUT_CLASS_NAME = 'h-8 w-10 cursor-pointer rounded border border-input bg-background p-1'
const TEXT_INPUT_CLASS_NAME = 'h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground'
const SELECT_CLASS_NAME =
  'h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground [color-scheme:light] dark:[color-scheme:dark]'
const SELECT_OPTION_CLASS_NAME = 'bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-100'

function readNumberInputValue(value: string, fallback: number): number {
  const nextValue = Number(value)
  return Number.isFinite(nextValue) ? nextValue : fallback
}

function colorPickerValue(value: string, fallback: string): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

export function ToolbarShapeSettingsControls({
  shapeSelection,
  isSettingsDisabled = false,
  onStrokeWidthChange,
  onBorderStyleChange,
  onStrokeColorChange,
  onFillColorChange,
  onCornerRadiusChange,
  withDivider = true,
}: ToolbarShapeSettingsControlsProps): JSX.Element {
  return (
    <>
      <div className="flex min-w-0 items-center gap-2" role="group" aria-label="Shape tools">
        <div className="flex items-center gap-2" role="group" aria-label="Stroke color">
          <ToolbarHintButton hint="Stroke color picker">
            <span className="inline-flex">
              <input
                type="color"
                value={colorPickerValue(shapeSelection.strokeColor, '#0f172a')}
                disabled={isSettingsDisabled}
                onChange={(event) => onStrokeColorChange?.(event.target.value)}
                aria-label="Stroke color picker"
                className={COLOR_INPUT_CLASS_NAME}
              />
            </span>
          </ToolbarHintButton>
          <ToolbarHintButton hint="Stroke color">
            <span className="inline-flex">
              <input
                value={shapeSelection.strokeColor}
                disabled={isSettingsDisabled}
                onChange={(event) => onStrokeColorChange?.(event.target.value)}
                className={`${TEXT_INPUT_CLASS_NAME} w-24`}
                aria-label="Stroke color"
                placeholder="#0f172a"
              />
            </span>
          </ToolbarHintButton>
        </div>

        <div className="flex items-center gap-2" role="group" aria-label="Fill color">
          <ToolbarHintButton hint="Fill color picker">
            <span className="inline-flex">
              <input
                type="color"
                value={colorPickerValue(shapeSelection.fillColor, '#ffffff')}
                disabled={isSettingsDisabled}
                onChange={(event) => onFillColorChange?.(event.target.value)}
                aria-label="Fill color picker"
                className={COLOR_INPUT_CLASS_NAME}
              />
            </span>
          </ToolbarHintButton>
          <ToolbarHintButton hint="Fill color">
            <span className="inline-flex">
              <input
                value={shapeSelection.fillColor}
                disabled={isSettingsDisabled}
                onChange={(event) => onFillColorChange?.(event.target.value)}
                className={`${TEXT_INPUT_CLASS_NAME} w-24`}
                aria-label="Fill color"
                placeholder="#ffffff"
              />
            </span>
          </ToolbarHintButton>
        </div>

        <ToolbarHintButton hint="Stroke width">
          <label>
            <span className="sr-only">Stroke width</span>
            <input
              className={`${TEXT_INPUT_CLASS_NAME} w-16`}
              type="number"
              min={0}
              step={1}
              value={shapeSelection.strokeWidth}
              disabled={isSettingsDisabled}
              onChange={(event) =>
                onStrokeWidthChange?.(readNumberInputValue(event.target.value, shapeSelection.strokeWidth))
              }
              aria-label="Stroke width"
            />
          </label>
        </ToolbarHintButton>

        <ToolbarHintButton hint="Border type">
          <label>
            <span className="sr-only">Border type</span>
            <select
              className={`${SELECT_CLASS_NAME} w-24`}
              value={shapeSelection.borderStyle}
              disabled={isSettingsDisabled}
              onChange={(event) => onBorderStyleChange?.(event.target.value as ShapeBorderStyle)}
              aria-label="Border type"
            >
              <option className={SELECT_OPTION_CLASS_NAME} value="solid">
                Solid
              </option>
              <option className={SELECT_OPTION_CLASS_NAME} value="dash">
                Dash
              </option>
              <option className={SELECT_OPTION_CLASS_NAME} value="dot">
                Dot
              </option>
            </select>
          </label>
        </ToolbarHintButton>

        {shapeSelection.canEditCornerRadius && (
          <ToolbarHintButton hint="Corner radius">
            <label>
              <span className="sr-only">Corner radius</span>
              <input
                className={`${TEXT_INPUT_CLASS_NAME} w-20`}
                type="number"
                min={0}
                max={shapeSelection.cornerRadiusMax}
                step={1}
                value={shapeSelection.cornerRadius}
                disabled={isSettingsDisabled}
                onChange={(event) =>
                  onCornerRadiusChange?.(readNumberInputValue(event.target.value, shapeSelection.cornerRadius))
                }
                aria-label="Corner radius"
              />
            </label>
          </ToolbarHintButton>
        )}
      </div>
      {withDivider && <div className="h-6 w-px bg-border" aria-hidden />}
    </>
  )
}
