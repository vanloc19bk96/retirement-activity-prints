import type { SgSubject } from './catalog'
import { GARDEN_SUBJECTS } from './subjects-garden'
import { HOBBY_SUBJECTS } from './subjects-hobbies'
import { HOME_SUBJECTS } from './subjects-home'
import { TRAVEL_SUBJECTS } from './subjects-travel'

export type { SgGround, SgKnobs, SgKnobValues, SgSetting, SgSubject, SgTheme } from './catalog'

/** Every stained-glass subject, grouped by theme. */
export const SG_SUBJECTS: readonly SgSubject[] = [...HOME_SUBJECTS, ...TRAVEL_SUBJECTS, ...GARDEN_SUBJECTS, ...HOBBY_SUBJECTS]

const SUBJECT_INDEX = new Map(SG_SUBJECTS.map((s) => [s.id, s]))
export const sgSubjectById = (id: string) => SUBJECT_INDEX.get(id)
