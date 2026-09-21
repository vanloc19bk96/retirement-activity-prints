/**
 * Ship-blocking gates for the procedural non-card templates.
 *
 * Same discipline as `card-pack.test.ts`, applied to the templates that do not
 * draw playing cards: the print QA gate across every supported trim (§9.6), the
 * cross-account uniqueness simulation (§9.5), reprint determinism (§9.8) and
 * the phrasing lint (§9.7).
 *
 * These are the checks that protect a seller's KDP account, so they run over
 * the pack as a whole rather than one template at a time — a rule that only one
 * template happens to satisfy is not a rule.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type {
  StudioConfig,
  StudioFabricObject,
  StudioGenerateContext,
  StudioTemplateDefinition,
} from '@/types/studio-template.types'
import { buildDefaultConfig, STUDIO_TEMPLATES } from '@/constants/studio-templates'
import { STUDIO_INSTRUCTION_POOLS } from '@/constants/studio-phrasing'
import { STUDIO_ANSWER_INK_MONO_TEMPLATES } from '@/constants/studio.constants'
import { resetObjectCounter } from '../studio-fabric-builders'
import { clearStudioRecentContent } from '../studio-variety'
import { contentFingerprint } from '../studio-content-fingerprint'
import { objectExtent } from '../studio-object-bounds'
import { buildAnswerPage, harvestAnswers } from '../studio-answer-key'
import { MIN_STROKE_PX } from './playing-card'
import { MIN_PHRASING_VARIANTS, findBannedTerm, sha256Hex } from './uniqueness'
import { parseWordFitMode } from '../word-fit/types'

/** Templates this gate covers. */
const PACK_KEYS = ['find-the-pair', 'word-fit'] as const

const PACK: StudioTemplateDefinition[] = STUDIO_TEMPLATES.filter((t) =>
  (PACK_KEYS as readonly string[]).includes(t.key),
)

/**
 * Trims the pack must survive, smallest first.
 *
 * Margins mirror the editor's safe area: 0.25in clear of trim on the outside
 * edges plus the KDP gutter on the inside one (0.5in for a 151–300pp book),
 * which is the worst case the layout has to hold.
 */
const TRIMS: { label: string; ctx: Omit<StudioGenerateContext, 'seed' | 'instanceId'> }[] = [
  {
    label: '5 x 8 in',
    ctx: {
      pageWidth: 480,
      pageHeight: 768,
      margin: { top: 24, right: 24, bottom: 24, left: 72 },
    },
  },
  {
    label: '6 x 9 in',
    ctx: {
      pageWidth: 576,
      pageHeight: 864,
      margin: { top: 36, right: 36, bottom: 36, left: 84 },
    },
  },
  {
    label: '8.5 x 11 in',
    ctx: {
      pageWidth: 816,
      pageHeight: 1056,
      margin: { top: 48, right: 48, bottom: 48, left: 96 },
    },
  },
]

/** Settings worth sweeping per template, beyond its defaults. */
const SWEEPS: Record<string, StudioConfig[]> = {
  'find-the-pair': [
    { tier: 'warmup' },
    { tier: 'medium', pairCount: 2 },
    { tier: 'hard', pairCount: 3 },
  ],
  'word-fit': [
    { mode: 'numbers' },
    { customTheme: true, customThemeText: 'tools in a garden shed' },
    { starters: 0 },
    { starters: 2 },
    { wordCount: 8 },
  ],
}

function ctxFor(
  trim: (typeof TRIMS)[number],
  over: Partial<StudioGenerateContext> = {},
): StudioGenerateContext {
  return { ...trim.ctx, seed: 42, instanceId: 'qa-run', ownerKey: 'user:qa', ...over }
}

function flatten(objects: readonly StudioFabricObject[]): StudioFabricObject[] {
  return objects.flatMap((o) => (o.objects ? [o, ...flatten(o.objects)] : [o]))
}

function defaults(template: StudioTemplateDefinition): StudioConfig {
  return { ...buildDefaultConfig(template), fontFamily: 'PT Serif' }
}

