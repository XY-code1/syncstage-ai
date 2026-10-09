import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PageShell } from '../components/PageShell'
import { ScoreRing, Button, StateView } from '../components/ui'
import { BandPill } from '../components/AgentEvidence'
import { CalendarIcon, MapPinIcon, ShieldIcon, SparkleIcon } from '../components/icons'
import { demoConcerts } from '../data/demoData'
import { SAFETY_OPTIONS } from '../data/options'
import { fetchAiStatus } from '../lib/api'
import type { AiStatus } from '../lib/api'
import { recommendTeammates } from '../lib/recommend'
import { AUTHORIZATION_SCOPES } from '../lib/tmeMock'
import { useSession } from '../store/session'
import { cn } from '../lib/cn'

const SECTIONS = {
  shows: '我的演出',
  friends: '同频好友',
  music: '音乐画像与授权',
  privacy: '隐私与安全',
  agent: 'Agent 设置',
  settings: '设置',
} as const

type SectionKey = keyof typeof SECTIONS

export function ProfileSectionPage() {
  const { section = 'shows' } = useParams()
  const navigate = useNavigate()
  const key = (section in SECTIONS ? section : 'shows') as SectionKey

  return (
    <PageShell title={SECTIONS[key]} subtitle='我的 · 二级页面' onBack={() => navigate('/me')}>
      {key === 'shows' ? <ShowsSection /> : null}
      {key === 'friends' ? <FriendsSection /> : null}
      {key === 'music' ? <MusicSection /> : null}
      {key === 'privacy' ? <PrivacySection /> : null}
      {key === 'agent' ? <AgentSection /> : null}
      {key === 'settings' ? <SettingsSection /> : null}
    </PageShell>
  )
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className='soft-card p-3.5'>
      <p className='text-[13px] font-semibold text-white'>{title}</p>
      {hint ? <p className='mt-1 text-[11px] leading-relaxed text-white/45'>{hint}</p> : null}
      <div className='mt-3'>{children}</div>
    </section>
  )
}

function ShowsSection() {
  const navigate = useNavigate()
  const { room } = useSession()
  return (
    <div className='flex flex-col gap-3'>
      {room ? (
        <button
          type='button'
          onClick={() => navigate(`/concert/${room.concertId}/room`)}
          className='soft-card flex items-center gap-3 p-3.5 text-left'
        >
          <span className='h-10 w-10 shrink-0 rounded-xl bg-brand-500/14' />
          <span className='min-w-0 flex-1'>
            <span className='block text-[12.5px] font-semibold text-white'>{room.concertTitle}</span>
            <span className='block text-[10.5px] text-brand-300'>临时同频房间进行中</span>
          </span>
          <span className='rounded-pill bg-brand-500 px-2.5 py-1 text-[10.5px] font-semibold text-stage-950'>进入</span>
        </button>
      ) : null}
      {demoConcerts.map((concert) => (
        <button
          key={concert.id}
          type='button'
          onClick={() => navigate(`/concert/${concert.id}`)}
          className='soft-card flex items-center gap-3 p-3 text-left'
        >
          <span
            className='h-[52px] w-[52px] shrink-0 rounded-xl'
            style={{ background: `linear-gradient(150deg, ${concert.poster.from}, ${concert.poster.via} 55%, ${concert.poster.to})` }}
          />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-[12.5px] font-semibold text-white'>{concert.title}</span>
            <span className='block truncate text-[10.5px] text-white/45'>{concert.artist}</span>
            <span className='mt-1 flex items-center gap-2 text-[10px] text-white/35'>
              <span className='flex items-center gap-1'>
                <CalendarIcon className='h-3 w-3' />
                {concert.dateLabel}
              </span>
            </span>
            <span className='mt-0.5 flex items-center gap-1 text-[10px] text-white/35'>
              <MapPinIcon className='h-3 w-3' />
              {concert.venue}
            </span>
          </span>
          <span className='shrink-0 rounded-pill border border-white/10 px-2 py-0.5 text-[10px] text-white/45'>
            {concert.ticketStatus}
          </span>
        </button>
      ))}
    </div>
  )
}

