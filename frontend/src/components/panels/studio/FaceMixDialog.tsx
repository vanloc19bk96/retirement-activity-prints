import { useEffect, useMemo, useState } from 'react'
import { Shuffle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { PopoverSelect } from '@/components/ui/popover-select'
import { cn } from '@/lib/utils'
import { createRng } from '@/utils/studio/studio-rng'
import {
  FACIAL_HAIR_POOL,
  accessoryPoolForGender,
  faceAllowsFacialHair,
  facePoolForGender,
  headPoolForGender,
  randomFaceMixEntry,
  type FaceMixEntry,
  type PresentGender,
} from '@/utils/studio/face-name-recall/face-specs'
import {
  describeFaceMixEntry,
  faceGenderLabel,
  humanizeFaceOptionId,
} from '@/utils/studio/face-name-recall/face-mix-labels'
import {
  renderFaceMixSvg,
  svgToImgSrc,
} from '@/utils/studio/face-name-recall/face-preview'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Set when editing an existing face; null adds a new one. */
  entry?: FaceMixEntry | null
  onSubmit: (entry: FaceMixEntry) => void
}

const GENDERS: PresentGender[] = ['female', 'male']

const NONE = ''

function toOptions(ids: readonly string[]) {
  return ids.map((id) => ({ value: id, label: humanizeFaceOptionId(id) }))
}

/** Fresh face on every open — the dialog starts from something already drawable. */
function seedEntry(): FaceMixEntry {
  const rng = createRng(Date.now() ^ Math.floor(Math.random() * 1_000_000_000))
  return randomFaceMixEntry(rng.chance(0.5) ? 'male' : 'female', rng)
}

export function FaceMixDialog({ open, onOpenChange, entry = null, onSubmit }: Props) {
  const [draft, setDraft] = useState<FaceMixEntry>(seedEntry)
  const isEditing = Boolean(entry)

  useEffect(() => {
    if (!open) return
    setDraft(entry ?? seedEntry())
  }, [open, entry])

  const previewSrc = useMemo(() => svgToImgSrc(renderFaceMixSvg(draft)), [draft])
  const heads = headPoolForGender(draft.gender)
  const faces = facePoolForGender(draft.gender)
  const accessories = accessoryPoolForGender(draft.gender)

  const patch = (changes: Partial<FaceMixEntry>) =>
    setDraft((current) => {
      const next = { ...current, ...changes }
      // Smile + beard is not a valid Open Peeps combo for this sheet.
      if (!faceAllowsFacialHair(next.face)) next.facialHair = NONE
      if (next.gender !== 'male') next.facialHair = NONE
      return next
    })

  const handleGender = (gender: PresentGender) => {
    if (gender === draft.gender) return
    const headPool = headPoolForGender(gender)
    const facePool = facePoolForGender(gender)
    const accessoryPool = accessoryPoolForGender(gender)
    setDraft((current) => {
      const face = facePool.includes(current.face) ? current.face : (facePool[0] ?? current.face)
      return {
        ...current,
        gender,
        // Heads/expressions/accessories are curated per gender; only male heads wear facial hair.
        head: headPool.includes(current.head) ? current.head : (headPool[0] ?? current.head),
        face,
        glasses: accessoryPool.includes(current.glasses) ? current.glasses : NONE,
        facialHair:
          gender === 'male' && faceAllowsFacialHair(face) ? current.facialHair : NONE,
      }
    })
  }

  const handleShuffle = () => {
    const rng = createRng(Date.now() ^ Math.floor(Math.random() * 1_000_000_000))
    setDraft((current) => ({
      ...randomFaceMixEntry(current.gender, rng),
      id: current.id,
      name: current.name,
    }))
  }

  const handleSubmit = () => {
    onSubmit(draft)
    onOpenChange(false)
  }

  return (
    // modal={false}: the default modal Dialog locks body scroll via react-remove-scroll,
    // which swallows wheel events on the nested PopoverSelect option lists below.
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit face' : 'Add a face'}</DialogTitle>
          <DialogDescription>
            Pick the features, then add the face to your sheet — type its name
            under the thumbnail, or leave it blank to have one written for you.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-2">
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-border bg-white">
              <img
                src={previewSrc}
                alt={describeFaceMixEntry(draft)}
                className="h-full w-full object-contain"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleShuffle}
            >
              <Shuffle className="h-3.5 w-3.5" aria-hidden />
              Surprise me
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-foreground">Person</span>
              <div
                className="flex gap-1 rounded-md bg-muted p-1"
                role="radiogroup"
                aria-label="Person"
              >
                {GENDERS.map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    role="radio"
                    aria-checked={draft.gender === gender}
                    onClick={() => handleGender(gender)}
                    className={cn(
                      'flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors',
                      draft.gender === gender
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {faceGenderLabel(gender)}
                  </button>
                ))}
              </div>
            </div>

            <FaceOption
              label="Hair"
              value={draft.head}
              options={toOptions(heads)}
              onChange={(head) => patch({ head })}
            />
            <FaceOption
              label="Expression"
              value={draft.face}
              options={toOptions(faces)}
              onChange={(face) => patch({ face })}
            />
            {draft.gender === 'male' && faceAllowsFacialHair(draft.face) ? (
              <FaceOption
                label="Beard"
                value={draft.facialHair}
                options={[
                  { value: NONE, label: 'None' },
                  ...toOptions(FACIAL_HAIR_POOL),
                ]}
                onChange={(facialHair) => patch({ facialHair })}
              />
            ) : null}
            <FaceOption
              label="Accessories"
              value={draft.glasses}
              options={[{ value: NONE, label: 'None' }, ...toOptions(accessories)]}
              onChange={(glasses) => patch({ glasses })}
            />
          </div>
        </div>

        <DialogFooter className="mt-5">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit}>
            {isEditing ? 'Save face' : 'Add face'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface FaceOptionProps {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

function FaceOption({ label, value, options, onChange }: FaceOptionProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground">{label}</span>
      <PopoverSelect
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={label}
      />
    </div>
  )
}
