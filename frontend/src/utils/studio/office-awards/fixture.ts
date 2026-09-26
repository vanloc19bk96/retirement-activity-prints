import type { OfficeAwardsItem, OfficeAwardsResponse } from '@/types/studio-office-awards.types'

type Row = readonly [award: string, theme: string, tone: OfficeAwardsItem['tone'], shape: string]

/**
 * A service reply as it arrives: a farewell award first, then awards from
 * different themes, then spares. Every award is valid and distinct from
 * every other. Mirrors FIXTURE in
 * backend/tests/test_studio_office_awards_service.py.
 */
const ROWS: readonly Row[] = [
  ['Most Likely to Inherit the Retiree’s Chair', 'farewell', 'playful', 'most-likely'],
  ['Knows Every Drink Order by Heart', 'hot-drinks', 'playful', 'habit'],
  ['Keeper of the Emergency Snack Drawer', 'snacks-treats', 'playful', 'title'],
  ['Always Saves a Seat at Lunch', 'lunch', 'warm', 'habit'],
  ['Clearest Notes in Every Meeting', 'meetings', 'playful', 'superlative'],
  ['Kindest Thank-You Notes', 'messages', 'warm', 'superlative'],
  ['First Through the Door Every Morning', 'timekeeping', 'playful', 'habit'],
  ['Most Likely to Label the Label Maker', 'organizing', 'playful', 'most-likely'],
  ['Never Without a Spare Pen', 'supplies', 'playful', 'habit'],
  ['Unofficial Help Desk Hero', 'tech', 'playful', 'title'],
  ['First Call When Anyone Is Stuck', 'fixers', 'warm', 'named-award'],
  ['Walking Encyclopedia of the Workplace', 'know-how', 'playful', 'title'],
  ['Master of the Perfect One-Liner', 'humour', 'playful', 'title'],
  ['Best Weekend Storyteller', 'stories', 'playful', 'superlative'],
  ['Most Thriving Desk Plant', 'workspace', 'playful', 'superlative'],
  ['Always First to Lend a Hand', 'teamwork', 'warm', 'habit'],
  ['Best Listener in the Building', 'kindness', 'warm', 'superlative'],
  ['Chief Monday Morning Sunshine', 'morale', 'playful', 'title'],
  ['Party Planner Extraordinaire', 'celebrations', 'playful', 'title'],
  ['Most Patient Teacher', 'mentoring', 'warm', 'superlative'],
  ['Steadiest Presence on a Busy Day', 'calm', 'warm', 'superlative'],
  ['Break Room Crossword Champion', 'breakroom', 'playful', 'named-award'],
  ['Unofficial Weather Reporter', 'everyday', 'playful', 'title'],
  ['Most Adventurous Traveller', 'outside-work', 'playful', 'superlative'],
  ['Remembers Every Birthday', 'kindness', 'warm', 'habit'],
  ['Always Has a Plan B', 'fixers', 'playful', 'habit'],
  ['First to Volunteer, Every Time', 'teamwork', 'playful', 'habit'],
  ['Brightens Every Room', 'morale', 'warm', 'named-award'],
  ['Makes Every Milestone Special', 'celebrations', 'warm', 'named-award'],
  ['Wise Words for Every Occasion', 'mentoring', 'playful', 'named-award'],
  ['Cool as a Cucumber Under Pressure', 'calm', 'playful', 'named-award'],
  ['Keeps the Team on Track', 'organizing', 'warm', 'named-award'],
]

export const OA_FIXTURE_ITEMS: readonly OfficeAwardsItem[] = ROWS.map(([award, theme, tone, shape], i) => ({
  award,
  theme,
  tone,
  shape,
  concept: `idea ${i}`,
}))

export const OA_FIXTURE: OfficeAwardsResponse = { awards: [...OA_FIXTURE_ITEMS] }

export const OA_FIXTURE_AWARDS: readonly string[] = OA_FIXTURE_ITEMS.map((item) => item.award)
