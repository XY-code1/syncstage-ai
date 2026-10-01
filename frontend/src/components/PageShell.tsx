import type { ReactNode } from 'react'
import { ProgressSteps } from './ui'
import { ArrowLeftIcon } from './icons'

export function PageShell({
  title,
  subtitle,
  step,
  onBack,
  right,
  children,
  footer,
  hideHeader,
  footerFixed,
}: {
  title: string
  subtitle?: string
  step?: number
  onBack?: () => void
  right?: ReactNode
  children: ReactNode
  footer?: ReactNode
  hideHeader?: boolean
  footerFixed?: boolean
}) {
  return (
    <div className='ai-stage flex min-h-screen flex-col'>
      {hideHeader ? null : (
        <header className='safe-top sticky top-0 z-30 border-b border-white/6 bg-stage-950/88 px-4 pb-3 pt-3 backdrop-blur-xl'>
          <div className='flex items-center gap-3'>
            {onBack ? (
              <button
                type='button'
                onClick={onBack}
                aria-label='返回'
                className='-ml-1 rounded-full border border-white/10 p-2 text-white/75 transition hover:border-white/25 hover:text-white'
              >
                <ArrowLeftIcon className='h-4 w-4' />
              </button>
            ) : null}
            <div className='min-w-0 flex-1'>
              <p className='truncate text-base font-semibold text-white'>{title}</p>
              {subtitle ? <p className='truncate text-sm text-white/50'>{subtitle}</p> : null}
            </div>
            {right}
          </div>
          {step === undefined ? null : (
            <div className='mt-3'>
              <ProgressSteps current={step} />
            </div>
          )}
        </header>
      )}

      <main className={footer ? (footerFixed ? 'flex-1 px-4 pb-36 pt-4' : 'flex-1 px-4 pb-6 pt-4') : 'flex-1 px-4 pb-14 pt-4'}>{children}</main>

      {footer ? (
        <footer className={footerFixed ? 'safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-white/8 bg-stage-950/96 px-4 pt-3 backdrop-blur-xl' : 'safe-bottom sticky bottom-0 z-30 border-t border-white/8 bg-stage-950/92 px-4 pt-3 backdrop-blur-xl'}>
          {footer}
        </footer>
      ) : null}
    </div>
  )
}
