import type { SubjectDrawing } from './subject-kit'

/**
 * The stained-glass subject library: everyday pleasures of retirement.
 *
 * Broad on purpose — home comforts, travel, the garden, hobbies — and never
 * about age itself: nothing about health, money worries or frailty, and no
 * one lifestyle assumed. Each subject is an object or a small scene anyone
 * recognises on sight, drawn from plain geometry for this game (see the rules
 * in `subject-kit.ts`).
 *
 * **Knobs.** Each subject exposes a few real-world choices (how many slats,
 * which way a sail sets, a tall or a squat pot), each with a count of
 * options, and every page deals one combination, seeded by the seller's salt
 * and the page. A knob changes how the thing is built, never what it is, so
 * every combination still reads as the same subject. `mirror` marks subjects
 * whose mirror image is still right — all of them so far, since none carries
 * text or a handed detail.
 */

export type SgTheme = 'home' | 'travel' | 'garden' | 'hobbies'

/** Where the subject lives, which decides the scenery around it. */
export type SgSetting = 'indoor' | 'outdoor'

/** Ground a subject stands on outdoors; `none` floats it (a balloon, a butterfly), over hills or open sky. */
export type SgGround = 'grass' | 'water' | 'sand' | 'none'

/** How many options each knob offers. */
export type SgKnobs = Readonly<Record<string, number>>
/** One chosen option per knob, each in `[0, count)`. */
export type SgKnobValues = Readonly<Record<string, number>>

export interface SgSubject {
  /** Stable identity, stamped on the page so a book does not repeat it. */
  id: string
  /** What a reader would call it, in title case. */
  name: string
  theme: SgTheme
  setting: SgSetting
  ground: SgGround
  knobs: SgKnobs
  /** The mirror image is still a correct picture of the subject. */
  mirror: boolean
  draw: (k: SgKnobValues) => SubjectDrawing
}

export const subject = (
  id: string,
  name: string,
  theme: SgTheme,
  setting: SgSetting,
  ground: SgGround,
  knobs: SgKnobs,
  draw: (k: SgKnobValues) => SubjectDrawing,
  mirror = true,
): SgSubject => ({ id, name, theme, setting, ground, knobs, mirror, draw })
