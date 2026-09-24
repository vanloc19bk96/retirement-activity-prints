import type { FifStory } from './content'
import {
  FONT_MIN,
  MAX_STORY_PAGES,
  paginateStory,
  storyMetrics,
  type FifPlan,
  type StoryPageLayout,
  type StoryPagePlan,
  type WordPagePlan,
} from './layout'

/** A story with both of its steps laid out. */
export interface FittedFif {
  story: FifStory
  words: WordPagePlan
  storyPlan: StoryPagePlan
  pages: StoryPageLayout[]
}

function paginateAt(story: FifStory, plan: StoryPagePlan, fields: FifPlan['fields'], family: string) {
  return paginateStory({
    title: story.title,
    paragraphs: story.paragraphs,
    plan,
    firstField: fields.storyFirst,
    nextField: fields.storyNext,
    family,
  })
}

/**
 * The story set on the fewest pages the plan allows: at the promised size if
 * it fits, else one step smaller at a time down to the large-print floor.
 * Null when it cannot keep to `maxPages` at any size.
 */
function layOut(
  story: FifStory,
  promised: FifPlan,
  family: string,
  maxPages: number,
): { plan: StoryPagePlan; pages: StoryPageLayout[] } | null {
  for (let font = promised.story.metrics.font; font >= FONT_MIN; font--) {
    const plan: StoryPagePlan =
      font === promised.story.metrics.font
        ? promised.story
        : { ...promised.story, metrics: storyMetrics(font, family, promised.story.textWidth) }
    const pages = paginateAt(story, plan, promised.fields, family)
    if (pages && pages.length <= maxPages) return { plan, pages }
  }
  return null
}

/**
 * Hold real stories to the activity the form promised.
 *
 * The word list keeps the plan's size and columns exactly, so every activity
 * of a run matches; only its row count follows the story. A story that sets
 * on one page — at the promised size, or a step or two smaller but never
 * below large print — beats one that needs a page turn; failing that, the
 * promised number of story pages, then at most two. The pool is walked in the order the service
 * returned it — every story in it has already passed the same gates.
 */
export function fitFif(
  stories: readonly FifStory[],
  promised: FifPlan,
  family: string,
): FittedFif | null {
  for (const maxPages of new Set([1, promised.story.pages, MAX_STORY_PAGES])) {
    for (const story of stories) {
      const count = story.blanks.length
      if (count > promised.words.count) continue
      const laid = layOut(story, promised, family, maxPages)
      if (!laid) continue
      return {
        story,
        words: {
          ...promised.words,
          count,
          rowsPerCol: Math.ceil(count / promised.words.cols),
        },
        storyPlan: laid.plan,
        pages: laid.pages,
      }
    }
  }
  return null
}
