export type PlanLockTier = 'standard' | 'pro'

const PLAN_LABELS: Record<PlanLockTier, string> = {
  standard: 'Standard',
  pro: 'Pro',
}

/** Standard copy for plan-gated features: "{Feature} requires {Plan} plan". */
export function getPlanLockedTooltip(featureLabel: string, requiredPlan: PlanLockTier): string {
  return `${featureLabel} requires ${PLAN_LABELS[requiredPlan]} plan`
}
