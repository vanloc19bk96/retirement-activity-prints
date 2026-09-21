import { fetchPictureSet } from '@/api/studio-pictures.api'
import type { StudioConfig } from '@/types/studio-template.types'
import type { PictureRef, PictureSetResponse } from '@/types/studio-pictures.types'
import {
  DEFAULT_NATURAL_SIZE,
  autoDistractorCount,
  snapTargetCount,
} from './layout'

function probeImageSize(
  src: string,
  signal: AbortSignal,
): Promise<{ width: number; height: number }> {
  if (typeof Image === 'undefined') {
    return Promise.resolve({ width: DEFAULT_NATURAL_SIZE, height: DEFAULT_NATURAL_SIZE })
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
      const width = img.naturalWidth || DEFAULT_NATURAL_SIZE
      const height = img.naturalHeight || DEFAULT_NATURAL_SIZE
      resolve({ width, height })
    }
    img.onerror = () => {
      cleanup()
      // Keep generation usable — square fallback; print quality still depends on source.
      resolve({ width: DEFAULT_NATURAL_SIZE, height: DEFAULT_NATURAL_SIZE })
    }
    img.src = src
  })
}

async function withNaturalSizes(
  pics: PictureRef[],
  signal: AbortSignal,
): Promise<PictureRef[]> {
  return Promise.all(
    pics.map(async (pic) => {
      if (pic.naturalWidth && pic.naturalHeight) return pic
      const size = await probeImageSize(pic.url, signal)
      return { ...pic, naturalWidth: size.width, naturalHeight: size.height }
    }),
  )
}

export async function pictureRecognitionPrefetch(
  config: StudioConfig,
  signal: AbortSignal,
): Promise<PictureSetResponse> {
  const targetCount = snapTargetCount(Number(config.targetCount ?? 9))
  const distractorCount = autoDistractorCount(targetCount)
  const seed = Number(config.seed ?? 1)

  const data = await fetchPictureSet(
    {
      targetCount,
      distractorCount,
      seed,
    },
    signal,
  )

  if (!data.options?.length || !data.targets?.length) {
    throw new Error('Picture set was empty. Try again with fewer pictures.')
  }

  const [targets, options] = await Promise.all([
    withNaturalSizes(data.targets, signal),
    withNaturalSizes(data.options, signal),
  ])

  return { targets, options }
}
