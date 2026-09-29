import { Button, DemoBadge, SectionTitle, Sheet } from './ui'
import { cn } from '../lib/cn'
import { SCOPE_LABELS } from '../lib/tmeMock'
import { AGENT_PHASES } from '../lib/agentMock'
import type { AgentState, ScoredCandidate } from '../types'

export function BandPill({ band }: { band: 'high' | 'mid' | 'low' }) {
  const text = band === 'high' ? '高度同频' : band === 'mid' ? '比较同频' : '低频重合'
  return (
    <span
      className={cn(
        'rounded-pill border px-2 py-[2px] text-[10px]',
        band === 'high'
          ? 'border-brand-500/45 bg-brand-500/15 text-brand-200'
          : band === 'mid'
            ? 'border-warm-400/40 bg-warm-400/12 text-warm-400'
            : 'border-white/15 bg-white/[0.04] text-white/50',
      )}
    >
      {text}
    </span>
  )
}

export function ScoreBars({ breakdown }: { breakdown: ScoredCandidate['scoreBreakdown'] }) {
  return (
    <div className='flex flex-col gap-2'>
      {breakdown.dimensions.map((dimension) => (
        <div key={dimension.id}>
          <div className='flex items-baseline justify-between text-[11px]'>
            <span className='text-white/70'>
              {dimension.label}
              <span className='ml-1 text-white/35'>权重 {dimension.weight}%</span>
            </span>
            <span className='text-white/80'>
              {dimension.points} / {dimension.weight}
            </span>
          </div>
          <div className='mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/8'>
            <div
              className='h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400'
              style={{ width: `${Math.round(dimension.ratio * 100)}%` }}
            />
          </div>
          <p className='mt-1 text-[10.5px] leading-relaxed text-white/40'>{dimension.detail}</p>
        </div>
      ))}
      <p className='text-[10.5px] text-white/35'>{breakdown.formula}</p>
    </div>
  )
}

