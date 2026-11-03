import type { AiGeneratedImage } from '@/types/projects.types'

/** Matches AI_IMAGE_HISTORY_LIMIT in the backend. */
export const AI_IMAGE_HISTORY_LIMIT = 50

/** Newest first; an image generated again moves to the front. */
export function addGeneratedImage(images: readonly AiGeneratedImage[], image: AiGeneratedImage): AiGeneratedImage[] {
  return [image, ...images.filter((other) => other.url !== image.url)].slice(0, AI_IMAGE_HISTORY_LIMIT)
}

/** `current` goes first: an image generated before the stored list arrived is the newest one. */
export function mergeGeneratedImages(
  current: readonly AiGeneratedImage[],
  stored: readonly AiGeneratedImage[],
): AiGeneratedImage[] {
  const urls = new Set(current.map((image) => image.url))
  return [...current, ...stored.filter((image) => !urls.has(image.url))].slice(0, AI_IMAGE_HISTORY_LIMIT)
}

function withoutQuery(url: string): string {
  return url.split('?', 1)[0]!
}

/** Every image a canvas uses, including those nested in groups. An erased image keeps only `originalImageUrl`. */
export function collectPlacedImageUrls(canvasJson: unknown, into: Set<string> = new Set()): Set<string> {
  if (canvasJson == null || typeof canvasJson !== 'object') return into
  const node = canvasJson as Record<string, unknown>
  for (const url of [node.src, node.originalImageUrl]) {
    if (typeof url === 'string' && url) into.add(withoutQuery(url))
  }
  if (Array.isArray(node.objects)) {
    for (const child of node.objects) collectPlacedImageUrls(child, into)
  }
  return into
}

export function isImagePlaced(image: AiGeneratedImage, placedUrls: ReadonlySet<string>): boolean {
  return placedUrls.has(withoutQuery(image.url))
}

export function findUnplacedImages(
  images: readonly AiGeneratedImage[],
  placedUrls: ReadonlySet<string>,
): AiGeneratedImage[] {
  return images.filter((image) => !isImagePlaced(image, placedUrls))
}

/** A manual Save with no canvas changes: say so, and that generated images are not part of the design yet. */
export function describeNothingToSave(unplacedImageCount: number): { title: string; description: string } {
  if (unplacedImageCount <= 0) {
    return { title: 'Nothing to save', description: 'All canvases are already up to date.' }
  }
  const images =
    unplacedImageCount === 1 ? 'A generated AI image is' : `${unplacedImageCount} generated AI images are`
  return {
    title: 'AI image not placed yet',
    description: `Your canvases are up to date, but ${images} not on them, so ${
      unplacedImageCount === 1 ? 'it is' : 'they are'
    } not part of your design. Open the AI tab in Image and press a Place button.`,
  }
}
