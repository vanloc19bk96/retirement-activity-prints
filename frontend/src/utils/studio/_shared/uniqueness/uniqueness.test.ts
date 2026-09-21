import { describe, it, expect, beforeEach } from 'vitest'
import { clearStudioRecentContent } from '../../studio-variety'
import { hmacSha256Hex, sha256Hex } from './sha256'
import {
  createRngFromBytes,
  deriveSeedHex,
  resolveOwnerSalt,
  stableConfigHash,
  studioCardRng,
} from './seed'
import {
  canonicalGridForm,
  canonicalSequenceForm,
  canonicalSetForm,
  gridSymmetries,
} from './canonical'
import { canonicalHash } from './hash'
import {
  CanonicalLedger,
  StudioUniquenessError,
  resolveUniquePuzzle,
} from './ledger'
import { findBannedTerm, pickPhrase } from './phrasing'
import { cardPageStyleToken, figureLabel, pickCardPageStyle } from './page-style'

const CTX = {
  pageWidth: 576,
  pageHeight: 864,
  margin: { top: 36, right: 36, bottom: 36, left: 48 },
  seed: 42,
  instanceId: 'test-run',
}

describe('sha256', () => {
  // FIPS 180-4 / RFC 4231 published vectors.
  it('matches the published SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(
      sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    ).toBe('248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1')
    expect(sha256Hex('a'.repeat(1_000_000))).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    )
  })

  it('matches the RFC 4231 HMAC-SHA256 vector', () => {
    expect(hmacSha256Hex('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
  })
})

describe('seed derivation', () => {
  it('gives two accounts different puzzles for identical settings and code', () => {
    const input = { templateKey: 'sudoku', configHash: 'abc', pageNonce: 1 }
    const a = deriveSeedHex({ ...input, ownerSalt: resolveOwnerSalt({ ownerKey: 'user:1' }) })
    const b = deriveSeedHex({ ...input, ownerSalt: resolveOwnerSalt({ ownerKey: 'user:2' }) })
    expect(a).not.toBe(b)
  })

  it('prefers the server-issued salt over the owner-key fallback', () => {
    const withSalt = resolveOwnerSalt({ ownerSalt: 'deadbeef', ownerKey: 'user:1' })
    const withoutSalt = resolveOwnerSalt({ ownerKey: 'user:1' })
    expect(withSalt).toBe('deadbeef')
    expect(withoutSalt).not.toBe('deadbeef')
  })

  it('reproduces the same seed for the same salt, config and nonce', () => {
    const input = {
      ownerSalt: 'aa11',
      templateKey: 'sudoku',
      configHash: 'x',
      pageNonce: 7,
    }
    expect(deriveSeedHex(input)).toBe(deriveSeedHex(input))
    expect(deriveSeedHex(input)).not.toBe(deriveSeedHex({ ...input, pageNonce: 8 }))
    expect(deriveSeedHex(input)).not.toBe(deriveSeedHex({ ...input, stream: 'figure:1' }))
  })

  it('ignores page furniture when hashing a config', () => {
    const base = { tier: 'easy', mode: 'A', figuresPerPage: 2 }
    expect(stableConfigHash({ ...base, title: 'Game 1', showTitle: true, seed: 5 })).toBe(
      stableConfigHash({ ...base, title: 'Puzzle 9', showTitle: false, seed: 99 }),
    )
    expect(stableConfigHash(base)).not.toBe(stableConfigHash({ ...base, tier: 'hard' }))
  })

  it('hashes a config independently of key order', () => {
    expect(stableConfigHash({ a: 1, b: 2 })).toBe(stableConfigHash({ b: 2, a: 1 }))
  })
})