function FriendsSection() {
  const navigate = useNavigate()
  const { scopes, concertId } = useSession()
  const { results } = recommendTeammates({ concertId, scopes, limit: 4 })

  if (results.length === 0) {
    return <StateView status='empty' title='还没有同频好友' description='完成一次匹配并双方确认后，同频好友会出现在这里。' />
  }

  return (
    <div className='flex flex-col gap-2.5'>
      {results.map((item) => (
        <button
          key={item.userId}
          type='button'
          onClick={() => navigate('/sync')}
          className='soft-card flex items-center gap-3 p-3 text-left'
        >
          <Avatar name={item.candidate.nickname} from={item.candidate.avatar.from} to={item.candidate.avatar.to} size={40} />
          <span className='min-w-0 flex-1'>
            <span className='flex items-center gap-1.5'>
              <span className='truncate text-[12.5px] font-semibold text-white'>{item.candidate.nickname}</span>
              <BandPill band={item.band} />
            </span>
            <span className='mt-0.5 block truncate text-[10.5px] text-white/45'>
              {item.sharedSongs.length > 0 ? `共同收藏《${item.sharedSongs.slice(0, 2).join('》《')}》` : item.candidate.headline}
            </span>
          </span>
          <ScoreRing score={item.score} size={40} />
        </button>
      ))}
      <p className='px-1 text-[10.5px] leading-relaxed text-white/35'>
        同频好友只保留演出场景内的关系，散场后不会变成陌生人信息流。
      </p>
    </div>
  )
}

function MusicSection() {
  const navigate = useNavigate()
  const { scopes } = useSession()
  return (
    <div className='flex flex-col gap-3'>
      <Block title='已授权的音乐数据' hint='每项都可以单独取消，Agent 只在授权范围内工作。'>
        <div className='divide-y divide-white/5'>
          {AUTHORIZATION_SCOPES.map((scope) => {
            const granted = scopes.includes(scope.id)
            return (
              <div key={scope.id} className='flex items-start gap-3 py-2.5 first:pt-0 last:pb-0'>
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px]',
                    granted ? 'border-brand-400 bg-brand-500 text-stage-950' : 'border-white/20 text-white/30',
                  )}
                >
                  {granted ? '✓' : ''}
                </span>
                <span className='min-w-0 flex-1'>
                  <span className={cn('block text-[12.5px]', granted ? 'text-white' : 'text-white/50')}>{scope.label}</span>
                  <span className='mt-0.5 block text-[10.5px] leading-relaxed text-white/40'>{scope.detail}</span>
                </span>
              </div>
            )
          })}
        </div>
        <Button
          className='mt-3.5'
          variant='secondary'
          size='sm'
          full
          onClick={() => navigate('/concert/night-voyage/authorize?edit=1')}
        >
          去修改授权项
        </Button>
      </Block>
      <Block title='数据边界' hint='没有授权就没有可验证的音乐画像，Agent 不会猜测你的偏好。'>
        <p className='text-[11px] leading-relaxed text-white/50'>
          所有画像均为脱敏 Demo 数据；推荐理由只能引用授权数据中出现过的条目，不会生成无法验证的文案。
        </p>
      </Block>
    </div>
  )
}

function PrivacySection() {
  return (
    <div className='flex flex-col gap-3'>
      <Block title='确定性安全硬条件' hint='这些条件由程序在排序之前执行，不交给大模型自由判断。'>
        <div className='flex flex-col gap-2'>
          {SAFETY_OPTIONS.map((option) => (
            <div key={option.value} className='rounded-xl bg-white/[0.03] px-3 py-2'>
              <p className='flex items-center gap-1.5 text-[12px] text-white/85'>
                <ShieldIcon className='h-3.5 w-3.5 text-brand-300' />
                {option.value}
              </p>
              <p className='mt-0.5 text-[10.5px] text-white/40'>{option.hint}</p>
            </div>
          ))}
        </div>
      </Block>
      <Block title='不会做的事'>
        <ul className='space-y-1.5 text-[11px] leading-relaxed text-white/50'>
          <li>· 不展示你的收藏、歌单或任何身份信息</li>
          <li>· 不交换私人联系方式，不做陌生人私信流</li>
          <li>· 不代替真人持续聊天，Agent 只做结构化协商</li>
          <li>· 不为了凑人数放宽你的安全条件</li>
        </ul>
      </Block>
      <Block title='举报与拉黑' hint='房间内可对单条消息举报，举报后 Agent 立即结束该会话。'>
        <p className='text-[11px] text-white/40'>当前没有举报记录。</p>
      </Block>
    </div>
  )
}

const FALLBACK_REASON_TEXT: Record<string, string> = {
  ready: '已启用',
  forbidden: 'AI_FORCE_FALLBACK=1，显式 Demo 回退',
  no_model: '后端没有配置 OPENAI_MODEL',
  no_api_key: '远程模型缺少服务端凭据',
}

