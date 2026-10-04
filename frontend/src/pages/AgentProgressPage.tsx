import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AgentEvidenceBody } from '../components/AgentEvidence'
import { QQMusicBar } from '../components/QQMusicBar'
import { Button, DemoBadge, StateView } from '../components/ui'
import { ChevronDownIcon, DiscIcon, SparkleIcon } from '../components/icons'
import { CANDIDATE_TRACK, USER_TRACK, Vinyl, type TrackPerson } from '../components/musicVisuals'
import { Avatar } from '../components/Avatar'
import { cn } from '../lib/cn'
import { MOTION_OK, MOTION_REDUCE, gsap, useGSAP } from '../lib/gsapSetup'
import { SYNC_STAGES, syncStagesOf } from '../lib/agentMock'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { useMusicPlayer } from '../components/music/DemoMusicPlayer'
import { localDemoAudioByKey } from '../data/localDemoAudioManifest'
import { useExitToFrequency } from '../hooks/useExitToFrequency'
import type { ParticleStageStatus } from '../components/visuals/particleStageTypes'

// 粒子舞台走 three.js，懒加载：不进入首屏主包，也不阻塞首屏渲染。
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
 * Agent 匹配项（Tara 寻找同频者）。
 *
 * 结构上只做一件事：把「当前歌曲 → 唱片主视觉 → 搜索标题 → 三项数据 → 四阶段进度 →
 * 暂停 → 修改条件 / 结束任务」按正常文档流竖着排下来。
 *
 * 硬约束：
 * - 页面只有一个视觉中心（中央唱片），粒子 Canvas 只当背景层（z-0、不拦点击）；
 * - 除头像与粒子外，标题 / 统计 / 进度 / 按钮一律不使用 absolute 定位，
 *   不再靠叠 z-index 掩盖重叠；
 * - 内容层不依赖任何固定高度，390×844 与更矮的屏幕都是自然滚动；
 * - 逐段间距 ≥ 20px，底部留 safe-area-inset-bottom。
 */
