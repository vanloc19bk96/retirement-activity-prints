import { describe, it, expect } from 'vitest'
import { isPlayableMask, maskVowels } from './mask'
import { normalizeCandidate } from './content'

describe('maskVowels', () => {
  it('masks A/E/I/O/U only and keeps Y and spaces', () => {
    expect(maskVowels('RETIREMENT')).toBe('R_T_R_M_NT')
    expect(maskVowels('ROAD TRIP')).toBe('R__D TR_P')
    expect(maskVowels('GARDENING')).toBe('G_RD_N_NG')
    expect(maskVowels('HAPPY')).toBe('H_PPY')
    expect(maskVowels('FREE TIME')).toBe('FR__ T_M_')
  })

  it('rejects answers with no vowel or too few consonants', () => {
    expect(normalizeCandidate('RHYTHM')).toBeNull()
    expect(normalizeCandidate('GYM')).toBeNull()
    expect(isPlayableMask({ token: 'RHYTHM', masked: 'RHYTHM' })).toBe(false)
  })
})
