import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getHubUrl } from '@/services/auth.service'

export default function OpenFromHubPage(): JSX.Element {
  const hubUrl = getHubUrl()

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Open from Hub</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This app must be opened from the hub. Use the button below to open the hub.
        </p>
        <div className="mt-6">
          <Button asChild disabled={!hubUrl}>
            <a
              href={hubUrl || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2"
            >
              Open hub
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}

