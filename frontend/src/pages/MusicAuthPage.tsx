import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MockNotice, QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, SectionTitle } from '../components/ui'
import { CheckIcon, ShieldIcon, SparkleIcon } from '../components/icons'
import { cn } from '../lib/cn'
import { AUTHORIZATION_SCOPES, DEMO_VIEWER, getMusicProfile } from '../lib/tmeMock'
import { useSession } from '../store/session'


export function MusicAuthPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { scopes, toggleScope, setScopes, completeAuthorization, dataMode } = useSession()
  const [declined, setDeclined] = useState(false)

  const preview = getMusicProfile(DEMO_VIEWER.userId, scopes.length ? scopes : [])

  const granted = scopes.length
  const canContinue = granted > 0

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar title='授权 QQ 音乐画像' subtitle='一起去现场 · 仅使用你同意的模拟数据' onBack={() => navigate(`/concert/${concertId}`)} />

      <main className='flex-1 px-4 pb-40 pt-4'>
        <div className='flex flex-col gap-4'>
          {declined ? (
            <Card className='border-warm-400/35 bg-warm-400/[0.07]'>
              <SectionTitle title='你已拒绝音乐画像授权' hint='Agent 不会读取或推断未授权的音乐数据' />
              <p className='text-[12px] leading-relaxed text-white/60'>
                没有音乐画像时无法生成可验证的同频证据，本次匹配不会继续。你可以重新选择授权项，或安全返回演出详情页。
              </p>
              <div className='mt-3 flex gap-2'>
                <Button size='sm' variant='secondary' full onClick={() => setDeclined(false)}>重新选择</Button>
                <Button size='sm' variant='ghost' full onClick={() => navigate(`/concert/${concertId}`)}>返回演出详情</Button>
              </div>
            </Card>
          ) : null}

          <div>
            <h1 className='text-[19px] font-semibold text-white'>选择要授权的音乐数据</h1>
            <p className='mt-2 text-[12px] leading-relaxed text-white/55'>
              「一起去现场」只会用这些数据计算你和同场观众的音乐重合度，不会公开展示你的收藏、歌单或任何身份信息。
              你可以只授权其中几项，Agent 会在可用数据范围内工作。
            </p>
          </div>

          <MockNotice />

          <div className='flex flex-col gap-2.5'>
            {AUTHORIZATION_SCOPES.map((scope) => {
              const active = scopes.includes(scope.id)
              return (
                <button
                  key={scope.id}
                  type='button'
                  onClick={() => toggleScope(scope.id)}
                  className={cn(
                    'flex items-start gap-3 rounded-card border px-3.5 py-3.5 text-left transition',
                    active ? 'border-brand-500/50 bg-brand-500/[0.09]' : 'border-white/10 bg-white/[0.025] hover:border-white/20',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                      active ? 'border-brand-400 bg-brand-500 text-stage-950' : 'border-white/25',
                    )}
                  >
                    {active ? <CheckIcon className='h-3.5 w-3.5' /> : null}
                  </span>
                  <span className='min-w-0 flex-1'>
                    <span className={cn('block text-[14px]', active ? 'text-brand-100' : 'text-white/85')}>{scope.label}</span>
                    <span className='mt-1 block text-[11px] leading-relaxed text-white/45'>{scope.detail}</span>
                    <span className='mt-1.5 block truncate text-[11px] text-white/30'>例如：{scope.example}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className='flex gap-2'>
            <Button variant='secondary' size='sm' full onClick={() => setScopes(AUTHORIZATION_SCOPES.map((scope) => scope.id))}>
              全部授权
            </Button>
            <Button variant='secondary' size='sm' full onClick={() => setScopes([])}>
              全部取消
            </Button>
          </div>

          <Card>
            <SectionTitle
              title='授权后 Agent 能看到什么'
              hint={granted > 0 ? `当前已授权 ${granted} 项，下面是脱敏预览` : '当前没有授权任何数据'}
            />
            {granted === 0 ? (
              <p className='text-[12px] text-white/45'>没有授权时，Agent 只能根据你这次的原话和演出信息做匹配，无法计算音乐重合度。</p>
            ) : (
              <div className='flex flex-col gap-2 text-[12px] text-white/70'>
                {preview && preview.favoriteTracks.length > 0 ? (
                  <p>收藏歌曲：{preview.favoriteTracks.slice(0, 4).map((track) => `《${track.title}》`).join(' ')}</p>
                ) : null}
                {preview && preview.topArtists.length > 0 ? <p>常听歌手：{preview.topArtists.join('、')}</p> : null}
                {preview && preview.recentPlays.length > 0 ? (
                  <p>近期播放：{preview.recentPlays.slice(0, 3).map((play) => `《${play.title}》`).join(' ')}</p>
                ) : null}
                {preview && preview.playlistTags.length > 0 ? <p>歌单标签：{preview.playlistTags.join('、')}</p> : null}
                {preview && preview.followedEventIds.length > 0 ? <p>关注演出：{preview.followedEventIds.length} 场</p> : null}
              </div>
            )}
          </Card>

          <div className='flex items-start gap-2.5 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] px-3.5 py-3'>
            <ShieldIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-400' />
            <p className='text-sm leading-relaxed text-white/60'>
              仅用于本场匹配，活动结束后自动失效。随时可以回到本页取消。当前数据源：{dataMode === 'backend' ? '本地后端 Agent（脱敏 Demo 数据）' : '前端本地 Demo 数据'}。
            </p>
          </div>
        </div>
      </main>

      <footer className='safe-bottom sticky bottom-0 z-30 border-t border-white/8 bg-stage-950/92 px-4 pt-3 backdrop-blur-xl'>
        <Button
          size='lg'
          full
          disabled={!canContinue}
          icon={<SparkleIcon className='h-4 w-4' />}
          onClick={() => {
            completeAuthorization()
            navigate(`/concert/${concertId}/intent`)
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
          }}
        >
          暂不授权
        </Button>
        <p className='pb-1 pt-2 text-center text-[11px] text-white/40'>
          {canContinue ? '不涉及登录、支付与真实票务' : '至少授权一项音乐数据才能继续'}
        </p>
      </footer>
    </div>
  )
}
