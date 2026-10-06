import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { BandPill } from '../components/AgentEvidence'
import { Button, StateView } from '../components/ui'
import {
  ArrowLeftIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  StopIcon,
  SendIcon,
  ShieldIcon,
  SparkleIcon,
  TicketIcon,
  UsersIcon,
} from '../components/icons'
import { demoConcerts } from '../data/demoData'
import { cn } from '../lib/cn'
import { MusicBasisNote, OfficialPlaylistSource, sharedSongLabel } from '../components/OfficialPlaylistSource'
import { DemoMusicPlayer } from '../components/music/DemoMusicPlayer'
import { localDemoAudioByTitle } from '../data/localDemoAudioManifest'
import {
  buildIcebreakSteps,
  type IcebreakMessage,
  type IcebreakTyping,
} from '../lib/icebreak'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { matchCandidates, revealCandidateById } from '../data/revealCandidates'

/**
 * 双 Agent 破冰对话页。
 *
 * 产品逻辑：先由两个 Agent 替真人把「共同演出 / 共同歌曲 / 到场时间 / 公开集合点与安全边界」对齐，
 * 再让真人决定是接管聊天还是继续交给 Agent。所有台词逐条落下，绝不跳过对方直接回复。
 *
 * 工程约束：不接后端新接口、不改 Agent 核心状态机；只读取现有 agent.rankedCandidates 与
 * pendingConfirmation 来驱动界面。定时器在暂停、返回、卸载时都会清理。
 */

type ConfirmStatus = 'none' | 'awaiting_peer' | 'declined' | 'expired' | 'confirmed'

const CONFIRMED = new Set(['accepted', 'both_confirmed', 'confirmed'])

