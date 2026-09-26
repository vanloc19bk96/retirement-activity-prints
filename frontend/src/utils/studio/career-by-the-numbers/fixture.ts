import type { CareerNumbersItem, CareerNumbersResponse } from '@/types/studio-career-numbers.types'

type Row = readonly [question: string, unit: string, theme: string, tone: CareerNumbersItem['tone'], shape: string]

/**
 * A service reply as it arrives: a road-to-retirement question first, then
 * questions from different themes, then spares. Every question is valid and
 * distinct from every other. Mirrors FIXTURE in
 * backend/tests/test_studio_career_numbers_service.py.
 */
const ROWS: readonly Row[] = [
  ['About how many workdays did you put in over your whole career?', 'workdays', 'finish-line', 'playful', 'career-total'],
  ['On a typical workday, how many cups of tea or coffee kept you going?', 'cups', 'hot-drinks', 'playful', 'typical'],
  ['If you had to guess, how many biscuits or cookies vanished from the shared tin over the years?', 'biscuits', 'snacks', 'playful', 'guess'],
  ['How many team lunches did you enjoy with coworkers over the years?', 'team lunches', 'lunch', 'nostalgic', 'tally'],
  ['Roughly how many meetings did you sit through over your whole career?', 'meetings', 'meetings', 'playful', 'career-total'],
  ['In your busiest week, how many emails or messages landed in your inbox?', 'emails', 'messages', 'playful', 'record'],
  ['On a typical day, how many times did the phone ring just as you sat down?', 'times', 'phone', 'playful', 'typical'],
  ['About how many miles did you travel getting to and from work over your career?', 'miles', 'commute', 'playful', 'career-total'],
  ['How many new towns or cities did you get to see thanks to your job over the years?', 'towns', 'work-travel', 'nostalgic', 'tally'],
  ['At a guess, how many times did you hit snooze before a workday over your career?', 'times', 'mornings', 'playful', 'guess'],
  ['How many Monday mornings did you face over your whole career?', 'mornings', 'weekdays', 'playful', 'tally'],
  ['In a typical week, how many hours did you work, give or take?', 'hours', 'shifts', 'playful', 'typical'],
  ['On a typical workday, how many breaks did you spend laughing with coworkers?', 'breaks', 'breaks', 'nostalgic', 'typical'],
  ['In a typical week, how many times did you glance at the clock on a slow afternoon?', 'times', 'clock', 'playful', 'typical'],
  ['Roughly how many projects that made you proud did you finish over your career?', 'projects', 'projects', 'nostalgic', 'career-total'],
  ['How many deadlines did you beat with minutes to spare over the years?', 'deadlines', 'deadlines', 'playful', 'tally'],
  ['If you had to guess, how many pages did you print or photocopy over your career?', 'pages', 'paperwork', 'playful', 'guess'],
  ['About how many pens went missing from your desk or pocket over your career?', 'pens', 'supplies', 'playful', 'career-total'],
  ['How many pairs of work shoes or boots did you wear out over your career?', 'pairs', 'gear', 'playful', 'tally'],
  ['Roughly how many coworkers did you work alongside over your whole career?', 'coworkers', 'coworkers', 'playful', 'career-total'],
  ['How many people did you train or show the ropes over the years?', 'people', 'helping', 'nostalgic', 'tally'],
  ['In a typical week, how many conversations about the weather did you have?', 'conversations', 'chats', 'playful', 'typical'],
  ['About how many birthday cakes did you help eat at work over your career?', 'birthday cakes', 'celebrations', 'playful', 'career-total'],
  ['How many passwords did you have to change over the years?', 'passwords', 'learning', 'playful', 'tally'],
  ['Roughly how many job titles did you hold over your working life?', 'job titles', 'career-path', 'playful', 'career-total'],
  ['At a guess, how many printer jams did you clear over your career?', 'printer jams', 'tech', 'playful', 'guess'],
  ['How many desk or windowsill plants did you keep alive over your career?', 'plants', 'workspace', 'playful', 'tally'],
  ['About how many vacation days did you enjoy over your whole career?', 'vacation days', 'time-off', 'nostalgic', 'career-total'],
  ['How many coworkers do you think will miss seeing you every day?', 'coworkers', 'finish-line', 'nostalgic', 'tally'],
  ['On a typical day, how many questions did you answer for someone else?', 'questions', 'helping', 'nostalgic', 'typical'],
  ['How many sunrises did you see on the way to work over the years?', 'sunrises', 'commute', 'nostalgic', 'tally'],
  ['How many farewell cards did you sign for coworkers over the years?', 'cards', 'celebrations', 'nostalgic', 'tally'],
]

export const CBN_FIXTURE_ITEMS: readonly CareerNumbersItem[] = ROWS.map(([question, unit, theme, tone, shape], i) => ({
  question,
  unit,
  theme,
  tone,
  shape,
  concept: `count ${i}`,
}))

export const CBN_FIXTURE: CareerNumbersResponse = { questions: [...CBN_FIXTURE_ITEMS] }

export const CBN_FIXTURE_QUESTIONS: readonly string[] = CBN_FIXTURE_ITEMS.map((item) => item.question)
