import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MockNotice, QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, DemoBadge, SectionTitle, StateView } from '../components/ui'
import { AlertIcon, CheckIcon, SparkleIcon } from '../components/icons'
import { cn } from '../lib/cn'
import { AGENT_PHASES, phasesOf } from '../lib/agentMock'
import { useSession } from '../store/session'
import type { AgentState, ToolTrace } from '../types'

function StepRow({ step, judgeMode }: { step: ToolTrace; judgeMode: boolean }) {
  const failed = step.status === 'error'
  return (
    <div
      className={cn(
        'rounded-2xl border px-3 py-2.5',
        failed ? 'border-rose-400/35 bg-rose-400/[0.06]' : 'border-white/8 bg-white/[0.025]',
      )}
    >
      <div className='flex items-center gap-2'>
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
            failed ? 'border-rose-400 text-rose-400' : 'border-brand-500 bg-brand-500/20 text-brand-300',
          )}
        >
          {failed ? <AlertIcon className='h-2.5 w-2.5' /> : <CheckIcon className='h-2.5 w-2.5' />}
        </span>
        <span className='truncate text-[12px] text-white/80'>{step.label}</span>
        {step.usedFallback ? (
          <span className='ml-auto shrink-0 rounded-pill border border-warm-400/40 bg-warm-400/12 px-1.5 py-[1px] text-[10px] text-warm-400'>
            fallback
          </span>
        ) : null}
        {judgeMode ? <span className='ml-auto shrink-0 text-[10px] text-white/35'>{step.durationMs} ms</span> : null}
      </div>
      <div className='mt-2 flex flex-col gap-1 border-t border-white/6 pt-2'>
          <p className='text-[10px] text-white/35'>调用工具：{step.name} · 阶段：{step.phase}</p>
          {judgeMode ? <p className='text-[11px] leading-relaxed text-white/50'>输入：{step.inputSummary}</p> : null}
          <p className='text-[11px] leading-relaxed text-white/65'>结果：{step.outputSummary}</p>
          {failed ? <p className='text-[11px] text-rose-300'>错误：{step.error}</p> : null}
      </div>
    </div>
  )
}

