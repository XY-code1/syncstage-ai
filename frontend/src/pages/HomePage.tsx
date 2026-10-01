import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TabHeader } from '../components/TabLayout'
import { MyProfileAvatar } from '../components/UserAvatar'
import { CalendarIcon, ChevronRightIcon, ClockIcon, MapPinIcon, SparkleIcon, UsersIcon } from '../components/icons'
import { Skeleton } from '../components/ui'
import { fetchConcerts } from '../lib/api'
import { SCOPE_LABELS } from '../lib/tmeMock'
import { useSession } from '../store/session'
import type { Concert } from '../types'

export function HomePage() {
  const navigate = useNavigate()
  const { agent, room, authorized, scopes } = useSession()
  const [concerts, setConcerts] = useState<Concert[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setConcerts((await fetchConcerts()).slice(0, 2))
    } catch {
      setConcerts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const hasPlan = Boolean(agent && agent.rankedCandidates.length > 0)
  const primaryConcert = concerts[0]

  return (
    <div className='tab-page'>
      <TabHeader
        title='一起去现场'
        subtitle='开场之前，先找到同频的人'
        aura
        right={<MyProfileAvatar size={32} />}
      />

      <div className='px-4 pt-4'>
        {/* 当前状态：一个卡片讲清楚下一步，而不是把全部流程铺开 */}
        {room ? (
          <button
            type='button'
            onClick={() => navigate(`/concert/${room.concertId}/room`)}
            className='soft-card glow-confirmed flex w-full items-center gap-3 p-3.5 text-left'
          >
            <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-300'>
              <UsersIcon className='h-5 w-5' />
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block text-[14px] font-semibold text-ink-100'>临时同频房间进行中</span>
              <span className='mt-0.5 block truncate text-[12.5px] text-ink-400'>
                {room.concertTitle} · {room.members.length} 位成员
              </span>
            </span>
            <span className='flex h-9 shrink-0 items-center rounded-xl bg-brand-500 px-3.5 text-[13px] font-semibold text-stage-950'>
              进入
            </span>
          </button>
        ) : hasPlan ? (
          <button
            type='button'
            onClick={() => navigate(`/concert/${agent?.eventId ?? 'night-flight'}/matches`)}
            className='soft-card flex w-full items-center gap-3 p-3.5 text-left'
          >
            <span className='flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-300'>
              <SparkleIcon className='h-5 w-5' />
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block text-[14px] font-semibold text-ink-100'>同频匹配结果已就绪</span>
              <span className='mt-0.5 block text-[12.5px] text-ink-400'>
                {agent?.rankedCandidates.length} 位同频候选人 · Top Match {agent?.rankedCandidates[0]?.score}%
              </span>
            </span>
            <ChevronRightIcon className='h-4 w-4 shrink-0 text-ink-400' />
          </button>
        ) : (
          /* Agent 入口：一句话说明 + 一个绿色主按钮，不在首页解释完整流程 */
          <div className='soft-card raised-card p-3.5'>
            <div className='flex items-center gap-3'>
              <span className='glow-agent flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-300'>
                <SparkleIcon className='h-5 w-5' />
              </span>
              <p className='min-w-0 flex-1 text-[14px] leading-relaxed text-ink-100'>
                告诉 Agent 你想和怎样的人一起去现场
              </p>
            </div>
            <button
              type='button'
              disabled={!primaryConcert}
              onClick={() => navigate(primaryConcert ? `/concert/${primaryConcert.id}` : '/concerts')}
              className='glow-cta mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-500 text-[14px] font-semibold text-stage-950 transition active:scale-[0.99] disabled:opacity-45'
            >
              <SparkleIcon className='h-4 w-4' />
              找同频搭子
            </button>
            <p className='mt-2 text-center text-[12px] text-ink-400'>
              {authorized
                ? `音乐画像已授权 ${scopes.length} 项 · ${scopes.map((scope) => SCOPE_LABELS[scope]).slice(0, 2).join('、')}…`
                : '音乐画像：未授权（第一次使用时授权）'}
            </p>
          </div>
        )}

        {/* 演出：一级页面只放最近两场，其余进二级演出列表 */}
        <div className='mt-5 flex items-baseline justify-between'>
          <h2 className='text-[15px] font-semibold text-ink-100'>正在匹配的演出</h2>
          <button
            type='button'
            onClick={() => navigate('/concerts')}
            className='flex h-11 min-w-11 items-center justify-end px-1 text-[13px] text-ink-400'
          >
            全部演出
          </button>
        </div>

        <div className='mt-2.5 flex flex-col gap-2.5'>
          {loading
            ? [0, 1].map((key) => <Skeleton key={key} className='h-[76px] w-full' />)
            : concerts.map((concert) => (
                <button
                  key={concert.id}
                  type='button'
                  onClick={() => navigate(`/concert/${concert.id}`)}
                  className='soft-card flex w-full items-center gap-3 p-2.5 text-left transition active:scale-[0.995]'
                >
                  <ConcertArt concert={concert} />
                  <span className='min-w-0 flex-1'>
                    <span className='block truncate text-[14px] font-semibold text-ink-100'>{concert.title}</span>
                    <span className='mt-1.5 flex items-center gap-2.5 text-[12.5px] text-ink-400'>
                      <span className='flex items-center gap-1'>
                        <CalendarIcon className='h-3.5 w-3.5' />
                        {concert.dateLabel.replace(/^.+(周.)/, '$1')}
                      </span>
                      <span className='flex items-center gap-1'>
                        <MapPinIcon className='h-3.5 w-3.5' />
                        {concert.city}
                      </span>
                    </span>
                  </span>
                  <span className='flex shrink-0 items-center gap-1.5'>
                    <span className='rounded-pill border border-white/12 px-2 py-0.5 text-[11px] text-ink-400'>
                      {concert.ticketStatus}
                    </span>
                    <ChevronRightIcon className='h-4 w-4 text-ink-400' />
                  </span>
                </button>
              ))}
        </div>

        {/* 快捷入口：三个，不再堆卡片 */}
        <div className='mt-4 grid grid-cols-3 gap-2.5'>
          <QuickEntry label='同频广场' hint='看人优先' onClick={() => navigate('/sync')} />
          <QuickEntry label='消息中心' hint='房间与通知' onClick={() => navigate('/messages')} />
          <QuickEntry label='我的演出' hint='已确认计划' onClick={() => navigate('/me/shows')} />
        </div>

        <p className='mt-5 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-400/80'>
          <ClockIcon className='h-3 w-3' />
          {authorized ? `本场授权 ${scopes.length} 项，活动结束后自动失效` : '参赛概念 Demo · 使用虚构数据'}
        </p>
      </div>
    </div>
  )
}

/**
 * 演出封面：用每场演出自己的配色做抽象音乐视觉（唱盘 + 声波 + 舞台光），
 * 不再用两块几乎一样的纯色方块。
 */
function ConcertArt({ concert }: { concert: Concert }) {
  const { poster } = concert
  return (
    <span
      className='relative h-[58px] w-[58px] shrink-0 overflow-hidden rounded-[14px]'
      style={{
        backgroundImage:
          `radial-gradient(120% 110% at 18% 4%, ${poster.accent} 0%, ${poster.accent}00 62%),` +
          `linear-gradient(140deg, ${poster.from} 0%, ${poster.to} 100%)`,
      }}
      aria-hidden='true'
    >
      {/* 舞台灯光 */}
      <span
        className='absolute -left-5 -top-6 h-14 w-14 rounded-full opacity-70 blur-xl'
        style={{ background: poster.accent }}
      />
      {/* 用演出自己的强调色拉开两张封面的差异（不是同一块纯色方块） */}
      <span className='absolute inset-0 bg-gradient-to-t from-stage-950/45 to-transparent' />
      {/* 声波 */}
      <span className='absolute bottom-2 left-2 flex items-end gap-[2px]'>
        {[5, 9, 13, 8, 4].map((height, index) => (
          <span
            key={index}
            className='w-[2px] rounded-full'
            style={{ height, background: poster.accent, opacity: 0.65 + (index % 3) * 0.12 }}
          />
        ))}
      </span>
      {/* 唱片 */}
      <span className='absolute -bottom-3 -right-3 h-11 w-11 rounded-full bg-black/45 ring-1 ring-white/25'>
        <span
          className='absolute left-1/2 top-1/2 h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full'
          style={{ background: poster.accent }}
        />
      </span>
    </span>
  )
}

function QuickEntry({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button type='button' onClick={onClick} className='soft-card flex min-h-[64px] flex-col items-start gap-1 p-3 text-left'>
      <span className='text-[13px] font-medium text-ink-100'>{label}</span>
      <span className='text-[11.5px] text-ink-400'>{hint}</span>
    </button>
  )
}
