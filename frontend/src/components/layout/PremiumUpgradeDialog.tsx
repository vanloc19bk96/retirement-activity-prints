import { Check, Crown, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DEFAULT_PROMOTIONAL_PACK_URL,
  DEFAULT_PRO_UPGRADE_URL,
  DEFAULT_STANDARD_UPGRADE_URL,
  PRO_PLAN_FEATURES,
  PROMOTIONAL_PACK_FEATURES,
  STANDARD_PLAN_FEATURES,
  STARTER_PLAN_FEATURES,
} from '@/constants/plan-features'
import { isProPlan, isStarterPlan, normalizeUserPlan } from '@/utils/user-plan'

type PlanKey = 'starter' | 'standard' | 'pro'

const DEFAULT_UPGRADE_URLS = {
  standard: DEFAULT_STANDARD_UPGRADE_URL,
  pro: DEFAULT_PRO_UPGRADE_URL,
  promotionalPack: DEFAULT_PROMOTIONAL_PACK_URL,
} as const

const PLAN_CONFIG: Record<
  PlanKey,
  {
    title: string
    subtitle: string
    features: readonly string[]
    isHighlighted?: boolean
  }
> = {
  starter: {
    title: 'Starter',
    subtitle: 'Everything you need to start publishing custom books.',
    features: STARTER_PLAN_FEATURES,
  },
  standard: {
    title: 'Standard',
    subtitle: 'Unlock AI images, icons, book covers, and more layouts.',
    features: STANDARD_PLAN_FEATURES,
  },
  pro: {
    title: 'Pro',
    subtitle: 'Maximum power for professional publishers and power users.',
    features: PRO_PLAN_FEATURES,
    isHighlighted: true,
  },
}

export type PremiumUpgradeDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  standardUpgradeUrl?: string
  proUpgradeUrl?: string
  promotionalPackUrl?: string
  currentPlan?: string | null
}

function isStandardPlan(plan: string | null): boolean {
  return plan === 'standard' || plan === 'premium'
}

function isCurrentPlan(plan: PlanKey, normalizedPlan: string | null): boolean {
  if (!normalizedPlan) return false
  if (plan === 'starter') return isStarterPlan(normalizedPlan)
  if (plan === 'standard') return isStandardPlan(normalizedPlan)
  return isProPlan(normalizedPlan)
}

function resolveUpgradeUrl(
  plan: PlanKey,
  standardUpgradeUrl: string,
  proUpgradeUrl: string,
): string | null {
  if (plan === 'starter') return null
  if (plan === 'standard') return standardUpgradeUrl
  return proUpgradeUrl
}

function resolveCtaLabel(plan: PlanKey, isCurrent: boolean): string {
  if (isCurrent) return 'Current plan'
  if (plan === 'starter') return 'Starter plan'
  return `Upgrade to ${PLAN_CONFIG[plan].title}`
}

type PlanCardProps = {
  plan: PlanKey
  isCurrent: boolean
}