function AgentSection() {
  const navigate = useNavigate()
  const { agent, judgeMode, toggleJudgeMode, dataMode, concertId } = useSession()
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const [aiError, setAiError] = useState('')

  useEffect(() => {
    let alive = true
    fetchAiStatus()
      .then((status) => {
        if (alive) setAiStatus(status)
      })
      .catch((error: unknown) => {
        if (alive) setAiError(error instanceof Error ? error.message : '无法读取大模型状态')
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className='flex flex-col gap-3'>
      <Block title='真实大模型' hint='来自后端 /api/ai/status，绝不下发 API Key'>
        {aiStatus ? (
          <div className='space-y-1 text-[11.5px] text-white/70'>
            <p>
              状态：
              <span className={aiStatus.enabled ? 'text-brand-300' : 'text-warm-400'}>
                {aiStatus.enabled ? '真实模型已启用' : '未启用真实模型'}
              </span>
              （{FALLBACK_REASON_TEXT[aiStatus.reason] ?? aiStatus.reason}）
            </p>
            <p>模型：{aiStatus.model || '未配置'}</p>
            <p>接口：{aiStatus.chatUrl}</p>
            <p>
              鉴权：{aiStatus.keyRequired ? (aiStatus.keyConfigured ? '已配置 API Key' : '缺少 API Key') : '本地服务，无需 Key'}
            </p>
          </div>
        ) : (
          <p className='text-[11.5px] text-white/50'>{aiError || '正在读取大模型状态…'}</p>
        )}
      </Block>
      <Block title='查看最近一次工作过程' hint='工具调用、输入输出摘要、被排除的人与得分构成都在二级页面里。'>
        {agent ? (
          <Button
            full
            size='sm'
            variant='secondary'
            icon={<SparkleIcon className='h-3.5 w-3.5' />}
            onClick={() => navigate(`/concert/${agent.eventId || concertId}/trace`)}
          >
            查看 Agent 工作过程（{agent.trace.length} 次工具调用）
          </Button>
        ) : (
          <p className='text-[11px] text-white/40'>本次还没有执行过 Agent 任务。</p>
        )}
      </Block>
      <Block title='匹配口径' hint='四个阶段固定顺序执行，缺一不可。'>
        <div className='flex flex-col gap-2'>
          {['理解需求', '寻找同场用户', '计算同频度', '生成组队方案'].map((stage, index) => (
            <div key={stage} className='flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2'>
              <span className='flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/14 text-[10px] text-brand-300'>
                {index + 1}
              </span>
              <span className='text-[12px] text-white/85'>{stage}</span>
            </div>
          ))}
        </div>
      </Block>
      <Block title='评委演示模式' hint='开启后在执行页显示真实工具名、输入输出摘要与耗时。'>
        <button
          type='button'
          onClick={() => toggleJudgeMode()}
          className={cn(
            'flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left transition',
            judgeMode ? 'border-brand-500/45 bg-brand-500/10' : 'border-white/10 bg-white/[0.03]',
          )}
        >
          <span className='text-[12px] text-white/85'>{judgeMode ? '已开启技术日志' : '已关闭技术日志'}</span>
          <span className={cn('h-4 w-4 rounded-full border', judgeMode ? 'border-brand-400 bg-brand-500' : 'border-white/25')} />
        </button>
        <p className='mt-2 text-[10.5px] text-white/35'>
          当前数据源：{dataMode === 'backend' ? '本地后端 Agent' : dataMode === 'probing' ? '探测中' : '前端本地镜像'}
        </p>
      </Block>
    </div>
  )
}

function SettingsSection() {
  const navigate = useNavigate()
  const { dataMode, resetAll, judgeMode } = useSession()
  return (
    <div className='flex flex-col gap-3'>
      <Block title='数据源' hint='能连上后端就用后端 Agent，连不上自动回退到前端本地镜像。'>
        <p className='text-[12px] text-white/80'>
          {dataMode === 'backend' ? '本地后端 Agent（真实工具轨迹）' : dataMode === 'probing' ? '正在探测后端…' : '前端本地镜像（后端未启动）'}
        </p>
      </Block>
      {/* Agent 设置并入「设置」，个人主页不再单列成第七个入口 */}
      <Block title='Agent 设置' hint='匹配口径、工作过程与评委演示模式。'>
        <Button variant='secondary' size='sm' full onClick={() => navigate('/me/agent')}>
          打开 Agent 设置
        </Button>
      </Block>
      <Block title='演示数据' hint='不会影响真实 QQ 音乐账号，本 Demo 也未接入任何官方接口。'>
        <Button
          variant='secondary'
          size='sm'
          full
          onClick={() => {
            resetAll()
            navigate('/')
          }}
        >
          重置演示数据并回到首页
        </Button>
      </Block>
      <Block title='关于'>
        <div className='space-y-1 text-[11px] text-white/45'>
          <p>产品：QQ音乐「一起去现场」· SyncStage</p>
          <p>版本：phase1-mock-v1 · 评委模式{judgeMode ? '已开启' : '已关闭'}</p>
          <p>说明：参赛概念 Demo，所有演出与用户均为虚构内容。</p>
        </div>
      </Block>
    </div>
  )
}
