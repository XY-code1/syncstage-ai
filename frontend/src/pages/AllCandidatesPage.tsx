import { useRef, useState } from 'react'
import type { UIEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { BandPill } from '../components/AgentEvidence'
import { PageShell } from '../components/PageShell'
import { Button, Card, DemoBadge, Sheet, StateView } from '../components/ui'
import { STAGE_BLUE, STAGE_PURPLE, Vinyl, WaveformBars } from '../components/musicVisuals'
import { cn } from '../lib/cn'
import { useConcertFlow } from '../store/concertFlow'
import { useSession } from '../store/session'

/** 「暂不同行」的候选项：只用来优化下一轮匹配，不会通知对方。 */
const SKIP_REASONS = ['音乐不搭', '人数不合适', '见面方式不同', '其它']

/** 结果卡上只留「一句理由」，完整解释在「查看详情」里。 */
function firstSentence(text: string): string {
  const cut = text.indexOf('。')
  return cut > 0 ? text.slice(0, cut + 1) : text
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex items-start gap-2.5'>
      <span className='mt-0.5 w-16 shrink-0 text-[13px] text-ink-400'>{label}</span>
      <span className='min-w-0 flex-1 text-[15px] leading-relaxed text-ink-100'>{value}</span>
    </div>
  )
}

/**
 * 全部候选：一次平铺全部候选人的列表页。
 *
 * 核心结果页（同频匹配结果）已经改成一次只看一位的票根卡；这里保留完整候选列表，
 * 用于横向对比与快速切换，不再承担首页主视觉。返回回到核心结果页。
 */
