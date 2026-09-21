import type { JSX } from 'react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

type ToolbarHintButtonProps = {
  hint: string
  children: JSX.Element
}

export function ToolbarHintButton({ hint, children }: ToolbarHintButtonProps): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">
        {hint}
      </TooltipContent>
    </Tooltip>
  )
}

