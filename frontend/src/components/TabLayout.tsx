import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '../lib/cn'
import { ChatIcon, HomeIcon, PersonIcon, UsersIcon } from './icons'
import { useSocial } from '../store/social'

const TABS = [
  { to: '/', label: '首页', Icon: HomeIcon },
  { to: '/sync', label: '同频', Icon: UsersIcon },
  { to: '/messages', label: '消息', Icon: ChatIcon },
  { to: '/me', label: '我的', Icon: PersonIcon },
]

/** 一级导航：固定为 首页 / 同频 / 消息 / 我的 */
export function TabBar() {
  const { unreadCount } = useSocial()

  return (
    <nav
      aria-label='主导航'
      className='safe-bottom sticky bottom-0 z-30 border-t border-white/8 bg-stage-950/95 backdrop-blur-xl'
    >
      <div className='flex items-stretch'>
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 pb-1 pt-2.5 transition',
                isActive ? 'text-brand-300' : 'text-white/40 hover:text-white/70',
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className='relative'>
                  <tab.Icon className='h-[21px] w-[21px]' />
                  {tab.to === '/messages' && unreadCount > 0 ? (
                    <span className='absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9px] font-semibold text-stage-950'>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  ) : null}
                </span>
                <span className={cn('text-[10px]', isActive ? 'font-medium' : '')}>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** 一级页面外壳：内容区 + 固定底部导航 */
export function TabLayout() {
  return (
    <div className='flex min-h-screen flex-col'>
      <main className='flex-1'>
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

/** 一级页面共用的紧凑顶部：品牌条 + 页面标题，避免整屏都是卡片标题 */
export function TabHeader({
  title,
  subtitle,
  right,
  aura,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
  /** 标题区加一点现场氛围渐变（只有首页用，避免整页铺满） */
  aura?: boolean
}) {
  return (
    <header
      className={cn(
        'safe-top sticky top-0 z-30 border-b border-white/6 backdrop-blur-xl',
        aura ? 'stage-aura' : 'bg-stage-950/92',
      )}
    >
      <div className='flex items-center gap-2 px-4 pt-3'>
        <span className='flex h-5 w-5 items-center justify-center rounded-[7px] bg-brand-500 text-[11px] font-bold text-stage-950'>
          ♪
        </span>
        <span className='text-[12px] font-semibold tracking-wide text-white'>QQ音乐</span>
        <span className='rounded-pill border border-brand-500/30 bg-brand-500/10 px-2 py-[2px] text-[10px] text-brand-200'>
          一起去现场
        </span>
        <span className='ml-auto text-[10px] text-white/30'>概念 Demo · 非官方</span>
      </div>
      <div className='mt-1.5 flex items-end gap-3 px-4 pb-2.5'>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[19px] font-semibold leading-tight text-white'>{title}</p>
          {subtitle ? <p className='mt-0.5 truncate text-[11px] text-white/45'>{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  )
}

/** 一级页面共用的胶囊分组按钮（消息过滤 / 同频筛选） */
export function SegmentedTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>
  value: T
  onChange: (next: T) => void
}) {
  return (
    <div className='no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4'>
      {options.map((option) => (
        <button
          key={option.value}
          type='button'
          onClick={() => onChange(option.value)}
          className={cn(
            'shrink-0 rounded-pill border px-3 py-1.5 text-[12px] transition',
            value === option.value
              ? 'border-brand-500/45 bg-brand-500/12 text-brand-100'
              : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white/80',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