export function AllCandidatesPage() {
  const { concertId = '' } = useParams()
  const navigate = useNavigate()
  const { agent, agentRunning, agentStarting, runAgent, judgeMode, pushToast } = useSession()
  const { flow, patchFlow } = useConcertFlow(concertId)
  const [index, setIndex] = useState(0)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const stripRef = useRef<HTMLDivElement>(null)

  const back = () => navigate(`/concert/${concertId}/matches`)
  const busy = agentRunning || agentStarting
  const candidates = (agent?.rankedCandidates ?? []).slice(0, 3)
  const safeIndex = Math.min(index, Math.max(0, candidates.length - 1))
  const current = candidates[safeIndex]
  const markedIds = flow.skippedCandidateIds ?? []

  const goTo = (next: number) => {
    if (!candidates.length) return
    const bounded = Math.max(0, Math.min(candidates.length - 1, next))
    setIndex(bounded)
    const strip = stripRef.current
    const child = strip?.children[bounded] as HTMLElement | undefined
    if (strip && child) strip.scrollTo({ left: child.offsetLeft - strip.offsetLeft, behavior: 'smooth' })
  }

  const onStripScroll = (event: UIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget
    const width = strip.clientWidth || 1
    const next = Math.max(0, Math.min(candidates.length - 1, Math.round(strip.scrollLeft / width)))
    if (next !== safeIndex) setIndex(next)
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
    goTo(safeIndex + 1)
  }

  if (!agent || busy) {
    return (
      <PageShell title='全部候选' step={3} onBack={back}>
        <StateView
          status={busy ? 'loading' : 'info'}
          title={busy ? 'Agent 正在匹配' : '还没有开始匹配'}
          description={busy ? undefined : 'Agent 只会在你点击「开始匹配」后运行。'}
          actionLabel={busy ? undefined : '开始匹配'}
          onAction={busy ? undefined : () => void runAgent()}
          secondaryLabel={busy ? undefined : '返回同频结果'}
          onSecondary={busy ? undefined : back}
        />
      </PageShell>
    )
  }
  if (agent.status === 'error') {
    return (
      <PageShell title='全部候选' step={3} onBack={back}>
        <StateView
          status='error'
          title='匹配失败'
          description={agent.error}
          actionLabel='重新运行'
          onAction={() => navigate(`/concert/${concertId}/running`)}
          secondaryLabel='返回同频结果'
          onSecondary={back}
        />
      </PageShell>
    )
  }
  if (!candidates.length || !current) {
    return (
      <PageShell title='全部候选' step={3} onBack={back}>
        <StateView
          status='empty'
          title='没有符合硬条件的候选人'
          description='Agent 不会伪造结果或自动放宽安全条件。'
          actionLabel='修改任务'
          onAction={() => navigate(`/concert/${concertId}/task`)}
        />
      </PageShell>
    )
  }

  return (
    <PageShell
      title='全部候选'
      subtitle={`${candidates.length} 位同场候选人 · 左右切换一次看一位`}
      step={3}
      onBack={back}
      right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
    >
      <div className='animate-fade'>
        <div ref={stripRef} onScroll={onStripScroll} className='snap-row no-scrollbar flex gap-3 overflow-x-auto pb-1'>
          {candidates.map((item) => {
            const skipped = markedIds.includes(item.userId)
            return (
              <article key={item.userId} className='snap-card w-full min-w-full shrink-0'>
                <Card className='relative flex min-h-[380px] flex-col'>
                  <span className='absolute right-3.5 top-3.5' aria-hidden='true'>
                    <Vinyl size={30} accent={STAGE_PURPLE} spin />
                  </span>

                  <div className='flex items-center gap-3 pr-10'>
                    <Avatar
                      name={item.candidate.nickname}
                      from={item.candidate.avatar.from}
                      to={item.candidate.avatar.to}
                      size={58}
                      showRing={item.band === 'high'}
                    />
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-center gap-1.5'>
                        <h2 className='truncate text-[17px] font-semibold text-ink-100'>{item.candidate.nickname}</h2>
                        <BandPill band={item.band} />
                      </div>
                      <p className='mt-0.5 truncate text-[12.5px] text-ink-400'>{item.candidate.profileLabel}</p>
                      <p className='mt-1.5 text-[15px] font-semibold text-brand-300'>综合匹配度 {item.score}%</p>
                    </div>
                  </div>

                  <WaveformBars className='mt-3.5' bars={13} accent={STAGE_BLUE} height={18} />

                  <div className='mt-3.5 flex flex-col gap-2.5'>
                    <Fact label='共同歌曲' value={item.sharedSongs.slice(0, 2).map((song) => `《${song}》`).join('、') || '同场不同歌'} />
                    <Fact label='同行方式' value={item.sharedPurposes.slice(0, 2).join('、') || '同场观演'} />
                    <Fact label='安全边界' value={item.sharedSafety[0] || '只在公开场合见面'} />
                  </div>

                  <p className='mt-3.5 rounded-xl bg-white/[.03] px-3 py-2.5 text-[15px] leading-relaxed text-ink-200'>
                    匹配理由：{firstSentence(item.matchReason)}
                  </p>

                  {skipped ? (
                    <p className='mt-2.5 text-[12.5px] text-warm-400/90'>
                      已记录「暂不同行」，只用于优化下一轮匹配，对方不会收到任何通知。
                    </p>
                  ) : null}

                  <div className='mt-auto pt-3'>
                    <Button
                      variant='ghost'
                      size='sm'
                      full
                      onClick={() => {
                        patchFlow({ selectedCandidateId: item.userId })
                        navigate(`/concert/${concertId}/matches/${item.userId}`)
                      }}
                    >
                      查看详情
                    </Button>
                  </div>
                </Card>
              </article>
            )
          })}
        </div>

        <div className='mt-3 flex items-center justify-center gap-1.5'>
          {candidates.map((item, dotIndex) => (
            <button
              key={item.userId}
              type='button'
              aria-label={`第 ${dotIndex + 1} 位候选人`}
              onClick={() => goTo(dotIndex)}
              className={cn(
                'h-1.5 rounded-full transition-all',
                dotIndex === safeIndex ? 'w-5 bg-brand-500' : 'w-1.5 bg-white/20',
              )}
            />
          ))}
        </div>
        <p className='mt-2 text-center text-[12.5px] text-ink-400'>
          第 {safeIndex + 1} / {candidates.length} 位 · 左右滑动切换
        </p>

        <div className='mt-3 grid grid-cols-2 gap-2'>
          <Button variant='secondary' onClick={() => setSkipOpen(true)}>
            暂不同行
          </Button>
          <Button variant='secondary' onClick={() => goTo(safeIndex + 1)} disabled={safeIndex >= candidates.length - 1}>
            换一个
          </Button>
        </div>
        <Button
          className='mt-2 glow-cta'
          full
          size='lg'
          onClick={() => {
            patchFlow({ selectedCandidateId: current.userId })
            navigate(`/concert/${concertId}/matches/${current.userId}`)
          }}
        >
          查看这位的详情
        </Button>
      </div>

      <Sheet
        open={skipOpen}
        onClose={() => {
          setSkipOpen(false)
          setSkipReason('')
        }}
        title='暂不同行？'
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