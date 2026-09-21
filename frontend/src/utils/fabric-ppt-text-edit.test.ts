/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest'
import { Textbox } from 'fabric'
import type PptxGenJS from 'pptxgenjs'

import { addFabricObjectToPptSlide } from '@/utils/fabric-object-to-ppt-slide'
import { shouldRasterizeFabricTextForPpt } from '@/utils/fabric-ppt-text-font'

describe('PPT text stays editable after content/font edits', () => {
  it('exports edited PT Serif text as native PPT text', async () => {
    const text = new Textbox('Original', {
      left: 40,
      top: 40,
      fontSize: 18,
      fontFamily: '"PT Serif", Georgia, serif',
      fill: '#111111',
    })
    text.set('text', 'Changed content')
    ;(text as { styles: unknown }).styles = {
      0: {
        0: { fontFamily: '"PT Serif", Georgia, serif' },
        1: { fontFamily: 'PT Serif' },
      },
    }

    const texts: Array<Record<string, unknown>> = []
    const images: unknown[] = []
    const slide = {
      addShape: vi.fn(),
      addText: vi.fn((value: string, props: Record<string, unknown>) => {
        texts.push({ text: value, ...props })
      }),
      addImage: vi.fn((props: unknown) => {
        images.push(props)
      }),
    } as unknown as PptxGenJS.Slide

    await addFabricObjectToPptSlide(slide, text)
    expect(images).toHaveLength(0)
    expect(texts).toHaveLength(1)
    expect(texts[0]?.text).toBe('Changed content')
    expect(texts[0]?.fontFace).toBe('PT Serif')
  })

  it('exports catalog font change (Lora) as editable PPT text', async () => {
    const text = new Textbox('Body', {
      left: 40,
      top: 40,
      fontSize: 18,
      fontFamily: '"Lora", Georgia, serif',
      fill: '#111111',
    })
    expect(shouldRasterizeFabricTextForPpt(text)).toBe(false)

    const texts: Array<Record<string, unknown>> = []
    const images: unknown[] = []
    const slide = {
      addShape: vi.fn(),
      addText: vi.fn((value: string, props: Record<string, unknown>) => {
        texts.push({ text: value, ...props })
      }),
      addImage: vi.fn((props: unknown) => images.push(props)),
    } as unknown as PptxGenJS.Slide

    await addFabricObjectToPptSlide(slide, text)
    expect(images).toHaveLength(0)
    expect(texts).toHaveLength(1)
    expect(texts[0]?.fontFace).toBe('Lora')
  })
})
