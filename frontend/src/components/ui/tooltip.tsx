import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

interface TooltipProps extends TooltipPrimitive.TooltipProps {}

interface TooltipTriggerProps extends TooltipPrimitive.TooltipTriggerProps {}

interface TooltipContentProps
  extends TooltipPrimitive.TooltipContentProps {
  className?: string
}

export const TooltipProvider = TooltipPrimitive.Provider

export const Tooltip = ({ children, ...props }: TooltipProps) => {
  return <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
}

export const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  TooltipTriggerProps
>(({ children, ...props }, ref) => {
  return (
    <TooltipPrimitive.Trigger ref={ref} {...props}>
      {children}
    </TooltipPrimitive.Trigger>
  )
})

TooltipTrigger.displayName = 'TooltipTrigger'

export const TooltipContent = React.forwardRef<
  HTMLDivElement,
  TooltipContentProps
>(({ className, sideOffset = 4, style, ...props }, ref) => {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'z-[200] overflow-hidden rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md',
          className,
        )}
        style={{
          backgroundColor: 'var(--color-popover)',
          color: 'var(--color-popover-foreground)',
          opacity: 1,
          ...style,
        }}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})

TooltipContent.displayName = 'TooltipContent'