function nowClock(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function AgentIcebreakPage() {
  const { concertId = 'night-flight', candidateId = '' } = useParams()
  const navigate = useNavigate()
  const { agent, invite, peerConfirm, cancelInvite } = useSession()
  const { profile } = useProfile()

  const concert = demoConcerts.find((item) => item.id === concertId)
  const revealCandidate = revealCandidateById(candidateId)
  const revealIndex = matchCandidates.findIndex((item) => item.candidateId === candidateId)
  const candidate = useMemo(
    () => revealIndex >= 0 ? agent?.rankedCandidates[revealIndex] ?? null : agent?.rankedCandidates.find((item) => item.userId === candidateId) ?? null,
    [agent, candidateId, revealIndex],
  )

  const meName = profile.nickname || '你'
  const peerName = revealCandidate?.displayName ?? candidate?.candidate.nickname ?? '同频搭子'
  const sharedSongs = useMemo(() => revealCandidate ? [revealCandidate.sharedSong] : candidate?.sharedSongs ?? [], [candidate, revealCandidate])
  const sharedAudio = useMemo(() => sharedSongs.map(localDemoAudioByTitle).filter((track): track is NonNullable<typeof track> => Boolean(track)), [sharedSongs])

  const steps = useMemo(() => {
    if (!candidate) return []
    return buildIcebreakSteps(
      { me: meName, peer: peerName },
      {
        concertTitle: concert?.title ?? '同场演出',
        sharedSongs,
        meetingTime: concert?.meetingPoint.time ?? '18:50（开场前 40 分钟）',
        meetingPoint: concert?.meetingPoint.name ?? '公开的集合点',
        safety: candidate.sharedSafety[0] ?? '只在公开场合见面',
        // 没有 musicBasis（例如后端模式）时，只要真的拿到了共同歌曲就正常引用，不误报「依据不足」
        hasMusicBasis: sharedSongs.length > 0,
      },
    )
  }, [candidate, concert, meName, peerName, sharedSongs])

  const [cursor, setCursor] = useState(-1)
  const [typing, setTyping] = useState<IcebreakTyping | null>(null)
  const [messages, setMessages] = useState<IcebreakMessage[]>([])
  const [paused, setPaused] = useState(false)
  const [handoff, setHandoff] = useState(false)
  const [autoReply, setAutoReply] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 暂停 / 接管时不排新的消息；返回或卸载时清掉定时器，避免重复发送。
  useEffect(() => {
    if (cursor < 0 || paused || handoff) return undefined
    const step = steps[cursor]
    if (!step) return undefined
    setTyping(step.typing ?? null)
    const timer = window.setTimeout(() => {
      setTyping(null)
      if (step.message) setMessages((prev) => [...prev, step.message as IcebreakMessage])
      setCursor((prev) => prev + 1)
    }, step.delay)
    return () => window.clearTimeout(timer)
  }, [cursor, paused, handoff, steps])

  // 接管聊天后自动回复关闭，并把焦点交给输入框。
  useEffect(() => {
    if (handoff) inputRef.current?.focus()
  }, [handoff])

  const start = useCallback(() => {
    if (cursor >= 0) return
    setPaused(false)
    setCursor(0)
  }, [cursor])

  const confirmStatus: ConfirmStatus = useMemo(() => {
    const status = agent?.pendingConfirmation.status ?? 'none'
    if (CONFIRMED.has(status)) return 'confirmed'
    if (status === 'declined') return 'declined'
    if (status === 'expired') return 'expired'
    if (status === 'awaiting_peer') return 'awaiting_peer'
    return 'none'
  }, [agent])

  const summaryDone = messages.some((message) => message.summary)
  const started = cursor >= 0

  const phase = useMemo(() => {
    if (confirmStatus !== 'none') return confirmStatus
    if (handoff) return 'handoff'
    if (paused) return 'paused'
    if (!started) return 'idle'
    if (typing?.side === 'peer') return 'peer_typing'
    if (typing?.side === 'me') return 'me_typing'
    if (summaryDone) return autoReply ? 'agent_continue' : 'summary'
    return 'talking'
  }, [autoReply, confirmStatus, handoff, paused, started, summaryDone, typing])

  const statusLine = useMemo(() => {
    if (confirmStatus === 'awaiting_peer') return '等待对方真人确认'
    if (confirmStatus === 'declined') return '对方拒绝'
    if (confirmStatus === 'expired') return '对方超时未确认'
    if (confirmStatus === 'confirmed') return '双方确认成功'
    if (handoff) return '你已接管聊天 · Agent 自动回复已关闭'
    if (paused) return '已暂停 · Agent 不会再产生新消息'
    if (!started) return '尚未开始对话'
    if (typing) return typing.label
    if (summaryDone) return 'Agent 已汇总 3 个共同点 · 等你决定是否接管'
    return 'Agent 对话进行中'
  }, [confirmStatus, handoff, paused, started, summaryDone, typing])

  // 新消息或确认状态变化时把对话滚到底部（只操作 DOM，不触发额外渲染）。
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messages.length, typing, summaryDone, confirmStatus])

  const run = async (task: () => Promise<boolean>) => {
    if (busy) return
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
    }
  }

  const send = () => {
    const text = draft.trim()
    if (!text || !handoff) return
    setDraft('')
    setMessages((prev) => [
      ...prev,
      {
        id: `self-${Date.now()}`,
        side: 'me',
        via: 'self',
        authorName: meName,
        status: '已发送',
        text,
        time: nowClock(),
      },
    ])
  }

  if (!agent || !candidate) {
    return (
      <div className='flex min-h-screen flex-col bg-stage-950'>
        <Header onBack={() => navigate(`/concert/${concertId}/matches`)} />
        <main className='flex-1 px-4 pt-4'>
          <StateView
            status='empty'
            title='还没有可以破冰的匹配结果'
            description='先让 Agent 跑完一轮匹配，再回来让两个 Agent 先聊。'
            actionLabel='返回同频结果'
            onAction={() => navigate(`/concert/${concertId}/matches`)}
          />
        </main>
      </div>
    )
  }

  return (
    <div
      data-visual='icebreak'
      data-ice-phase={phase}
      className='flex h-[100dvh] flex-col overflow-hidden bg-stage-950'
    >
      <Header onBack={() => navigate(`/concert/${concertId}/matches`)} />

      <div className='flex items-center gap-2 border-b border-white/6 bg-stage-950/94 px-4 py-2.5'>
        <Avatar name={meName} from='#31f58a' to='#0d6b45' size={34} src={profile.avatar} />
        <span className='flex h-6 w-6 items-center justify-center rounded-full bg-brand-500/12 text-[11px] text-brand-300'>
          <SparkleIcon className='h-3.5 w-3.5' />
        </span>
        {revealCandidate ? <img src={`${import.meta.env.BASE_URL}${revealCandidate.avatar}`} alt={`${peerName}的Demo头像`} className='h-[34px] w-[34px] rounded-full border border-white/60 object-cover' /> : <Avatar name={peerName} from={candidate.candidate.avatar.from} to={candidate.candidate.avatar.to} size={34} />}
        <div className='ml-1 min-w-0 flex-1 text-right'>
          <p className='truncate text-[13px] text-white/75'>{meName} 与 {peerName}</p>
          <p className='truncate text-[11.5px] text-brand-300'>Agent 先对齐 · 真人再确认</p>
        </div>
      </div>

      <div className='flex items-center gap-2 border-b border-white/6 px-4 py-2 text-[12.5px] text-white/55'>
        <BandPill band={candidate.band} />
        <span className='min-w-0 flex-1 truncate'>共同演出：{concert?.title ?? '同场演出'}</span>
        <span className='shrink-0 text-white/40'>综合匹配度 {candidate.score}%</span>
      </div>

      <div ref={listRef} data-visual='icebreak-thread' className='flex-1 space-y-3 overflow-y-auto px-4 py-3'>
        {!started ? (
          <div className='rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-5'>
            <p className='text-[15px] font-semibold text-white'>让两个 Agent 先替你们破冰</p>
            <p className='mt-1.5 text-[14px] leading-relaxed text-white/60'>
              它们会先确认共同演出、共同歌曲、到场时间和公开集合点，再把结论交给你们本人确认。
            </p>
            <div className='mt-3 space-y-1.5'>
              {[
                `共同演出：${concert?.title ?? '同场演出'}`,
                `共同歌曲：${sharedSongLabel(sharedSongs.slice(0, 2), '暂无足够音乐依据')}`,
                `到场时间：提前约 40 分钟 · ${concert?.meetingPoint.time ?? ''}`,
                `公开集合点：${concert?.meetingPoint.name ?? '公开区域'}`,
              ].map((line) => (
                <p key={line} className='flex items-start gap-2 text-[14px] leading-relaxed text-white/75'>
                  <CheckIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
                  {line}
                </p>
              ))}
            </div>
            <p className='mt-3 flex items-start gap-2 text-[14px] leading-relaxed text-white/75'>
              <ShieldIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
              安全边界：{candidate.sharedSafety[0] ?? '只在公开场合见面'}，不交换私人联系方式。
            </p>
          </div>
        ) : null}

        {candidate ? (
          <div className='space-y-2'>
            <MusicBasisNote basis={candidate.musicBasis} songs={sharedSongs} />
            <OfficialPlaylistSource compact />
            <DemoMusicPlayer tracks={sharedAudio} reason='Agent 已核对的共同歌曲' compact />
          </div>
        ) : null}

        {messages.map((message) =>
          message.summary ? (
            <div key={message.id} data-ice-msg data-ice-id={message.id} data-side={message.side} data-via={message.via} className='rounded-2xl border border-brand-500/35 bg-brand-500/[0.08] p-4 shadow-[0_0_26px_rgba(49,245,138,.14)]'>
              <p className='flex items-center gap-2 text-[13px] font-semibold text-brand-200'>
                <SparkleIcon className='h-4 w-4' />
                Agent 破冰总结
              </p>
              <p className='mt-2 text-[15px] font-semibold leading-relaxed text-white'>{message.text}</p>
              <p className='mt-2 flex items-start gap-2 text-[14px] leading-relaxed text-white/70'>
                <ShieldIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
                结论只是建议：是否同行、是否见面，仍然由你们两位真人自己确认。
              </p>
              <div className='mt-3 flex items-center gap-2 text-[12.5px] text-white/50'>
                <MapPinIcon className='h-4 w-4 shrink-0 text-brand-300' />
                <span className='min-w-0 flex-1 truncate'>{concert?.meetingPoint.name ?? '公开集合点'}</span>
                <ClockIcon className='h-4 w-4 shrink-0 text-brand-300' />
                <span className='shrink-0'>{concert?.meetingPoint.time ?? ''}</span>
              </div>
            </div>
          ) : (
            <MessageBubble key={message.id} message={message} />
          ),
        )}

        {typing ? (
          <div data-ice-typing data-side={typing.side} data-ice-phase={phase} className={cn('flex', typing.side === 'me' ? 'justify-end' : 'justify-start')}>
            <div className='flex max-w-[84%] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5'>
              <span className='flex gap-1'>
                <i className='h-1.5 w-1.5 animate-bounce rounded-full bg-brand-300 [animation-delay:0ms]' />
                <i className='h-1.5 w-1.5 animate-bounce rounded-full bg-brand-300 [animation-delay:120ms]' />
                <i className='h-1.5 w-1.5 animate-bounce rounded-full bg-brand-300 [animation-delay:240ms]' />
              </span>
              <span className='text-[14px] text-white/70'>{typing.label}</span>
            </div>
          </div>
        ) : null}
        {summaryDone || confirmStatus !== 'none' ? (
          <div className='mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3'>
            {confirmStatus === 'none' ? (
              <Button full variant='secondary' icon={<TicketIcon className='h-4 w-4' />} disabled={busy} onClick={() => void run(() => invite(candidate.userId))}>
                发起同行邀请
              </Button>
            ) : confirmStatus === 'awaiting_peer' ? (
              <div className='space-y-2'>
                <p className='flex items-center gap-1.5 text-[13px] text-brand-200'>
                  <UsersIcon className='h-4 w-4' />
                  等待对方真人确认（Demo 里可直接模拟对方反应）
                </p>
                <div className='grid grid-cols-1 gap-2'>
                  <Button size='sm' variant='secondary' disabled={busy} onClick={() => void run(() => peerConfirm(true))}>
                    模拟对方接受
                  </Button>
                  <Button size='sm' variant='secondary' disabled={busy} onClick={() => void run(() => peerConfirm(false))}>
                    模拟对方拒绝
                  </Button>
                  <Button size='sm' variant='secondary' disabled={busy} onClick={() => void run(() => cancelInvite(true))}>
                    模拟对方超时
                  </Button>
                </div>
              </div>
            ) : confirmStatus === 'declined' ? (
              <div className='space-y-2'>
                <p className='text-[14px] text-rose-300'>对方拒绝这次邀请，不会创建同行房间。</p>
                <Button full variant='secondary' onClick={() => navigate(`/concert/${concertId}/matches`)}>
                  换一位
                </Button>
              </div>
            ) : confirmStatus === 'expired' ? (
              <div className='space-y-2'>
                <p className='text-[14px] text-warm-400'>对方超时未确认，本次邀请已失效。</p>
                <Button full variant='secondary' disabled={busy} onClick={() => void run(() => invite(candidate.userId))}>
                  重新发起邀请
                </Button>
              </div>
            ) : (
              <div className='space-y-2'>
                <p className='text-[14px] text-brand-200'>双方确认成功，可以进入临时同行房间。</p>
                <Button full size='lg' onClick={() => navigate(`/concert/${concertId}/room`)}>
                  进入同行房间
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <footer className='safe-bottom border-t border-white/8 bg-stage-950/96 px-3 pt-2.5'>
        <p
          data-ice-status
          className={cn(
            'mb-2 flex items-center gap-1.5 text-[13px]',
            confirmStatus === 'confirmed' ? 'text-brand-200' : confirmStatus === 'declined' ? 'text-rose-300' : 'text-white/60',
          )}
        >
          <SparkleIcon className='h-3.5 w-3.5 shrink-0' />
          {statusLine}
        </p>

        {started && !handoff && !summaryDone ? (
          <p className='mb-2 text-[13px] text-white/45'>这一步两个 Agent 还在对齐，结束前你随时可以暂停。</p>
        ) : null}

        {handoff ? (
          <div className='mb-2 flex items-end gap-2'>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  send()
                }
              }}
              rows={1}
              maxLength={200}
              placeholder='你已接管，自己说点什么…'
              className='max-h-24 min-h-11 flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/25'
            />
            <button
              type='button'
              onClick={send}
              disabled={!draft.trim()}
              aria-label='发送'
              className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-stage-950 transition active:scale-95 disabled:opacity-40'
            >
              <SendIcon className='h-4.5 w-4.5' />
            </button>
          </div>
        ) : null}

        <div className='flex items-center gap-2'>
          {!started ? (
            <Button full size='lg' icon={<SparkleIcon className='h-4 w-4' />} onClick={start}>
              模拟一次同频破冰
            </Button>
          ) : phase === 'paused' ? (
            <Button full size='lg' onClick={() => setPaused(false)}>
              继续Agent对话
            </Button>
          ) : phase === 'peer_typing' || phase === 'me_typing' || phase === 'talking' ? (
            <Button full size='lg' variant='secondary' icon={<StopIcon className='h-4 w-4' />} onClick={() => setPaused(true)}>
              暂停Agent
            </Button>
          ) : phase === 'summary' || phase === 'agent_continue' ? (
            <div className='grid w-full grid-cols-2 gap-2'>
              <Button variant='secondary' onClick={() => { setHandoff(true); setAutoReply(false) }}>
                接管聊天
              </Button>
              <Button onClick={() => setAutoReply(true)} disabled={autoReply}>
                继续让Agent聊
              </Button>
            </div>
          ) : null}

          {handoff ? (
            <Button variant='ghost' size='sm' onClick={() => setHandoff(false)}>
              让 Agent 接手
            </Button>
          ) : null}
        </div>


        <p className='pb-2 pt-2 text-center text-[12.5px] text-white/40'>Agent 之间不交换私人联系方式 · 见面与同行由本人决定</p>
      </footer>
    </div>
  )
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className='safe-top sticky top-0 z-30 border-b border-white/6 bg-stage-950/94 px-3 pb-2.5 pt-2 backdrop-blur-xl'>
      <div className='flex items-center gap-2.5'>
        <button
          type='button'
          onClick={onBack}
          aria-label='返回同频结果'
          className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/75 transition hover:border-white/25 hover:text-white'
        >
          <ArrowLeftIcon className='h-4 w-4' />
        </button>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[15px] font-semibold text-white'>Agent 破冰沟通</p>
          <p className='truncate text-[12.5px] text-white/50'>两个 Agent 先对齐，真人再确认</p>
        </div>
      </div>
    </header>
  )
}

