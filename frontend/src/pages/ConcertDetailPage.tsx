import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, Skeleton, StateView } from '../components/ui'
import { QQMusicBar } from '../components/QQMusicBar'
import { ClockIcon, MapPinIcon, MusicIcon, SparkleIcon } from '../components/icons'
import { fetchConcert } from '../lib/api'
import { messageOf, useSession } from '../store/session'
import type { Concert } from '../types'
import { useMusicPlayer } from '../components/music/DemoMusicPlayer'
import { QQMusicAuthorizationSheet } from '../components/QQMusicAuthorizationSheet'
import { useQQMusicAuth } from '../store/qqMusicAuth'

/** 把 2026-10-18 19:30 压成演出页要用的「10月18日 19:30」。 */
function shortDateTime(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/)
  if (!match) return value
  return `${Number(match[2])}月${Number(match[3])}日 ${match[4]}`
}

/** 只保留「声浪 Livehouse」这一级场地名，去掉「静安店」这类门店后缀。 */
function shortVenue(value: string): string {
  const trimmed = value.replace(/\s*[^\s]*店\s*$/, '').trim()
  return trimmed || value
}

/**
 * 主视觉卡：全幅 Livehouse 现场感背景 + 底部深色渐变遮罩，全页只有这一个大标题。
 * 背景图加载失败时才退回原有的蓝绿渐变，保证任何情况下都有可读的封面。
 */
function ConcertHero({ concert }: { concert: Concert }) {
  const [imageFailed, setImageFailed] = useState(false)
  const { poster } = concert

  return (
    <div
      data-concert-hero
      className='relative aspect-[4/5] max-h-[62vh] w-full overflow-hidden'
      style={
        imageFailed
          ? { backgroundImage: `linear-gradient(148deg, ${poster.from} 0%, ${poster.via} 48%, ${poster.to} 100%)` }
          : undefined
      }
    >
      {imageFailed ? (
        <div className='poster-grain absolute inset-0 opacity-70' />
      ) : (
        <>
          <img
            data-concert-hero-image
            src={`${import.meta.env.BASE_URL}concert-crowd-bg.png`}
            alt=''
            aria-hidden='true'
            onError={() => setImageFailed(true)}
            className='absolute inset-0 h-full w-full object-cover object-bottom brightness-[1.12]'
          />
          <div className='poster-grain absolute inset-0 opacity-35' />
        </>
      )}
      {/* 深色渐变遮罩：顶部压住顶栏，底部保证标题对比度，中间保留现场灯光 */}
      <div className='absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-stage-950/85 to-transparent' />
      <div className='absolute inset-0 bg-gradient-to-t from-stage-950 via-stage-950/40 to-transparent' />
      <div className='absolute inset-x-0 bottom-0 p-5'>
        <h1 className='text-[30px] font-black leading-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.8)]'>
          {concert.title}
        </h1>
      </div>
    </div>
  )
}

export function ConcertDetailPage() {
  const { concertId = 'night-voyage' } = useParams()
  const navigate = useNavigate()
  const player = useMusicPlayer()
  const { selectConcert, agent, room, startNewMatch } = useSession()
  const { qqMusicUser } = useQQMusicAuth()
  const [authorizationOpen, setAuthorizationOpen] = useState(false)
  const [concert, setConcert] = useState<Concert | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await fetchConcert(concertId)
      setConcert(data)
      setStatus('ready')
      selectConcert(data.id)
    } catch (err) {
      setError(messageOf(err))
      setStatus('error')
    }
  }, [concertId, selectConcert])

  useEffect(() => {
    void load()
  }, [load])

  // 只有会话未终结（未撤回 / 拒绝 / 过期）时才「回到同行方案」，否则从任务确认重新开始。
  // 主产品链路只有一条：演出入口始终进入选歌，不再回到旧匹配列表。
  const entryTarget = `/concert/${concertId}/select-song`

  /**
   * 主按钮：用这一次真实点击解锁浏览器音频（iPhone Safari 要求），
   * 同步播放入口音乐（send-location.mp3，15% 音量、800ms 淡入），然后进入匹配流程。
   */
  const enterNightFlight = () => {
    player.unlock()
    void player.playCue('entry')
    if (agent) startNewMatch()
    if (!qqMusicUser.authorized) {
      setAuthorizationOpen(true)
      return
    }
    navigate(entryTarget)
  }

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar title={concert ? concert.title : '演出详情'} onBack={() => navigate(-1)} />

      <main className='flex-1 pb-14'>
        {status === 'loading' ? (
          <div className='flex flex-col gap-4 px-4 pt-4'>
            <Skeleton className='aspect-[4/5] w-full' />
            <Skeleton className='h-24 w-full' />
            <Skeleton className='h-28 w-full' />
          </div>
        ) : null}

        {status === 'error' ? (
          <div className='px-4 pt-4'>
            <StateView
              status='error'
              title='演出信息加载失败'
              description={error}
              actionLabel='重新加载'
              onAction={() => void load()}
              secondaryLabel='返回首页'
              onSecondary={() => navigate('/')}
            />
          </div>
        ) : null}

        {status === 'ready' && concert ? (
          <div className='flex flex-col gap-5'>
            <ConcertHero concert={concert} />

            <dl className='mx-4 flex flex-col gap-2.5 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3.5'>
              <div className='flex items-center gap-2.5'>
                <MusicIcon className='h-4 w-4 shrink-0 text-brand-300' />
                <dd className='text-[14px] text-white/85'>
                  {concert.artist} · {concert.city}站
                </dd>
              </div>
              <div className='flex items-center gap-2.5'>
                <ClockIcon className='h-4 w-4 shrink-0 text-brand-300' />
                <dd className='text-[14px] text-white/85'>{shortDateTime(concert.date)}</dd>
              </div>
              <div className='flex items-center gap-2.5'>
                <MapPinIcon className='h-4 w-4 shrink-0 text-brand-300' />
                <dd className='text-[14px] text-white/85'>{shortVenue(concert.venue)}</dd>
              </div>
            </dl>

            {/* Agent 入口：只保留一句话说明和唯一主按钮 */}
            <Card className='mx-4 border-brand-500/35 bg-brand-500/[0.07]' glow>
              <div className='flex items-start gap-3'>
                <span className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-500/18'>
                  <SparkleIcon className='h-5 w-5 text-brand-300' />
                </span>
                <p className='text-[15px] leading-relaxed text-white/85'>
                  选一首今晚的歌，Tara会先替你找到同场、同频且安全边界一致的人。
                </p>
              </div>
              <Button
                className='mt-4'
                full
                size='lg'
                icon={<SparkleIcon className='h-4 w-4' />}
                onClick={enterNightFlight}
              >
                寻找同频观众
              </Button>
            </Card>

            {room ? (
              <Card className='mx-4 border-brand-500/35 bg-brand-500/8'>
                <p className='text-[13px] text-brand-100'>你已经在这场演出有一个临时同频房间</p>
                <Button size='sm' className='mt-3' onClick={() => navigate(`/concert/${concertId}/room`)}>
                  回到同频房间
                </Button>
              </Card>
            ) : null}
          </div>
        ) : null}
      </main>
      <QQMusicAuthorizationSheet open={authorizationOpen} onClose={() => setAuthorizationOpen(false)} onAuthorized={() => { setAuthorizationOpen(false); navigate(`/concert/${concertId}/select-song`) }} />
    </div>
  )
}
