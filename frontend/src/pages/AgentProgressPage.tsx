import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AgentEvidenceBody } from '../components/AgentEvidence'
import { QQMusicBar } from '../components/QQMusicBar'
import { Button, DemoBadge, StateView } from '../components/ui'
import { ChevronDownIcon, DiscIcon, SparkleIcon } from '../components/icons'
import {
  CANDIDATE_TRACK,
  USER_TRACK,
  Vinyl,
  WaveformBars,
  type TrackPerson,
} from '../components/musicVisuals'
import { Avatar } from '../components/Avatar'
import { cn } from '../lib/cn'
import { MOTION_OK, MOTION_REDUCE, gsap, useGSAP } from '../lib/gsapSetup'
import { SYNC_STAGES, syncStagesOf } from '../lib/agentMock'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { useExitToFrequency } from '../hooks/useExitToFrequency'
import type { ParticleStageStatus } from '../components/visuals/particleStageTypes'

// 粒子舞台含 three.js，走懒加载：不进首屏主包，也不阻塞首屏渲染。
const FrequencyParticleStage = lazy(() => import('../components/visuals/FrequencyParticleStage'))

/** 执行阶段 → 粒子舞台状态：相邻阶段不会停在同一个视觉状态上。 */
const STAGE_VISUAL: Record<string, ParticleStageStatus> = {
  profile: 'analyzing',
  search: 'searching',
  safety: 'analyzing',
  rank: 'searching',
  plan: 'matched',
}

/** 结果回来后先播完这一段「双轨汇合」动画，再进入同频汇合页（600–900ms）。 */
const MERGE_HOLD_MS = 800

