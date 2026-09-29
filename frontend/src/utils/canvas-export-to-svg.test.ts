/**
 * @vitest-environment jsdom
 */
import { Group, Path } from 'fabric'
import { describe, expect, it } from 'vitest'
import {
  bakeUniformStrokesForVectorExport,
  isSvgElementVisibilityHidden,
  removeVisibilityHiddenSvgElements,
} from '@/utils/canvas-export-to-svg'

function parseSvg(markup: string): SVGSVGElement {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml')
  return doc.documentElement as unknown as SVGSVGElement
}

describe('removeVisibilityHiddenSvgElements', () => {
  it('detects visibility:hidden from style and attribute', () => {
    const svg = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <text id="a" style="opacity: 1; visibility: hidden;">7</text>
        <text id="b" visibility="hidden">6</text>
        <text id="c" style="opacity: 1;">0</text>
      </svg>
    `)
    expect(isSvgElementVisibilityHidden(svg.querySelector('#a')!)).toBe(true)
    expect(isSvgElementVisibilityHidden(svg.querySelector('#b')!)).toBe(true)
    expect(isSvgElementVisibilityHidden(svg.querySelector('#c')!)).toBe(false)
  })

  it('removes Fabric-hidden answer glyphs so puzzle squares stay blank', () => {
    const svg = parseSvg(`
      <svg xmlns="http://www.w3.org/2000/svg">
        <rect id="box" width="20" height="20"/>
        <g transform="matrix(1 0 0 1 10 10)">
          <text id="answer" style="fill: rgb(0,0,0); opacity: 1; visibility: hidden;">7</text>
        </g>
        <text id="prompt">7 6 0</text>
      </svg>
    `)

    removeVisibilityHiddenSvgElements(svg)

    expect(svg.querySelector('#answer')).toBeNull()
    expect(svg.querySelector('#box')).not.toBeNull()
    expect(svg.querySelector('#prompt')).not.toBeNull()
  })
})

describe('bakeUniformStrokesForVectorExport', () => {
  it('keeps a nested scaled icon stroke at its editor weight (svg2pdf ignores non-scaling-stroke)', () => {
    const path = new Path('M 0 0 L 24 24', {
      stroke: '#000',
      strokeWidth: 2,
      strokeUniform: true,
    })
    const icon = new Group([path], { scaleX: 3, scaleY: 3 })
    const row = new Group([icon], { scaleX: 1.5, scaleY: 1.5 })

    bakeUniformStrokesForVectorExport([row])

    expect(path.strokeUniform).toBe(false)
    expect(path.strokeWidth).toBeCloseTo(2 / 4.5)
    expect(path.toSVG()).not.toContain('non-scaling-stroke')
  })

  it('leaves scaling strokes untouched', () => {
    const path = new Path('M 0 0 L 24 24', { stroke: '#000', strokeWidth: 2 })
    const group = new Group([path], { scaleX: 3, scaleY: 3 })

    bakeUniformStrokesForVectorExport([group])

    expect(path.strokeWidth).toBe(2)
  })
})
