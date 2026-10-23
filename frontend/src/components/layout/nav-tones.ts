/** Each icon-rail item gets its own crayon color: tinted icon at rest, solid chip when active. */
export type NavTone = 'violet' | 'pink' | 'sky' | 'amber' | 'teal' | 'emerald' | 'orange' | 'rose'

const NAV_TONE_CLASSES: Record<NavTone, { idle: string; active: string }> = {
  violet: {
    idle: 'text-violet-600 group-hover:bg-violet-100 dark:text-violet-300 dark:group-hover:bg-violet-500/20',
    active: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-md shadow-violet-500/30',
  },
  pink: {
    idle: 'text-pink-600 group-hover:bg-pink-100 dark:text-pink-300 dark:group-hover:bg-pink-500/20',
    active: 'bg-gradient-to-br from-pink-500 to-fuchsia-600 text-white shadow-md shadow-pink-500/30',
  },
  sky: {
    idle: 'text-sky-600 group-hover:bg-sky-100 dark:text-sky-300 dark:group-hover:bg-sky-500/20',
    active: 'bg-gradient-to-br from-sky-400 to-blue-600 text-white shadow-md shadow-sky-500/30',
  },
  amber: {
    idle: 'text-amber-600 group-hover:bg-amber-100 dark:text-amber-300 dark:group-hover:bg-amber-500/20',
    active: 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30',
  },
  teal: {
    idle: 'text-teal-600 group-hover:bg-teal-100 dark:text-teal-300 dark:group-hover:bg-teal-500/20',
    active: 'bg-gradient-to-br from-teal-400 to-cyan-600 text-white shadow-md shadow-teal-500/30',
  },
  emerald: {
    idle: 'text-emerald-600 group-hover:bg-emerald-100 dark:text-emerald-300 dark:group-hover:bg-emerald-500/20',
    active: 'bg-gradient-to-br from-emerald-400 to-green-600 text-white shadow-md shadow-emerald-500/30',
  },
  orange: {
    idle: 'text-orange-600 group-hover:bg-orange-100 dark:text-orange-300 dark:group-hover:bg-orange-500/20',
    active: 'bg-gradient-to-br from-orange-400 to-red-500 text-white shadow-md shadow-orange-500/30',
  },
  rose: {
    idle: 'text-rose-600 group-hover:bg-rose-100 dark:text-rose-300 dark:group-hover:bg-rose-500/20',
    active: 'bg-gradient-to-br from-rose-400 to-pink-600 text-white shadow-md shadow-rose-500/30',
  },
}

export const navIconClasses = 'h-4 w-4 shrink-0 sm:h-[1.125rem] sm:w-[1.125rem]'

export const navLabelClasses =
  'max-w-full text-center text-[9px] font-medium leading-tight tracking-tight sm:text-[10px]'

const navItemBaseClasses =
  'group flex min-h-[2.875rem] w-full flex-col items-center justify-center gap-1 rounded-lg px-0.5 py-1 transition-colors sm:min-h-[3.5rem] sm:px-1 sm:py-1.5'

const chipBaseClasses =
  'flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 sm:h-9 sm:w-9'

export function navItemClasses(isActive: boolean): string {
  return `${navItemBaseClasses} ${isActive ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground'}`
}

export function navChipClasses(isActive: boolean, tone: NavTone): string {
  return `${chipBaseClasses} ${isActive ? NAV_TONE_CLASSES[tone].active : NAV_TONE_CLASSES[tone].idle}`
}
