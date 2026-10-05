import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type TrainingVideoItem = {
  id: string
  title: string
  embedUrl: string
}

export type VideoTrainingDialogProps = {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  videos?: TrainingVideoItem[]
}

const DEFAULT_TRAINING_VIDEOS: TrainingVideoItem[] = [
  {
    id: 'get-started',
    title: 'Get Started',
    embedUrl: 'https://www.youtube.com/embed/mC3mtWS53yw',
  },
  {
    id: 'settings',
    title: 'Settings',
    embedUrl: 'https://www.youtube.com/embed/TqoX31L_4bM',
  },
  {
    id: 'components',
    title: 'Components',
    embedUrl: 'https://www.youtube.com/embed/_HBsJZgye-8',
  },
  {
    id: 'create-book',
    title: 'Create Book',
    embedUrl: 'https://www.youtube.com/embed/ys4dU8OhN1c',
  },
  {
    id: 'photo-and-tools',
    title: 'Photo & Tools',
    embedUrl: 'https://www.youtube.com/embed/Q97F-SkOiQQ',
  },
  {
    id: 'working-with-canvas',
    title: 'Working With Canvas',
    embedUrl: 'https://www.youtube.com/embed/bvW7th5gyJI',
  },
  {
    id: 'book-cover',
    title: 'Book Cover',
    embedUrl: 'https://www.youtube.com/embed/jSSPYZDn8jk',
  },
  {
    id: 'download',
    title: 'Download',
    embedUrl: 'https://www.youtube.com/embed/yy1BJ3CwnNc',
  },
]

export function VideoTrainingDialog({
  isOpen,
  onOpenChange,
  videos = DEFAULT_TRAINING_VIDEOS,
}: VideoTrainingDialogProps): JSX.Element {
  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setExpandedVideoId(null)
  }, [isOpen, videos])

  const handleToggleVideo = (videoId: string): void => {
    setExpandedVideoId((previousId) => (previousId === videoId ? null : videoId))
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 sm:max-w-4xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Video training</DialogTitle>
          <DialogDescription>Watch training videos directly in this dialog.</DialogDescription>
        </DialogHeader>

        <div className="mt-3">
          {videos.map((video, index) => (
            <div
              key={video.id}
              className={index > 0 ? 'mt-2 border-border' : ''}
            >
              <Button
                type="button"
                variant="ghost"
                className="h-12 w-full justify-between px-2 py-0 text-left hover:bg-transparent"
                onClick={() => handleToggleVideo(video.id)}
                aria-expanded={expandedVideoId === video.id}
                aria-label={`Toggle Video ${index + 1}: ${video.title}`}
              >
                <span className="flex items-center gap-2 text-sm">
                  <PlayCircle className="h-4 w-4 text-primary" />
                  <span className="font-medium">Video {index + 1}:</span>
                  <span>{video.title}</span>
                </span>
                {expandedVideoId === video.id ? (
                  <ChevronUp className="mr-1 h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="mr-1 h-4 w-4 text-muted-foreground" />
                )}
              </Button>

              {expandedVideoId === video.id ? (
                <div className="mt-4 overflow-hidden rounded-md border bg-black">
                  <iframe
                    width="560"
                    height="315"
                    src={video.embedUrl}
                    title={`${video.title} training video`}
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerPolicy="strict-origin-when-cross-origin"
                    allowFullScreen
                    className="aspect-video h-auto w-full"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