export function EvidenceList({ candidate, compact }: { candidate: ScoredCandidate; compact?: boolean }) {
  return (
    <div className='flex flex-col gap-1.5'>
      {candidate.evidence.map((entry, index) => (
        <div key={`${entry.kind}-${index}`} className='rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2'>
          <div className='flex items-center gap-2'>
            <span className='text-[11px] text-brand-300'>{entry.label}</span>
            <span className='rounded-pill border border-white/10 px-1.5 py-[1px] text-[10px] text-white/40'>
              来源：{SCOPE_LABELS[entry.source] ?? entry.sourceLabel}
            </span>
          </div>
          <p className='mt-1 text-[11.5px] leading-relaxed text-white/70'>{entry.text}</p>
          {!compact && entry.items.length > 0 ? (
            <p className='mt-1 text-[10.5px] text-white/35'>引用条目：{entry.items.map((item) => `《${item}》`).join(' ')}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** 「查看 Agent 依据」抽屉：工具调用、数据来源、被排除的人、得分构成、下一步 */
export function AgentEvidenceSheet({
  open,
  onClose,
  agent,
  focus,
}: {
  open: boolean
  onClose: () => void
  agent: AgentState
  focus?: ScoredCandidate | null
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title='Agent 依据'
      description='这里可以看到 Agent 每一步做了什么、用了哪些数据、排除了谁，以及你为什么和 ta 匹配。'
    >
      <div className='max-h-[62vh] overflow-y-auto pr-1'>
        <div className='flex flex-col gap-5'>
          <div>
            <SectionTitle title='工具调用步骤' hint={`共 ${agent.trace.length} 次工具调用`} />
            <div className='flex flex-col gap-2'>
              {agent.trace.map((step, index) => (
                <div key={`${step.name}-${index}`} className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5'>
                  <div className='flex items-center gap-2'>
                    <span className='text-[12px] text-white/85'>{step.label}</span>
                    <span className='rounded-pill border border-white/10 px-1.5 py-[1px] text-[10px] text-white/40'>{step.name}</span>
                    {step.usedFallback ? (
                      <span className='rounded-pill border border-warm-400/40 bg-warm-400/12 px-1.5 py-[1px] text-[10px] text-warm-400'>fallback</span>
                    ) : null}
                    <span className='ml-auto text-[10px] text-white/35'>{step.durationMs} ms</span>
                  </div>
                  <p className='mt-1.5 text-[11px] leading-relaxed text-white/45'>输入：{step.inputSummary}</p>
                  <p className='mt-0.5 text-[11px] leading-relaxed text-white/65'>输出：{step.outputSummary}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title='使用的数据来源' hint='全部来自当前模拟的脱敏数据' />
            <div className='flex flex-col gap-2 text-[11.5px] text-white/65'>
              <p>
                数据提供方：{agent.provider?.provider ?? 'mock_qqmusic'} ·
                {agent.provider?.isDemo ? ' 脱敏 Demo 数据' : ' 官方数据'}
              </p>
              <p>
                你授权的范围：
                {agent.authorizedScopes.length > 0
                  ? agent.authorizedScopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join('、')
                  : '未授权任何音乐数据'}
              </p>
              {agent.musicProfile ? (
                <p>
                  实际读取到：收藏 {agent.musicProfile.favoriteTracks.length} 首 · 常听歌手 {agent.musicProfile.topArtists.length} 位 ·
                  近期播放 {agent.musicProfile.recentPlays.length} 条 · 关注演出 {agent.musicProfile.followedEventIds.length} 场 ·
                  歌单标签 {agent.musicProfile.playlistTags.length} 个
                </p>
              ) : null}
              <p className='text-white/40'>{agent.provider?.disclaimer}</p>
            </div>
          </div>

          <div>
            <SectionTitle title='被排除的候选人' hint={`共 ${agent.excludedCandidates.length} 人，都是硬条件命中的结果`} />
            {agent.excludedCandidates.length === 0 ? (
              <p className='text-[11.5px] text-white/45'>这一轮没有被硬条件排除的候选人。</p>
            ) : (
              <div className='flex flex-col gap-2'>
                {agent.excludedCandidates.map((item) => (
                  <div key={item.userId} className='rounded-2xl border border-white/8 bg-white/[0.025] px-3 py-2.5'>
                    <div className='flex items-center gap-2'>
                      <span className='text-[12px] text-white/80'>{item.nickname}</span>
                      <span className='rounded-pill border border-rose-400/35 bg-rose-400/10 px-1.5 py-[1px] text-[10px] text-rose-300'>
                        {item.rule}
                      </span>
                    </div>
                    <p className='mt-1 text-[11px] leading-relaxed text-white/50'>{item.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {focus ? (
            <div>
              <SectionTitle title={`得分构成 · ${focus.candidate.nickname}`} hint='总分由四个维度加权得出，不存在黑箱加分' />
              <ScoreBars breakdown={focus.scoreBreakdown} />
              <div className='mt-3'>
                <p className='mb-2 text-[12px] text-white/70'>推荐理由引用的依据</p>
                <EvidenceList candidate={focus} />
              </div>
            </div>
          ) : null}

          <div>
            <SectionTitle title='等待你确认的下一步' />
            <div className='rounded-2xl border border-brand-500/30 bg-brand-500/[0.07] px-3 py-3'>
              <p className='text-[12px] text-white/80'>
                {agent.pendingConfirmation.status === 'both_confirmed'
                  ? '双方都已确认，可以创建临时同频房间了。'
                  : agent.pendingConfirmation.status === 'awaiting_peer'
                    ? '邀请已发出，正在等对方确认；双方都确认后才会创建房间。'
                    : agent.pendingConfirmation.status === 'blocked'
                      ? '当前没有可邀请的人，需要先放宽某一条硬条件。'
                      : '选择一位同频搭子发起邀请，对方同意后才会创建临时房间。'}
              </p>
              <p className='mt-1.5 text-[11px] text-white/45'>
                创建房间、共享集合点、保留联系之前，Agent 都必须先拿到双方的确认。
              </p>
            </div>
          </div>

          <div className='flex flex-wrap gap-1.5'>
            {AGENT_PHASES.map((phase) => (
              <span key={phase.id} className='rounded-pill border border-white/10 px-2 py-1 text-[10px] text-white/45'>
                {phase.label}
              </span>
            ))}
          </div>

          <Button variant='secondary' full onClick={onClose}>
            收起依据
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

export function AgentEvidenceButton({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button
      type='button'
      onClick={onClick}
      className='inline-flex items-center gap-1.5 rounded-pill border border-brand-500/35 bg-brand-500/10 px-3 py-1.5 text-[11px] text-brand-200 transition hover:bg-brand-500/16'
    >
      查看 Agent 依据
      <span className='text-brand-300/70'>· {count}</span>
    </button>
  )
}

export function JudgeHint() {
  return <DemoBadge label='评委模式：显示工具轨迹' />
}