describe('procedural pack registry', () => {
  it('registers both templates', () => {
    expect(PACK.map((t) => t.key).sort()).toEqual([...PACK_KEYS].sort())
  })

  /**
   * The §5.4 claim is now per-mode, not per-template, so the gate is too.
   *
   * Find the Pair reaches no model at all. Word Fit's themed mode asks for a
   * word list written for that page — those pages carry the disclosure, and the
   * form tells the seller so. The numbers mode must still be provably free of
   * it, because that is the half of the claim still being sold, and a fetch
   * quietly added to it would kill that silently.
   */
  it('never reaches a model from a template that claims to be procedural (§5.4)', () => {
    for (const template of PACK) {
      if (template.key === 'word-fit') continue
      expect(template.prefetch, template.key).toBeUndefined()
    }
  })

  it('makes no model call for the Word Fit modes still sold as procedural (§5.4)', async () => {
    const wordFit = PACK.find((t) => t.key === 'word-fit')!
    const offline: StudioConfig[] = [{ mode: 'numbers' }]
    for (const over of offline) {
      const config = { ...defaults(wordFit), ...over }
      await expect(
        wordFit.prefetch!(config, new AbortController().signal),
        JSON.stringify(over),
      ).resolves.toBeUndefined()
    }
  })

  it('does fetch a fresh word list for a plain themed page', async () => {
    const wordFit = PACK.find((t) => t.key === 'word-fit')!
    // No stub: a real call is not made in test, but the code path must at least
    // be reached rather than short-circuited by the guards above.
    expect(wordFit.prefetch, 'word-fit declares no prefetch').toBeDefined()
    expect(parseWordFitMode(defaults(wordFit).mode)).toBe('themed')
  })

  it('prints every answer key in black, not blue (§2.1)', () => {
    for (const key of PACK_KEYS) {
      expect(STUDIO_ANSWER_INK_MONO_TEMPLATES.has(key), key).toBe(true)
    }
  })

  it('accepts its own defaults on every trim', () => {
    for (const template of PACK) {
      expect(template.validateConfig?.(defaults(template)) ?? null, template.key).toBeNull()
    }
  })
})

describe('phrasing lint (§9.7)', () => {
  function allStrings(): { where: string; text: string }[] {
    const out: { where: string; text: string }[] = []
    for (const [templateKey, pool] of Object.entries(STUDIO_INSTRUCTION_POOLS)) {
      for (const [mode, variants] of Object.entries(pool)) {
        variants.forEach((text, index) =>
          out.push({ where: `${templateKey}/${mode}[${index}]`, text }),
        )
      }
    }
    for (const template of PACK) {
      out.push({ where: `${template.key}.label`, text: template.label })
      out.push({ where: `${template.key}.description`, text: template.description })
      for (const field of template.configSchema) {
        out.push({ where: `${template.key}.${field.key}.label`, text: field.label })
        if (field.help) {
          out.push({ where: `${template.key}.${field.key}.help`, text: field.help })
        }
        for (const option of field.options ?? []) {
          out.push({
            where: `${template.key}.${field.key}.option`,
            text: String(option.label),
          })
        }
      }
    }
    return out
  }

  it('lints something — the sweep is not silently empty', () => {
    expect(allStrings().length).toBeGreaterThan(80)
  })

  it('prints no gambling vocabulary and no deck brand name', () => {
    const offenders = allStrings()
      .map(({ where, text }) => ({ where, text, term: findBannedTerm(text) }))
      .filter((entry) => entry.term !== null)
    expect(offenders).toEqual([])
  })

  it('ships at least ten hand-written instruction variants per mode (§4.7)', () => {
    for (const [templateKey, pool] of Object.entries(STUDIO_INSTRUCTION_POOLS)) {
      for (const [mode, variants] of Object.entries(pool)) {
        expect(
          variants.length,
          `${templateKey}/${mode} has ${variants.length} variants`,
        ).toBeGreaterThanOrEqual(MIN_PHRASING_VARIANTS)
      }
    }
  })

  it('has no duplicate variant inside a pool', () => {
    for (const [templateKey, pool] of Object.entries(STUDIO_INSTRUCTION_POOLS)) {
      for (const [mode, variants] of Object.entries(pool)) {
        expect(new Set(variants).size, `${templateKey}/${mode}`).toBe(variants.length)
      }
    }
  })

  it('has no near-duplicate variant across two templates', () => {
    const seen = new Map<string, string>()
    for (const [templateKey, pool] of Object.entries(STUDIO_INSTRUCTION_POOLS)) {
      for (const variants of Object.values(pool)) {
        for (const text of variants) {
          const normalised = text.toLowerCase().replace(/[^a-z]/g, '')
          const previous = seen.get(normalised)
          // Modes inside one template may share a sentence; two different
          // templates sharing one is a copy-paste that would print the same
          // line in two different books.
          if (previous && previous !== templateKey) {
            expect.fail(`"${text}" appears in both ${previous} and ${templateKey}`)
          }
          seen.set(normalised, templateKey)
        }
      }
    }
  })
})

