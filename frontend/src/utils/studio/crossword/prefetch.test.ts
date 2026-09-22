import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDefaultConfig } from '@/constants/studio-templates'
import { clearStudioRecentContent } from '../studio-variety'
import { FIXTURE_PAIRS } from './fixture'

vi.mock('@/api/studio-crossword.api', () => ({
  generateCrosswordClues: vi.fn(),
}))

import { generateCrosswordClues } from '@/api/studio-crossword.api'
import { crosswordTemplate } from './generate'
import { CROSSWORD_AI_EMPTY_MESSAGE, crosswordPrefetch } from './prefetch'
import { CROSSWORD_THEME_CUSTOM, CROSSWORD_THEME_MIXED } from './theme'

const generateMock = vi.mocked(generateCrosswordClues)

const defaults = buildDefaultConfig(crosswordTemplate)

describe('crosswordPrefetch', () => {
  beforeEach(() => {
    generateMock.mockReset()
    clearStudioRecentContent()
  })

  it('asks for the level it was given, and retries with seed +97', async () => {
    generateMock
      .mockResolvedValueOnce({ clues: [{ word: 'TEA', clue: 'Hot drink' }] })
      .mockResolvedValueOnce({ clues: FIXTURE_PAIRS })

    const pairs = await crosswordPrefetch(
      { ...defaults, theme: 'gardening', level: 'gentle', seed: 11 },
      new AbortController().signal,
    )

    expect(pairs.length).toBeGreaterThanOrEqual(8)
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(generateMock.mock.calls[0]![0]).toMatchObject({
      theme: 'Gardening retirement lifestyle',
      difficulty: 'easy',
      minLetters: 4,
      maxLetters: 7,
      maxClueChars: 44,
      seed: 11,
      avoid: expect.any(Array),
    })
    // Far more candidates than the grid needs, so the packer can substitute.
    expect(generateMock.mock.calls[0]![0].itemCount).toBeGreaterThanOrEqual(20)
    expect(generateMock.mock.calls[1]![0].seed).toBe(108)
  })

  it('sends the seller typed theme when they wrote their own', async () => {
    generateMock.mockResolvedValue({ clues: FIXTURE_PAIRS })
    await crosswordPrefetch(
      {
        ...defaults,
        theme: CROSSWORD_THEME_CUSTOM,
        customTheme: 'Weekends in the garden',
        seed: 3,
      },
      new AbortController().signal,
    )
    expect(generateMock.mock.calls[0]![0].theme).toBe('Weekends in the garden')
  })

  it('rotates the theme by seed on the mixed default', async () => {
    generateMock.mockResolvedValue({ clues: FIXTURE_PAIRS })
    const themeFor = async (seed: number) => {
      generateMock.mockClear()
      await crosswordPrefetch(
        { ...defaults, theme: CROSSWORD_THEME_MIXED, seed },
        new AbortController().signal,
      )
      return generateMock.mock.calls[0]![0].theme
    }
    const themes = new Set<string | undefined>()
    for (const seed of [1, 1_000, 8_919, 16_838, 24_757]) {
      themes.add(await themeFor(seed))
    }
    expect(themes.size).toBeGreaterThan(2)
  })

  it('tells the seller plainly after three unusable pools', async () => {
    generateMock.mockResolvedValue({ clues: [{ word: 'TEA', clue: 'Hot drink' }] })
    await expect(
      crosswordPrefetch(defaults, new AbortController().signal),
    ).rejects.toThrow(CROSSWORD_AI_EMPTY_MESSAGE)
    expect(generateMock).toHaveBeenCalledTimes(3)
  })

  it('drops clues that echo the answer or run past the level budget', async () => {
    generateMock.mockResolvedValue({
      clues: [
        ...FIXTURE_PAIRS,
        { word: 'HAMMOCK', clue: 'A hammock strung between two trees' },
        {
          word: 'COTTAGE',
          clue: 'A modest country dwelling with roses around the door and a view',
        },
      ],
    })
    const pairs = await crosswordPrefetch(
      { ...defaults, level: 'classic', seed: 5 },
      new AbortController().signal,
    )
    const words = pairs.map((pair) => pair.word)
    expect(words).not.toContain('HAMMOCK')
    expect(pairs.every((pair) => pair.clue.length <= 52)).toBe(true)
  })
})
