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
    id: 'instruction',
    title: 'Instruction',
    embedUrl: 'https://www.youtube.com/embed/R287I9p0-2k',
  },
  {
    id: 'settings',
    title: 'Settings',
    embedUrl: 'https://www.youtube.com/embed/fjtslTDGYUg',
  },
  {
    id: 'components',
    title: 'Components',
    embedUrl: 'https://www.youtube.com/embed/BiXYUpQkuU0',
  },
  {
    id: 'studio',
    title: 'Studio',
    embedUrl: 'https://www.youtube.com/embed/VY1mW3Ia5_k',
  },
  {
    id: 'photo-library',
    title: 'Photo Library',
    embedUrl: 'https://www.youtube.com/embed/DxFZ_i6TbIQ',
  },
  {
    id: 'tools',
    title: 'Tools',
    embedUrl: 'https://www.youtube.com/embed/CiiNvIkRUFM',
  },
  {
    id: 'working-with-canvas',
    title: 'Working With Canvas',
    embedUrl: 'https://www.youtube.com/embed/XNAfjSCqM_k',
  },
  {
    id: 'book-cover',
    title: 'Book Cover',
    embedUrl: 'https://www.youtube.com/embed/UQ9R1l-ePyA',
  },
  {
    id: 'download',
    title: 'Download',
    embedUrl: 'https://www.youtube.com/embed/PYnFZ_wPOQc',
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
