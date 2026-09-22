export type RetirementThemeCategory =
  | 'retirement-life'
  | 'travel-adventure'
  | 'hobbies-leisure'
  | 'career-farewell'
  | 'nostalgia'
  | 'friends-family'
  | 'active-retirement'
  | 'home-leisure'

export interface RetirementThemePreset {
  id: string
  label: string
  category: RetirementThemeCategory
}

export interface RetirementCategoryMeta {
  id: RetirementThemeCategory
  label: string
}

export const RETIREMENT_CATEGORIES: readonly RetirementCategoryMeta[] = [
  { id: 'retirement-life', label: 'Retirement Life' },
  { id: 'travel-adventure', label: 'Travel & Adventure' },
  { id: 'hobbies-leisure', label: 'Hobbies & Leisure' },
  { id: 'career-farewell', label: 'Career & Farewell' },
  { id: 'nostalgia', label: 'Nostalgia' },
  { id: 'friends-family', label: 'Friends & Family' },
  { id: 'active-retirement', label: 'Active Retirement' },
  { id: 'home-leisure', label: 'Home & Leisure' },
]

/** Human-authored preset themes — category → theme picker. */
export const RETIREMENT_THEMES: readonly RetirementThemePreset[] = [
  // A — Retirement Life
  { id: 'life-after-work', label: 'Life After Work', category: 'retirement-life' },
  { id: 'retirement-freedom', label: 'Retirement Freedom', category: 'retirement-life' },
  { id: 'the-new-chapter', label: 'The New Chapter', category: 'retirement-life' },
  { id: 'perfect-retirement-day', label: 'Perfect Retirement Day', category: 'retirement-life' },
  { id: 'free-time', label: 'Free Time', category: 'retirement-life' },
  { id: 'relax-unwind', label: 'Relax & Unwind', category: 'retirement-life' },
  { id: 'no-more-mondays', label: 'No More Mondays', category: 'retirement-life' },
  { id: 'retirement-celebration', label: 'Retirement Celebration', category: 'retirement-life' },
  // B — Travel & Adventure
  { id: 'travel-dreams', label: 'Travel Dreams', category: 'travel-adventure' },
  { id: 'road-trips', label: 'Road Trips', category: 'travel-adventure' },
  { id: 'dream-destinations', label: 'Dream Destinations', category: 'travel-adventure' },
  { id: 'around-the-world', label: 'Around the World', category: 'travel-adventure' },
  { id: 'weekend-getaways', label: 'Weekend Getaways', category: 'travel-adventure' },
  { id: 'vacation-time', label: 'Vacation Time', category: 'travel-adventure' },
  { id: 'outdoor-adventures', label: 'Outdoor Adventures', category: 'travel-adventure' },
  { id: 'travel-essentials', label: 'Travel Essentials', category: 'travel-adventure' },
  // C — Hobbies & Leisure
  { id: 'new-hobbies', label: 'New Hobbies', category: 'hobbies-leisure' },
  { id: 'gardening', label: 'Gardening', category: 'hobbies-leisure' },
  { id: 'photography', label: 'Photography', category: 'hobbies-leisure' },
  { id: 'arts-crafts', label: 'Arts & Crafts', category: 'hobbies-leisure' },
  { id: 'cooking-baking', label: 'Cooking & Baking', category: 'hobbies-leisure' },
  { id: 'reading-learning', label: 'Reading & Learning', category: 'hobbies-leisure' },
  { id: 'birdwatching', label: 'Birdwatching', category: 'hobbies-leisure' },
  { id: 'diy-projects', label: 'DIY Projects', category: 'hobbies-leisure' },
  { id: 'music-dance', label: 'Music & Dance', category: 'hobbies-leisure' },
  { id: 'classic-pastimes', label: 'Classic Pastimes', category: 'hobbies-leisure' },
  // D — Career & Farewell
  { id: 'career-memories', label: 'Career Memories', category: 'career-farewell' },
  { id: 'office-goodbye', label: 'Office Goodbye', category: 'career-farewell' },
  { id: 'workplace-memories', label: 'Workplace Memories', category: 'career-farewell' },
  { id: 'retirement-party', label: 'Retirement Party', category: 'career-farewell' },
  { id: 'career-milestones', label: 'Career Milestones', category: 'career-farewell' },
  { id: 'work-friends', label: 'Work Friends', category: 'career-farewell' },
  { id: 'life-beyond-work', label: 'Life Beyond Work', category: 'career-farewell' },
  // E — Nostalgia (entertainment theme only — not cognitive training)
  { id: 'school-days', label: 'School Days', category: 'nostalgia' },
  { id: 'nostalgia-classic-pastimes', label: 'Classic Pastimes', category: 'nostalgia' },
  { id: 'retro-technology', label: 'Retro Technology', category: 'nostalgia' },
  { id: 'vintage-home', label: 'Vintage Home', category: 'nostalgia' },
  { id: 'old-school-travel', label: 'Old-School Travel', category: 'nostalgia' },
  { id: 'memory-lane', label: 'Memory Lane', category: 'nostalgia' },
  { id: 'then-and-now', label: 'Then & Now', category: 'nostalgia' },
  { id: 'decade-memories', label: 'Decade Memories', category: 'nostalgia' },
  // F — Friends & Family
  { id: 'friends-family', label: 'Friends & Family', category: 'friends-family' },
  { id: 'family-gatherings', label: 'Family Gatherings', category: 'friends-family' },
  { id: 'good-friends', label: 'Good Friends', category: 'friends-family' },
  { id: 'social-life', label: 'Social Life', category: 'friends-family' },
  { id: 'celebrations', label: 'Celebrations', category: 'friends-family' },
  { id: 'quality-time', label: 'Quality Time', category: 'friends-family' },
  // G — Active Retirement
  { id: 'walking-nature', label: 'Walking & Nature', category: 'active-retirement' },
  { id: 'outdoor-life', label: 'Outdoor Life', category: 'active-retirement' },
  { id: 'active-retirement', label: 'Active Retirement', category: 'active-retirement' },
  { id: 'healthy-habits', label: 'Healthy Habits', category: 'active-retirement' },
  { id: 'mindful-moments', label: 'Mindful Moments', category: 'active-retirement' },
  { id: 'nature-lovers', label: 'Nature Lovers', category: 'active-retirement' },
  { id: 'everyday-wellness', label: 'Everyday Wellness', category: 'active-retirement' },
  // H — Home & Leisure
  { id: 'cozy-home', label: 'Cozy Home', category: 'home-leisure' },
  { id: 'garden-days', label: 'Garden Days', category: 'home-leisure' },
  { id: 'home-projects', label: 'Home Projects', category: 'home-leisure' },
  { id: 'weekend-fun', label: 'Weekend Fun', category: 'home-leisure' },
  { id: 'relaxing-hobbies', label: 'Relaxing Hobbies', category: 'home-leisure' },
  { id: 'kitchen-fun', label: 'Kitchen Fun', category: 'home-leisure' },
  { id: 'creative-time', label: 'Creative Time', category: 'home-leisure' },
]

const THEME_BY_ID = new Map(RETIREMENT_THEMES.map((t) => [t.id, t]))

export function getRetirementTheme(id: string): RetirementThemePreset | undefined {
  return THEME_BY_ID.get(id)
}

export function themesForCategory(
  category: RetirementThemeCategory,
): RetirementThemePreset[] {
  return RETIREMENT_THEMES.filter((t) => t.category === category)
}

export function defaultThemeId(category: RetirementThemeCategory): string {
  return themesForCategory(category)[0]?.id ?? RETIREMENT_THEMES[0]!.id
}

/** Flat theme picker (no category grouping) — every preset in one list. */
export function allThemeSelectOptions(): { label: string; value: string }[] {
  return RETIREMENT_THEMES.map((t) => ({ label: t.label, value: t.id }))
}

export function parseRetirementCategory(raw: unknown): RetirementThemeCategory {
  const value = String(raw ?? '')
  if (RETIREMENT_CATEGORIES.some((c) => c.id === value)) {
    return value as RetirementThemeCategory
  }
  return 'retirement-life'
}