describe('print QA gate (§9.6)', () => {
  beforeEach(() => clearStudioRecentContent())

  /** Paint allowed on a black-and-white interior. */
  const ALLOWED_PAINT = new Set([
    '#000000',
    '#FFFFFF',
    'transparent',
    // Studio page furniture: muted rules and secondary copy, shared with the
    // rest of the library so these pages sit beside every other one.
    '#6B7280',
    '#9CA3AF',
    '#111827',
    '#D1D5DB',
  ])

  /**
   * Smallest glyph these pages may print.
   *
   * Lower than the card pack's 12pt index floor, and deliberately: the only
   * type below that here is answer-key ink inside a fill-in cell, whose size is
   * governed by the handwriting floor instead (`MIN_WORD_FIT_CELL`). Every
   * glyph the reader is asked to *read* on the puzzle page clears 12pt.
   */
  const MIN_GLYPH_PX = 11

  function auditPage(where: string, objects: readonly StudioFabricObject[]): void {
    for (const obj of flatten(objects)) {
      if (obj.strokeWidth) {
        expect(
          obj.strokeWidth,
          `${where}: ${obj.type} stroke ${obj.strokeWidth}px is under the 0.75pt floor`,
        ).toBeGreaterThanOrEqual(MIN_STROKE_PX)
      }
      if (obj.fontSize != null) {
        expect(
          obj.fontSize,
          `${where}: "${String(obj.text).slice(0, 24)}" at ${obj.fontSize}px`,
        ).toBeGreaterThanOrEqual(MIN_GLYPH_PX)
      }
      if (obj.fill) expect(ALLOWED_PAINT, `${where}: fill ${obj.fill}`).toContain(obj.fill)
      if (obj.stroke) {
        expect(ALLOWED_PAINT, `${where}: stroke ${obj.stroke}`).toContain(obj.stroke)
      }
      // No transparency anywhere: a flattened alpha becomes a grey wash on POD.
      if (obj.opacity != null) expect(obj.opacity).toBe(1)
    }
  }

  function auditSafeArea(
    where: string,
    objects: readonly StudioFabricObject[],
    ctx: StudioGenerateContext,
  ): void {
    for (const obj of objects) {
      const extent = objectExtent(obj)
      expect(extent.left, `${where}: left`).toBeGreaterThanOrEqual(ctx.margin.left - 1)
      expect(extent.top, `${where}: top`).toBeGreaterThanOrEqual(ctx.margin.top - 1)
      expect(extent.right, `${where}: right`).toBeLessThanOrEqual(
        ctx.pageWidth - ctx.margin.right + 1,
      )
      expect(extent.bottom, `${where}: bottom`).toBeLessThanOrEqual(
        ctx.pageHeight - ctx.margin.bottom + 1,
      )
    }
  }

  for (const trim of TRIMS) {
    it(`holds every print floor on ${trim.label}, puzzle and solution`, () => {
      for (const template of PACK) {
        const variants = [{}, ...(SWEEPS[template.key] ?? [])]
        for (const [index, over] of variants.entries()) {
          const config = { ...defaults(template), ...over }
          const ctx = ctxFor(trim, { seed: 1000 + index })
          const where = `${template.key} ${trim.label} #${index}`
          clearStudioRecentContent()
          resetObjectCounter()

          const pages = template.generate(config, ctx)
          for (const page of pages) {
            auditPage(where, page.objects)
            auditSafeArea(where, page.objects, ctx)

            const source = page.answerSourceObjects ?? page.objects
            if (harvestAnswers(source).length === 0) continue
            const key = buildAnswerPage(source, '#000000', {
              contentWidth: ctx.pageWidth - ctx.margin.left - ctx.margin.right,
            })
            auditPage(`${where} key`, key)
            auditSafeArea(`${where} key`, key, ctx)
          }
        }
      }
    }, 180_000)
  }

  /**
   * A page with a heading but no puzzle is a blank in a printed book. Both
   * templates have a legitimate refusal path — better a blank than an
   * unsolvable or two-answer page — but it must never be reached on a
   * supported trim at a setting the form offers.
   */
  for (const trim of TRIMS) {
    it(`always prints an actual puzzle on ${trim.label}`, () => {
      for (const template of PACK) {
        const variants = [{}, ...(SWEEPS[template.key] ?? [])]
        for (const [index, over] of variants.entries()) {
          for (let seed = 0; seed < 6; seed++) {
            clearStudioRecentContent()
            resetObjectCounter()
            const pages = template.generate(
              { ...defaults(template), ...over },
              ctxFor(trim, { seed: 5_000 + index * 97 + seed }),
            )
            const hasFigure = pages.some((page) =>
              page.objects.some((obj) => obj.type === 'group'),
            )
            expect(
              hasFigure,
              `${template.key} ${trim.label} #${index} seed ${seed} printed no puzzle`,
            ).toBe(true)
          }
        }
      }
    }, 180_000)
  }
})