describe('xoshiro128** rng', () => {
  const bytes = (n: number) =>
    Uint8Array.from({ length: 16 }, (_, i) => (i * 31 + n) & 0xff)

  it('is deterministic for a given seed', () => {
    const a = createRngFromBytes(bytes(1))
    const b = createRngFromBytes(bytes(1))
    expect(Array.from({ length: 20 }, () => a.next())).toEqual(
      Array.from({ length: 20 }, () => b.next()),
    )
  })

  it('survives an all-zero seed', () => {
    const rng = createRngFromBytes(new Uint8Array(16))
    const draws = Array.from({ length: 10 }, () => rng.next())
    expect(new Set(draws).size).toBeGreaterThan(1)
  })

  it('reaches beyond a 32-bit generator: 200k seeds, 200k distinct streams', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200_000; i++) {
      const rng = createRngFromBytes(
        Uint8Array.from([
          i & 0xff, (i >> 8) & 0xff, (i >> 16) & 0xff, (i >> 24) & 0xff,
          9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 1, 2,
        ]),
      )
      seen.add(`${rng.int(0, 0xffff)}:${rng.int(0, 0xffff)}`)
    }
    // Birthday-expected collisions for 2e5 draws from 2^32 is ~4.6.
    expect(seen.size).toBeGreaterThan(199_980)
  })

  it('draws integers uniformly across the requested range', () => {
    const rng = createRngFromBytes(bytes(3))
    const counts = new Array(6).fill(0)
    for (let i = 0; i < 60_000; i++) counts[rng.int(0, 5)]++
    for (const count of counts) {
      expect(count).toBeGreaterThan(9_000)
      expect(count).toBeLessThan(11_000)
    }
  })

  it('never returns a value outside the requested range', () => {
    const rng = createRngFromBytes(bytes(4))
    for (let i = 0; i < 20_000; i++) {
      const value = rng.int(3, 9)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(9)
    }
  })

  it('gives one page independent streams per figure', () => {
    const config = { tier: 'easy' }
    const a = studioCardRng({ templateKey: 't', config, ctx: CTX, stream: 'figure:0' })
    const b = studioCardRng({ templateKey: 't', config, ctx: CTX, stream: 'figure:1' })
    expect(a.next()).not.toBe(b.next())
  })
})

describe('canonical forms', () => {
  it('collapses the eight symmetries of a square grid', () => {
    const grid = [
      [1, 2],
      [3, 4],
    ]
    expect(gridSymmetries(grid)).toHaveLength(8)
    const forms = gridSymmetries(grid).map((g) => canonicalGridForm(g, String))
    expect(new Set(forms).size).toBe(1)
  })

  it('collapses only the four shape-preserving symmetries of a rectangle', () => {
    const grid = [
      [1, 2, 3],
      [4, 5, 6],
    ]
    expect(gridSymmetries(grid)).toHaveLength(4)
    const forms = gridSymmetries(grid).map((g) => canonicalGridForm(g, String))
    expect(new Set(forms).size).toBe(1)
  })

  it('keeps genuinely different grids apart', () => {
    const a = canonicalGridForm(
      [
        [1, 2],
        [3, 4],
      ],
      String,
    )
    const b = canonicalGridForm(
      [
        [1, 2],
        [4, 3],
      ],
      String,
    )
    expect(a).not.toBe(b)
  })

  it('does NOT collapse relabelled puzzles — that entropy axis is kept', () => {
    const a = canonicalGridForm(
      [
        [1, 3],
        [7, 13],
      ],
      String,
    )
    const b = canonicalGridForm(
      [
        [2, 5],
        [9, 12],
      ],
      String,
    )
    expect(a).not.toBe(b)
  })

  it('treats a reversed run as the same sequence unless it is directional', () => {
    expect(canonicalSequenceForm([1, 2, 3], String)).toBe(
      canonicalSequenceForm([3, 2, 1], String),
    )
    expect(canonicalSequenceForm([1, 2, 3], String, { directional: true })).not.toBe(
      canonicalSequenceForm([3, 2, 1], String, { directional: true }),
    )
  })

  it('ignores order in a set', () => {
    expect(canonicalSetForm([3, 1, 2], String)).toBe(canonicalSetForm([2, 3, 1], String))
  })

  it('produces a 64-bit hex digest', () => {
    expect(canonicalHash('anything')).toMatch(/^[0-9a-f]{16}$/)
  })
})

