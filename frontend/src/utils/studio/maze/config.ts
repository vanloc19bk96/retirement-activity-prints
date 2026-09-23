import type { StudioConfigField } from '@/types/studio-template.types'
import { mazePrintNote } from './layout'
import {
  DEFAULT_MAZE_LEVEL_ID,
  MAZE_LEVEL_OPTIONS,
  mazeInstruction,
  parseMazeLevel,
} from './levels'

/**
 * One question, and it is about the puzzle rather than the page.
 *
 * The form this replaces asked three. "Maze size" picked a column count blind
 * to the trim, so the same choice meant a comfortable maze on one page size and
 * corridors narrower than a pencil on another. "Difficulty" then set twistiness
 * on its own, which let the two be set against each other — the hardest maze at
 * the smallest size is a page nobody can solve. And a toggle offered to leave
 * Start and Finish unlabelled, which is not a preference; it is a way to print
 * a puzzle with no way in.
 *
 * What is left is the level. Corridor width, grid size, wall weight, label size
 * and how long the route runs are all derived from it and from the page size in
 * Settings, because the page is the only thing that knows how much room there
 * is. The help line reports the maze those decisions produced on the trim
 * currently set, so the form never promises a page it cannot print.
 */
export const MAZE_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'level',
    label: 'Puzzle level',
    type: 'select',
    default: DEFAULT_MAZE_LEVEL_ID,
    options: MAZE_LEVEL_OPTIONS,
    helpWhen: (config, layout) =>
      mazePrintNote({
        level: parseMazeLevel(config),
        page: layout,
        config,
        instruction: mazeInstruction(config),
      }),
  },
]
