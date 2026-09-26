import type { StudioConfigField } from '@/types/studio-template.types'
import { DEFAULT_SD_GROUP, DEFAULT_SD_LEVEL, SD_GROUPS, SD_LEVELS, parseSdGroup, parseSdLevel, sdLevelSpec } from './content'
import { sdCrowdedWarning, sdPanelFor, sdPrintNote } from './layout'
import { sdGroupRecipes } from './scenes'

/**
 * Two questions: what kind of scenes, and how many differences.
 *
 * What the form deliberately does not ask:
 *
 * *Which scene, which things in it* — a book wants variety, and the page
 * deals it: scenes the book already shows wait their turn, and every scene
 * is dealt fresh (its things, their versions, their order and spacing).
 *
 * *Which differences, how big, where* — dealt per page and measured on the
 * printed ink: every one big enough to see in print, clear of every other,
 * one thing each. The level decides how many and how bold.
 *
 * *Picture size, layout, line weights, the answer key* — fixed for print:
 * the two pictures fill the page one above the other, and the answer page
 * circles and numbers every difference, with a short list of what changed.
 */
export const SD_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'theme',
    label: 'Scenes',
    type: 'select',
    default: DEFAULT_SD_GROUP,
    options: SD_GROUPS.map((g) => ({ label: g.label, value: g.value })),
    helpWhen: (config) => {
      const recipes = sdGroupRecipes(parseSdGroup(config.theme))
      const names = recipes.map((r) => r.name.toLowerCase())
      const list = names.length > 4 ? `${names.slice(0, 4).join(', ')} and ${names.length - 4} more` : names.join(', ')
      return `${recipes.length} scenes — ${list}. Every page is a freshly drawn scene.`
    },
  },
  {
    key: 'level',
    label: 'Differences',
    type: 'select',
    default: DEFAULT_SD_LEVEL,
    options: SD_LEVELS.map((level) => ({ label: level.label, value: level.value })),
    helpWhen: (config, layout) => sdPrintNote({ page: layout, config, minExtent: sdLevelSpec(parseSdLevel(config.level)).fairness.minExtent }),
    warningWhen: (config, layout) => (layout ? sdCrowdedWarning(sdPanelFor(layout, config), parseSdGroup(config.theme), parseSdLevel(config.level)) : null),
  },
]
