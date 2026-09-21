import { describe, it, expect } from 'vitest'
import {
  asUploadedSvgs,
  mergeSvgUploads,
  readSvgFile,
  svgUploadLimits,
} from './svg-upload'

const SAMPLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>'

function svgFile(name: string, contents: string, type = 'image/svg+xml'): File {
  return new File([contents], name, { type })
}

describe('svg-upload', () => {
  it('reads a valid SVG into a data-URI asset', async () => {
    const asset = await readSvgFile(svgFile('star.svg', SAMPLE_SVG))
    expect(asset.fileName).toBe('star.svg')
    expect(asset.svgText).toContain('<svg')
    expect(asset.dataUri.startsWith('data:image/svg+xml')).toBe(true)
  })

  it('rejects non-SVG and scripted SVG files', async () => {
    await expect(readSvgFile(svgFile('photo.png', 'not-svg', 'image/png'))).rejects.toThrow(
      /must be an SVG/,
    )
    await expect(
      readSvgFile(
        svgFile('bad.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
      ),
    ).rejects.toThrow(/unsupported script/)
  })

  it('merges uploads up to the shared max count', () => {
    const { maxCount } = svgUploadLimits()
    const existing = asUploadedSvgs(
      Array.from({ length: maxCount - 1 }, (_, i) => ({
        id: `id-${i}`,
        fileName: `${i}.svg`,
        svgText: SAMPLE_SVG,
        dataUri: 'data:image/svg+xml;base64,abc',
      })),
    )
    const incoming = [
      {
        id: 'new-1',
        fileName: 'a.svg',
        svgText: SAMPLE_SVG,
        dataUri: 'data:image/svg+xml;base64,a',
      },
      {
        id: 'new-2',
        fileName: 'b.svg',
        svgText: SAMPLE_SVG,
        dataUri: 'data:image/svg+xml;base64,b',
      },
    ]
    const merged = mergeSvgUploads(existing, incoming)
    expect(merged).toHaveLength(maxCount)
    expect(merged.at(-1)?.id).toBe('new-1')
  })
})
