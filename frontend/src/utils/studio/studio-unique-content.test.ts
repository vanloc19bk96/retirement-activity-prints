import { describe, it, expect, vi } from 'vitest'
import type { StudioFabricObject, StudioPageOutput } from '@/types/studio-template.types'
import {
  claimUniqueStudioOutputs,
  STUDIO_UNIQUE_CONTENT_ATTEMPTS,
} from './studio-unique-content'
import {
  contentFingerprint,
  hashStudioFingerprint,
  pagesContentFingerprint,
} from './studio-content-fingerprint'
import { drawHeader, type Box } from './studio-layout'
import type { StudioTag } from './studio-fabric-builders'

/** The digest `claimUniqueStudioOutputs` stores for an un-namespaced build. */
function claimedHash(pages: StudioPageOutput[]): string {
  return hashStudioFingerprint(pagesContentFingerprint(pages))
}

function pageWithText(text: string): StudioPageOutput {
  const objects: StudioFabricObject[] = [
    {
      type: 'textbox',
      left: 10,
      top: 10,
      text,
      studioRole: 'prompt',
    },
  ]
  return { pageRole: 'single', objects }
}

describe('contentFingerprint', () => {
  it('ignores decoration so headers do not hide duplicates', () => {
    const a: StudioFabricObject[] = [
      { type: 'textbox', left: 0, top: 0, text: 'Title', studioRole: 'decoration' },
      { type: 'textbox', left: 10, top: 40, text: 'A', studioRole: 'prompt' },
    ]
    const b: StudioFabricObject[] = [
      { type: 'textbox', left: 0, top: 0, text: 'Other title', studioRole: 'decoration' },
      { type: 'textbox', left: 10, top: 40, text: 'A', studioRole: 'prompt' },
    ]
    expect(contentFingerprint(a)).toBe(contentFingerprint(b))
  })

  it('treats different image src at the same cell as distinct', () => {
    const cell = { type: 'image' as const, left: 40, top: 80 }
    const a: StudioFabricObject[] = [{ ...cell, src: 'https://cdn.example/a.png' }]
    const b: StudioFabricObject[] = [{ ...cell, src: 'https://cdn.example/b.png' }]
    expect(contentFingerprint(a)).not.toBe(contentFingerprint(b))
  })

  it('treats different phosphor icons at the same cell as distinct', () => {
    const cell = { type: 'group' as const, left: 12, top: 12 }
    const a: StudioFabricObject[] = [
      { ...cell, data: { source: 'phosphor-icon', iconName: 'cat' } },
    ]
    const b: StudioFabricObject[] = [
      { ...cell, data: { source: 'phosphor-icon', iconName: 'dog' } },
    ]
    expect(contentFingerprint(a)).not.toBe(contentFingerprint(b))
  })

  it('joins multi-page fingerprints', () => {
    const pages = [pageWithText('one'), pageWithText('two')]
    expect(pagesContentFingerprint(pages)).toBe(
      `${contentFingerprint(pages[0]!.objects)}#${contentFingerprint(pages[1]!.objects)}`,
    )
  })
})

describe('contentFingerprint with a run-numbered header', () => {
  const tag: StudioTag = { templateKey: 'word-search', instanceId: 'run', pageRole: 'single' }
  const box: Box = { left: 36, top: 36, width: 504, height: 792 }

  function sheet(title: string): StudioFabricObject[] {
    const header = drawHeader(box, { title, fontFamily: 'PT Serif' }, tag, 'Find every word.')
    const body: StudioFabricObject = {
      type: 'textbox',
      left: header.body.left,
      top: header.body.top,
      text: 'GARDEN TRAVEL FREE TIME',
      studioRole: 'prompt',
    }
    return [...header.objects, body]
  }

  it('reads the same puzzle as a repeat when only "Game N" differs', () => {
    // Book runs bump the title every sheet; if it counted, no repeat would ever match.
    expect(contentFingerprint(sheet('Game 3'))).toBe(contentFingerprint(sheet('Game 14')))
  })

  it('still tells two different puzzles apart under the same title', () => {
    const other = sheet('Game 3').map((obj) =>
      obj.studioRole === 'prompt' ? { ...obj, text: 'KITCHEN BREAD' } : obj,
    )
    expect(contentFingerprint(other)).not.toBe(contentFingerprint(sheet('Game 3')))
  })
})

