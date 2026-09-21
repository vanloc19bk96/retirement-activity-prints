import type { StoryQuestion, StoryRecallResponse } from '@/types/studio-story.types'
import fallbackStories from '@/data/studio/stories/fallback.json'

interface FallbackStory {
  theme: string
  title: string
  passage: string
  questions: Array<{
    wh: StoryQuestion['wh']
    question: string
    answer: string
  }>
}

const STORIES = fallbackStories as FallbackStory[]

function pickStory(theme: string, seed: number): FallbackStory {
  const matches = STORIES.filter((s) => s.theme === theme)
  const pool = matches.length > 0 ? matches : STORIES
  return pool[Math.abs(seed) % pool.length]
}

/** Closest-theme bundled story when the API is unavailable. */
export function resolveStoryFallback(
  theme: string,
  questionCount: number,
  seed: number,
): StoryRecallResponse {
  const story = pickStory(theme, seed)
  const count = Math.min(8, Math.max(3, questionCount))
  const questions: StoryQuestion[] = story.questions.slice(0, count).map((q, i) => ({
    id: `q${i + 1}`,
    wh: q.wh,
    question: q.question,
    answer: q.answer,
  }))

  return {
    title: story.title,
    passage: story.passage,
    questions,
  }
}
