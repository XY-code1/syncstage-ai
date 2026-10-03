import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { Poster } from '../components/Poster'
import { QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, Skeleton, StateView } from '../components/ui'
import {
  SparkleIcon,
} from '../components/icons'
import { fetchConcert } from '../lib/api'
import { messageOf, useSession } from '../store/session'
import { ALL_SCOPES } from '../lib/tmeMock'
import type { Concert } from '../types'
import { useConcertFlow } from '../store/concertFlow'

const AGENT_FLOW = ['授权 QQ 音乐画像', '说出同行需求', 'Agent 检索与排序', '查看音乐证据', '双方确认后进房间']

export function ConcertDetailPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { selectConcert, authorized, scopes, agent, room, judgeMode, matchResumable, startNewMatch } = useSession()
  const { flow } = useConcertFlow(concertId)
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
  const entryLabel = matchResumable ? '回到同行方案' : authorized ? '继续 AI找同行' : 'AI找同行'
  const entryTarget = matchResumable ? `/concert/${concertId}/matches` : (authorized || flow.consentStatus === 'granted') ? `/concert/${concertId}/task` : `/concert/${concertId}/authorize`

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title={concert ? concert.title : '演出详情'}
        subtitle={concert ? concert.subtitle : undefined}
        onBack={() => navigate(-1)}
        right={<span className='text-[11px] text-white/45'>演出</span>}
      />

      <main className='flex-1 px-4 pb-14 pt-4'>
        {status === 'loading' ? (
          <div className='flex flex-col gap-4'>
            <Skeleton className='aspect-[4/3] w-full' />
            <Skeleton className='h-5 w-2/3' />
            <Skeleton className='h-3 w-1/2' />
            <Skeleton className='h-28 w-full' />
            <Skeleton className='h-20 w-full' />
          </div>
        ) : null}

        {status === 'error' ? (
          <StateView
            status='error'
            title='演出信息加载失败'
            description={error}
            actionLabel='重新加载'
            onAction={() => void load()}
            secondaryLabel='返回首页'
            onSecondary={() => navigate('/')}
          />
        ) : null}

        {status === 'ready' && concert ? (
          <div className='flex flex-col gap-5'>
            <Poster concert={concert} />

            <div>
              <div className='flex items-start justify-between gap-3'>
                <div>
                  <h1 className='text-[22px] font-semibold leading-tight text-white'>{concert.title}</h1>
                  <p className='mt-1.5 text-[13px] text-white/60'>{concert.artist}</p>
                  <p className='mt-0.5 text-[11px] text-white/40'>{concert.artistNote}</p>
                </div>
                <span className='shrink-0 rounded-pill border border-brand-500/30 bg-brand-500/12 px-2.5 py-1 text-[11px] text-brand-200'>
                  {concert.ticketStatus}
                </span>
              </div>

              <div className='mt-4 flex items-center gap-2 rounded-2xl border border-white/8 bg-white/[0.025] px-3.5 py-2.5'>
                <div className='flex -space-x-2'>
                  {['#31c27c', '#61c8ff', '#ffc46b', '#9b8cff'].map((color, index) => (
                    <Avatar key={color} name={`同${index}`} from={color} to='#0b1116' size={24} className='border border-stage-950' />
                  ))}
                </div>
                <p className='text-[12px] text-white/55'>
                  已有 <span className='font-semibold text-brand-300'>128</span> 位同场听众开启匹配
                </p>
              </div>
            </div>

            {/* Agent 入口 */}
            <Card className='border-brand-500/35 bg-brand-500/[0.07]' glow>
              <div className='flex items-start gap-3'>
                <span className='mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-500/18'>
                  <SparkleIcon className='h-5 w-5 text-brand-300' />
                </span>
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-2'>
                    <p className='text-base font-semibold text-white'>QQ音乐「一起去现场」</p>
                    <span className='rounded-pill border border-brand-500/40 bg-brand-500/12 px-2 py-[1px] text-[10px] text-brand-200'>
                      面向独自观演用户的 AI 同行组队 Agent
                    </span>
                  </div>
                  <p className='mt-1.5 text-sm leading-relaxed text-white/65'>
                    AI同频同行助手 · 在开场之前，找到和你同频的人。授权模拟音乐画像，Agent 会调用同场检索、安全过滤、排序与解释工具，给出<span className='text-brand-200'>可追溯到音乐数据</span>的理由。
                  </p>
                  <div className='mt-3 flex flex-wrap gap-1.5'>
                    {AGENT_FLOW.map((step, index) => (
                      <span
                        key={step}
                        className='rounded-pill border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/55'
                      >
                        {index + 1}. {step}
                      </span>
                    ))}
                  </div>
                  <Button
                    className='mt-3.5'
                    full
                    size='lg'
                    icon={<SparkleIcon className='h-4 w-4' />}
                    onClick={() => {
                      if (!matchResumable && agent) startNewMatch()
                      navigate(entryTarget)
                    }}
                  >
                    {entryLabel}
                  </Button>
                  <p className='mt-2 text-center text-[11px] text-white/40'>
                    {authorized ? `已授权 ${scopes.length}/${ALL_SCOPES.length} 类音乐数据 · 随时可以取消` : '第一次使用需要先授权音乐数据'}
                    {judgeMode ? ' · 评委模式已开启' : ''}
                  </p>
                </div>
              </div>
            </Card>

            {room ? (
              <Card className='border-brand-500/35 bg-brand-500/8'>
                <p className='text-[13px] text-brand-100'>你已经在这场演出有一个临时同频房间</p>
                <Button size='sm' className='mt-3' onClick={() => navigate(`/concert/${concertId}/room`)}>
                  回到同频房间
                </Button>
              </Card>
            ) : null}

          </div>
        ) : null}
      </main>
    </div>
  )
}