describe('canonical ledger', () => {
  it('refuses to hand back a puzzle the book already holds', () => {
    const ledger = new CanonicalLedger()
    const first = resolveUniquePuzzle({
      templateKey: 't',
      ledger,
      build: (attempt) => ({ value: attempt, canonicalForm: `p${Math.min(attempt, 2)}` }),
    })
    expect(first.value).toBe(0)

    const second = resolveUniquePuzzle({
      templateKey: 't',
      ledger,
      build: (attempt) => ({ value: attempt, canonicalForm: `p${Math.min(attempt, 2)}` }),
    })
    expect(second.value).toBe(1)
    expect(second.hash).not.toBe(first.hash)
    expect(ledger.size).toBe(2)
  })

  it('tells the generator to widen once resampling is exhausted', () => {
    const ledger = new CanonicalLedger([canonicalHash('narrow')])
    const seen: boolean[] = []
    const result = resolveUniquePuzzle({
      templateKey: 't',
      ledger,
      resampleAttempts: 3,
      build: (_, widen) => {
        seen.push(widen)
        return { value: widen, canonicalForm: widen ? 'wide' : 'narrow' }
      },
    })
    expect(result.value).toBe(true)
    expect(seen.slice(0, 3)).toEqual([false, false, false])
  })

  it('fails loudly rather than printing a duplicate', () => {
    const ledger = new CanonicalLedger([canonicalHash('only')])
    expect(() =>
      resolveUniquePuzzle({
        templateKey: 'sudoku',
        ledger,
        hardLimit: 8,
        build: () => ({ value: 1, canonicalForm: 'only' }),
      }),
    ).toThrow(StudioUniquenessError)
  })
})

describe('phrasing', () => {
  beforeEach(() => clearStudioRecentContent())

  const pool = Array.from({ length: 10 }, (_, i) => `Variant ${i}`)

  it('avoids repeating the variants it just used', () => {
    const rng = createRngFromBytes(Uint8Array.from({ length: 16 }, (_, i) => i + 1))
    const picks = Array.from({ length: 5 }, () =>
      pickPhrase({ templateKey: 't', poolName: 'instruction', mode: 'A', pool, rng }),
    )
    // The window holds the last four, so no run of five may repeat.
    expect(new Set(picks).size).toBe(5)
  })

  it('reopens the pool rather than failing when everything is recent', () => {
    const rng = createRngFromBytes(Uint8Array.from({ length: 16 }, (_, i) => i + 5))
    const two = ['One', 'Two']
    for (let i = 0; i < 20; i++) {
      expect(
        pickPhrase({ templateKey: 't', poolName: 'instruction', mode: 'A', pool: two, rng }),
      ).toBeTruthy()
    }
  })

  it('flags banned gambling vocabulary and deck brands', () => {
    expect(findBannedTerm('Circle the cards that total exactly 21.')).toBeNull()
    expect(findBannedTerm('A quick blackjack drill')).toBe('blackjack')
    expect(findBannedTerm('Place your bet on the total')).toBe('bet')
    expect(findBannedTerm('Printed on a Bicycle deck')).toBe('bicycle')
  })

  it('does not flag ordinary words that merely contain a banned term', () => {
    expect(findBannedTerm('Do not mistake the suits')).toBeNull()
    expect(findBannedTerm('Better still, work down the column')).toBeNull()
    expect(findBannedTerm('Beetles and spades')).toBeNull()
  })
})

describe('page-style pool', () => {
  beforeEach(() => clearStudioRecentContent())

  it('does not repeat the previous page style', () => {
    const rng = createRngFromBytes(Uint8Array.from({ length: 16 }, (_, i) => i * 7 + 1))
    const tokens: string[] = []
    for (let page = 0; page < 12; page++) {
      tokens.push(cardPageStyleToken(pickCardPageStyle({ templateKey: 't', rng })))
    }
    for (let i = 1; i < tokens.length; i++) {
      expect(tokens[i]).not.toBe(tokens[i - 1])
    }
  })

  it('honours pinned axes', () => {
    const rng = createRngFromBytes(Uint8Array.from({ length: 16 }, (_, i) => i + 2))
    for (let i = 0; i < 20; i++) {
      const style = pickCardPageStyle({
        templateKey: 't',
        rng,
        axes: { figuresPerPage: [4], cardSize: ['S'] },
      })
      expect(style.figuresPerPage).toBe(4)
      expect(style.cardSize).toBe('S')
    }
  })

  it('labels figures per the chosen style', () => {
    expect(figureLabel('letters', 0)).toBe('A')
    expect(figureLabel('numbers', 2)).toBe('3')
    expect(figureLabel('puzzleN', 1)).toBe('Puzzle 2')
    expect(figureLabel('none', 0)).toBe('')
  })
})
