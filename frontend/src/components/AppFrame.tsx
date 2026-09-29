import type { ReactNode } from 'react'
import { useSession } from '../store/session'

export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <div className='stage-surface min-h-screen w-full'>
      <div className='relative mx-auto flex min-h-screen w-full max-w-[440px] flex-col bg-stage-950/55 shadow-[0_0_140px_-50px_rgba(49,194,124,0.45)] sm:border-x sm:border-white/6'>
        {children}
      </div>
    </div>
  )
}

export function Toaster() {
  const { toasts, dismissToast } = useSession()

  if (toasts.length === 0) return null

  return (
    <div className='pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-6'>
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type='button'
          onClick={() => dismissToast(toast.id)}
          className={
            'pointer-events-auto max-w-[330px] animate-rise rounded-2xl border px-4 py-2.5 text-[13px] leading-snug shadow-xl backdrop-blur-xl ' +
            (toast.tone === 'success'
              ? 'border-brand-500/40 bg-brand-800/85 text-brand-50'
              : toast.tone === 'warn'
                ? 'border-rose-400/40 bg-[#3a1a25]/90 text-rose-100'
                : 'border-white/12 bg-stage-800/90 text-white/85')
          }
        >
          {toast.text}
        </button>
      ))}
    </div>
  )
}
