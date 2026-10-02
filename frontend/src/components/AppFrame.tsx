import type { ReactNode } from 'react'
import { useSession } from '../store/session'
import { useVisualBudget } from '../lib/visualBudget'

export function AppFrame({ children }: { children: ReactNode }) {
  // 视觉预算：低端机 / prefers-reduced-motion 时在场景根节点挂预算类，
  // 由 index.css 里的 .budget-low / .budget-reduced 关闭粒子、模糊与轨迹动画。
  const { rootClassName } = useVisualBudget()
  return (
    <div className={'stage-surface min-h-screen w-full ' + rootClassName}>
      <div className='relative mx-auto flex min-h-screen w-full max-w-[390px] flex-col overflow-x-hidden bg-stage-950 shadow-[0_0_120px_-44px_rgba(49,194,124,0.38)] sm:border-x sm:border-white/8'>
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