export function AgentProgressPage() {
  const musicPlayer = useMusicPlayer()
  const selectedTrack = localDemoAudioByKey(musicPlayer.selectedTrackId)
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

  const stageRatio = stages.length <= 1 ? 0 : doneCount / (stages.length - 1)

  // 当前阶段点：只做呼吸缩放，位置仍然来自真实 stage 状态。
  const stageRow = useRef<HTMLDivElement>(null)
  const pulsedDot = useRef<HTMLElement | null>(null)
  useGSAP(() => {
    const row = stageRow.current
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
    mm.add(MOTION_REDUCE, () => {
      gsap.set(node, { scale: 1, opacity: 1, transformOrigin: '50% 50%' })
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

  // 搜索阶段继续播放用户自己选的那首歌（只有解锁过音频才会发声，绝不自动播放）。
  useEffect(() => {
    void musicPlayer.playSelected()
  }, [])

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
    ? `正在${currentStage?.label ?? '理解你的期待'}…`
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

  const currentLabel = paused ? '等待继续' : currentStage?.label ?? '准备执行'

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='正在寻找同频的人'
        onBack={exitToFrequency}
        right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
      />

      <main
        className='relative flex-1 overflow-hidden px-4 pt-3'
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      >
        {/* 背景层：现场氛围图 + 暗色渐变，永远在内容之后 */}
        <div className='pointer-events-none absolute inset-0 z-0' aria-hidden='true'>
          <img
            src={`${import.meta.env.BASE_URL}concert-crowd-bg.png`}
            alt=''
            className='h-full w-full object-cover object-bottom opacity-25'
          />
          <div className='absolute inset-0 bg-gradient-to-b from-stage-950 via-stage-950/80 to-stage-950/60' />
        </div>

        {/* 粒子 Canvas：只当背景，透明度降低约 40%，且不拦点击 */}
        <Suspense fallback={null}>
          <FrequencyParticleStage
            variant='ambient'
            className='z-0 opacity-60'
            status={stageStatus}
            progress={stageProgress}
            leftAvatar={profile.avatar ?? undefined}
            leftName={profile.nickname || '你'}
            rightName={top?.candidate.nickname ?? '同频听众'}
          />
        </Suspense>

        {/* 内容层：正常文档流竖排，不使用固定高度 */}
        <div className='relative z-10 flex flex-col'>
          {/* 1. 当前歌曲胶囊 */}
          <p className='mx-auto max-w-full truncate rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[12px] text-white/65'>
            当前信号 · 《{selectedTrack.title}》
          </p>

          {/* 2. 唱片主视觉区：唯一视觉中心，双方头像固定在唱片左右 */}
          <div
            data-visual='dual-track'
            data-track-state={merged ? 'merged' : active || paused ? 'converging' : 'apart'}
            data-track-progress={stageRatio}
            className='relative mx-auto mt-5 w-[clamp(220px,64vw,320px)]'
          >
            <span className='absolute left-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-brand-300/55 bg-stage-950 p-1'>
              <Avatar name={me.name} from={me.from} to={me.to} src={me.src} size={48} />
            </span>
            <span className='absolute right-0 top-1/2 z-20 -translate-y-1/2 rounded-full border border-vibepurple-400/60 bg-stage-950 p-1'>
              <Avatar name={topPerson.name} from={topPerson.from} to={topPerson.to} size={48} silhouette={!top} />
            </span>

            <div className='relative flex aspect-square w-full items-center justify-center'>
              <span className='absolute inset-0 rounded-full border border-brand-300/15' />
              <span className='absolute inset-[10%] rounded-full border border-brand-300/25 shadow-[0_0_54px_rgba(49,245,138,0.16)]' />
              <Vinyl size={260} sizeCss='100%' spin={active} accent={merged ? '#31f58a' : '#4a7dff'} />
            </div>

            <span className='sr-only'>
              {Array.from({ length: 5 }).map((_, index) => (
                <i key={index} data-visual='track-bead' data-bead-state={stages[index]?.state ?? 'pending'} />
              ))}
            </span>
          </div>

          {/* 3. 搜索标题 + 一句辅助文案（暗色渐变底，保证文字对比度） */}
          <div className='mt-5 rounded-2xl bg-gradient-to-b from-stage-950/75 via-stage-950/60 to-stage-950/25 px-3 py-3 text-center'>
            <h1 className='text-[21px] font-bold leading-snug text-white'>{paused ? '任务已暂停' : headline}</h1>
            <p className='mx-auto mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-ink-300'>
              {paused ? '已完成的工具轨迹仍保留；继续时沿用当前授权与条件' : sentence}
            </p>

            {/* 4. 三项轻量数据 */}
            <div className='mt-3 flex items-center justify-center gap-2.5 text-[13px] text-white/60'>
              <span>
                已浏览 <b className='text-brand-300'>{browsedCount}</b> 人
              </span>
              <span className='text-white/20'>·</span>
              <span>
                已筛除 <b className='text-white/85'>{filteredCount}</b> 人
              </span>
              <span className='text-white/20'>·</span>
              <span className='max-w-[104px] truncate'>{currentLabel}</span>
            </div>
          </div>

          {/* 5. 四阶段进度：真实 stage 状态驱动，全部在文档流里 */}
          {active || paused || merged ? (
            <div ref={stageRow} aria-label='匹配阶段' className='mt-4 flex items-start gap-1 px-1'>
              {displayStages.map((item, index) => {
                const done = item.source?.state === 'done'
                const firstPending = displayStages.findIndex((entry) => entry.source?.state !== 'done')
                const isCurrent = index === firstPending && active
                return (
                  <div
                    key={item.label}
                    data-stage={item.label}
                    data-stage-current={isCurrent ? '1' : '0'}
                    className='flex min-w-0 flex-1 flex-col items-center gap-1.5'
                  >
                    <span
                      className={cn(
                        'block rounded-full',
                        done
                          ? 'h-2.5 w-2.5 bg-brand-500'
                          : item.source?.state === 'failed'
                            ? 'h-2.5 w-2.5 bg-warm-400'
                            : isCurrent
                              ? 'h-2.5 w-2.5 bg-brand-400'
                              : 'h-2 w-2 border border-white/25 bg-stage-950',
                      )}
                    />
                    <span
                      className={cn(
                        'text-center text-[10.5px] leading-tight',
                        done ? 'text-brand-200' : isCurrent ? 'text-white' : 'text-white/45',
                      )}
                    >
                      {item.label}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : null}

          {/* 6. 暂停 / 继续 */}
          {active || paused ? (
            <div className='mt-4'>
              <Button full size='lg' onClick={() => (paused ? void runAgent() : pauseAgent())}>
                {paused ? '继续寻找' : '暂停寻找'}
              </Button>
              {/* 7. 修改条件 / 结束任务：与主按钮间隔 20px */}
              <div className='mt-5 grid grid-cols-2 gap-1'>
                <button
                  type='button'
                  onClick={() => {
                    cancelAgent()
                    navigate(`/concert/${concertId}/task`)
                  }}
                  className='min-h-11 text-[14px] text-white/65'
                >
                  修改条件
                </button>
                <button type='button' onClick={exitToFrequency} className='min-h-11 text-[14px] text-white/65'>
                  结束任务
                </button>
              </div>
            </div>
          ) : null}

          {agent?.status === 'no_match' ? (
            <div className='mt-4'>
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
            <div className='mt-4'>
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
            <div className='mt-4'>
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
              className='glow-cta mt-4'
              full
              size='lg'
              icon={<SparkleIcon className='h-4 w-4' />}
              onClick={() => navigate(`/concert/${concertId}/reveal`)}
            >
              查看同频汇合
            </Button>
          ) : null}

          {/* 技术信息只有展开后才出现：工具调用、耗时、fallback、provider 都在这里 */}
          <section className='soft-card mt-4 overflow-hidden'>
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
        </div>
      </main>
    </div>
  )
}
