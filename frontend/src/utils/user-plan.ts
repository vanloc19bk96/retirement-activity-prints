import {
  STANDARD_MONTHLY_DOWNLOAD_LIMIT,
  STARTER_MONTHLY_DOWNLOAD_LIMIT,
} from '@/constants/plan-download-limits'

export function normalizeUserPlan(plan: string | null | undefined): string | null {
  const normalized = plan?.trim().toLowerCase() ?? null
  return normalized || null
}

/** Matches backend Starter tier (legacy: essential, basic). */
export function isStarterPlan(plan: string | null | undefined): boolean {
  const normalized = normalizeUserPlan(plan)
  return normalized === 'starter' || normalized === 'essential' || normalized === 'basic'
}

export function isUserOnStarterPlan(user: { plan: string | null } | null): boolean {
  return user !== null && isStarterPlan(user.plan)
}

export function isProPlan(plan: string | null | undefined): boolean {
  return normalizeUserPlan(plan) === 'pro'
}

export function isUserOnProPlan(user: { plan: string | null } | null): boolean {
  return user !== null && isProPlan(user.plan)
}

/** Icons are available on Standard and Pro; Starter is locked. */
export function isUserIconsLocked(user: { plan: string | null } | null): boolean {
  return user !== null && isStarterPlan(user.plan)
}

/** Emojis are Pro-only. */
export function isUserEmojisLocked(user: { plan: string | null } | null): boolean {
  return user !== null && !isProPlan(user.plan)
}

/** Matches backend Standard tier (legacy: `premium`, `pro`). */
export function isStandardTierPlan(plan: string | null | undefined): boolean {
  const normalized = normalizeUserPlan(plan)
  return normalized === 'standard' || normalized === 'premium' || normalized === 'pro'
}

export function isUserOnStandardTierPlan(user: { plan: string | null } | null): boolean {
  return user !== null && isStandardTierPlan(user.plan)
}

/** AI book cover generation is Pro-only. */
export function isUserBookCoverAiLocked(user: { plan: string | null } | null): boolean {
  return user !== null && !isProPlan(user.plan)
}

/** Starter sees a curated subset of Studio templates; Standard and Pro unlock all. */
export function isUserStudioTemplateLibraryLimited(
  user: { plan: string | null } | null,
): boolean {
  return user !== null && isStarterPlan(user.plan)
}

/** Studio "Build a book" is Pro-only. */
export function isUserStudioBookBuilderLocked(user: { plan: string | null } | null): boolean {
  return user !== null && !isProPlan(user.plan)
}

/** Resolves monthly canvas download cap; null means unlimited (Pro). */
export function resolveMonthlyDownloadLimit(plan: string | null | undefined): number | null {
  if (isProPlan(plan)) {
    return null
  }
  if (isStarterPlan(plan)) {
    return STARTER_MONTHLY_DOWNLOAD_LIMIT
  }
  return STANDARD_MONTHLY_DOWNLOAD_LIMIT
}
