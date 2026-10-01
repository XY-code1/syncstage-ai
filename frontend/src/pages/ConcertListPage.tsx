import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QQMusicBar } from '../components/QQMusicBar'
import { Sheet, Skeleton, StateView } from '../components/ui'
import { CalendarIcon, MapPinIcon, UsersIcon } from '../components/icons'
import { fetchConcerts } from '../lib/api'
import { messageOf, useSession } from '../store/session'
import type { Concert } from '../types'

/** 二级页面：全部演出。首页只放最近两场，完整清单放在这里。 */
export function ConcertListPage() {
  const navigate = useNavigate()
  const { selectConcert, room, concertId } = useSession()
  const [concerts, setConcerts] = useState<Concert[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      setConcerts(await fetchConcerts())
      setStatus('ready')
    } catch (err) {
      setError(messageOf(err))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='演出'
        subtitle='选择一场演出，开始一次安全组队'
        onBack={() => navigate(-1)}
        right={
          <button type='button' onClick={() => setInfoOpen(true)} className='min-h-11 px-1 text-[12px] text-white/55'>
            说明
          </button>
        }
      />

      <main className='flex-1 px-4 pb-8 pt-4'>
        {room && concertId ? (
          <button
            type='button'
            onClick={() => navigate(`/concert/${concertId}/room`)}
            className='soft-card mb-3 flex w-full items-center gap-3 p-3 text-left'
          >
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-300'>
              <UsersIcon className='h-5 w-5' />
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block truncate text-[12.5px] font-semibold text-white'>{room.concertTitle}</span>
              <span className='block text-[10.5px] text-white/45'>临时同频房间进行中</span>
            </span>
            <span className='flex h-8 shrink-0 items-center rounded-xl bg-brand-500 px-3 text-[11.5px] font-semibold text-stage-950'>
              继续
            </span>
          </button>
        ) : null}

        {status === 'loading' ? (
          <div className='flex flex-col gap-2.5'>
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className='h-[78px] w-full' />
            ))}
          </div>
        ) : null}

        {status === 'error' ? (
          <StateView
            status='error'
            title='演出加载失败'
            description={error}
            actionLabel='重新加载'
            onAction={() => void load()}
          />
        ) : null}

        {status === 'ready' && concerts.length === 0 ? <StateView status='empty' title='近期没有演出' /> : null}

        {status === 'ready' && concerts.length > 0 ? (
          <div className='flex flex-col gap-2.5'>
            {concerts.map((concert) => (
              <button
                key={concert.id}
                type='button'
                onClick={() => {
                  selectConcert(concert.id)
                  navigate(`/concert/${concert.id}`)
                }}
                className='soft-card flex items-center gap-3 p-3 text-left'
              >
                <span
                  className='h-[56px] w-[56px] shrink-0 rounded-xl'
                  style={{
                    background: `linear-gradient(150deg, ${concert.poster.from}, ${concert.poster.via} 55%, ${concert.poster.to})`,
                  }}
                />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-[13.5px] font-semibold text-white'>{concert.title}</span>
                  <span className='block truncate text-[11px] text-white/45'>{concert.artist}</span>
                  <span className='mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-white/35'>
                    <span className='flex items-center gap-1'>
                      <CalendarIcon className='h-3 w-3' />
                      {concert.dateLabel}
                    </span>
                    <span className='flex items-center gap-1'>
                      <MapPinIcon className='h-3 w-3' />
                      {concert.city}
                    </span>
                    <span className='flex items-center gap-1 text-brand-300/80'>
                      <UsersIcon className='h-3 w-3' />
                      {concert.attendeeCount} 人
                    </span>
                  </span>
                </span>
                <span className='shrink-0 rounded-pill border border-white/10 px-2 py-0.5 text-[10px] text-white/45'>
                  {concert.ticketStatus}
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </main>

      <Sheet
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title='一起去现场'
        description='QQ音乐演出场景下的 AI 同频同行助手'
      >
        <div className='space-y-3 text-[12px] leading-relaxed text-white/65'>
          <p>选择演出后，授权脱敏音乐画像，给同行 Agent 一个任务；Agent 会检索同场候选人、执行安全过滤并生成可核验的理由。</p>
          <p>Agent 之间只交换匿名结构化条件；双方真人确认后，才会创建限时临时房间。</p>
          <p className='rounded-xl border border-warm-400/20 bg-warm-400/[0.06] p-3 text-warm-400'>
            本作品为参赛概念 Demo，当前使用模拟数据，未调用 QQ 音乐官方内部 API。
          </p>
        </div>
      </Sheet>
    </div>
  )
}
