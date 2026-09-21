import { useCallback, useEffect, useMemo, useState } from 'react'

import { downloadsApi } from '@/api/downloads.api'
import { authService } from '@/services/auth.service'
import {
  STANDARD_MONTHLY_DOWNLOAD_LIMIT,
  STARTER_MONTHLY_DOWNLOAD_LIMIT,
} from '@/constants/plan-download-limits'
import { isProPlan, isStarterPlan, normalizeUserPlan } from '@/utils/user-plan'
import type { User } from '@/types/auth'
import type { DownloadQuota } from '@/types/downloads.types'

function resolveDownloadLimitFromUser(user: User | null): number | null {
  if (user?.monthly_download_limit != null) {
    return user.monthly_download_limit
  }
  if (user?.is_unlimited_downloads) {
    return null
  }
  if (user !== null && isProPlan(user.plan)) {
    return null
  }
  if (user !== null && isStarterPlan(user.plan)) {
    return STARTER_MONTHLY_DOWNLOAD_LIMIT
  }
  return STANDARD_MONTHLY_DOWNLOAD_LIMIT
}

function buildQuotaFromUser(user: User | null): DownloadQuota | null {
  if (!user) return null

  const limit = user.is_unlimited_downloads ? null : resolveDownloadLimitFromUser(user)
  const used = user.monthly_downloads_used ?? 0
  const isUnlimited = limit === null
  const remaining =
    user.monthly_downloads_remaining ??
    (isUnlimited ? null : Math.max(0, (limit ?? 0) - used))

  return {
    monthly_downloads_used: used,
    monthly_download_limit: limit,
    monthly_downloads_remaining: remaining,
    is_unlimited: isUnlimited,
    can_download: isUnlimited || (remaining !== null && remaining > 0),
  }
}

function mergeQuotaIntoUser(user: User, quota: DownloadQuota): User {
  return {
    ...user,
    monthly_downloads_used: quota.monthly_downloads_used,
    monthly_download_limit: quota.monthly_download_limit,
    monthly_downloads_remaining: quota.monthly_downloads_remaining,
    is_unlimited_downloads: quota.is_unlimited,
  }
}

export function formatDownloadQuotaLabel(quota: DownloadQuota | null): string {
  if (!quota) return '—'
  if (quota.is_unlimited) {
    return `${quota.monthly_downloads_used} used · Unlimited`
  }
  const limit = quota.monthly_download_limit ?? 0
  return `${quota.monthly_downloads_used} / ${limit} this month`
}

export function getDownloadQuotaNote(quota: DownloadQuota | null): string {
  if (!quota) return ''
  if (quota.is_unlimited) {
    return 'Usage is tracked for reference. Your counter resets on the 1st of each calendar month (UTC).'
  }
  return 'Each export counts as one download. Your allowance resets on the 1st of each calendar month (UTC).'
}

export function useDownloadQuota(user: User | null) {
  const [quota, setQuota] = useState<DownloadQuota | null>(() => buildQuotaFromUser(user))
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshQuota = useCallback(async (): Promise<DownloadQuota | null> => {
    if (!user) {
      setQuota(null)
      return null
    }

    setIsLoading(true)
    setError(null)
    try {
      const nextQuota = await downloadsApi.getQuota()
      setQuota(nextQuota)

      const storedUser = authService.getStoredUser()
      if (storedUser) {
        authService.updateStoredUser(mergeQuotaIntoUser(storedUser, nextQuota))
      }

      return nextQuota
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Failed to load download quota'
      setError(message)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [user])

  useEffect(() => {
    setQuota(buildQuotaFromUser(user))
  }, [user])

  useEffect(() => {
    if (!user) return
    void refreshQuota()
  }, [user, refreshQuota])

  const consumeQuota = useCallback(async (): Promise<DownloadQuota> => {
    const nextQuota = await downloadsApi.consumeQuota()
    setQuota(nextQuota)

    const storedUser = authService.getStoredUser()
    if (storedUser) {
      authService.updateStoredUser(mergeQuotaIntoUser(storedUser, nextQuota))
    }

    return nextQuota
  }, [])

  const planLabel = useMemo(() => {
    const normalized = normalizeUserPlan(user?.plan ?? null)
    if (!normalized) return 'Starter'
    if (normalized === 'pro') return 'Pro'
    if (normalized === 'starter' || normalized === 'essential' || normalized === 'basic') {
      return 'Starter'
    }
    return 'Standard'
  }, [user?.plan])

  return {
    quota,
    isLoading,
    error,
    planLabel,
    refreshQuota,
    consumeQuota,
    canDownload: quota?.can_download ?? true,
    quotaLabel: formatDownloadQuotaLabel(quota),
  }
}
