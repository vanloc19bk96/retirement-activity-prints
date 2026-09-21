import { generatePairs } from '@/api/studio-pairs.api'
import {
  rememberStudioContent,
  studioAvoidList,
  studioVarietyKey,
} from '../studio-variety'
import type { StudioConfig } from '@/types/studio-template.types'
import type {
  PairRequest,
  PairResponse,
  PairType,
  WordPair,
} from '@/types/studio-pairs.types'
import { resolvePairsFallback } from './fallback'

const DEFAULT_NATURAL = 256
/** One study + recall pair per generate (Number of exercises removed from UI). */
const DEFAULT_EXERCISE_COUNT = 1

function asType(value: unknown): PairType {
  if (value === 'related' || value === 'word-picture' || value === 'arbitrary') {
    return value
  }
  return 'arbitrary'
}

function toRequest(config: StudioConfig): PairRequest {
  return {
    pairType: asType(config.pairType),
    pairCount: Math.min(10, Math.max(4, Number(config.pairCount ?? 6))),
    exerciseCount: Math.min(
      40,
      Math.max(1, Number(config.exerciseCount ?? DEFAULT_EXERCISE_COUNT)),
    ),
    seed: Number(config.seed ?? 1),
  }
}

function probeImageSize(
  src: string,
  signal: AbortSignal,
): Promise<{ width: number; height: number }> {
  if (typeof Image === 'undefined') {
    return Promise.resolve({ width: DEFAULT_NATURAL, height: DEFAULT_NATURAL })
  }

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    const onAbort = () => {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const cleanup = () => {
      signal.removeEventListener('abort', onAbort)
      img.onload = null
      img.onerror = null
    }

    signal.addEventListener('abort', onAbort, { once: true })
    img.onload = () => {
      cleanup()
      resolve({
        width: img.naturalWidth || DEFAULT_NATURAL,
        height: img.naturalHeight || DEFAULT_NATURAL,
      })
    }
    img.onerror = () => {
      cleanup()
      resolve({ width: DEFAULT_NATURAL, height: DEFAULT_NATURAL })
    }
    img.src = src
  })
}

async function withNaturalSizes(
  data: PairResponse,
  signal: AbortSignal,
): Promise<PairResponse> {
  const sets = await Promise.all(
    data.sets.map(async (set) => {
      const pairs: WordPair[] = await Promise.all(
        set.pairs.map(async (pair) => {
          if (!pair.rightImageUrl) return pair
          if (pair.rightNaturalWidth && pair.rightNaturalHeight) return pair
          const size = await probeImageSize(pair.rightImageUrl, signal)
          return {
            ...pair,
            rightNaturalWidth: size.width,
            rightNaturalHeight: size.height,
          }
        }),
      )
      return { pairs }
    }),
  )
  return { sets }
}

export async function pairedAssociatesPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<PairResponse> {
  const req = toRequest(config)
  const varietyKey = studioVarietyKey('paired-associates', req.pairType)

  // Always AI by default; curated bank only covers API failures.
  try {
    const data = await generatePairs(
      { ...req, avoid: studioAvoidList(varietyKey) },
      signal,
    )
    rememberStudioContent(
      varietyKey,
      data.sets.flatMap((set) => set.pairs.map((pair) => `${pair.left} / ${pair.right}`)),
    )
    if (req.pairType === 'word-picture') {
      return withNaturalSizes(data, signal)
    }
    return data
  } catch (error) {
    if (signal.aborted) throw error
    console.warn('[paired-associates] API failed; using curated fallback', error)
    return resolvePairsFallback(
      req.pairType,
      req.pairCount,
      req.exerciseCount,
      req.seed,
    )
  }
}
