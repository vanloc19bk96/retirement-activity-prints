import type { WordEntry } from '@/utils/puzzles/word-search-core'
import { sanitizeWordEntries } from '@/utils/puzzles/word-search-core'
import { RETIREMENT_THEMES } from './retirement-themes'

import lifeAfterWork from '@/data/studio/retirement-wordlists/life-after-work.json'
import retirementFreedom from '@/data/studio/retirement-wordlists/retirement-freedom.json'
import theNewChapter from '@/data/studio/retirement-wordlists/the-new-chapter.json'
import perfectRetirementDay from '@/data/studio/retirement-wordlists/perfect-retirement-day.json'
import freeTime from '@/data/studio/retirement-wordlists/free-time.json'
import relaxUnwind from '@/data/studio/retirement-wordlists/relax-unwind.json'
import noMoreMondays from '@/data/studio/retirement-wordlists/no-more-mondays.json'
import retirementCelebration from '@/data/studio/retirement-wordlists/retirement-celebration.json'
import travelDreams from '@/data/studio/retirement-wordlists/travel-dreams.json'
import roadTrips from '@/data/studio/retirement-wordlists/road-trips.json'
import dreamDestinations from '@/data/studio/retirement-wordlists/dream-destinations.json'
import aroundTheWorld from '@/data/studio/retirement-wordlists/around-the-world.json'
import weekendGetaways from '@/data/studio/retirement-wordlists/weekend-getaways.json'
import vacationTime from '@/data/studio/retirement-wordlists/vacation-time.json'
import outdoorAdventures from '@/data/studio/retirement-wordlists/outdoor-adventures.json'
import travelEssentials from '@/data/studio/retirement-wordlists/travel-essentials.json'
import newHobbies from '@/data/studio/retirement-wordlists/new-hobbies.json'
import gardening from '@/data/studio/retirement-wordlists/gardening.json'
import photography from '@/data/studio/retirement-wordlists/photography.json'
import artsCrafts from '@/data/studio/retirement-wordlists/arts-crafts.json'
import cookingBaking from '@/data/studio/retirement-wordlists/cooking-baking.json'
import readingLearning from '@/data/studio/retirement-wordlists/reading-learning.json'
import birdwatching from '@/data/studio/retirement-wordlists/birdwatching.json'
import diyProjects from '@/data/studio/retirement-wordlists/diy-projects.json'
import musicDance from '@/data/studio/retirement-wordlists/music-dance.json'
import classicPastimes from '@/data/studio/retirement-wordlists/classic-pastimes.json'
import careerMemories from '@/data/studio/retirement-wordlists/career-memories.json'
import officeGoodbye from '@/data/studio/retirement-wordlists/office-goodbye.json'
import workplaceMemories from '@/data/studio/retirement-wordlists/workplace-memories.json'
import retirementParty from '@/data/studio/retirement-wordlists/retirement-party.json'
import careerMilestones from '@/data/studio/retirement-wordlists/career-milestones.json'
import workFriends from '@/data/studio/retirement-wordlists/work-friends.json'
import lifeBeyondWork from '@/data/studio/retirement-wordlists/life-beyond-work.json'
import schoolDays from '@/data/studio/retirement-wordlists/school-days.json'
import nostalgiaClassicPastimes from '@/data/studio/retirement-wordlists/nostalgia-classic-pastimes.json'
import retroTechnology from '@/data/studio/retirement-wordlists/retro-technology.json'
import vintageHome from '@/data/studio/retirement-wordlists/vintage-home.json'
import oldSchoolTravel from '@/data/studio/retirement-wordlists/old-school-travel.json'
import memoryLane from '@/data/studio/retirement-wordlists/memory-lane.json'
import thenAndNow from '@/data/studio/retirement-wordlists/then-and-now.json'
import decadeMemories from '@/data/studio/retirement-wordlists/decade-memories.json'
import friendsFamily from '@/data/studio/retirement-wordlists/friends-family.json'
import familyGatherings from '@/data/studio/retirement-wordlists/family-gatherings.json'
import goodFriends from '@/data/studio/retirement-wordlists/good-friends.json'
import socialLife from '@/data/studio/retirement-wordlists/social-life.json'
import celebrations from '@/data/studio/retirement-wordlists/celebrations.json'
import qualityTime from '@/data/studio/retirement-wordlists/quality-time.json'
import walkingNature from '@/data/studio/retirement-wordlists/walking-nature.json'
import outdoorLife from '@/data/studio/retirement-wordlists/outdoor-life.json'
import activeRetirement from '@/data/studio/retirement-wordlists/active-retirement.json'
import healthyHabits from '@/data/studio/retirement-wordlists/healthy-habits.json'
import mindfulMoments from '@/data/studio/retirement-wordlists/mindful-moments.json'
import natureLovers from '@/data/studio/retirement-wordlists/nature-lovers.json'
import everydayWellness from '@/data/studio/retirement-wordlists/everyday-wellness.json'
import cozyHome from '@/data/studio/retirement-wordlists/cozy-home.json'
import gardenDays from '@/data/studio/retirement-wordlists/garden-days.json'
import homeProjects from '@/data/studio/retirement-wordlists/home-projects.json'
import weekendFun from '@/data/studio/retirement-wordlists/weekend-fun.json'
import relaxingHobbies from '@/data/studio/retirement-wordlists/relaxing-hobbies.json'
import kitchenFun from '@/data/studio/retirement-wordlists/kitchen-fun.json'
import creativeTime from '@/data/studio/retirement-wordlists/creative-time.json'

