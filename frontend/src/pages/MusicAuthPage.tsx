import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { QQMusicBar } from '../components/QQMusicBar'
import { Button, Sheet } from '../components/ui'
import { CheckIcon, InfoIcon, ShieldIcon, SparkleIcon } from '../components/icons'
import { cn } from '../lib/cn'
import { AUTHORIZATION_SCOPES } from '../lib/tmeMock'
import { useSession } from '../store/session'
import { useConcertFlow } from '../store/concertFlow'
import type { ScopeMeta } from '../types'

/** 每项授权的详细解释只在 Bottom Sheet 里展开，一级页面保持单屏可读完 */
const EXPLAIN: Record<string, { what: string; why: string; not: string }> = {
  favorite_songs: {
    what: '读取你收藏过的曲目名称与所属专辑。',
    why: '用来计算你和同场观众的重合曲目，推荐理由会直接引用这些歌名。',
    not: '不会展示你的收藏列表，也不会把收藏当作公开信息。',
  },
  top_artists: {
    what: '读取你长期收听的歌手名单。',
    why: '判断长期口味是否接近，避免只靠一首歌就判定同频。',
    not: '不会公开你听的歌单，也不会生成排行榜。',
  },
  recent_plays: {
    what: '读取最近 30 天播放次数较高的曲目。',
    why: '判断你最近在听什么，让候选人的「当下状态」也被考虑。',
    not: '不会记录播放时间点，也不会持续追踪。',
  },
  followed_events: {
    what: '读取你关注的演出场次。',
    why: '确认你和对方是同场观众，这是匹配的硬前提。',
    not: '不会读取票务信息、座位号或订单。',
  },
  playlist_tags: {
    what: '读取你给歌单起的名字与标签。',
    why: '用听歌场景判断氛围是否接近，例如深夜通勤、考研自习室。',
    not: '不会读取歌单内的完整曲目列表。',
  },
}

