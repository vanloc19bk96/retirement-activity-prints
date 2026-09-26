import type {
  StudioConfig,
  StudioConfigField,
  StudioConfigValidationError,
} from '@/types/studio-template.types'
import { STUDIO_DEFAULT_FONT } from '@/constants/studio.constants'
import {
  WKB_AUDIENCES,
  WKB_DEFAULT_PLAYERS,
  WKB_NAME_MAX,
  WKB_PLAYER_COUNTS,
  parseRetireeName,
  parseWkbAudience,
  parseWkbPlayers,
  retireeNameProblem,
} from './content'
import { wkbPrintNote } from './layout'

/**
 * Three questions: who the game is about, who is playing, and how many.
 *
 * What the form deliberately does not ask:
 *
 * *The retiree's details* — no profile to fill in. The questions are guesses
 * anyone who knows them could make, and the retiree writes the real answers
 * on their own sheet, so nothing about them is invented and nothing private
 * is typed in. The name is optional, printed in headings and instructions
 * only, and never sent to the content service.
 *
 * *The real answers* — they cannot be typed before the questions exist, and
 * the retiree knows them best: their sheet prints the same twelve questions
 * with room to write.
 *
 * *Number of questions, topics, tone* — twelve questions is the game; every
 * set spreads over at least nine topics, always one about retirement plans,
 * and is held to light, kind and personal-but-not-private.
 *
 * *Answer space, type size, questions per page* — each question gets the
 * room its answer needs (a short line, a full line, or two), and the type
 * size and pages fall out of the trim, at large print. The players' help line
 * reports what came out.
 */
export const WKB_CONFIG_SCHEMA: StudioConfigField[] = [
  {
    key: 'retireeName',
    label: 'Retiree’s name (optional)',
    type: 'text',
    default: '',
    max: WKB_NAME_MAX,
    placeholder: 'e.g. Linda',
    help: 'A first name or nickname for the headings and instructions — “Who Knows Linda Best?”. It is printed only, never sent to the AI. Leave blank to say “the retiree”.',
  },
  {
    key: 'audience',
    label: 'Who’s playing?',
    type: 'select',
    default: 'mixed',
    options: WKB_AUDIENCES.map((audience) => ({ label: audience.label, value: audience.value })),
    helpWhen: (config) => {
      const audience = WKB_AUDIENCES.find((a) => a.value === parseWkbAudience(config.audience))!
      return `${audience.help} Fresh questions every time, never repeated within your book.`
    },
  },
  {
    key: 'players',
    label: 'Players',
    type: 'select',
    default: WKB_DEFAULT_PLAYERS,
    options: WKB_PLAYER_COUNTS.map((n) => ({ label: n === 1 ? '1 player' : `${n} players`, value: n })),
    helpWhen: (config, layout) =>
      wkbPrintNote({
        page: layout,
        config,
        font: String(config.fontFamily ?? STUDIO_DEFAULT_FONT),
        name: parseRetireeName(config.retireeName),
        players: parseWkbPlayers(config.players),
      }),
  },
]

export function validateWkbConfig(config: StudioConfig): StudioConfigValidationError | null {
  const message = retireeNameProblem(config.retireeName)
  return message ? { message, field: 'retireeName' } : null
}
