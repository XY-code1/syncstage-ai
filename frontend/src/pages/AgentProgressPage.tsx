import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { BandPill } from '../components/AgentEvidence'
import { MockNotice, QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, DemoBadge, SectionTitle, StateView } from '../components/ui'
import { AlertIcon, CheckIcon, SparkleIcon } from '../components/icons'
import { cn } from '../lib/cn'
import { stagesOf } from '../lib/agentMock'
import { sharedHighlights } from '../lib/recommend'
import { demoConcerts } from '../data/demoData'
import { useSession } from '../store/session'

/** 后端把"为什么回退"写在工具输出摘要的末尾括号里，这里取出来单独展示。 */
function noteOf(summary: string): string {
  const start = summary.lastIndexOf('（')
  const end = summary.endsWith('）') ? summary.length - 1 : summary.length
  return start >= 0 && start < end ? summary.slice(start + 1, end) : ''
}

/**
 * Agent 匹配页：一级只展示四个阶段的进度与结果摘要，
 * 全部工具调用记录移动到「查看 Agent 工作过程」二级页面。
 */
export function AgentProgressPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const {
    agent,
    agentRunning,
    agentStarting,
    agentError,
    runAgent,
    judgeMode,
    demoCase,
    agentMode,
    agentModeLabel,
    agentNotConfigured,
    setAgentMode,
  } = useSession()
  const [elapsed, setElapsed] = useState(0)
  const ranHere = useRef(false)
  const jumpedRef = useRef<string | null>(null)
  const active = agentRunning || agentStarting

  const trace = agent?.trace ?? []
  const stages = stagesOf(trace)
  const done = Boolean(agent) && !active && ['pending_confirmation', 'no_match', 'error', 'room_created'].includes(agent?.status ?? '')
  const pendingIndex = stages.findIndex((stage) => stage.state === 'pending')
  const currentIndex = pendingIndex === -1 ? stages.length - 1 : pendingIndex
  const currentStage = stages[currentIndex]
  const top = agent?.rankedCandidates[0] ?? null
  const concertTitle = demoConcerts.find((item) => item.id === (agent?.eventId ?? concertId))?.title ?? ''

  // 这里刻意不再自动启动 Agent：只有用户在确认页 / 本页点击按钮才会运行。
  // 之前这里有一处 mount 即 runAgent 的 effect，在 StrictMode 下会被双调用，
  // 加上没有 runId 排队，就会出现"刷新/重进即重复执行"的循环。

  useEffect(() => {
    if (!active) return undefined
    const timer = window.setInterval(() => setElapsed((prev) => prev + 100), 100)
    return () => window.clearInterval(timer)
  }, [active])

  // 本页看过一次完整的运行后，跑完自动跳到匹配结果页（Mock 流程规定的收尾动作）。
  // 只对"本页监看过的任务"生效：刷新 / 返回进度页时不会重复跳转，也不会重复执行任务。
  useEffect(() => {
    if (active) {
      ranHere.current = true
      return
    }
    if (!ranHere.current) return
    if (!agent || agent.status !== 'pending_confirmation' || !agent.rankedCandidates.length) return
    if (jumpedRef.current === agent.sessionId) return
    jumpedRef.current = agent.sessionId
    ranHere.current = false
    navigate(`/concert/${concertId}/matches`, { replace: true })
  }, [active, agent, concertId, navigate])

  const modeBadge = judgeMode ? <DemoBadge label='评委模式' /> : <DemoBadge label={agentModeLabel} />

  // live 模式下真正发生了"模型失败 → 本地规则回退"时，必须显式说明，不能让它看起来像模型输出
  const liveFallbackStep = agentMode === 'live'
    ? agent?.trace.find((step) => step.usedFallback || step.status === 'fallback') ?? null
    : null

  // live 模式但后端没有可用模型配置：不进入加载动画，也不再发起任何请求。
  if (agentMode === 'live' && agentNotConfigured) {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='Agent 正在匹配' onBack={() => navigate(`/concert/${concertId}/task`)} right={modeBadge} />
        <main className='flex-1 px-4 pt-4'>
          <StateView
            status='error'
            title='尚未配置大模型服务'
            description={agentNotConfigured}
            actionLabel='切换 Demo 模式'
            onAction={() => setAgentMode('mock')}
            secondaryLabel='返回修改需求'
            onSecondary={() => navigate(`/concert/${concertId}/task`)}
          />
          <p className='mt-3 text-[11px] leading-relaxed text-white/40'>
            真实模型模式需要后端配置模型服务并设置 AGENT_MODE=live。密钥只允许放在后端环境变量里，
            页面不会向你索取 API Key，也不会在未配置时静默回退。
          </p>
        </main>
      </div>
    )
  }

  // 没有任何任务在跑：等用户显式点击「开始匹配」。
  if (!agent && !active) {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='Agent 正在匹配' onBack={() => navigate(`/concert/${concertId}/task`)} right={modeBadge} />
        <main className='flex-1 px-4 pt-4'>
          <StateView
            status='info'
            title='还没有开始匹配'
            description='点击「开始匹配」后，Agent 才会读取你已授权的音乐画像并检索同场的人。刷新或重新进入本页不会自动重跑。'
            actionLabel='开始匹配'
            onAction={() => void runAgent()}
            secondaryLabel='返回修改需求'
            onSecondary={() => navigate(`/concert/${concertId}/task`)}
          />
        </main>
      </div>
    )
  }

  const headline = active
    ? currentStage?.label ?? '正在准备'
    : agent?.status === 'no_match'
      ? '没有找到合适的同频搭子'
      : agent?.status === 'error'
        ? 'Agent 执行中断'
        : '匹配完成'

  const subline = active
    ? `已用 ${(elapsed / 1000).toFixed(1)} 秒 · 已调用 ${trace.length} 个工具`
    : agent?.status === 'pending_confirmation'
      ? `${agent.rankedCandidates.length} 位同频候选人 · 排除 ${agent.excludedCandidates.length} 位不符合硬条件的人`
      : `共 ${trace.length} 个工具调用 · 案例：${demoCase === 'normal' ? '正常匹配' : demoCase === 'safety_no_match' ? '安全条件过滤后无匹配' : '大模型不可用走 fallback'}`

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='Agent 正在匹配'
        subtitle='理解需求 → 寻找同场用户 → 计算同频度 → 生成组队方案'
        onBack={() => navigate(`/concert/${concertId}/task`)}
        right={modeBadge}
      />

      <main className={cn('flex-1 px-4 pt-4', done && agent?.status === 'pending_confirmation' ? 'pb-32' : 'pb-10')}>
        <div className='flex flex-col gap-4'>
          <div className='soft-card p-3.5'>
            <div className='flex items-center gap-3'>
              <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12', active && 'animate-pulse')}>
                <SparkleIcon className='h-4.5 w-4.5 text-brand-300' />
              </span>
              <div className='min-w-0 flex-1'>
                <p className='text-[14px] font-semibold text-white'>{headline}</p>
                <p className='mt-0.5 text-[11px] leading-relaxed text-white/50'>{subline}</p>
              </div>
            </div>

            <div className='mt-4 flex'>
              {stages.map((stage, index) => {
                const failed = stage.state === 'failed'
                const complete = stage.state === 'done'
                const active = !complete && !failed && index === currentIndex
                return (
                  <div key={stage.id} className='relative flex flex-1 flex-col items-center'>
                    {index > 0 ? (
                      <span className={cn('absolute left-0 top-3.5 h-px w-1/2', stage.state === 'pending' ? 'bg-white/10' : 'bg-brand-500/40')} />
                    ) : null}
                    {index < stages.length - 1 ? (
                      <span className={cn('absolute right-0 top-3.5 h-px w-1/2', stages[index + 1].state === 'pending' ? 'bg-white/10' : 'bg-brand-500/40')} />
                    ) : null}
                    <span
                      className={cn(
                        'relative flex h-7 w-7 items-center justify-center rounded-full border text-[11px] transition',
                        complete
                          ? 'border-brand-500 bg-brand-500 text-stage-950'
                          : failed
                            ? 'border-rose-400 bg-rose-400/20 text-rose-300'
                            : active
                              ? 'border-brand-500/60 bg-brand-500/10 text-brand-300 animate-pulse'
                              : 'border-white/12 bg-stage-950 text-white/30',
                      )}
                    >
                      {complete ? <CheckIcon className='h-3.5 w-3.5' /> : failed ? <AlertIcon className='h-3.5 w-3.5' /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        'mt-1.5 text-center text-[10px] leading-tight',
                        complete || active ? 'text-white/80' : 'text-white/35',
                      )}
                    >
                      {stage.label}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className='mt-3 text-[10.5px] leading-relaxed text-white/40'>{currentStage?.detail}</p>
          </div>

          {done && agent?.status === 'pending_confirmation' && top ? (
            <Card className='border-white/10'>
              <SectionTitle title='匹配结果' hint={`${agent.rankedCandidates.length} 位候选人符合硬条件，这里是最匹配的一位`} />
              <div className='flex items-center gap-3'>
                <Avatar name={top.candidate.nickname} from={top.candidate.avatar.from} to={top.candidate.avatar.to} size={46} />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-1.5'>
                    <span className='truncate text-[15px] font-semibold text-white'>{top.candidate.nickname}</span>
                    <BandPill band={top.band} />
                  </div>
                  <p className='mt-0.5 text-[11px] text-white/50'>
                    {top.candidate.profileLabel} · 同频度 <span className='font-semibold text-brand-300'>{top.score}%</span>
                  </p>
                </div>
              </div>
              <div className='mt-3 flex flex-wrap gap-1.5'>
                <span className='rounded-pill border border-brand-500/22 bg-brand-500/[0.07] px-2 py-0.5 text-[10.5px] text-brand-200'>
                  共同演出：{concertTitle}
                </span>
                {sharedHighlights(top, concertTitle)
                  .filter((line) => !line.startsWith('共同演出'))
                  .slice(0, 2)
                  .map((line) => (
                  <span key={line} className='rounded-pill border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-white/60'>
                    {line}
                  </span>
                  ))}
              </div>
              <p className='mt-3 text-[12px] leading-relaxed text-white/70'>匹配理由：{top.matchReason}</p>
            </Card>
          ) : null}

          {agent?.status === 'no_match' ? (
            <Card className='border-warm-400/30 bg-warm-400/[0.06]'>
              <SectionTitle title='为什么一个人都没匹配到' hint={agent.pendingConfirmation.reason} />
              <div className='flex flex-col gap-2'>
                {agent.excludedCandidates.slice(0, 4).map((item) => (
                  <div key={item.userId} className='soft-card px-3 py-2.5'>
                    <p className='text-[12px] text-white/75'>{item.nickname}</p>
                    <p className='mt-1 text-[11px] text-white/45'>规则：{item.rule} · {item.reason}</p>
                  </div>
                ))}
              </div>
              <p className='mt-3 text-[11px] leading-relaxed text-white/45'>
                Agent 不会为了凑人数而放宽你的安全条件，也不会编造候选人。
              </p>
              <Button className='mt-3' size='sm' variant='secondary' full onClick={() => navigate(`/concert/${concertId}/task`)}>
                去放宽条件
              </Button>
            </Card>
          ) : null}

          {agentMode === 'mock' ? (
            <p className='text-center text-[11px] leading-relaxed text-warm-400/80'>
              Demo 模拟 Agent · 本地预设数据，未调用任何大模型 API
            </p>
          ) : null}

          {agent?.status === 'error' ? (
            <StateView
              status='error'
              title='Agent 执行中断'
              description={agentError || agent.error || '网络或工具调用出现问题，请重试'}
              actionLabel='重新运行'
              onAction={() => void runAgent()}
              secondaryLabel='返回修改需求'
              onSecondary={() => navigate(`/concert/${concertId}/task`)}
            />
          ) : null}

          {liveFallbackStep ? (
            <Card className='border-warm-400/35 bg-warm-400/[0.06]'>
              <SectionTitle title='本次没有用上大模型' hint='这是真实模型调用失败后的显式回退，不是模型输出' />
              <p className='text-[11px] leading-relaxed text-warm-400/90'>
                {noteOf(liveFallbackStep.outputSummary) || liveFallbackStep.outputSummary}
              </p>
              <p className='mt-2 text-[11px] leading-relaxed text-white/50'>
                修好后点「重新运行」即可拿到真实模型结果；在此之前不会把本地规则包装成模型回复。
              </p>
            </Card>
          ) : null}

          <Button
            variant='secondary'
            size='sm'
            full
            onClick={() => navigate(`/concert/${concertId}/trace`)}
          >
            查看 Agent 工作过程 · {trace.length} 次工具调用
          </Button>

          {!judgeMode ? <MockNotice compact /> : null}
        </div>
      </main>

      {done && agent?.status === 'pending_confirmation' ? (
        <footer className='safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-white/8 bg-stage-950/96 px-4 pt-3 backdrop-blur-xl'>
          <Button size='lg' full icon={<SparkleIcon className='h-4 w-4' />} onClick={() => navigate(`/concert/${concertId}/matches`)}>
            查看匹配结果
          </Button>
          <p className='pb-1 pt-2 text-center text-[11px] text-white/40'>
            {agent.rankedCandidates.length} 位同频候选人 · 双方确认后才会创建临时房间
          </p>
        </footer>
      ) : null}
    </div>
  )
}
