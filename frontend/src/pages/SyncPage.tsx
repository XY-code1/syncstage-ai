import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { SegmentedTabs, TabHeader } from '../components/TabLayout'
import { BandPill, EvidenceList, ScoreBars } from '../components/AgentEvidence'
import { ChevronRightIcon, SparkleIcon, UsersIcon } from '../components/icons'
import { Button, ScoreRing, Sheet } from '../components/ui'
import { demoConcerts } from '../data/demoData'
import { recommendTeammates, sharedHighlights } from '../lib/recommend'
import { useSession } from '../store/session'
import type { ScoredCandidate } from '../types'

export function SyncPage() {
  const navigate = useNavigate()
  const { agent, room, concertId, selectConcert, scopes } = useSession()
  const [focusId, setFocusId] = useState(concertId)
  const [detail, setDetail] = useState<ScoredCandidate | null>(null)

  const concert = demoConcerts.find((item) => item.id === focusId) ?? demoConcerts[0]

  const { results } = useMemo(
    () => recommendTeammates({ concertId: concert.id, scopes, limit: 3 }),
    [concert.id, scopes],
  )

  const ongoing = room
    ? { label: '临时同频房间', title: room.concertTitle, hint: `${room.members.length} 位成员 · 已确认 ${room.members.filter((m) => m.confirmed).length}/${room.members.length}`, to: `/concert/${room.concertId}/room` }
    : agent && agent.rankedCandidates.length > 0
      ? { label: '匹配进行中', title: `Top Match · ${agent.rankedCandidates[0].candidate.nickname}`, hint: `${agent.rankedCandidates.length} 位候选人 · 同频度 ${agent.rankedCandidates[0].score}%`, to: `/concert/${agent.eventId}/matches` }
      : null

  return (
    <div className='tab-page'>
      <TabHeader title='同频' subtitle='先看人，再看演出' />

      <div className='px-4 pt-4'>
        {ongoing ? (
          <button
            type='button'
            onClick={() => navigate(ongoing.to)}
            className='soft-card flex w-full items-center gap-3 p-3.5 text-left'
          >
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-300'>
              <UsersIcon className='h-5 w-5' />
            </span>
            <span className='min-w-0 flex-1'>
              <span className='block text-[10.5px] text-brand-300'>{ongoing.label}</span>
              <span className='mt-0.5 block truncate text-[13px] font-semibold text-white'>{ongoing.title}</span>
              <span className='block truncate text-[11px] text-white/45'>{ongoing.hint}</span>
            </span>
            <ChevronRightIcon className='h-4 w-4 shrink-0 text-white/35' />
          </button>
        ) : (
          <div className='soft-card flex items-center gap-3 p-3.5'>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-300'>
              <SparkleIcon className='h-5 w-5' />
            </span>
            <div className='min-w-0 flex-1'>
              <p className='text-[13px] font-semibold text-white'>还没有进行中的匹配</p>
              <p className='mt-0.5 text-[11px] text-white/50'>选一场演出发起匹配，或者先看看下面的推荐。</p>
            </div>
          </div>
        )}

        <div className='mt-5'>
          <SegmentedTabs
            options={demoConcerts.map((item) => ({ value: item.id, label: item.title }))}
            value={concert.id}
            onChange={(next) => {
              setFocusId(next)
              selectConcert(next)
            }}
          />
        </div>

        <div className='mt-4 flex items-baseline justify-between'>
          <h2 className='text-[15px] font-semibold text-white'>推荐同频用户</h2>
          <span className='text-[11px] text-white/40'>{concert.title} · 同场观众</span>
        </div>

        <div className='mt-2.5 flex flex-col gap-2.5'>
          {results.length === 0 ? (
            <div className='soft-card p-4 text-center'>
              <p className='text-[13px] text-white/70'>当前安全条件下没有推荐</p>
              <p className='mt-1 text-[11px] text-white/40'>Agent 不会为了凑人数放宽你的硬条件。</p>
            </div>
          ) : (
            results.map((item) => (
              <button
                key={item.userId}
                type='button'
                onClick={() => setDetail(item)}
                className='soft-card flex w-full flex-col gap-2 p-3.5 text-left'
              >
                <span className='flex items-center gap-3'>
                  <Avatar
                    name={item.candidate.nickname}
                    from={item.candidate.avatar.from}
                    to={item.candidate.avatar.to}
                    size={42}
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='flex items-center gap-1.5'>
                      <span className='truncate text-[14px] font-semibold text-white'>{item.candidate.nickname}</span>
                      <BandPill band={item.band} />
                    </span>
                    <span className='mt-0.5 block truncate text-[11px] text-white/45'>
                      {item.candidate.profileLabel} · {item.candidate.activeHint}
                    </span>
                  </span>
                  <ScoreRing score={item.score} size={44} />
                </span>
                <span className='flex flex-wrap gap-1.5'>
                  <span className='rounded-pill border border-brand-500/22 bg-brand-500/[0.07] px-2 py-0.5 text-[10.5px] text-brand-200'>
                    共同演出：{concert.title}
                  </span>
                  {sharedHighlights(item, concert.title)
                    .filter((line) => !line.startsWith('共同演出'))
                    .slice(0, 2)
                    .map((line) => (
                    <span key={line} className='rounded-pill border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-white/55'>
                      {line}
                    </span>
                    ))}
                </span>
                <span className='line-clamp-2 text-[11.5px] leading-relaxed text-white/60'>推荐理由：{item.matchReason}</span>
              </button>
            ))
          )}
        </div>

        <p className='mt-4 text-center text-[10.5px] leading-relaxed text-white/30'>
          推荐结果复用 Agent 的同一套硬条件与评分公式，仅展示已授权的音乐数据。
        </p>
      </div>

      <Sheet
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail ? `${detail.candidate.nickname} · 同频度 ${detail.score}%` : ''}
        description='这里的理由全部来自双方已授权的音乐数据，不包含任何身份信息。'
      >
        {detail ? (
          <div className='max-h-[64vh] space-y-3 overflow-y-auto pr-1'>
            <div>
              <p className='mb-2 text-[12px] font-medium text-white/85'>四维评分组成</p>
              <ScoreBars breakdown={detail.scoreBreakdown} />
            </div>
            <div>
              <p className='mb-2 text-[12px] font-medium text-white/85'>共同点</p>
              <div className='flex flex-wrap gap-1.5'>
                {sharedHighlights(detail, concert.title).map((line) => (
                  <span key={line} className='rounded-pill border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10.5px] text-white/60'>
                    {line}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className='mb-2 text-[12px] font-medium text-white/85'>匹配证据</p>
              <EvidenceList candidate={detail} compact />
            </div>
            <Button
              full
              size='lg'
              icon={<SparkleIcon className='h-4 w-4' />}
              onClick={() => {
                const id = concert.id
                setDetail(null)
                navigate(`/concert/${id}`)
              }}
            >
              发起一次正式匹配
            </Button>
          </div>
        ) : null}
      </Sheet>
    </div>
  )
}
