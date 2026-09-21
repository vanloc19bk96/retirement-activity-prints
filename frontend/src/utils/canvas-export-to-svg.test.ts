/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest'
import {
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
