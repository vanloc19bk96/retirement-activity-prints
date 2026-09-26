import type { StudioConfig, StudioConfigLayoutContext } from '@/types/studio-template.types'
import { wwBoxCounts, type WwPageHead } from './layout'

/** Stand-ins: only whether a page has a title or intro changes its height, never the words. */
const SAMPLE = 'x'

/** What each page carries above its boxes, as far as the layout is concerned. */
export function wwSampleHeads(config: StudioConfig, pages: number): WwPageHead[] {
  const title = String(config.title ?? '').trim() ? SAMPLE : ''
  const instruction = config.showInstructions === false ? '' : SAMPLE
  return Array.from({ length: pages }, (_, index) => ({ title, instruction: index === 0 ? instruction : '' }))
}

/** What a set prints on the trim currently in Settings. */
export function wwPrintNote(options: {
  page: StudioConfigLayoutContext | undefined
  config: StudioConfig
  font: string
  name: string
  pages: number
}): string {
  const { page, config, pages } = options
  if (!page) return 'Boxes are sized to your page for comfortable handwriting.'
  const counts = wwBoxCounts(page, config, wwSampleHeads(config, pages))
  if (!counts) return 'This page size is too small for signature boxes — choose a larger one in Settings.'
  const total = counts.reduce((sum, n) => sum + n, 0)
  const [first, later] = [counts[0]!, counts[1]]
  const spread =
    later === undefined || later === first
      ? `${first} per page`
      : `${first} on the first page, ${later} on ${pages === 2 ? 'the next' : 'each page after'}`
  return `${total} message boxes (${spread}), each with room for a few sentences and a signature.`
}
