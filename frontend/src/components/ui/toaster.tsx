import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'
import { useToast } from '../../hooks/use-toast'

export function Toaster(): JSX.Element {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={3000}>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && <ToastDescription>{description}</ToastDescription>}
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport className="fixed bottom-0 right-0 top-auto z-[100] flex w-full max-w-[420px] flex-col p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:p-6" />
    </ToastProvider>
  )
}