describe('claimUniqueStudioOutputs', () => {
  it('accepts the first build when fingerprints are not tracked', async () => {
    const build = vi.fn(async () => [pageWithText('same')])
    const usedSeeds = new Set<number>()
    const result = await claimUniqueStudioOutputs({ usedSeeds, build })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(build).toHaveBeenCalledTimes(1)
    expect(usedSeeds.size).toBe(1)
  })

  it('retries until content fingerprint is unique in the batch', async () => {
    const usedSeeds = new Set<number>()
    const usedFingerprints = new Set<string>()
    let call = 0
    const build = vi.fn(async () => {
      call += 1
      // First two attempts collide; third is unique.
      return [pageWithText(call <= 2 ? 'dup' : 'fresh')]
    })

    const first = await claimUniqueStudioOutputs({
      usedSeeds,
      usedFingerprints,
      build: async () => [pageWithText('dup')],
    })
    expect(first.ok).toBe(true)

    const second = await claimUniqueStudioOutputs({
      usedSeeds,
      usedFingerprints,
      build,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.fingerprint).toBe(claimedHash([pageWithText('fresh')]))
    expect(second.duplicate).toBe(false)
    expect(build.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(usedFingerprints.size).toBe(2)
  })

  it('keeps the last sheet when unique attempts collide, flagged as a duplicate', async () => {
    const usedFingerprints = new Set<string>([claimedHash([pageWithText('stuck')])])
    const result = await claimUniqueStudioOutputs({
      usedFingerprints,
      maxAttempts: 3,
      build: async () => [pageWithText('stuck')],
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.fingerprint).toBe(claimedHash([pageWithText('stuck')]))
    // The caller has to be able to tell the seller which pages still repeat.
    expect(result.duplicate).toBe(true)
  })

  it('namespaces fingerprints so mixed templates do not collide', async () => {
    const usedFingerprints = new Set<string>()
    const first = await claimUniqueStudioOutputs({
      usedFingerprints,
      namespace: 'alpha',
      build: async () => [pageWithText('same')],
    })
    const second = await claimUniqueStudioOutputs({
      usedFingerprints,
      namespace: 'beta',
      build: async () => [pageWithText('same')],
    })
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(usedFingerprints.size).toBe(2)
  })

  it('allows identical content when fingerprints are not tracked (seed-invariant sheets)', async () => {
    const usedSeeds = new Set<number>()
    const usedFingerprints = new Set<string>()
    const first = await claimUniqueStudioOutputs({
      usedSeeds,
      usedFingerprints,
      build: async () => [pageWithText('blank-log')],
    })
    expect(first.ok).toBe(true)

    // Book/bulk pass `usedFingerprints: undefined` for seedInvariant templates.
    const second = await claimUniqueStudioOutputs({
      usedSeeds,
      build: async () => [pageWithText('blank-log')],
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.fingerprint).toBe(first.ok ? first.fingerprint : '')
  })

  it('stops on abort between colliding attempts', async () => {
    let calls = 0
    const stuck = claimedHash([pageWithText('stuck')])
    const result = await claimUniqueStudioOutputs({
      usedFingerprints: new Set([stuck]),
      maxAttempts: STUDIO_UNIQUE_CONTENT_ATTEMPTS,
      isAborted: () => calls >= 1,
      build: async () => {
        calls += 1
        return [pageWithText('stuck')]
      },
    })
    expect(result).toEqual({ ok: false, reason: 'aborted' })
    expect(calls).toBe(1)
  })

  it('returns aborted when build reports aborted', async () => {
    const result = await claimUniqueStudioOutputs({
      build: async () => 'aborted',
    })
    expect(result).toEqual({ ok: false, reason: 'aborted' })
  })

  it('returns error when build reports error', async () => {
    const result = await claimUniqueStudioOutputs({
      build: async () => 'error',
    })
    expect(result).toEqual({ ok: false, reason: 'error' })
  })

  it('redraws an error page on a fresh seed instead of claiming it', async () => {
    const seeds: number[] = []
    const result = await claimUniqueStudioOutputs({
      build: async (seed) => {
        seeds.push(seed)
        if (seeds.length < 3) return [{ ...pageWithText('sorry'), buildFailed: 'Could not fill the grid.' }]
        return [pageWithText('puzzle')]
      },
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.outputs[0]!.buildFailed).toBeFalsy()
    expect(new Set(seeds).size).toBe(3)
  })

  it('reports the failure once every draw comes back as an error page', async () => {
    let calls = 0
    const result = await claimUniqueStudioOutputs({
      maxAttempts: 5,
      build: async () => {
        calls += 1
        return [{ ...pageWithText('sorry'), buildFailed: 'Page too small.' }]
      },
    })
    expect(result).toEqual({ ok: false, reason: 'failed', message: 'Page too small.' })
    expect(calls).toBe(5)
  })

  it('stops after maxFailedAttempts error pages', async () => {
    let calls = 0
    const usedFingerprints = new Set<string>()
    const result = await claimUniqueStudioOutputs({
      usedFingerprints,
      maxAttempts: 4,
      maxFailedAttempts: 2,
      build: async () => {
        calls += 1
        return [{ ...pageWithText('sorry'), buildFailed: 'Page too small.' }]
      },
    })
    expect(result).toEqual({ ok: false, reason: 'failed', message: 'Page too small.' })
    expect(calls).toBe(2)
    expect(usedFingerprints.size).toBe(0)
  })
})