export function MusicAuthPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { scopes, toggleScope, setScopes, completeAuthorization, dataMode } = useSession()
  const [declined, setDeclined] = useState(false)
  const [explainScope, setExplainScope] = useState<ScopeMeta | null>(null)
  const { flow, patchFlow } = useConcertFlow(concertId)

  if (flow.consentStatus === 'granted' && !location.search.includes('edit=1')) {
    return <Navigate to={`/concert/${concertId}/task`} replace />
  }

  const canContinue = scopes.length > 0
  const detail = explainScope ? EXPLAIN[explainScope.id] : null
  const explainActive = explainScope ? scopes.includes(explainScope.id) : false

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='授权 QQ 音乐画像'
        subtitle='只使用你勾选的模拟数据'
        onBack={() => navigate(`/concert/${concertId}`)}
      />

      <main className='flex-1 px-4 pb-4 pt-4'>
        <h1 className='text-[17px] font-semibold text-white'>选择要授权的音乐数据</h1>
        <p className='mt-1.5 text-[11.5px] leading-relaxed text-white/50'>
          只用于计算同场观众的音乐重合度，不会公开展示。可以只授权其中几项，Agent 会在可用范围内工作。
        </p>

        {declined ? (
          <div className='mt-3 rounded-2xl border border-warm-400/30 bg-warm-400/[0.07] px-3.5 py-3'>
            <p className='text-[12px] text-warm-400'>你已拒绝音乐画像授权，本次匹配不会继续。</p>
            <button type='button' onClick={() => setDeclined(false)} className='mt-1.5 text-[11.5px] text-brand-300'>
              重新选择授权项
            </button>
          </div>
        ) : null}

        <div className='soft-card mt-3 divide-y divide-white/5 overflow-hidden'>
          {AUTHORIZATION_SCOPES.map((scope) => {
            const active = scopes.includes(scope.id)
            return (
              <div key={scope.id} className='flex items-center gap-1 pr-1.5'>
                <button
                  type='button'
                  onClick={() => toggleScope(scope.id)}
                  aria-pressed={active}
                  className='flex min-w-0 flex-1 items-center gap-3 px-3.5 py-3 text-left'
                >
                  <span
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                      active ? 'border-brand-400 bg-brand-500 text-stage-950' : 'border-white/20',
                    )}
                  >
                    {active ? <CheckIcon className='h-3.5 w-3.5' /> : null}
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className={cn('block text-[13.5px]', active ? 'text-white' : 'text-white/70')}>{scope.label}</span>
                    <span className='mt-0.5 block truncate text-[10.5px] text-white/40'>{scope.detail}</span>
                  </span>
                </button>
                <button
                  type='button'
                  onClick={() => setExplainScope(scope)}
                  aria-label={`查看 ${scope.label} 的授权说明`}
                  className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/40 transition hover:text-white'
                >
                  <InfoIcon className='h-4 w-4' />
                </button>
              </div>
            )
          })}
        </div>

        <div className='mt-2 flex items-center justify-between px-0.5'>
          <button
            type='button'
            onClick={() => setScopes(AUTHORIZATION_SCOPES.map((scope) => scope.id))}
            className='text-[11.5px] text-brand-300'
          >
            全部授权
          </button>
          <span className='text-[11px] text-white/35'>已选 {scopes.length}/{AUTHORIZATION_SCOPES.length}</span>
          <button type='button' onClick={() => setScopes([])} className='text-[11.5px] text-white/45'>
            全部取消
          </button>
        </div>

        <div className='mt-3 flex items-start gap-2.5 rounded-2xl border border-white/8 bg-white/[0.02] px-3.5 py-3'>
          <ShieldIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-400' />
          <p className='text-[11px] leading-relaxed text-white/50'>
            仅用于本场匹配，活动结束后自动失效，随时可以回到本页取消。当前数据源：
            {dataMode === 'backend' ? '本地后端 Agent（脱敏 Demo 数据）' : '前端本地 Demo 数据'}。
          </p>
        </div>
      </main>

      <footer className='safe-bottom sticky bottom-0 z-30 border-t border-white/8 bg-stage-950/94 px-4 pt-3 backdrop-blur-xl'>
        <Button
          size='lg'
          full
          disabled={!canContinue}
          icon={<SparkleIcon className='h-4 w-4' />}
          onClick={() => {
            completeAuthorization()
            patchFlow({ consentStatus: 'granted', consentScopes: scopes })
            navigate(`/concert/${concertId}/task`)
          }}
        >
          授权并继续
        </Button>
        <Button
          variant='ghost'
          size='sm'
          full
          onClick={() => {
            setScopes([])
            setDeclined(true)
            patchFlow({ consentStatus: 'declined', consentScopes: [] })
          }}
        >
          暂不授权
        </Button>
        <p className='pb-1 pt-1 text-center text-[10.5px] text-white/40'>
          {canContinue ? '不涉及登录、支付与真实票务' : '至少授权一项音乐数据才能继续'}
        </p>
      </footer>

      <Sheet
        open={Boolean(explainScope)}
        onClose={() => setExplainScope(null)}
        title={explainScope?.label ?? ''}
        description={explainScope?.detail}
      >
        {detail ? (
          <div className='space-y-3'>
            <div className='soft-card p-3'>
              <p className='text-[11px] text-brand-300'>读取什么</p>
              <p className='mt-1 text-[12px] leading-relaxed text-white/75'>{detail.what}</p>
            </div>
            <div className='soft-card p-3'>
              <p className='text-[11px] text-brand-300'>用来做什么</p>
              <p className='mt-1 text-[12px] leading-relaxed text-white/75'>{detail.why}</p>
            </div>
            <div className='soft-card p-3'>
              <p className='text-[11px] text-warm-400'>不会做什么</p>
              <p className='mt-1 text-[12px] leading-relaxed text-white/75'>{detail.not}</p>
            </div>
            <p className='text-[11px] text-white/40'>例如：{explainScope?.example}</p>
            <Button
              full
              variant={explainActive ? 'secondary' : 'primary'}
              onClick={() => {
                if (explainScope) toggleScope(explainScope.id)
                setExplainScope(null)
              }}
            >
              {explainActive ? '取消这一项授权' : '授权这一项'}
            </Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
