import type { ReactNode } from 'react'
import { cn } from '../lib/cn'

/**
 * 模拟 QQ 音乐顶栏。只借鉴音乐产品的信息层级与品牌绿点缀，
 * 不复刻 QQ 音乐受版权保护的完整界面，并始终标注"概念功能 Demo"。
 */
export function QQMusicBar({
  title = '演出',
  subtitle,
  right,
  onBack,
}: {
  title?: string
  subtitle?: string
  right?: ReactNode
  onBack?: () => void
}) {
  return (
    <header className='safe-top sticky top-0 z-30 border-b border-white/6 bg-stage-950/92 backdrop-blur-xl'>
      <div className='flex items-center gap-2 px-4 pt-3'>
        <span className='flex h-5 w-5 items-center justify-center rounded-[7px] bg-brand-500 text-[11px] font-bold text-stage-950'>
          ♪
        </span>
        <span className='text-[13px] font-semibold tracking-wide text-white'>QQ音乐</span>
        <span className='rounded-pill border border-brand-500/40 bg-brand-500/12 px-2 py-[2px] text-[10px] text-brand-200'>
          概念功能 Demo
        </span>
        <span className='ml-auto text-[10px] text-white/35'>非官方页面</span>
      </div>

      <div className='mt-2 flex items-center gap-3 px-4 pb-3'>
        {onBack ? (
          <button
            type='button'
            onClick={onBack}
            aria-label='返回'
            className='-ml-1 rounded-full border border-white/10 px-2 py-1 text-[13px] text-white/75 transition hover:border-white/25 hover:text-white'
          >
            ‹
          </button>
        ) : null}
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[15px] font-semibold text-white'>{title}</p>
          {subtitle ? <p className='truncate text-[11px] text-white/45'>{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  )
}

/** 明确写出 Mock 数据与官方 API 的限制，避免任何"已接入官方"的误解 */
export function MockNotice({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-warm-400/30 bg-warm-400/[0.07] px-3.5 py-3',
        className,
      )}
    >
      <p className={cn('text-warm-400', compact ? 'text-[11px] leading-snug' : 'text-[12px] leading-relaxed')}>
        本作品为参赛概念Demo，当前使用模拟数据，未调用QQ音乐官方内部API。
      </p>
      {compact ? null : (
        <p className='mt-1 text-[11px] leading-relaxed text-white/45'>
          当前版本没有接入真实 QQ 音乐账号，也不会读取你的真实听歌数据。
        </p>
      )}
    </div>
  )
}
