import { useNavigate } from 'react-router-dom'
import { TabHeader } from '../components/TabLayout'
import { UserAvatar } from '../components/UserAvatar'
import {
  ChevronRightIcon,
  EditIcon,
  LockIcon,
  MusicIcon,
  SettingsIcon,
  TicketIcon,
  UsersIcon,
} from '../components/icons'
import { getMusicProfile, DEMO_VIEWER, SCOPE_LABELS } from '../lib/tmeMock'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { useSocial } from '../store/social'

/** 演示访客的累计数据，仅用于 Demo 展示 */
const DEMO_STATS = { shows: 14, matches: 6, friends: 4 }

/** 菜单固定六项：Agent 设置已并入「设置」，不在个人主页单列 */
const ENTRIES = [
  { to: '/me/edit', label: '编辑资料', hint: '头像、昵称、生日与可见性', Icon: EditIcon },
  { to: '/me/shows', label: '我的演出', hint: '已关注与待观演', Icon: TicketIcon },
  { to: '/me/friends', label: '同频好友', hint: '一起看过演出的人', Icon: UsersIcon },
  { to: '/me/music', label: '音乐画像与授权', hint: '随时可以取消授权', Icon: MusicIcon },
  { to: '/me/privacy', label: '隐私与安全', hint: '硬条件与数据边界', Icon: LockIcon },
  { to: '/me/settings', label: '设置', hint: '数据源、Agent 与演示数据', Icon: SettingsIcon },
]

export function ProfilePage() {
  const navigate = useNavigate()
  const { scopes, authorized, room, agent } = useSession()
  const { threads } = useSocial()
  const { profile: userProfile, age, genderLabel } = useProfile()

  const profile = getMusicProfile(DEMO_VIEWER.userId, scopes)
  const artists = profile?.topArtists.slice(0, 2) ?? []

  const friends = threads.filter((thread) => thread.kind === 'dm').length + DEMO_STATS.friends

  const stats = [
    { label: '演出', value: DEMO_STATS.shows + (room ? 1 : 0) },
    { label: '匹配', value: DEMO_STATS.matches + (agent ? 1 : 0) },
    { label: '同频好友', value: friends },
  ]

  return (
    <div className='tab-page'>
      <TabHeader title='我的' subtitle='音乐画像、演出与同频关系' />

      <div className='px-4 pt-4'>
        {/* 头像与昵称是这一页的视觉核心 */}
        <div className='flex items-center gap-3.5'>
          <UserAvatar size={64} showRing />
          <div className='min-w-0 flex-1'>
            <p className='truncate text-[18px] font-semibold text-ink-100'>{userProfile.nickname}</p>
            <p className='mt-0.5 text-[12.5px] text-ink-400'>
              {[age !== null ? `${age} 岁` : null, genderLabel, userProfile.city].filter(Boolean).join(' · ')}
            </p>
            <p className='mt-1 truncate text-[12.5px] text-ink-400/90'>{userProfile.signature || '还没有个性签名'}</p>
          </div>
          <button
            type='button'
            onClick={() => navigate('/me/edit')}
            className='flex min-h-[44px] shrink-0 items-center gap-1 rounded-pill border border-white/12 px-3 text-[12.5px] text-ink-400'
          >
            <EditIcon className='h-3.5 w-3.5' />
            编辑资料
          </button>
        </div>

        <div className='soft-card mt-2.5 flex divide-x divide-white/6'>
          {stats.map((stat) => (
            <div key={stat.label} className='flex flex-1 flex-col items-center py-3'>
              <span className='text-[17px] font-semibold text-ink-100'>{stat.value}</span>
              <span className='mt-0.5 text-[11.5px] text-ink-400'>{stat.label}</span>
            </div>
          ))}
        </div>

        {/* 音乐画像：一条状态卡，点进去才是独立授权页，不再用巨大的绿色按钮占位 */}
        <button
          type='button'
          onClick={() => navigate('/me/music')}
          className='soft-card mt-2.5 flex min-h-[56px] w-full items-center gap-3 px-3.5 py-3 text-left'
        >
          <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300'>
            <MusicIcon className='h-4 w-4' />
          </span>
          <span className='min-w-0 flex-1'>
            <span className='block text-[14px] text-ink-100'>音乐画像</span>
            <span className='block truncate text-[12px] text-ink-400'>
              {authorized
                ? `已授权 ${scopes.length} 项 · ${artists.length ? `常听 ${artists.join('、')}` : SCOPE_LABELS[scopes[0]]}`
                : '未授权，Agent 无法生成可验证的同频证据'}
            </span>
          </span>
          <span
            className={
              authorized
                ? 'shrink-0 rounded-pill border border-brand-500/40 bg-brand-500/10 px-2 py-0.5 text-[11.5px] text-brand-200'
                : 'shrink-0 rounded-pill border border-white/12 px-2 py-0.5 text-[11.5px] text-ink-400'
            }
          >
            {authorized ? `已授权 ${scopes.length} 项` : '未授权'}
          </span>
          <ChevronRightIcon className='h-4 w-4 shrink-0 text-ink-400' />
        </button>

        <div className='soft-card mt-2.5 divide-y divide-white/6 overflow-hidden'>
          {ENTRIES.map((entry) => (
            <button
              key={entry.to}
              type='button'
              onClick={() => navigate(entry.to)}
              className='flex min-h-[56px] w-full items-center gap-3 px-3.5 py-2.5 text-left'
            >
              <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-ink-400'>
                <entry.Icon className='h-4 w-4' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-[14px] text-ink-100'>{entry.label}</span>
                <span className='block text-[12px] text-ink-400'>{entry.hint}</span>
              </span>
              <ChevronRightIcon className='h-4 w-4 shrink-0 text-ink-400' />
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
