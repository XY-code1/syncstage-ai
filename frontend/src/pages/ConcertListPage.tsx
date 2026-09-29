import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchConcerts } from '../lib/api'
import { messageOf, useSession } from '../store/session'
import type { Concert } from '../types'
import { Avatar } from '../components/Avatar'
import { Poster } from '../components/Poster'
import { Button, Card, DemoBadge, SectionTitle, Skeleton, StateView } from '../components/ui'
import { CalendarIcon, MapPinIcon, MusicIcon, ShieldIcon, SparkleIcon, UsersIcon } from '../components/icons'

const FLOW = [
  { title: '填写偏好', detail: '喜欢哪首歌、想找什么样的同行者' },
  { title: '确认标签', detail: '把你说的话整理成可以匹配的标签' },
  { title: '查看匹配', detail: '3 位候选人，附上具体的匹配理由' },
  { title: '双向确认', detail: '双方都按下确认，房间才会生成' },
  { title: '现场回忆', detail: '散场后留下一张属于这场的回忆卡' },
]

export function ConcertListPage() {
  const navigate = useNavigate()
  const { selectConcert, room, concertId } = useSession()
  const [concerts, setConcerts] = useState<Concert[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await fetchConcerts()
      setConcerts(data)
      setStatus('ready')
    } catch (err) {
      setError(messageOf(err))
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const openConcert = (id: string) => {
    selectConcert(id)
    navigate(`/concert/${id}`)
  }

  return (
    <div className='flex min-h-screen flex-col'>
      <header className='safe-top px-4 pb-2 pt-6'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <span className='flex h-8 w-8 items-center justify-center rounded-xl bg-brand-500/15 text-brand-400'>
              <MusicIcon className='h-4 w-4' />
            </span>
            <span className='text-[15px] font-semibold text-white'>同频现场</span>
          </div>
          <DemoBadge />
        </div>

        <h1 className='mt-5 text-[26px] font-semibold leading-snug text-white'>
          在同场观众里，
          <br />
          找到听同一首歌的人。
        </h1>
        <p className='mt-3 text-[13px] leading-relaxed text-white/55'>
          基于音乐口味、演出期待、社交意愿与安全偏好，匹配同场同行者或 2～4 人临时小组。
          每一条匹配都会说明理由，集合点只选公开区域。
        </p>

        <div className='mt-4 flex flex-wrap gap-1.5'>
          {['音乐口味', '演出期待', '社交意愿', '安全边界'].map((item) => (
            <span
              key={item}
              className='rounded-pill border border-brand-500/25 bg-brand-500/10 px-2.5 py-1 text-[11px] text-brand-200'
            >
              {item}
            </span>
          ))}
        </div>
      </header>

      <main className='flex-1 px-4 pb-14 pt-5'>
        {room && concertId ? (
          <Card className='mb-5 border-brand-500/35 bg-brand-500/8'>
            <div className='flex items-center justify-between gap-3'>
              <div>
                <p className='text-[13px] text-brand-100'>你还有一个进行中的同频房间</p>
                <p className='mt-1 text-[11px] text-white/50'>
                  {room.members.length} 位成员 · 已确认集合点：{room.meetingConfirmed ? '是' : '还没确认'}
                </p>
              </div>
              <Button size='sm' onClick={() => navigate(`/concert/${concertId}/room`)}>
                回到房间
              </Button>
            </div>
          </Card>
        ) : null}

        <SectionTitle
          title='近期演出'
          hint='以下演出、艺人、场地均为虚构的 Demo 数据'
          icon={<SparkleIcon className='h-4 w-4 text-brand-400' />}
        />

        {status === 'loading' ? (
          <div className='flex flex-col gap-4'>
            {[0, 1, 2].map((index) => (
              <div key={index} className='glass-card rounded-card p-3'>
                <Skeleton className='aspect-[16/9] w-full' />
                <Skeleton className='mt-3 h-4 w-2/3' />
                <Skeleton className='mt-2 h-3 w-1/2' />
              </div>
            ))}
          </div>
        ) : null}

        {status === 'error' ? (
          <StateView
            status='error'
            title='演出列表加载失败'
            description={error}
            actionLabel='重新加载'
            onAction={() => void load()}
          />
        ) : null}

        {status === 'ready' && concerts.length === 0 ? (
          <StateView status='empty' title='近期还没有可预约的演出' description='换个时间再来看看。' />
        ) : null}

        {status === 'ready' && concerts.length > 0 ? (
          <div className='flex flex-col gap-4'>
            {concerts.map((concert) => (
              <div key={concert.id} className='glass-card animate-rise overflow-hidden rounded-card p-3'>
                <Poster concert={concert} size='mini' />
                <div className='px-1 pb-1 pt-3'>
                  <div className='flex items-center justify-between gap-2'>
                    <p className='text-[15px] font-semibold text-white'>{concert.title}</p>
                    <span className='rounded-pill border border-brand-500/30 bg-brand-500/12 px-2 py-0.5 text-[10px] text-brand-200'>
                      {concert.ticketStatus}
                    </span>
                  </div>
                  <p className='mt-1 text-[12px] text-white/50'>{concert.artistNote}</p>

                  <div className='mt-3 flex flex-col gap-1.5 text-[12px] text-white/60'>
                    <span className='flex items-center gap-1.5'>
                      <CalendarIcon className='h-3.5 w-3.5 text-brand-400' />
                      {concert.dateLabel}
                    </span>
                    <span className='flex items-center gap-1.5'>
                      <MapPinIcon className='h-3.5 w-3.5 text-brand-400' />
                      {concert.city} · {concert.venue}
                    </span>
                  </div>

                  <div className='mt-3 flex items-center justify-between'>
                    <div className='flex items-center gap-1.5'>
                      <div className='flex -space-x-2'>
                        {['#31c27c', '#61c8ff', '#ffc46b'].map((color, index) => (
                          <Avatar
                            key={color}
                            name={`同${index}`}
                            from={color}
                            to='#0b1116'
                            size={22}
                            className='border border-stage-900'
                          />
                        ))}
                      </div>
                      <span className='text-[11px] text-white/45'>{concert.attendeeCount} 人已标记同频</span>
                    </div>
                    <Button size='sm' onClick={() => openConcert(concert.id)}>
                      看看这场
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className='mt-6'>
          <SectionTitle title='一次同频是怎么发生的' hint='从填写偏好到留下回忆卡，一共五步' />
          <Card className='p-0'>
            {FLOW.map((item, index) => (
              <div
                key={item.title}
                className='flex items-start gap-3 border-b border-white/6 px-4 py-3.5 last:border-b-0'
              >
                <span className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-300'>
                  {index + 1}
                </span>
                <div>
                  <p className='text-[13px] text-white/90'>{item.title}</p>
                  <p className='mt-0.5 text-[11px] text-white/45'>{item.detail}</p>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <div className='mt-6'>
          <SectionTitle title='安全与边界' hint='所有同频都建立在公开、可退出的前提下' />
          <div className='flex flex-col gap-2.5'>
            {[
              { icon: <ShieldIcon className='h-4 w-4 text-brand-400' />, text: '集合点只推荐灯光明亮的公共区域，不涉及任何私人空间' },
              { icon: <UsersIcon className='h-4 w-4 text-brand-400' />, text: '双方确认后才会生成临时房间，任何一方随时可以退出' },
              { icon: <MusicIcon className='h-4 w-4 text-brand-400' />, text: '不做精确位置共享，不涉及登录、支付与真实票务' },
            ].map((item) => (
              <div key={item.text} className='flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/[0.025] px-3.5 py-3'>
                <span className='mt-0.5'>{item.icon}</span>
                <p className='text-[12px] leading-relaxed text-white/60'>{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className='mt-6 text-center text-[11px] leading-relaxed text-white/30'>
          本页面为腾讯音乐高校 AI Hackathon 参赛作品 Demo
          <br />
          所有演出、艺人、用户与互动内容均为虚构，与真实演出及真实用户无关
        </p>
      </main>
    </div>
  )
}