export function AgentProgressPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { agent, agentRunning, agentError, runAgent, judgeMode, demoCase } = useSession()
  const started = useRef(false)
  const [elapsed, setElapsed] = useState(0)

  const trace: ToolTrace[] = agent?.trace ?? []
  const phases = phasesOf(trace)
  const done = Boolean(agent) && !agentRunning && ['pending_confirmation', 'no_match', 'error', 'room_created'].includes(agent?.status ?? '')

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (!agentRunning && (!agent || agent.status === 'error')) {
      void runAgent()
    }
  }, [agent, agentRunning, runAgent])

  useEffect(() => {
    if (!agentRunning) return undefined
    const timer = window.setInterval(() => setElapsed((prev) => prev + 100), 100)
    return () => window.clearInterval(timer)
  }, [agentRunning])

  const currentPhase = phases.find((phase) => phase.state === 'pending') ?? phases[phases.length - 1]

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='Agent 正在匹配'
        subtitle='一起去现场 · 五类工具协同完成'
        onBack={() => navigate(`/concert/${concertId}/intent`)}
        right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
      />

      <main className='flex-1 px-4 pb-40 pt-4'>
        <div className='flex flex-col gap-4'>
          <Card className='border-brand-500/30 bg-brand-500/[0.06]'>
            <div className='flex items-center gap-3'>
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/18', agentRunning && 'animate-pulse')}>
                <SparkleIcon className='h-5 w-5 text-brand-300' />
              </span>
              <div className='min-w-0 flex-1'>
                <p className='text-[15px] font-semibold text-white'>
                  {agentRunning ? currentPhase?.label ?? '正在准备' : agent?.status === 'no_match' ? '没有找到合适的同频搭子' : agent?.status === 'error' ? 'Agent 执行中断' : 'Agent 已经跑完了'}
                </p>
                <p className='mt-0.5 text-[11px] text-white/50'>
                  {agentRunning
                    ? `已用 ${(elapsed / 1000).toFixed(1)} 秒 · 已完成 ${trace.length} 个工具调用`
                    : `共 ${trace.length} 个工具调用 · 案例：${demoCase === 'normal' ? '正常匹配' : demoCase === 'safety_no_match' ? '安全条件过滤后无匹配' : '大模型不可用走 fallback'}`}
                </p>
              </div>
            </div>
          </Card>

          <div>
            <SectionTitle title='Agent 任务计划' hint='每一步都会展示调用工具与处理结果' />
            <div className='flex flex-col gap-3'>
            {AGENT_PHASES.map((phase, index) => {
              const view = phases[index]
              const state = view?.state ?? 'pending'
              return (
                <div key={phase.id} className='flex gap-3'>
                  <div className='flex flex-col items-center pt-1'>
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]',
                        state === 'done'
                          ? 'border-brand-500 bg-brand-500 text-stage-950'
                          : state === 'failed'
                            ? 'border-rose-400 bg-rose-400/20 text-rose-300'
                            : state === 'pending' && view?.steps.length
                              ? 'border-brand-500/50 text-brand-300'
                              : 'border-white/15 text-white/35',
                      )}
                    >
                      {state === 'done' ? <CheckIcon className='h-3 w-3' /> : index + 1}
                    </span>
                    {index < AGENT_PHASES.length - 1 ? <span className='mt-1 w-px flex-1 bg-white/8' /> : null}
                  </div>
                  <div className='min-w-0 flex-1 pb-1'>
                    <p className={cn('text-[13px]', state === 'pending' ? 'text-white/45' : 'text-white')}>{phase.label}</p>
                    <p className='mt-0.5 text-[11px] leading-relaxed text-white/40'>{phase.detail}</p>
                    {view && view.steps.length > 0 ? (
                      <div className='mt-2 flex flex-col gap-2'>
                        {view.steps.map((step, stepIndex) => (
                          <StepRow key={`${step.name}-${stepIndex}`} step={step} judgeMode={judgeMode} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })}
            </div>
          </div>

          {agent?.status === 'no_match' ? (
            <Card className='border-warm-400/30 bg-warm-400/[0.06]'>
              <SectionTitle title='为什么一个人都没匹配到' hint={agent.pendingConfirmation.reason} />
              <div className='flex flex-col gap-2'>
                {agent.excludedCandidates.slice(0, 6).map((item) => (
                  <div key={item.userId} className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5'>
                    <p className='text-[12px] text-white/75'>{item.nickname}</p>
                    <p className='mt-1 text-[11px] text-white/45'>规则：{item.rule} · {item.reason}</p>
                  </div>
                ))}
              </div>
              <p className='mt-3 text-[11px] leading-relaxed text-white/45'>
                Agent 不会为了凑人数而放宽你的安全条件，也不会编造候选人。你可以放宽某一条硬条件后重新匹配。
              </p>
              <Button className='mt-3' size='sm' variant='secondary' full onClick={() => navigate(`/concert/${concertId}/intent`)}>
                去放宽条件
              </Button>
            </Card>
          ) : null}

          {agent?.status === 'error' ? (
            <StateView
              status='error'
              title='Agent 执行中断'
              description={agentError || agent.error || '网络或工具调用出现问题，请重试'}
              actionLabel='重试一次'
              onAction={() => void runAgent()}
              secondaryLabel='改一改需求'
              onSecondary={() => navigate(`/concert/${concertId}/intent`)}
            />
          ) : null}

          {!judgeMode ? <MockNotice compact /> : null}
        </div>
      </main>

      {done && agent?.status === 'pending_confirmation' ? (
        <footer className='safe-bottom sticky bottom-0 z-30 border-t border-white/8 bg-stage-950/92 px-4 pt-3 backdrop-blur-xl'>
          <Button size='lg' full icon={<SparkleIcon className='h-4 w-4' />} onClick={() => navigate(`/concert/${concertId}/matches`)}>
            查看匹配结果与证据
          </Button>
          <p className='pb-1 pt-2 text-center text-[11px] text-white/40'>
            共 {agent.rankedCandidates.length} 位同频候选人
            {judgeMode ? ` · 工具调用 ${agent.trace.length} 次` : ''}
          </p>
        </footer>
      ) : null}
    </div>
  )
}

export type { AgentState }