function MessageBubble({ message }: { message: IcebreakMessage }) {
  const mine = message.side === 'me'
  const agent = message.via === 'agent'
  return (
    <div data-ice-msg data-ice-id={message.id} data-side={message.side} data-via={message.via} className={cn('flex gap-2', mine && 'flex-row-reverse')}>
      <span
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          agent ? (mine ? 'bg-brand-500 text-stage-950' : 'bg-vibepurple-500 text-white') : 'bg-white/12 text-white',
        )}
      >
        {agent ? <SparkleIcon className='h-4 w-4' /> : <UsersIcon className='h-4 w-4' />}
      </span>
      <div className={cn('max-w-[82%]', mine && 'text-right')}>
        <div className={cn('mb-1 flex flex-wrap items-center gap-1.5 text-[12.5px] text-white/50', mine && 'justify-end')}>
          <span className='font-semibold text-white/80'>{message.authorName}</span>
          <span
            className={cn(
              'rounded-pill border px-1.5 py-[1px] text-[11px]',
              agent ? 'border-brand-500/40 bg-brand-500/12 text-brand-200' : 'border-white/20 bg-white/10 text-white/80',
            )}
          >
            {agent ? 'Agent代发' : '本人'}
          </span>
          <span>{message.status}</span>
          <span>{message.time}</span>
        </div>
        <div
          className={cn(
            'rounded-2xl px-3.5 py-2.5 text-left text-[15px] leading-relaxed',
            agent
              ? mine
                ? 'rounded-tr-sm border border-brand-500/28 bg-brand-500/[0.09] text-white shadow-[0_0_18px_rgba(49,245,138,.13)]'
                : 'rounded-tl-sm border border-vibepurple-500/30 bg-vibepurple-500/[0.1] text-white shadow-[0_0_18px_rgba(130,92,255,.16)]'
              : 'rounded-tr-sm bg-brand-500 text-stage-950',
          )}
        >
          {message.text}
        </div>
      </div>
    </div>
  )
}
