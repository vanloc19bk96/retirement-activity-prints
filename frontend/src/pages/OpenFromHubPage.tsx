import { useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LAUNCH_END_REASON_KEY, type LaunchEndReason } from '@/lib/launchAuthClient'
import { getHubUrl } from '@/services/auth.service'

const COPY: Record<LaunchEndReason | 'default', { title: string; body: string; action: string }> = {
  project_deleted: {
    title: 'This project was deleted',
    body: 'It was deleted in the hub, so this tab stopped editing it. You can restore it or open another project from your project list.',
    action: 'Go to my projects',
  },
  session_expired: {
    title: 'Your session ended',
    body: 'Open the project again from the hub to keep working. Your saved work is safe.',
    action: 'Go to my projects',
  },
  default: {
    title: 'Open from Hub',
    body: 'This app must be opened from the hub. Use the button below to open the hub.',
    action: 'Open hub',
  },
}

function readReason(): LaunchEndReason | null {
  try {
    const reason = sessionStorage.getItem(LAUNCH_END_REASON_KEY)
    return reason === 'project_deleted' || reason === 'session_expired' ? reason : null
  } catch {
    return null
  }
}

export default function OpenFromHubPage(): JSX.Element {
  const hubUrl = getHubUrl().trim().replace(/\/+$/, '')
  const [reason] = useState(readReason)
  const copy = COPY[reason ?? 'default']
  const target = hubUrl && reason ? `${hubUrl}/projects` : hubUrl

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{copy.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
        <div className="mt-6">
          <Button asChild disabled={!target}>
            <a
              href={target || '#'}
              target={reason ? undefined : '_blank'}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              {copy.action}
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