function PlanCard({ plan, isCurrent }: PlanCardProps): JSX.Element {
  const config = PLAN_CONFIG[plan]
  const sectionClassName = config.isHighlighted
    ? 'relative overflow-hidden rounded-xl border border-primary/40 bg-primary/5 p-4'
    : 'rounded-xl border border-border bg-muted/20 p-4'

  return (
    <section className={sectionClassName} aria-label={`${config.title} plan`}>
      {config.isHighlighted && (
        <div className="absolute right-3 top-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
          Best value
        </div>
      )}

      <div className={config.isHighlighted ? 'pr-16' : undefined}>
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold leading-tight text-foreground">{config.title}</h3>
          {isCurrent && (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
              Current
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{config.subtitle}</p>
      </div>

      <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto pr-1 sm:max-h-64" role="list">
        {config.features.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="leading-snug">{feature}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

type PlanCtaButtonProps = {
  plan: PlanKey
  isCurrent: boolean
  upgradeUrl: string | null
  onUpgrade: (url: string) => void
}

type PromotionalPackCardProps = {
  upgradeUrl: string
  onUpgrade: (url: string) => void
}

function PromotionalPackCard({ upgradeUrl, onUpgrade }: PromotionalPackCardProps): JSX.Element {
  const hasUpgradeUrl = Boolean(upgradeUrl && upgradeUrl !== '#')

  return (
    <section
      className="rounded-xl border border-border bg-muted/20 p-4"
      aria-label="Promotional Material Pack add-on"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold leading-tight text-foreground">
          Promotional Material Pack
        </h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Add-on
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Listing, categories, and a 30-day launch plan for the book you already built. Not an app
        plan.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2" role="list">
        {PROMOTIONAL_PACK_FEATURES.map((feature) => (
          <li key={feature} className="flex gap-3 text-sm text-foreground">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="leading-snug">{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="mt-4 h-11 w-full gap-2 sm:w-auto"
        onClick={() => {
          if (hasUpgradeUrl) {
            onUpgrade(upgradeUrl)
          }
        }}
        disabled={!hasUpgradeUrl}
        aria-label="Continue to Promotional Material Pack checkout — opens in a new tab"
      >
        <span>Get the Promotional Pack</span>
        {hasUpgradeUrl && <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />}
      </Button>
    </section>
  )
}

function PlanCtaButton({ plan, isCurrent, upgradeUrl, onUpgrade }: PlanCtaButtonProps): JSX.Element {
  const isDisabled = isCurrent || plan === 'starter'
  const label = resolveCtaLabel(plan, isCurrent)
  const hasUpgradeUrl = Boolean(upgradeUrl && upgradeUrl !== '#')

  return (
    <Button
      type="button"
      variant={plan === 'pro' ? 'default' : 'outline'}
      className="h-11 w-full gap-2"
      onClick={() => {
        if (hasUpgradeUrl && upgradeUrl) {
          onUpgrade(upgradeUrl)
        }
      }}
      disabled={isDisabled}
      aria-label={
        isCurrent
          ? `${PLAN_CONFIG[plan].title} is your current plan`
          : `Continue to ${PLAN_CONFIG[plan].title} checkout — opens in a new tab`
      }
    >
      <span>{label}</span>
      {!isCurrent && plan !== 'starter' && hasUpgradeUrl && (
        <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </Button>
  )
}

export function PremiumUpgradeDialog({
  isOpen,
  onOpenChange,
  standardUpgradeUrl = DEFAULT_UPGRADE_URLS.standard,
  proUpgradeUrl = DEFAULT_UPGRADE_URLS.pro,
  promotionalPackUrl = DEFAULT_UPGRADE_URLS.promotionalPack,
  currentPlan = null,
}: PremiumUpgradeDialogProps): JSX.Element {
  const openUpgradeUrl = (url: string): void => {
    if (!url || url === '#') return
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const normalizedPlan = normalizeUserPlan(currentPlan)
  const plans: PlanKey[] = ['starter', 'standard', 'pro']

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 sm:max-w-6xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader className="space-y-0 text-left">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Crown className="h-6 w-6 text-primary" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 items-center">
              <DialogTitle className="text-xl leading-tight">Upgrade your plan</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <p className="mt-2 text-sm text-muted-foreground">
          Compare plans and choose the one that fits how you create. You can upgrade anytime.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <PlanCard
              key={plan}
              plan={plan}
              isCurrent={isCurrentPlan(plan, normalizedPlan)}
            />
          ))}
        </div>

        <div className="mt-6 border-t border-border pt-5" role="group" aria-label="Upgrade actions">
          <div className="grid gap-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCtaButton
                key={plan}
                plan={plan}
                isCurrent={isCurrentPlan(plan, normalizedPlan)}
                upgradeUrl={resolveUpgradeUrl(plan, standardUpgradeUrl, proUpgradeUrl)}
                onUpgrade={openUpgradeUrl}
              />
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium text-foreground">Also available</p>
          <PromotionalPackCard upgradeUrl={promotionalPackUrl} onUpgrade={openUpgradeUrl} />
        </div>
      </DialogContent>
    </Dialog>
  )
}