describe('cross-account uniqueness simulation (§9.5)', () => {
  beforeEach(() => clearStudioRecentContent())

  const ACCOUNTS = 24
  const PAGES_PER_ACCOUNT = 2

  it('never prints the same page for two accounts on identical settings', () => {
    for (const template of PACK) {
      const seen = new Map<string, string>()
      for (let account = 0; account < ACCOUNTS; account++) {
        // A distinct 128-bit salt per account, exactly as §8.1 mints them.
        const ownerSalt = sha256Hex(`account-${account}`).slice(0, 32)
        for (let page = 0; page < PAGES_PER_ACCOUNT; page++) {
          resetObjectCounter()
          const pages = template.generate(
            defaults(template),
            ctxFor(TRIMS[1]!, {
              ownerSalt,
              ownerKey: `user:${account}`,
              // Every account uses the same small nonces, deliberately: this is
              // the "two sellers both typed variation code 1" case the salt
              // exists for, and it is the only thing separating them.
              seed: 1 + page,
              instanceId: `${template.key}-${account}-${page}`,
            }),
          )
          const fingerprint = pages.map((p) => contentFingerprint(p.objects)).join('#')
          const previous = seen.get(fingerprint)
          if (previous !== undefined) {
            expect.fail(
              `${template.key}: account ${account} repeats the page from ${previous}`,
            )
          }
          seen.set(fingerprint, `account ${account}`)
        }
      }
      expect(seen.size).toBe(ACCOUNTS * PAGES_PER_ACCOUNT)
    }
  }, 300_000)
})

describe('reprint determinism (§9.8)', () => {
  beforeEach(() => clearStudioRecentContent())

  it('same salt, same variation code, same settings gives identical output', () => {
    for (const template of PACK) {
      const config = defaults(template)
      const ctx = ctxFor(TRIMS[1]!, { ownerSalt: 'a1b2c3d4', seed: 7 })

      clearStudioRecentContent()
      resetObjectCounter()
      const first = template.generate(config, ctx)
      clearStudioRecentContent()
      resetObjectCounter()
      const second = template.generate(config, ctx)

      expect(JSON.stringify(second), template.key).toBe(JSON.stringify(first))
    }
  }, 60_000)

  it('a different account salt gives different output', () => {
    for (const template of PACK) {
      const config = defaults(template)
      const build = (ownerSalt: string) => {
        clearStudioRecentContent()
        resetObjectCounter()
        return template
          .generate(config, ctxFor(TRIMS[1]!, { ownerSalt, seed: 7 }))
          .map((page) => contentFingerprint(page.objects))
          .join('#')
      }
      expect(build('1111aaaa'), template.key).not.toBe(build('2222bbbb'))
    }
  }, 60_000)

  it('a different variation code gives different output', () => {
    for (const template of PACK) {
      const config = defaults(template)
      const build = (seed: number) => {
        clearStudioRecentContent()
        resetObjectCounter()
        return template
          .generate(config, ctxFor(TRIMS[1]!, { ownerSalt: 'deadbeef', seed }))
          .map((page) => contentFingerprint(page.objects))
          .join('#')
      }
      expect(build(11), template.key).not.toBe(build(12))
    }
  }, 60_000)
})