/**
 * Agent 匹配页（双轨版本）。
 *
 * 页面主体只有一件事：两条代表两个陌生人的音乐轨道，跟着后端真实进度逐渐靠近；
 * 每完成一个阶段，两轨之间就亮起一个共同音符，最后一个阶段完成后两轨汇合。
 * 页面上只保留一句当前状态与一条简短进度；工具名 / 耗时 / fallback / provider
 * 全部收进「查看 Agent 工作过程」，普通界面不显示。
 * 动画完全由后端运行状态驱动：没有任务在跑就不会有流动或收束。
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
    pauseAgent,
    cancelAgent,
    judgeMode,
    agentMode,
    agentNotConfigured,
    setAgentMode,
  } = useSession()
  const { profile } = useProfile()
  const [workOpen, setWorkOpen] = useState(false)
  const ranHere = useRef(false)
  const jumpedRef = useRef<string | null>(null)
  const active = agentRunning || agentStarting
  const paused = Boolean(agent?.status === 'running' && !active)

  const trace = agent?.trace ?? []
  const stages = useMemo(() => syncStagesOf(trace), [trace])
  const doneCount = stages.filter((stage) => stage.state === 'done').length
  const pendingIndex = stages.findIndex((stage) => stage.state !== 'done')
  const currentIndex = pendingIndex === -1 ? Math.max(0, stages.length - 1) : pendingIndex
  const currentStage = stages[currentIndex]
  const displayStages = [
    { label: '理解你的期待', source: stages.find((item) => item.id === 'profile') },
    { label: '检查安全边界', source: stages.find((item) => item.id === 'safety') },
    { label: '对齐音乐偏好', source: stages.find((item) => item.id === 'rank') },
    { label: '寻找同频观众', source: stages.find((item) => item.id === 'search') },
  ]
  const failed = stages.some((stage) => stage.state === 'failed')
  const settled = Boolean(agent) && !active
  const merged = settled && agent?.status === 'pending_confirmation' && Boolean(agent?.rankedCandidates.length)
  const top = agent?.rankedCandidates[0] ?? null
  const browsedCount = new Set([
    ...(agent?.candidateIds ?? []),
    ...(agent?.excludedCandidates ?? []).map((item) => item.userId),
  ]).size
  const filteredCount = agent?.excludedCandidates.length ?? 0
  const exitToFrequency = useExitToFrequency(cancelAgent)

  // 粒子舞台状态完全跟随真实执行阶段；暂停只冻结视觉，恢复后回到原阶段。
  const stageStatus = useMemo<ParticleStageStatus>(() => {
    if (paused) return 'paused'
    if (merged) return 'matched'
    if (failed || agent?.status === 'error' || agent?.status === 'no_match') return 'idle'
    if (!active || !currentStage) return 'idle'
    return STAGE_VISUAL[currentStage.id] ?? 'analyzing'
  }, [active, agent?.status, currentStage, failed, merged, paused])

  // 0–1：已完成的阶段 + 当前阶段的一小段推进，只用来调整粒子强度，不伪造时间轴。
  const stageProgress = useMemo(() => {
    if (merged) return 1
    if (!active || stages.length === 0) return 0
    return Math.min(1, (doneCount + 0.35) / stages.length)
  }, [active, doneCount, merged, stages.length])

  // 匹配阶段过渡：进度条与「正在跑的那一个」阶段点交给 GSAP，位置仍然来自真实 stage 状态。
  const stageRow = useRef<HTMLDivElement>(null)
  const progressBar = useRef<HTMLSpanElement>(null)
  const pulsedDot = useRef<HTMLElement | null>(null)
  const stageRatio = stages.length <= 1 ? 0 : doneCount / (stages.length - 1)
  const prevStageRatio = useRef(stageRatio)

  useGSAP(() => {
    const bar = progressBar.current
    const from = prevStageRatio.current
    prevStageRatio.current = stageRatio
    if (!bar) return
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      // 只做 scaleX（transform），不逐帧改 width
      const tween = gsap.fromTo(
        bar,
        { scaleX: from },
        { scaleX: stageRatio, duration: 0.6, ease: 'power2.out', transformOrigin: 'left center' },
      )
      return () => tween.kill()
    })
    mm.add(MOTION_REDUCE, () => {
      gsap.set(bar, { scaleX: stageRatio, transformOrigin: 'left center' })
    })
    return () => mm.revert()
  }, { dependencies: [stageRatio], scope: stageRow })

  useGSAP(() => {
    const row = stageRow.current
    // 上一个「当前阶段」点的缩放要清掉，否则换阶段后会残留放大状态
    if (pulsedDot.current) {
      gsap.set(pulsedDot.current, { clearProps: 'transform,opacity' })
      pulsedDot.current = null
    }
    const node = row?.querySelector<HTMLElement>('[data-stage-current="1"]')
    if (!node) return
    pulsedDot.current = node
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      const tween = gsap.fromTo(
        node,
        { scale: 0.82, opacity: 0.7 },
        { scale: 1.16, opacity: 1, duration: 0.9, ease: 'sine.inOut', repeat: -1, yoyo: true, transformOrigin: '50% 50%' },
      )
      return () => tween.kill()
    })
    return () => mm.revert()
  }, { dependencies: [currentIndex, active], scope: stageRow })

  const me: TrackPerson = useMemo(
    () => ({ name: profile.nickname || '你', from: USER_TRACK.from, to: USER_TRACK.to, src: profile.avatar }),
    [profile.avatar, profile.nickname],
  )
  const topPerson: TrackPerson = top
    ? { name: top.candidate.nickname, from: top.candidate.avatar.from, to: top.candidate.avatar.to }
    : { name: '待汇合', from: CANDIDATE_TRACK.from, to: CANDIDATE_TRACK.to }
  // 只有用户点击按钮才会运行；刷新 / 重进不会自动重跑（StrictMode 双调用也挡在这里）。
  useEffect(() => {
    if (active) ranHere.current = true
  }, [active])

  // 本页看过一次完整运行后，播完汇合动画再进入同频汇合页。
  useEffect(() => {
    if (active || !ranHere.current) return undefined
    if (!merged || !agent) return undefined
    if (jumpedRef.current === agent.sessionId) return undefined
    const timer = window.setTimeout(() => {
      jumpedRef.current = agent.sessionId
      ranHere.current = false
      navigate(`/concert/${concertId}/reveal`, { replace: true })
    }, MERGE_HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [active, agent, concertId, merged, navigate])

  const headline = active
    ? currentStage?.label ?? '正在准备'
    : failed || agent?.status === 'error'
      ? '这次同频没有跑完'
      : agent?.status === 'no_match'
        ? '这一场暂时没有合适的同频搭子'
        : merged
          ? '两条轨道已经汇合'
          : '还没有开始匹配'
  const sentence = active
    ? currentStage?.line ?? '只读取你授权的那几类音乐数据'
    : failed || agent?.status === 'error'
      ? '可以重新运行，或回去修改需求'
      : agent?.status === 'no_match'
        ? '没有合适的人时轨道会停在原地，不会硬凑一个结果'
        : merged
          ? `${agent?.rankedCandidates.length ?? 0} 位同频搭子已经就位`
          : '点击「开始匹配」后，两条轨道才会开始靠近'

  // live 模式但后端没有可用模型配置：不进入动画，也不发起任何请求。
  if (agentMode === 'live' && agentNotConfigured) {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='正在寻找同频的人' onBack={exitToFrequency} />
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
        </main>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='正在寻找同频的人'
        onBack={exitToFrequency}
        right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
      />

      <main className='relative flex-1 overflow-hidden px-4 pb-6 pt-2'>
        <img src={`${import.meta.env.BASE_URL}concert-crowd-bg.png`} alt='' className='pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom opacity-35'/>
        <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-stage-950 via-stage-950/75 to-stage-950/55'/>
        {/* 粒子舞台：铺在状态信息后方，只做氛围层，不拦点击 */}
        <Suspense fallback={null}>
          <FrequencyParticleStage
            status={stageStatus}
            progress={stageProgress}
            leftAvatar={profile.avatar ?? undefined}
            leftName={profile.nickname || '你'}
            rightName={top?.candidate.nickname ?? '同频听众'}
          />
        </Suspense>
        <section className={failed || agent?.status === 'error' ? 'hidden' : 'relative'}>
          <div data-visual='dual-track' data-track-state={merged ? 'merged' : 'converging'} data-track-progress={stageRatio} className='relative mx-auto h-[342px] w-[342px]'>
            {[0,1,2].map((ring) => <span key={ring} className='absolute rounded-full border border-brand-300/15' style={{inset:18 + ring * 31}}/>)}
            <span className='absolute inset-[38px] rounded-full border border-brand-300/35 shadow-[0_0_54px_rgba(49,245,138,.18)]'/>
            <span className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'><Vinyl size={230} spin={active} accent={merged ? '#31f58a' : '#4a7dff'}/></span>
            <span className='absolute left-[4px] top-[139px] z-10 rounded-full border border-brand-300/55 bg-stage-950 p-1'><Avatar name={me.name} from={me.from} to={me.to} src={me.src} size={52}/></span>
            <span className='absolute right-[4px] top-[139px] z-10 rounded-full border border-vibepurple-400/60 bg-stage-950 p-1'><Avatar name={topPerson.name} from={topPerson.from} to={topPerson.to} size={52} silhouette={!top}/></span>
            <WaveformBars bars={17} height={52} active={active} accent='#31f58a' className='absolute left-[54px] top-[147px] w-[92px] -rotate-6'/>
            <WaveformBars bars={17} height={52} active={active} accent='#8769ff' className='absolute right-[54px] top-[147px] w-[92px] rotate-6'/>
            <span className='absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-full border border-brand-300/35 bg-black/55 px-3 py-1.5 text-sm text-brand-200'>理解你的期待</span>
            <span className='absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-white/10 bg-black/55 px-3 py-1.5 text-sm text-white/60'>对齐音乐偏好</span>
            <span className='sr-only'>{Array.from({length:5}).map((_, index) => <i key={index} data-visual='track-bead' data-bead-state={stages[index]?.state ?? 'pending'}/>)}</span>
          </div>

          <div className='relative -mt-3 px-4 pb-1 text-center'>
            <p className='text-[22px] font-bold leading-snug text-white'>{paused ? '任务已暂停' : active ? `正在${currentStage?.label ?? '理解你的期待'}…` : headline}</p>
            <p className='mt-1.5 text-[15px] leading-relaxed text-ink-300'>{paused ? '已完成的工具轨迹仍保留；继续时沿用当前授权与条件' : sentence}</p>
            <div className='mt-3 flex items-center justify-center gap-2 text-[13px] text-white/55'>
              <span>已浏览 <b className='text-brand-300'>{browsedCount}</b> 人</span>
              <span className='text-white/20'>·</span>
              <span>已筛除 <b className='text-white/80'>{filteredCount}</b> 人</span>
              <span className='text-white/20'>·</span>
              <span className='max-w-[128px] truncate'>{paused ? '等待继续' : currentStage?.label ?? '准备执行'}</span>
            </div>
          </div>

          {/* 五个阶段用一条极简进度表示：两轨之间的共同音符才是主体；没有任务在跑时不占空间 */}
          {active || merged ? (
          <div
            ref={stageRow}
            className='relative mx-auto mb-3 mt-4 flex w-[252px] items-center justify-between'
            aria-label='匹配阶段'
          >
            <span className='absolute inset-x-1 h-px bg-white/10' style={{ top: 'calc(50% - 0.5px)' }} />
            <span
              ref={progressBar}
              data-visual='stage-progress'
              className='absolute inset-x-1 h-px bg-brand-500/60'
              style={{ top: 'calc(50% - 0.5px)' }}
            />
            {displayStages.map((item, index) => {
              const done = item.source?.state === 'done'
              const firstPending = displayStages.findIndex((entry) => entry.source?.state !== 'done')
              const isCurrent = index === firstPending && active
              return (
                <span
                  key={item.label}
                  data-stage={item.label}
                  data-stage-current={isCurrent ? '1' : '0'}
                  aria-label={item.label}
                  title={item.label}
                  className={cn(
                    'relative z-10 block rounded-full',
                    done
                      ? 'h-2.5 w-2.5 bg-brand-500'
                      : item.source?.state === 'failed'
                        ? 'h-2.5 w-2.5 bg-warm-400'
                        : isCurrent
                          ? 'h-2.5 w-2.5 bg-brand-400'
                          : 'h-2 w-2 border border-white/25 bg-stage-950',
                  )}
                />
              )
            })}
          </div>
          ) : null}

          <div className='grid grid-cols-2 gap-2 px-1'>
            {displayStages.map((item, index) => <div key={item.label} className={`rounded-2xl border px-3 py-2.5 text-sm ${item.source?.state === 'done' ? 'border-brand-400/30 bg-brand-400/10 text-brand-200' : active && index === displayStages.findIndex((entry) => entry.source?.state !== 'done') ? 'border-brand-400/45 bg-black/55 text-white' : 'border-white/8 bg-black/30 text-white/45'}`}><span className='mr-2'>{item.source?.state === 'done' ? '✓' : index + 1}</span>{item.label}</div>)}
          </div>

          {active || paused ? (
            <div className='pb-2 pt-3 text-center'>
              <Button full size='lg' onClick={() => paused ? void runAgent() : pauseAgent()}>
                {paused ? '继续寻找' : '暂停寻找'}
              </Button>
              <div className='mt-1 grid grid-cols-2 gap-1'>
                <button type='button' onClick={() => { cancelAgent(); navigate(`/concert/${concertId}/task`) }} className='min-h-11 text-[14px] text-white/65'>修改条件</button>
                <button type='button' onClick={exitToFrequency} className='min-h-11 text-[14px] text-white/65'>结束任务</button>
              </div>
            </div>
          ) : null}
        </section>

        {agent?.status === 'no_match' ? (
          <div className='mt-3'>
            <StateView
              status='empty'
              title='没有符合安全条件的同频搭子'
              description='Agent 不会为了凑人数放宽你的硬条件，也不会编造候选人。'
              actionLabel='去放宽条件'
              onAction={() => navigate(`/concert/${concertId}/task`)}
              secondaryLabel='查看 Agent 工作过程'
              onSecondary={() => setWorkOpen(true)}
            />
          </div>
        ) : null}

        {failed || agent?.status === 'error' ? (
          <div className='mt-3'>
            <StateView
              status='error'
              title='这次同频中断了'
              description={agentError || agent?.error || '网络或工具调用出现问题，可以重新运行'}
              actionLabel='重新运行'
              onAction={() => void runAgent()}
              secondaryLabel='返回修改需求'
              onSecondary={() => navigate(`/concert/${concertId}/task`)}
            />
          </div>
        ) : null}

        {!agent && !active ? (
          <div className='mt-3'>
            <StateView
              status='info'
              title='还没有开始匹配'
              description='点击「开始匹配」后，Agent 才会读取你已授权的音乐画像并检索同场的人。'
              actionLabel='开始匹配'
              onAction={() => void runAgent()}
              secondaryLabel='返回修改需求'
              onSecondary={() => navigate(`/concert/${concertId}/task`)}
            />
          </div>
        ) : null}

        {merged ? (
          <Button
            className='mt-3 glow-cta'
            full
            size='lg'
            icon={<SparkleIcon className='h-4 w-4' />}
            onClick={() => navigate(`/concert/${concertId}/reveal`)}
          >
            查看同频汇合
          </Button>
        ) : null}

        {/* 技术信息只有展开后才出现：工具调用、耗时、fallback、provider 都在这里 */}
        <section className='soft-card mt-3 overflow-hidden'>
          <button
            type='button'
            aria-expanded={workOpen}
            onClick={() => setWorkOpen((prev) => !prev)}
            className='flex min-h-11 w-full items-center gap-2 px-3.5 text-left'
          >
            <DiscIcon className='h-4 w-4 shrink-0 text-ink-400' />
            <span className='min-w-0 flex-1 text-[13px] text-ink-100'>查看 Agent 工作过程</span>
            <ChevronDownIcon className={cn('h-4 w-4 shrink-0 text-ink-400 transition', workOpen && 'rotate-180')} />
          </button>
          {workOpen ? (
            <div className='border-t border-white/6 px-3.5 py-3'>
              {agent ? (
                <div className='flex flex-col gap-4'>
                  <AgentEvidenceBody agent={agent} focus={top} stages={SYNC_STAGES} />
                  <Button variant='ghost' size='sm' full onClick={() => navigate(`/concert/${concertId}/trace`)}>
                    打开完整记录
                  </Button>
                </div>
              ) : (
                <p className='text-[12px] leading-relaxed text-ink-400'>
                  任务开始后，这里会按顺序记录每一次工具调用与输入输出摘要。
                </p>
              )}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  )
}
