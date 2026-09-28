import { describe, expect, it } from 'vitest'
import {
  RETIREMENT_THEME_CUSTOM,
  RETIREMENT_THEME_MIXED,
  isPresetRetirementTheme,
  parseRetirementThemeChoice,
  retirementThemeSelectOptions,
  writeOwnThemeField,
} from './retirement-theme-config'

describe('write-my-own-theme switch', () => {
  it('is a switch beside the picker, not one of its options', () => {
    const values = retirementThemeSelectOptions().map((option) => option.value)
    expect(values).not.toContain(RETIREMENT_THEME_CUSTOM)
    expect(writeOwnThemeField()).toMatchObject({
      key: 'writeOwnTheme',
      type: 'toggle',
      default: false,
    })
  })

  it('swaps the picker for the typed theme while it is on', () => {
    expect(parseRetirementThemeChoice({ writeOwnTheme: true, theme: 'gardening' })).toBe(
      RETIREMENT_THEME_CUSTOM,
    )
    expect(isPresetRetirementTheme({ writeOwnTheme: true })).toBe(false)
    expect(isPresetRetirementTheme({ writeOwnTheme: false })).toBe(true)
  })

  it('still reads a custom theme saved while it was a picker option', () => {
    expect(parseRetirementThemeChoice({ theme: RETIREMENT_THEME_CUSTOM })).toBe(
      RETIREMENT_THEME_CUSTOM,
    )
    // The switch turned off wins over a stale saved option.
    expect(
      parseRetirementThemeChoice({ writeOwnTheme: false, theme: RETIREMENT_THEME_CUSTOM }),
    ).toBe(RETIREMENT_THEME_MIXED)
  })
})
