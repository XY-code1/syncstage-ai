import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { BandPill } from '../components/AgentEvidence'
import { PageShell } from '../components/PageShell'
import { Button, DemoBadge, Sheet, StateView } from '../components/ui'
import {
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  MapPinIcon,
  ShieldIcon,
  SparkleIcon,
  TicketIcon,
} from '../components/icons'
import { demoConcerts } from '../data/demoData'
import { cn } from '../lib/cn'
import { useConcertFlow } from '../store/concertFlow'
import { useSession } from '../store/session'

/** 「暂不同频」的候选项：只用来优化下一轮匹配，不会通知对方。 */
const SKIP_REASONS = ['音乐不搭', '人数不合适', '见面方式不同', '其它']


/**
 * 同频匹配结果：核心结果页，一次只重点展示一位候选人。
 *
 * 从上到下：Agent 状态与一句结果说明 → 演唱会票根式匹配卡（人物/共同演出/高度同频/3 条理由/
 * 安全边界/公开集合点）→ 底部三个操作（暂不同频 / 换一个 / 让 Agent 先聊）。
 * 完整候选列表收进「查看全部候选」，评分明细仍然在「查看详情」里。
 */
export function MatchResultsPage() {
  const { concertId = '' } = useParams()
  const navigate = useNavigate()
  const { agent, agentRunning, agentStarting, runAgent, judgeMode, pushToast, dismissedCandidateIds, startNewMatch } = useSession()
  const { flow, patchFlow } = useConcertFlow(concertId)
  const [index, setIndex] = useState(0)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReason, setSkipReason] = useState('')

  const back = () => navigate(`/concert/${concertId}/running`)
  const busy = agentRunning || agentStarting
  // 本轮排除名单（撤回 / 拒绝过的候选人）不进入票根池，展示下一位可用候选人。
  const candidates = (agent?.rankedCandidates ?? [])
    .filter((item) => !(dismissedCandidateIds ?? []).includes(item.userId))
    .slice(0, 3)
  const safeIndex = Math.min(index, Math.max(0, candidates.length - 1))
  const current = candidates[safeIndex]
  const markedIds = flow.skippedCandidateIds ?? []
  const concert = demoConcerts.find((item) => item.id === concertId)

  const goNext = () => {
    if (safeIndex + 1 >= candidates.length) {
      pushToast('这一轮没有下一位了，可以重新发起一轮匹配', 'warn')
      return
    }
    setIndex(safeIndex + 1)
  }

  const confirmSkip = () => {
    if (!current || !skipReason) return
    patchFlow({
      skippedCandidateIds: Array.from(new Set([...markedIds, current.userId])),
      negativeFeedback: [...(flow.negativeFeedback ?? []), `${current.userId}:${skipReason}`],
    })
    pushToast('已记录，只用于优化下一轮匹配，不会通知对方', 'success')
    setSkipOpen(false)
    setSkipReason('')
    goNext()
  }

  if (!agent || busy) {
    return (
      <PageShell title='同频匹配结果' step={3} onBack={back}>
        <StateView
          status={busy ? 'loading' : 'info'}
          title={busy ? 'Agent 正在匹配' : '还没有开始匹配'}
          description={busy ? undefined : 'Agent 只会在你点击「开始匹配」后运行。'}
          actionLabel={busy ? undefined : '开始匹配'}
          onAction={busy ? undefined : () => void runAgent()}
          secondaryLabel={busy ? undefined : '返回修改需求'}
          onSecondary={busy ? undefined : () => navigate(`/concert/${concertId}/task`)}
        />
      </PageShell>
    )
  }
  if (agent.status === 'error') {
    return (
      <PageShell title='同频匹配结果' step={3} onBack={back}>
        <StateView
          status='error'
          title='匹配失败'
          description={agent.error}
          actionLabel='重新运行'
          onAction={() => navigate(`/concert/${concertId}/running`)}
          secondaryLabel='返回修改需求'
          onSecondary={() => navigate(`/concert/${concertId}/task`)}
        />
      </PageShell>
    )
  }
  if (!candidates.length || !current) {
    // Agent 本来就没有候选人（安全条件过滤后无匹配）→ 保留原有的「改条件」引导；
    // 有候选人但被本轮排除名单全部滤掉（撤回 / 暂不同频）→ 才给「重新扫描」。
    const hadCandidates = (agent.rankedCandidates ?? []).length > 0
    return (
      <PageShell title='同频匹配结果' step={3} onBack={back}>
        <StateView
          status='empty'
          title={hadCandidates ? '这一轮没有更多候选人了' : '没有符合硬条件的候选人'}
          description={
            hadCandidates
              ? '刚才撤回 / 暂不同频的候选人不会立刻重复出现；可以重新扫描一次。'
              : 'Agent 不会伪造结果或自动放宽安全条件。'
          }
          actionLabel={hadCandidates ? '重新扫描' : '修改任务'}
          onAction={
            hadCandidates
              ? () => {
                  startNewMatch({ clearDismissed: true })
                  navigate(`/concert/${concertId}/running`)
                }
              : () => navigate(`/concert/${concertId}/task`)
          }
          secondaryLabel={hadCandidates ? '修改任务' : undefined}
          onSecondary={hadCandidates ? () => navigate(`/concert/${concertId}/task`) : undefined}
        />
      </PageShell>
    )
  }

  const skipped = markedIds.includes(current.userId)
  const songs = current.sharedSongs.slice(0, 2).map((song) => `《${song}》`).join('、') || '同场不同歌'
  const purpose = current.sharedPurposes[0] ?? '一起排队候场'
  const safety = current.sharedSafety[0] ?? '只在公开场合见面'
  const meetingTime = concert?.meetingPoint.time ?? '18:50（开场前 40 分钟）'
  const meetingPoint = concert?.meetingPoint.name ?? '公开的集合点'
  const reasons = [
    { id: 'song', text: `共同歌曲：${songs}`, icon: <SparkleIcon className='h-4 w-4' /> },
    { id: 'time', text: `到场时间接近：${meetingTime}`, icon: <ClockIcon className='h-4 w-4' /> },
    { id: 'purpose', text: `同行方式：${purpose}`, icon: <CheckIcon className='h-4 w-4' /> },
  ]
  const ticketCode = 'NO.' + String(Math.abs(current.userId.length * 37 + current.score * 3) % 9000 + 1000)

  const footer = (
    <div>
      <div className='grid grid-cols-2 gap-2'>
        <Button variant='secondary' onClick={() => setSkipOpen(true)}>
          暂不同频
        </Button>
        <Button variant='secondary' onClick={goNext} disabled={safeIndex >= candidates.length - 1}>
          换一个
        </Button>
      </div>
      <Button
        className='mt-2 glow-cta'
        full
        size='lg'
        icon={<SparkleIcon className='h-4 w-4' />}
        onClick={() => {
          patchFlow({ selectedCandidateId: current.userId })
          navigate(`/concert/${concertId}/icebreak/${current.userId}`)
        }}
      >
        让Agent先聊
      </Button>
      <button
        type='button'
        data-visual='match-all-entry'
        onClick={() => navigate(`/concert/${concertId}/candidates`)}
        className='mx-auto mt-2 flex min-h-11 items-center gap-1 px-3 text-[14px] text-white/60'
      >
        查看全部候选（{candidates.length} 位）
        <ChevronRightIcon className='h-4 w-4' />
      </button>
    </div>
  )

  return (
    <PageShell
      title='同频匹配结果'
      subtitle='一次只看一位 · 你可以换人、拒绝或让 Agent 先聊'
      step={3}
      onBack={back}
      right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
      footer={footer}
      footerFixed
    >
      <div className='animate-fade space-y-3'>
        <div data-visual='match-agent-status' className='soft-card flex items-start gap-3 p-3.5'>
          <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/14 text-brand-300'>
            <SparkleIcon className='h-4.5 w-4.5' />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='text-[15px] font-semibold text-white'>Agent 已完成匹配</p>
            <p className='mt-0.5 text-[14px] leading-relaxed text-white/65'>
              在「{concert?.title ?? '同场演出'}」找到 {candidates.length} 位符合硬条件的同场观众，这一位同频度最高。
            </p>
          </div>
        </div>

        <article
          data-visual='match-focus'
          data-candidate={current.userId}
          className='relative overflow-hidden rounded-card border border-white/12 bg-surface-2'
        >
          <header className='flex items-center gap-2.5 px-4 pt-3.5'>
            <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-500/15 text-brand-300'>
              <TicketIcon className='h-4 w-4' />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='truncate text-[15px] font-semibold text-ink-100'>{concert?.title ?? '同场演出'}</p>
              <p className='truncate text-[12.5px] text-ink-400'>
                {concert?.dateLabel} · {concert?.venue}
              </p>
            </div>
            <span className='shrink-0 text-right text-[11px] leading-tight tracking-wider text-white/40'>
              {ticketCode}
              <span className='mt-0.5 block text-[10px] text-white/25'>Demo 票面</span>
            </span>
          </header>

          <div className='relative mt-2.5 flex items-center px-4'>
            <span className='absolute -left-2 h-4 w-4 rounded-full bg-stage-950' />
            <span
              className='h-px flex-1'
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 5px, transparent 5px 11px)' }}
            />
            <span className='absolute -right-2 h-4 w-4 rounded-full bg-stage-950' />
          </div>

          <div className='flex items-center gap-3.5 px-4 pt-3.5'>
            <Avatar
              name={current.candidate.nickname}
              from={current.candidate.avatar.from}
              to={current.candidate.avatar.to}
              size={64}
              showRing={current.band === 'high'}
            />
            <div className='min-w-0 flex-1'>
              <div className='flex flex-wrap items-center gap-1.5'>
                <h1 className='truncate text-[20px] font-semibold text-ink-100'>{current.candidate.nickname}</h1>
                <BandPill band={current.band} />
              </div>
              <p className='mt-0.5 truncate text-[13px] text-ink-400'>{current.candidate.profileLabel}</p>
              <p className='mt-1 text-[13px] text-ink-400'>共同演出：{concert?.title ?? '同场演出'}</p>
            </div>
            <div className='shrink-0 text-right'>
              <p className='text-[19px] font-semibold leading-none text-brand-300'>{current.score}%</p>
              <p className='mt-1 text-[11px] text-white/40'>综合匹配度</p>
              <p className='mt-0.5 text-[11px] text-white/30'>次要参考</p>
            </div>
          </div>

          <div className='mt-3.5 border-t border-white/6 px-4 pt-3.5'>
            <p className='text-[13px] font-semibold text-white/80'>最重要的 3 个匹配理由</p>
            <div className='mt-2.5 space-y-2'>
              {reasons.map((reason, reasonIndex) => (
                <div key={reason.id} className='flex min-h-11 items-center gap-2.5 rounded-2xl bg-white/[.045] px-3'>
                  <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500/14 text-[13px] font-semibold text-brand-300'>
                    {reasonIndex + 1}
                  </span>
                  <span className='min-w-0 flex-1 text-[15px] leading-relaxed text-ink-100'>{reason.text}</span>
                </div>
              ))}
            </div>
          </div>

          <dl className='mt-3.5 space-y-2 px-4 pb-4'>
            <div className='flex items-start gap-2.5'>
              <ShieldIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
              <div className='min-w-0 flex-1'>
                <dt className='text-[13px] text-white/45'>安全边界</dt>
                <dd className='text-[15px] leading-relaxed text-ink-100'>{safety}，不交换私人联系方式</dd>
              </div>
            </div>
            <div className='flex items-start gap-2.5'>
              <MapPinIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
              <div className='min-w-0 flex-1'>
                <dt className='text-[13px] text-white/45'>公开集合点</dt>
                <dd className='text-[15px] leading-relaxed text-ink-100'>{meetingPoint}</dd>
                <dd className='mt-0.5 text-[13px] text-white/50'>{meetingTime}</dd>
              </div>
            </div>
          </dl>

          <div className='flex items-center gap-2 border-t border-white/6 px-4 py-3'>
            <button
              type='button'
              onClick={() => {
                patchFlow({ selectedCandidateId: current.userId })
                navigate(`/concert/${concertId}/matches/${current.userId}`)
              }}
              className='min-h-11 flex-1 rounded-xl text-[15px] text-white/70 transition hover:text-white'
            >
              查看详情
            </button>
            <span className='h-5 w-px bg-white/10' />
            <p className='flex-1 text-center text-[12.5px] text-white/40'>
              第 {safeIndex + 1} / {candidates.length} 位
            </p>
          </div>

          {skipped ? (
            <p className='border-t border-white/6 px-4 py-2.5 text-[13px] text-warm-400/90'>
              已记录「暂不同频」，只用于优化下一轮匹配，对方不会收到任何通知。
            </p>
          ) : null}
        </article>

        <p className='text-center text-[13px] leading-relaxed text-white/40'>
          双方都在预沟通里确认后，才会创建临时同行房间
        </p>
        <div aria-hidden='true' className='h-24' />
      </div>

      <Sheet
        open={skipOpen}
        onClose={() => {
          setSkipOpen(false)
          setSkipReason('')
        }}
        title='暂不同频？'
        description='理由只用于优化下一轮匹配，不会通知对方，也不会降低你之后的匹配质量。'
      >
        <div className='space-y-2'>
          {SKIP_REASONS.map((reason) => (
            <button
              key={reason}
              type='button'
              onClick={() => setSkipReason(reason)}
              className={cn(
                'w-full min-h-12 rounded-xl border p-3 text-left text-[15px]',
                skipReason === reason ? 'border-warm-400/50 bg-warm-400/10 text-white' : 'border-white/10 text-white/75',
              )}
            >
              {reason}
            </button>
          ))}
          <Button variant='warm' full disabled={!skipReason} onClick={confirmSkip}>
            记录并看下一位
          </Button>
        </div>
      </Sheet>
    </PageShell>
  )
}