const RAW_BY_THEME: Record<string, readonly string[]> = {
  'life-after-work': lifeAfterWork,
  'retirement-freedom': retirementFreedom,
  'the-new-chapter': theNewChapter,
  'perfect-retirement-day': perfectRetirementDay,
  'free-time': freeTime,
  'relax-unwind': relaxUnwind,
  'no-more-mondays': noMoreMondays,
  'retirement-celebration': retirementCelebration,
  'travel-dreams': travelDreams,
  'road-trips': roadTrips,
  'dream-destinations': dreamDestinations,
  'around-the-world': aroundTheWorld,
  'weekend-getaways': weekendGetaways,
  'vacation-time': vacationTime,
  'outdoor-adventures': outdoorAdventures,
  'travel-essentials': travelEssentials,
  'new-hobbies': newHobbies,
  gardening,
  photography,
  'arts-crafts': artsCrafts,
  'cooking-baking': cookingBaking,
  'reading-learning': readingLearning,
  birdwatching,
  'diy-projects': diyProjects,
  'music-dance': musicDance,
  'classic-pastimes': classicPastimes,
  'career-memories': careerMemories,
  'office-goodbye': officeGoodbye,
  'workplace-memories': workplaceMemories,
  'retirement-party': retirementParty,
  'career-milestones': careerMilestones,
  'work-friends': workFriends,
  'life-beyond-work': lifeBeyondWork,
  'school-days': schoolDays,
  'nostalgia-classic-pastimes': nostalgiaClassicPastimes,
  'retro-technology': retroTechnology,
  'vintage-home': vintageHome,
  'old-school-travel': oldSchoolTravel,
  'memory-lane': memoryLane,
  'then-and-now': thenAndNow,
  'decade-memories': decadeMemories,
  'friends-family': friendsFamily,
  'family-gatherings': familyGatherings,
  'good-friends': goodFriends,
  'social-life': socialLife,
  celebrations,
  'quality-time': qualityTime,
  'walking-nature': walkingNature,
  'outdoor-life': outdoorLife,
  'active-retirement': activeRetirement,
  'healthy-habits': healthyHabits,
  'mindful-moments': mindfulMoments,
  'nature-lovers': natureLovers,
  'everyday-wellness': everydayWellness,
  'cozy-home': cozyHome,
  'garden-days': gardenDays,
  'home-projects': homeProjects,
  'weekend-fun': weekendFun,
  'relaxing-hobbies': relaxingHobbies,
  'kitchen-fun': kitchenFun,
  'creative-time': creativeTime,
}

/** Load curated WordEntry pool for a preset theme (falls back to first theme). */
export function loadCuratedThemeEntries(
  themeId: string,
  gridSize: number,
  options?: { minLetters?: number; maxLetters?: number },
): WordEntry[] {
  const raw =
    RAW_BY_THEME[themeId] ??
    RAW_BY_THEME[RETIREMENT_THEMES[0]!.id] ??
    []
  return sanitizeWordEntries(raw, {
    gridSize,
    minLetters: options?.minLetters ?? 4,
    maxLetters: options?.maxLetters,
  })
}

export function curatedThemeCount(themeId: string): number {
  return RAW_BY_THEME[themeId]?.length ?? 0
}
