import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { MockNotice, QQMusicBar } from '../components/QQMusicBar'
import { AgentEvidenceButton, AgentEvidenceSheet, BandPill, EvidenceList, ScoreBars } from '../components/AgentEvidence'
import { Button, Card, Chip, DemoBadge, SectionTitle, Sheet, StateView } from '../components/ui'
import { CheckIcon, SparkleIcon, UsersIcon } from '../components/icons'
import { cn } from '../lib/cn'
import { useSession } from '../store/session'
import type { ScoredCandidate } from '../types'

const CONFIRM_STEPS = ['邀请已发出', '对方已查看', '双方确认']

function ConfirmTrack({ step }: { step: number }) {
  return (
    <div className='flex items-center gap-2'>
      {CONFIRM_STEPS.map((label, index) => (
        <div key={label} className='flex flex-1 flex-col items-center gap-1'>
          <div className={cn('h-1 w-full rounded-full', index <= step ? 'bg-brand-500' : 'bg-white/10')} />
          <span className={cn('text-[10px]', index <= step ? 'text-brand-300' : 'text-white/30')}>{label}</span>
        </div>
      ))}
    </div>
  )
}

export function MatchResultsPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { agent, agentRunning, runAgent, judgeMode, invite, peerViewed, createRoom, roomError, feedback, pushToast } = useSession()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState(false)
  const [reportId, setReportId] = useState<string | null>(null)

  if (!agent || agentRunning) {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='同频匹配结果' onBack={() => navigate(`/concert/${concertId}/agent`)} />
        <main className='flex-1 px-4 pt-4'>
          <StateView
            status='loading'
            title={agentRunning ? 'Agent 正在为你匹配…' : '还没有匹配结果'}
            description={agentRunning ? '正在对比同场观众的歌单与期待曲目' : '先让 Agent 跑一遍，才能看到同频候选人。'}
            actionLabel={agentRunning ? undefined : '让 Agent 开始匹配'}
            onAction={agentRunning ? undefined : () => void runAgent()}
          />
        </main>
      </div>
    )
  }

  if (agent.status === 'error') {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='同频匹配结果' onBack={() => navigate(`/concert/${concertId}/agent`)} />
        <main className='flex-1 px-4 pt-4'>
          <StateView
            status='error'
            title='匹配失败'
            description={agent.error || '网络或工具调用出现问题'}
            actionLabel='重新匹配'
            onAction={() => void runAgent()}
            secondaryLabel='回到 Agent 进度'
            onSecondary={() => navigate(`/concert/${concertId}/agent`)}
          />
        </main>
      </div>
    )
  }

  if (agent.status === 'no_match' || agent.rankedCandidates.length === 0) {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='同频匹配结果' onBack={() => navigate(`/concert/${concertId}/agent`)} />
        <main className='flex-1 px-4 pt-4'>
          <div className='flex flex-col gap-4'>
            <StateView
              status='empty'
              title='这一轮没有找到同频的人'
              description={agent.pendingConfirmation.reason || '所有候选人都被你的安全条件排除了。Agent 不会编造候选人，也不会替你放宽安全条件。'}
              actionLabel='放宽条件再匹配'
              onAction={() => navigate(`/concert/${concertId}/intent`)}
            />
            <Card>
              <SectionTitle title='被排除的候选人' hint={`共 ${agent.excludedCandidates.length} 人`} />
              <div className='flex flex-col gap-2'>
                {agent.excludedCandidates.map((item) => (
                  <div key={item.userId} className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5'>
                    <p className='text-[12px] text-white/75'>{item.nickname}</p>
                    <p className='mt-1 text-[11px] text-white/45'>{item.rule} · {item.reason}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </main>
        <AgentEvidenceSheet open={sheetOpen} onClose={() => setSheetOpen(false)} agent={agent} />
      </div>
    )
  }

  const ranked = agent.rankedCandidates
  const visible = expanded ? ranked : ranked.slice(0, 3)
  const pending = agent.pendingConfirmation
  const invited = ranked.find((item) => item.userId === pending.candidateId) ?? null
  const confirmStep = pending.status === 'both_confirmed' || pending.status === 'confirmed' ? 2 : peerViewed ? 1 : 0
  const report = reportId ? agent.handshakeReports?.[reportId] : null

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='同频匹配结果'
        subtitle={`${ranked.length} 位候选人 · 每个理由都可以核对`}
        onBack={() => navigate(`/concert/${concertId}/agent`)}
        right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
      />

      <main className='flex-1 px-4 pb-40 pt-4'>
        <div className='flex flex-col gap-4'>
          <Card className='border-brand-500/25 bg-brand-500/[0.05]'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <p className='text-[15px] font-semibold text-white'>Agent 找到 {ranked.length} 位同频候选人</p>
                <p className='mt-1 text-[11.5px] leading-relaxed text-white/55'>
                  同场候选人 {agent.candidateIds.length + agent.excludedCandidates.length} 人 ·
                  硬条件排除 {agent.excludedCandidates.length} 人 · 工具调用 {agent.trace.length} 次
                </p>
              </div>
              <AgentEvidenceButton onClick={() => setSheetOpen(true)} count={agent.trace.length} />
            </div>
            <div className='mt-3 rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5'>
              <p className='text-[11px] text-white/45'>Agent 的组队方案</p>
              <p className='mt-1 text-[12px] leading-relaxed text-white/75'>
                {agent.proposedGroup.rationale ?? '还没有生成组队方案'}
              </p>
              {agent.proposedGroup.meetingPoint?.name ? (
                <p className='mt-1.5 text-[11px] text-white/45'>
                  公开集合点：{agent.proposedGroup.meetingPoint.name} · {agent.proposedGroup.meetingPoint.time}
                </p>
              ) : null}
            </div>
          </Card>

          {pending.required ? (
            <Card className={cn('border', pending.status === 'both_confirmed' || pending.status === 'confirmed' ? 'border-brand-500/45 bg-brand-500/[0.08]' : 'border-white/10')}>
              <SectionTitle
                title='双向确认状态'
                hint={pending.reason}
                icon={<UsersIcon className='h-4 w-4 text-brand-400' />}
              />
              <ConfirmTrack step={confirmStep} />
              <div className='mt-3 flex flex-col gap-2'>
                {invited ? (
                  <div className='flex items-center gap-2.5'>
                    <Avatar name={invited.candidate.nickname} from={invited.candidate.avatar.from} to={invited.candidate.avatar.to} size={32} />
                    <div className='min-w-0 flex-1'>
                      <p className='text-[12.5px] text-white/85'>{invited.candidate.nickname}</p>
                      <p className='text-[11px] text-white/45'>
                        {pending.status === 'both_confirmed' || pending.status === 'confirmed' ? '对方已确认同行' : peerViewed ? '对方已查看你的邀请' : '等待对方查看'}
                      </p>
                    </div>
                    {pending.status === 'both_confirmed' || pending.status === 'confirmed' ? (
                      <span className='flex items-center gap-1 text-[11px] text-brand-300'>
                        <CheckIcon className='h-3.5 w-3.5' /> 已确认
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {pending.status === 'both_confirmed' || pending.status === 'confirmed' ? (
                  <Button
                    full
                    icon={<SparkleIcon className='h-4 w-4' />}
                    onClick={async () => {
                      const ok = await createRoom()
                      if (ok) navigate(`/concert/${concertId}/room`)
                    }}
                  >
                    进入同频临时房间
                  </Button>
                ) : (
                  <p className='rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2 text-[11px] leading-relaxed text-white/45'>
                    双方都确认后，Agent 才会调用创建房间的工具，并把公开集合点写进房间。
                  </p>
                )}
                {roomError ? <p className='text-[11px] text-rose-300'>{roomError}</p> : null}
              </div>
            </Card>
          ) : null}

          <div className='flex flex-col gap-3'>
            {visible.map((candidate) => (
              <CandidateCard
                key={candidate.userId}
                candidate={candidate}
                invitedId={pending.candidateId ?? null}
                canInvite={pending.status !== 'both_confirmed' && pending.status !== 'confirmed'}
                onInvite={() => void invite(candidate.userId)}
                onEvidence={() => setSheetOpen(true)}
                onHandshake={() => setReportId(candidate.userId)}
              />
            ))}
          </div>

          {ranked.length > 3 ? (
            <Button variant='ghost' size='sm' full onClick={() => setExpanded((prev) => !prev)}>
              {expanded ? '收起其余候选人' : `展开其余 ${ranked.length - 3} 位候选人`}
            </Button>
          ) : null}

          {!feedbackSent ? (
            <Card>
              <SectionTitle title='这次推荐准吗？' hint='反馈会用于后续调整匹配权重' />
              <div className='flex flex-wrap gap-2'>
                {[
                  { key: 'good', label: '理由可信' },
                  { key: 'neutral', label: '一般' },
                  { key: 'bad', label: '不太准' },
                ].map((option) => (
                  <Chip
                    key={option.key}
                    label={option.label}
                    size='sm'
                    onClick={() => {
                      void feedback(option.key, [option.label], '')
                      setFeedbackSent(true)
                      pushToast('反馈已记录，会用于后续调整匹配权重', 'success')
                    }}
                  />
                ))}
              </div>
            </Card>
          ) : null}

          <MockNotice compact />
        </div>
      </main>

      <AgentEvidenceSheet open={sheetOpen} onClose={() => setSheetOpen(false)} agent={agent} focus={invited ?? ranked[0]} />
      <Sheet open={Boolean(report)} onClose={() => setReportId(null)} title='Agent 预沟通报告' description='双方 Agent 仅交换匿名结构字段，不进行自由聊天。'>
        {report ? <div className='max-h-[68vh] space-y-4 overflow-y-auto pr-1'>
          <ReportBlock title='一致条件' items={report.agreements} tone='brand' />
          <ReportBlock title='冲突条件' items={report.conflicts.length ? report.conflicts : ['未发现硬冲突']} tone={report.conflicts.length ? 'warn' : 'brand'} />
          <ReportBlock title='待真人确认条件' items={report.needsHumanConfirmation} tone='violet' />
          <ReportBlock title='使用的数据证据' items={report.evidence.map((v) => `${v.field}：${v.value}（${v.source}）`)} tone='neutral' />
          <ReportBlock title='被隐藏的数据' items={report.hiddenFields} tone='neutral' />
          <div className='rounded-2xl border border-brand-500/25 bg-brand-500/[.06] p-3'><p className='text-sm font-semibold text-brand-200'>安全过滤结果：已通过</p><p className='mt-1 text-xs leading-relaxed text-white/45'>未交换真实姓名、联系方式、精确位置和原始听歌历史。</p></div>
        </div> : null}
      </Sheet>
    </div>
  )
}

function CandidateCard({
  candidate,
  invitedId,
  canInvite,
  onInvite,
  onEvidence,
  onHandshake,
}: {
  candidate: ScoredCandidate
  invitedId: string | null
  canInvite: boolean
  onInvite: () => void
  onEvidence: () => void
  onHandshake: () => void
}) {
  const invited = invitedId === candidate.userId
  return (
    <Card className={cn(invited && 'border-brand-500/45')}>
      <div className='flex items-start gap-3'>
        <Avatar name={candidate.candidate.nickname} from={candidate.candidate.avatar.from} to={candidate.candidate.avatar.to} size={46} showRing={candidate.band === 'high'} />
        <div className='min-w-0 flex-1'>
          <div className='flex items-center gap-2'>
            <p className='truncate text-[15px] font-semibold text-white'>{candidate.candidate.nickname}</p>
            <BandPill band={candidate.band} />
          </div>
          <p className='mt-0.5 truncate text-[11px] text-white/45'>
            {candidate.candidate.profileLabel} · {candidate.candidate.city} · 看过 {candidate.candidate.showCount} 场
          </p>
          <p className='mt-1 text-[11.5px] leading-relaxed text-white/55'>{candidate.candidate.headline}</p>
        </div>
        <div className='shrink-0 text-right'>
          <p className='text-[24px] font-semibold leading-none text-brand-300'>{candidate.score}</p>
          <p className='mt-1 text-[10px] text-white/40'>匹配度</p>
        </div>
      </div>

      <div className='mt-3 rounded-2xl border border-brand-500/20 bg-brand-500/[0.06] px-3 py-2.5'>
        <p className='text-[11px] text-brand-300'>匹配理由（只引用真实共同点）</p>
        <p className='mt-1 text-[12px] leading-relaxed text-white/80'>{candidate.matchReason || '共同点太少，暂不生成推荐理由'}</p>
      </div>

      <div className='mt-3 grid grid-cols-2 gap-2'>
        <div className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2'>
          <p className='text-[10.5px] text-white/40'>共同歌曲</p>
          <p className='mt-1 text-[11.5px] leading-relaxed text-white/75'>
            {candidate.sharedSongs.length ? candidate.sharedSongs.slice(0, 3).map((song) => `《${song}》`).join('') : '暂无'}
          </p>
        </div>
        <div className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2'>
          <p className='text-[10.5px] text-white/40'>共同歌手</p>
          <p className='mt-1 text-[11.5px] leading-relaxed text-white/75'>
            {candidate.sharedArtists.length ? candidate.sharedArtists.join('、') : candidate.candidate.topArtists.slice(0, 2).join('、')}
          </p>
        </div>
        <div className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2'>
          <p className='text-[10.5px] text-white/40'>同行目的</p>
          <p className='mt-1 text-[11.5px] leading-relaxed text-white/75'>{candidate.sharedPurposes.join('、') || '现场同行'}</p>
        </div>
        <div className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2'>
          <p className='text-[10.5px] text-white/40'>交流与安全</p>
          <p className='mt-1 text-[11.5px] leading-relaxed text-white/75'>{candidate.candidate.chatStyle} · {candidate.candidate.safety.slice(0, 1).join('')}</p>
        </div>
      </div>
      <Button className='mt-3' variant='secondary' full onClick={onHandshake}>查看 Agent 预沟通报告</Button>

      <div className='mt-2 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2'>
        <p className='text-[10.5px] text-white/40'>差异点</p>
        <ul className='mt-1 flex flex-col gap-1'>
          {candidate.differences.map((item) => (
            <li key={item} className='text-[11.5px] leading-relaxed text-white/60'>· {item}</li>
          ))}
        </ul>
      </div>

      <div className='mt-3 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2.5'>
          <p className='mb-2 text-[11px] text-white/60'>综合匹配评分组成</p>
          <ScoreBars breakdown={candidate.scoreBreakdown} />
      </div>

      <div className='mt-3'>
        <p className='mb-1.5 text-[10.5px] text-white/40'>已验证条件</p>
        <div className='flex flex-wrap gap-1.5'>
          {['同一场演出', '音乐偏好已核对', `同行目的：${candidate.sharedPurposes[0] ?? '现场同行'}`, '安全条件通过'].map((item) => (
            <span key={item} className='rounded-pill border border-brand-500/25 bg-brand-500/[0.07] px-2 py-1 text-[10.5px] text-brand-100'>
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className='mt-3 flex items-center gap-2'>
        <Button size='sm' variant='secondary' onClick={onEvidence}>
          查看依据
        </Button>
        <Button size='sm' full disabled={!canInvite} onClick={onInvite}>
          {invited ? '已发出邀请' : '邀请 ta 同行'}
        </Button>
      </div>
      <div className='mt-2'>
        <EvidenceList candidate={candidate} compact />
      </div>
    </Card>
  )
}

function ReportBlock({ title, items, tone }: { title: string; items: string[]; tone: 'brand' | 'warn' | 'violet' | 'neutral' }) {
  const color = tone === 'warn' ? 'text-warm-400' : tone === 'violet' ? 'text-violet-400' : tone === 'brand' ? 'text-brand-300' : 'text-white/65'
  return <section><p className={`mb-2 text-sm font-semibold ${color}`}>{title}</p><div className='space-y-1.5'>{items.map((item) => <p key={item} className='rounded-xl border border-white/8 bg-white/[.025] px-3 py-2 text-sm leading-relaxed text-white/70'>{item}</p>)}</div></section>
}
