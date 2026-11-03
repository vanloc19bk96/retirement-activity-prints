import { describe, expect, it } from 'vitest'

import type { AiGeneratedImage } from '@/types/projects.types'
import {
  AI_IMAGE_HISTORY_LIMIT,
  addGeneratedImage,
  collectPlacedImageUrls,
  describeNothingToSave,
  findUnplacedImages,
  isImagePlaced,
  mergeGeneratedImages,
} from '@/utils/ai-image-history'

const image = (name: string): AiGeneratedImage => ({
  url: `https://s/${name}.png`,
  previewUrl: `https://s/${name}.webp`,
  idea: null,
  kind: 'cover',
})

describe('generated image list', () => {
  it('keeps earlier images when a new one is generated, newest first', () => {
    const list = addGeneratedImage(addGeneratedImage([], image('first')), image('second'))

    expect(list.map((entry) => entry.url)).toEqual(['https://s/second.png', 'https://s/first.png'])
  })

  it('does not list the same image twice', () => {
    expect(addGeneratedImage([image('a'), image('b')], image('b')).map((entry) => entry.url)).toEqual([
      'https://s/b.png',
      'https://s/a.png',
    ])
  })

  it('drops the oldest image only past the limit', () => {
    const full = Array.from({ length: AI_IMAGE_HISTORY_LIMIT }, (_, index) => image(String(index)))

    const list = addGeneratedImage(full, image('new'))

    expect(list).toHaveLength(AI_IMAGE_HISTORY_LIMIT)
    expect(list[0]!.url).toBe('https://s/new.png')
    expect(list.some((entry) => entry.url === `https://s/${AI_IMAGE_HISTORY_LIMIT - 1}.png`)).toBe(false)
  })

  it('keeps an image generated before the stored list arrived', () => {
    const merged = mergeGeneratedImages([image('just-made')], [image('old'), image('just-made')])

    expect(merged.map((entry) => entry.url)).toEqual(['https://s/just-made.png', 'https://s/old.png'])
  })
})

describe('placed images', () => {
  const page = {
    objects: [
      { type: 'Image', src: 'https://s/placed.png?t=1' },
      { type: 'Group', objects: [{ type: 'Image', src: 'https://s/nested.png' }] },
      { type: 'Image', src: 'data:image/png;base64,AAAA', originalImageUrl: 'https://s/erased.png' },
      { type: 'Textbox', text: 'Title' },
    ],
  }

  it('finds images in groups and erased images, whatever their case or query string', () => {
    const urls = collectPlacedImageUrls(page)

    for (const name of ['placed', 'nested', 'erased']) {
      expect(isImagePlaced(image(name), urls)).toBe(true)
    }
    expect(isImagePlaced(image('waiting'), urls)).toBe(false)
  })

  it('reads several canvases into one set', () => {
    const urls = collectPlacedImageUrls({ objects: [{ src: 'https://s/a.png' }] })
    collectPlacedImageUrls({ objects: [{ src: 'https://s/b.png' }] }, urls)
    collectPlacedImageUrls(null, urls)

    expect(findUnplacedImages([image('a'), image('b'), image('c')], urls)).toEqual([image('c')])
  })
})

describe('saving with no canvas changes', () => {
  it('says nothing needs saving when every generated image is placed', () => {
    expect(describeNothingToSave(0).title).toBe('Nothing to save')
  })

  it('reminds the user about one image not on a canvas', () => {
    const message = describeNothingToSave(1)

    expect(message.title).toBe('AI image not placed yet')
    expect(message.description).toContain('A generated AI image is not on them')
    expect(message.description).toContain('Place button')
  })

  it('counts several images', () => {
    expect(describeNothingToSave(3).description).toContain('3 generated AI images are not on them, so they are')
  })

  it('writes no em dash', () => {
    for (const count of [0, 1, 2]) {
      expect(JSON.stringify(describeNothingToSave(count))).not.toContain('—')
    }
  })
})
