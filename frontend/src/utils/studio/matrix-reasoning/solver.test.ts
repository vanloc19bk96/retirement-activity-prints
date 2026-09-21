import { describe, it, expect } from 'vitest'
import { solveChannel } from './solver'
import type { Figure, FigureValue } from './types'

/** Nine values with the ninth dropped — what the solver is handed. */
const visible = (values: FigureValue[]): FigureValue[] => values.slice(0, 8)

describe('solveChannel', () => {
  it('reads a channel that never changes', () => {
    const solved = solveChannel(visible(Array.from({ length: 9 }, () => 'circle')))
    expect(solved).toEqual({ value: 'circle', tier: 0 })
  })

  it('reads a row band off its third row', () => {
    const solved = solveChannel(
      visible(['a', 'a', 'a', 'b', 'b', 'b', 'c', 'c', 'c'] as unknown as FigureValue[]),
    )
    expect(solved).toEqual({ value: 'c', tier: 1 })
  })

  it('reads a column band off its third column', () => {
    const solved = solveChannel(
      visible(['a', 'b', 'c', 'a', 'b', 'c', 'a', 'b', 'c'] as unknown as FigureValue[]),
    )
    expect(solved).toEqual({ value: 'c', tier: 1 })
  })

  it('reads a distribution rule off the symbol that is one cell short', () => {
    const solved = solveChannel(
      visible(['a', 'b', 'c', 'b', 'c', 'a', 'c', 'a', 'b'] as unknown as FigureValue[]),
    )
    expect(solved).toEqual({ value: 'b', tier: 2 })
  })

  /**
   * Three symbols over nine cells is what makes a distribution rule readable.
   * Without that requirement any unused value would complete the square, and a
   * seven-shape domain would hand the reader five right answers.
   */
  it('refuses a grid of all-different rows that any symbol would complete', () => {
    expect(
      solveChannel(
        visible(['a', 'b', 'c', 'b', 'c', 'd', 'c', 'd', 'e'] as unknown as FigureValue[]),
      ),
    ).toBeNull()
  })

  it('reads a combining rule along rows', () => {
    // hollow = off, solid = on; third cell is the first two xor-ed.
    const solved = solveChannel(
      visible([
        'hollow',
        'solid',
        'solid',
        'solid',
        'solid',
        'hollow',
        'solid',
        'hollow',
        'solid',
      ] as FigureValue[]),
    )
    expect(solved).toEqual({ value: 'solid', tier: 3 })
  })

  it('reads quantities that add along a line', () => {
    const solved = solveChannel(visible([1, 2, 3, 1, 1, 2, 2, 1, 3] as FigureValue[]))
    expect(solved).toEqual({ value: 3, tier: 3 })
  })

  /**
   * The reader takes the simplest rule that fits, so a board that reads as a
   * plain band never has to be read as a logical combination — but a board
   * where the two readings disagree has no defensible answer at all.
   */
  it('lets the simplest fitting rule settle it', () => {
    const solved = solveChannel(
      visible([
        'hollow',
        'hollow',
        'hollow',
        'hollow',
        'hollow',
        'hollow',
        'solid',
        'solid',
        'solid',
      ] as FigureValue[]),
    )
    // Row band says solid; xor along rows would say hollow. Band wins its tier
    // outright — and `vetBoard` refuses the board where the two disagree.
    expect(solved?.tier).toBe(1)
    expect(solved?.value).toBe('solid')
  })

  it('gives up when nothing in the grammar fits', () => {
    expect(
      solveChannel(
        visible([
          'a',
          'b',
          'c',
          'd',
          'e',
          'f',
          'g',
          'a',
          'b',
        ] as unknown as FigureValue[]),
      ),
    ).toBeNull()
  })

  it('needs all eight visible cells', () => {
    expect(solveChannel(['circle', 'circle'] as FigureValue[])).toBeNull()
  })
})

/** Type guard for the tests above — keeps `Figure` imported and honest. */
export const SAMPLE: Figure = {
  shape: 'circle',
  count: 1,
  fill: 'hollow',
  size: 'medium',
  mark: 'none',
}
