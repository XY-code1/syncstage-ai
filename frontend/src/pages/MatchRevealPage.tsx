import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { EvidenceList, PreferenceNotes } from '../components/AgentEvidence'
import { QQMusicBar } from '../components/QQMusicBar'
import { Button, Sheet, StateView } from '../components/ui'
import { ChevronRightIcon, MapPinIcon, ShieldIcon, SparkleIcon, TicketIcon } from '../components/icons'
import {
  CANDIDATE_TRACK,
  TicketStub,
  USER_TRACK,
  type TrackPerson,
} from '../components/musicVisuals'
import { demoConcerts } from '../data/demoData'
import { useConcertFlow } from '../store/concertFlow'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { useExitToFrequency } from '../hooks/useExitToFrequency'
import { Avatar } from '../components/Avatar'
import { WaveformBars } from '../components/musicVisuals'
import { MusicBasisNote, OfficialPlaylistBadge, OfficialPlaylistLink, OfficialPlaylistSource, sharedSongLabel } from '../components/OfficialPlaylistSource'
import { DemoMusicPlayer, useMusicPlayer } from '../components/music/DemoMusicPlayer'
import { localDemoAudioByKey, localDemoAudioByTitle } from '../data/localDemoAudioManifest'

/** 「暂不同行」的候选项：只用于优化下一轮匹配，不会通知对方。 */
const SKIP_REASONS = ['音乐不搭', '同行方式不同', '人数不合适', '其它']

/** 只有真正发出邀请之后的这些状态，才代表「已邀请当前这位候选人」。 */
const INVITE_ACTIVE_STATUSES = ['awaiting_peer', 'accepted', 'both_confirmed', 'confirmed', 'declined', 'expired', 'withdrawn', 'cancelled']
/** 邀请已终结：本次会话不能再回放旧票根，必须重新开启一轮匹配。 */
const TERMINAL_INVITE_STATUSES = ['withdrawn', 'declined', 'expired', 'cancelled']
/** 双方确认后刷新：把票面还原到被邀请的那位候选人，否则会落回第 1 位、看不到「进入同行房间」。 */
const RESTORED_INVITE_STATUSES = ['accepted', 'both_confirmed', 'confirmed']

/** 模型给的匹配理由压到两行以内，不出现技术术语。 */
function shortReason(text: string, max = 54): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max) + '…' : clean
}

/**
 * 同频汇合页：整条主链路的高潮，主角是首屏直接生成的「双人同行票」。
 *
 * 票面里有两位用户、共同曲目、演出与公开集合点、双方安全边界、唯一票号与可撕票根；
 * 同频百分比降级为票面印章。汇合动画结束后 0.8–1 秒，候选端从匿名剪影过渡为
 * 真实 Demo 头像 + 昵称 + 「同场观众」标签（减少动效时直接显示完成状态）。
 * 评分明细与 Agent 证据收进「查看匹配依据」bottom sheet，首屏不纵向堆叠。
 * 底部固定三个操作：暂不同行 / 换一位 / 发出同行邀请。
 *
 * 暂不同行与换一位都会真的生效：前者把候选人记进本地负反馈（只用于下一轮，
 * 不会通知对方），后者直接切到下一位真实候选人；双方确认后才创建消息房间。
 */
export function MatchRevealPage() {
  const musicPlayer = useMusicPlayer()
  const selectedTrack = localDemoAudioByKey(musicPlayer.selectedTrackId)
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { agent, agentRunning, agentStarting, invite, peerConfirm, cancelInvite, createRoom, runAgent, pushToast, room, dismissedCandidateIds, startNewMatch } = useSession()
  const { flow, patchFlow } = useConcertFlow(concertId)
  const { profile } = useProfile()
  const exitToFrequency = useExitToFrequency()
  const [index, setIndex] = useState(0)
  const [revealReady, setRevealReady] = useState(false)
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const [skipOpen, setSkipOpen] = useState(false)
  const [skipReason, setSkipReason] = useState('')
  const [exhausted, setExhausted] = useState(false)
  const [now, setNow] = useState(Date.now())

  const busy = agentRunning || agentStarting
  const skippedIds = flow.skippedCandidateIds ?? []
  const dismissedIds = dismissedCandidateIds ?? []
  const ranked = agent?.rankedCandidates ?? []
  // 本轮排除：既包含「暂不同行」记录，也包含已撤回 / 拒绝过的候选人，避免立刻重复推荐同一位。
  const pool = ranked.filter((item) => !skippedIds.includes(item.userId) && !dismissedIds.includes(item.userId))
  const safeIndex = Math.min(index, Math.max(0, pool.length - 1))
  const current = pool[safeIndex]
  const concert = demoConcerts.find((item) => item.id === concertId)

  // 汇合动画结束后浮出匹配依据入口。
  useEffect(() => {
    if (!current) return undefined
    setRevealReady(false)
    const timer = window.setTimeout(() => setRevealReady(true), 900)
    return () => window.clearTimeout(timer)
  }, [current?.userId, busy])

  const me: TrackPerson = useMemo(
    () => ({ name: profile.nickname || '你', from: USER_TRACK.from, to: USER_TRACK.to, src: profile.avatar }),
    [profile.avatar, profile.nickname],
  )
  const person: TrackPerson = current
    ? { name: current.candidate.nickname, from: current.candidate.avatar.from, to: current.candidate.avatar.to }
    : { name: '待汇合', from: CANDIDATE_TRACK.from, to: CANDIDATE_TRACK.to }

  // 共同曲目只来自本轮真实匹配结果；没有就是没有，不回退到虚构歌曲
  const sharedSong = current?.sharedSongs[0] ?? ''
  const sharedAudio = useMemo(() => current?.sharedSongs.map(localDemoAudioByTitle).filter((track): track is NonNullable<typeof track> => Boolean(track)) ?? [], [current])
  const purpose = current?.sharedPurposes[0] ?? current?.candidate.purposes[0] ?? '同场观演'
  const sharedSafety = current?.sharedSafety[0] ?? '只在公开场合见面'
  const sameBoundary = (current?.sharedSafety.length ?? 0) > 0
  const pending = agent?.pendingConfirmation
  const invitedThis = Boolean(current) && pending?.candidateId === current?.userId && INVITE_ACTIVE_STATUSES.includes(pending?.status ?? '')
  const bothConfirmed = invitedThis && (pending?.status === 'accepted' || pending?.status === 'both_confirmed' || pending?.status === 'confirmed')
  const waiting = invitedThis && pending?.status === 'awaiting_peer'
  const peerView = new URLSearchParams(location.search).get('as') === 'peer'
  const secondsLeft = Math.max(0, Math.ceil(((pending?.expiresAt ?? now) - now) / 1000))
  const confirmState = !invitedThis
    ? '双方都还没确认'
    : bothConfirmed
      ? '双方已确认，可以进入同行房间'
      : '你已确认 · 等待对方确认'

  useEffect(() => {
    if (!waiting) return undefined
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    if (secondsLeft === 0) void cancelInvite(true)
    return () => window.clearInterval(timer)
  }, [cancelInvite, secondsLeft, waiting])

  // 匹配成功：先给一段 fireworks.mp3 的高光提示，5 秒后引擎自动淡回用户选的歌。
  useEffect(() => {
    if (!current) return
    void musicPlayer.playCue('highlight')
  }, [current?.userId])

  // 等待对方确认：整段停留在 beijing-snow.mp3 的低音量氛围里；确认后再淡回用户选的歌。
  const wasWaiting = useRef(false)
  useEffect(() => {
    if (waiting) {
      wasWaiting.current = true
      void musicPlayer.playCue('waiting')
      return
    }
    if (wasWaiting.current) {
      wasWaiting.current = false
      void musicPlayer.releaseCue()
    }
  }, [waiting])

  // 刷新恢复：pending 已是 accepted / confirmed 时，把当前候选人还原成房间对应的那一位。
  useEffect(() => {
    const candidateId = pending?.candidateId
    if (!candidateId || !RESTORED_INVITE_STATUSES.includes(pending?.status ?? '')) return
    const restored = pool.findIndex((item) => item.userId === candidateId)
    if (restored >= 0 && restored !== safeIndex) setIndex(restored)
  }, [pending?.candidateId, pending?.status, pool, safeIndex])

  const sendInvite = async () => {
    if (!current) return
    const ok = await invite(current.userId)
    if (ok) pushToast('已发出同行邀请，等对方确认后才创建房间', 'success')
  }

  const nextCandidate = () => {
    if (safeIndex + 1 < pool.length) {
      setIndex(safeIndex + 1)
      setExhausted(false)
      return
    }
    setExhausted(true)
    pushToast('这一轮没有下一位了，可以重新发起一轮匹配', 'warn')
  }

  const confirmSkip = () => {
    if (!current || !skipReason) return
    patchFlow({
      skippedCandidateIds: Array.from(new Set([...skippedIds, current.userId])),
      negativeFeedback: [...(flow.negativeFeedback ?? []), current.userId + ':' + skipReason],
    })
    pushToast('已记录，只用于优化下一轮匹配，不会通知对方')
    setSkipOpen(false)
    setSkipReason('')
    setIndex(0)
  }

  const enterRoom = async () => {
    if (room) {
      navigate(`/concert/${concertId}/room`)
      return
    }
    const ok = await createRoom()
    if (ok) navigate(`/concert/${concertId}/room`)
  }

  const rerun = () => {
    setExhausted(false)
    setIndex(0)
    navigate(`/concert/${concertId}/running`)
    void runAgent()
  }

  /** 重新扫描：开启全新会话并重置「本轮排除名单」——用户明确要求重新看一遍。 */
  const rescan = () => {
    setExhausted(false)
    setIndex(0)
    startNewMatch({ clearDismissed: true })
    navigate(`/concert/${concertId}/running`)
    void runAgent()
  }

  if (busy) {
    return (
      <PageShellMin title='找到同频的人' onBack={exitToFrequency}>
        <StateView
          status='loading'
          title='两条轨道正在靠近'
          description='匹配还在进行，跑完这里会展示汇合结果。'
          actionLabel='回到匹配页'
          onAction={() => navigate(`/concert/${concertId}/running`)}
        />
      </PageShellMin>
    )
  }

  if (!agent) {
    return (
      <PageShellMin title='找到同频的人' onBack={exitToFrequency}>
        <StateView
          status='info'
          title='还没有匹配结果'
          description='先让 Agent 跑一轮，才会出现汇合页。'
          actionLabel='开始匹配'
          onAction={() => { navigate(`/concert/${concertId}/running`); void runAgent() }}
          secondaryLabel='返回演出详情'
          onSecondary={() => navigate(`/concert/${concertId}`)}
        />
      </PageShellMin>
    )
  }

  if (agent.status === 'error') {
    return (
      <PageShellMin title='找到同频的人' onBack={exitToFrequency}>
        <StateView
          status='error'
          title='这次匹配没有跑完'
          description={agent.error || '网络或工具调用出现问题；这里不会伪造一个成功结果。'}
          actionLabel='重新运行'
          onAction={rerun}
          secondaryLabel='返回修改需求'
          onSecondary={() => navigate(`/concert/${concertId}/task`)}
        />
      </PageShellMin>
    )
  }

  // 撤回 / 拒绝 / 过期后本次会话已终结：绝不回放旧票根，直接给出终结态与「重新扫描」。
  if (!peerView && TERMINAL_INVITE_STATUSES.includes(pending?.status ?? '')) {
    return (
      <PageShellMin title='找到同频的人' onBack={exitToFrequency}>
        <StateView
          status='info'
          title={
            pending?.status === 'withdrawn'
              ? '邀请已撤回，本次匹配已结束'
              : pending?.status === 'declined'
                ? '对方暂未接受，本次匹配已结束'
                : '本次匹配已结束'
          }
          description='撤回只终止这一条邀请，不影响这场演出继续匹配；历史邀请会保留在记录里。'
          actionLabel='重新扫描'
          onAction={() => {
            startNewMatch({ clearDismissed: true })
            navigate(`/concert/${concertId}/task`)
          }}
          secondaryLabel='返回首页'
          onSecondary={exitToFrequency}
        />
      </PageShellMin>
    )
  }

  if (!current || exhausted) {
    const reasonCount = skippedIds.length
    return (
      <PageShellMin title='找到同频的人' onBack={exitToFrequency}>
        <StateView
          status='empty'
          title={ranked.length ? '这一轮已经看完' : '这一场暂时没有合适的同频搭子'}
          description={
            ranked.length
              ? reasonCount
                ? `已记录 ${reasonCount} 条不同行原因，只会用于下一轮匹配，对方不会收到通知。`
                : '可以重新发起一轮匹配，或回去放宽条件。'
              : 'Agent 不会为了凑人数放宽你的安全条件，也不会编造候选人。'
          }
          actionLabel='重新扫描'
          onAction={rescan}
          secondaryLabel='回去修改条件'
          onSecondary={() => navigate(`/concert/${concertId}/task`)}
        />
      </PageShellMin>
    )
  }

  return (
    // h-screen 而不是 min-h-screen：核心结果页必须锁在一个主屏内，超出的票根内容走 main 内部滚动，
    // 否则页面会随内容一起变高（documentElement.scrollHeight 超过 1.05 屏）。
    <div className='flex h-screen flex-col'>
      <QQMusicBar
        title='找到同频的人'
        onBack={exitToFrequency}
      />

      <main className='relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-28 pt-2'>
        <p className='relative z-10 mx-auto mb-2 w-fit rounded-full border border-brand-400/20 bg-black/35 px-3 py-1 text-[12px] text-brand-200'>你发出的信号 · 《{selectedTrack.title}》</p>
        <img src={`${import.meta.env.BASE_URL}concert-crowd-bg.png`} alt='' className='pointer-events-none absolute inset-0 h-full w-full object-cover object-bottom opacity-30'/>
        <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-stage-950/70 via-stage-950/85 to-stage-950'/>
        <span className='sr-only'>发现同频同行者</span>
        <section data-visual='dual-track' data-track-state='merged' data-track-progress='1' className='relative overflow-hidden border border-brand-300/35 bg-[#081513]/95 px-4 pb-4 pt-5 shadow-[0_0_42px_rgba(49,245,138,.12)]' style={{clipPath:'polygon(0 0,100% 0,100% 44%,96% 47%,100% 50%,100% 100%,0 100%,0 50%,4% 47%,0 44%)'}}>
          <div className='flex items-center justify-center gap-3'>
            <Avatar name={profile.nickname || '你'} from={USER_TRACK.from} to={USER_TRACK.to} src={profile.avatar} size={72} showRing/>
            <div className='text-center'><b className='block text-[36px] leading-none text-brand-300'>{current.score}%</b><span className='text-sm text-white/75'>同频</span><WaveformBars bars={9} height={26} active accent='#31f58a' className='mt-1'/></div>
            <span data-visual='reveal-person' data-person={current.userId}><Avatar name={current.candidate.nickname} from={current.candidate.avatar.from} to={current.candidate.avatar.to} size={72} className='ring-2 ring-vibepurple-400/70 ring-offset-2 ring-offset-[#081513]'/></span>
          </div>
          <div className='mt-4 border-y border-dashed border-white/15 py-4 text-center'>
            <p className='text-sm tracking-[.2em] text-white/45'>QQ音乐 · 同频现场</p>
            <h1 className='mt-2 text-[27px] font-black'>{concert?.title ?? '同场演出'} · {concert?.city}</h1>
            <p className='mt-1 text-sm text-white/55'>{concert?.dateLabel} · {concert?.venue}</p>
            <p className='mt-3 text-sm text-brand-200'>共同曲目：{sharedSongLabel(current.sharedSongs.slice(0, 3))}</p>
            <p className='mt-1 text-sm text-white/65'>公开集合：{concert?.meetingPoint.time} · {concert?.meetingPoint.name}</p>
          </div>
          <h2 className='mt-4 text-center text-[16px] font-semibold'>你们同频的 3 个理由</h2>
          <div className='mt-3 space-y-2'>
            {[`共同喜欢${sharedSongLabel(current.sharedSongs.slice(0, 2))}`, `都想${purpose}`, sameBoundary ? sharedSafety : '只在公开场合见面'].map((reason, i) => <div key={reason} className='flex min-h-11 items-center rounded-2xl bg-white/[.045] px-3 text-sm'><span className='mr-3 flex h-7 w-7 items-center justify-center rounded-full bg-brand-400/15 text-brand-300'>{i+1}</span>{reason}</div>)}
          </div>
          <MusicBasisNote basis={current.musicBasis} songs={current.sharedSongs} className='mt-3' />
          <DemoMusicPlayer tracks={sharedAudio} reason='共同收藏 / 共同最近循环' compact className='mt-3' />
          <div className='mt-3 flex flex-wrap items-center gap-x-2 gap-y-1'>
            <OfficialPlaylistBadge />
            <span className='text-[11.5px] text-white/45'>赛事Demo模拟数据 · 未接入官方 API · 不自动播放音乐</span>
          </div>
          <div className='mt-2 flex items-stretch gap-2'>
            <button type='button' onClick={() => setEvidenceOpen(true)} className='min-h-11 min-w-0 flex-1 text-sm text-white/60'>查看匹配依据 ›</button>
            <OfficialPlaylistLink className='shrink-0 px-3 text-[13px]' />
          </div>
        </section>

        {pool.length > 1 ? (
          <p className='mt-1.5 text-center text-[11px] text-white/35'>
            第 {safeIndex + 1} / {pool.length} 位 · 可以换一位
          </p>
        ) : null}

        {false && revealReady ? (
          <button
            type='button'
            onClick={() => setEvidenceOpen(true)}
            className='animate-rise mt-2.5 flex min-h-11 w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 text-left'
          >
            <TicketIcon className='h-4 w-4 shrink-0 text-brand-300' />
            <span className='min-w-0 flex-1 text-[12.5px] text-ink-200'>查看匹配依据</span>
            <span className='shrink-0 rounded-pill border border-white/12 px-2 py-0.5 text-[10.5px] text-white/45'>同行票根</span>
            <ChevronRightIcon className='h-4 w-4 shrink-0 text-ink-400' />
          </button>
        ) : (
          <p className='mt-4 text-center text-[11px] text-white/30'>两条声波正在汇合…</p>
        )}
      </main>

      <footer className='safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-white/8 bg-stage-950/96 px-4 pt-3 backdrop-blur-xl'>
        {waiting ? (
          peerView ? (
            <div className='space-y-2'>
              <p className='text-center text-sm text-white'>Demo访客邀请你一起去现场</p>
              <div className='grid grid-cols-2 gap-2'>
                <Button variant='secondary' onClick={() => void peerConfirm(false)}>暂不同行</Button>
                <Button onClick={() => void peerConfirm(true)}>接受同行</Button>
              </div>
            </div>
          ) : (
            <div>
              <Button full size='lg' variant='secondary' disabled>等待对方确认 · {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}</Button>
              <div className='mt-2 grid grid-cols-2 gap-2'>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => {
                    // 撤回只终止这一条邀请：清空邀请与会话、记入本轮排除名单，然后回到首页。
                    void cancelInvite(false).then(() => navigate('/'))
                  }}
                >
                  撤回邀请
                </Button>
                <Button variant='ghost' size='sm' onClick={exitToFrequency}>返回同频首页</Button>
              </div>
            </div>
          )
        ) : invitedThis ? (
          bothConfirmed ? (
            <Button full size='lg' onClick={() => void enterRoom()}>
              进入同行房间
            </Button>
          ) : pending?.status === 'declined' ? (
            <div><p className='mb-2 text-center text-sm text-white/70'>对方暂时没有接受邀请，你可以继续寻找同频搭子。</p><div className='grid grid-cols-2 gap-2'><Button variant='secondary' onClick={nextCandidate}>换一位</Button><Button onClick={exitToFrequency}>返回首页</Button></div></div>
          ) : pending?.status === 'expired' ? (
            <div><p className='mb-2 text-center text-sm text-white/70'>邀请暂未得到回应，本次匹配已结束。</p><div className='grid grid-cols-2 gap-2'><Button variant='secondary' onClick={rerun}>重新匹配</Button><Button onClick={exitToFrequency}>返回首页</Button></div></div>
          ) : pending?.status === 'withdrawn' || pending?.status === 'cancelled' ? (
            <div><p className='mb-2 text-center text-sm text-white/70'>邀请已撤回，旧邀请不能再进入房间，可以重新扫描一轮。</p><Button full onClick={exitToFrequency}>返回首页</Button></div>
          ) : (
            <Button full size='lg' variant='secondary' disabled>当前邀请不可用</Button>
          )
        ) : (
          <div className='flex items-center gap-2'>
            <Button variant='secondary' size='sm' className='w-[88px] shrink-0' onClick={() => setSkipOpen(true)}>
              暂不同行
            </Button>
            <Button variant='secondary' size='sm' className='w-[88px] shrink-0' onClick={nextCandidate}>
              换一位
            </Button>
            <Button className='glow-cta flex-1' icon={<SparkleIcon className='h-4 w-4' />} onClick={() => void sendInvite()}>
              发出同行邀请
            </Button>
          </div>
        )}
        <p className='pb-1 pt-1.5 text-center text-[11px] text-white/40'>
          {waiting ? '对方确认后才会开启房间' : invitedThis ? '只有 accepted 状态可以进入同行房间' : '「暂不同行」只用于下一轮匹配，不会通知对方'}
        </p>
      </footer>

      <Sheet
        open={skipOpen}
        onClose={() => { setSkipOpen(false); setSkipReason('') }}
        title='暂不同行？'
        description='理由只用于优化下一轮匹配，不会通知对方，也不会降低你之后的匹配质量。'
      >
        <div className='space-y-2'>
          {SKIP_REASONS.map((reason) => (
            <button
              key={reason}
              type='button'
              onClick={() => setSkipReason(reason)}
              className={
                'min-h-12 w-full rounded-xl border p-3 text-left text-[14px] ' +
                (skipReason === reason ? 'border-warm-400/50 bg-warm-400/10 text-white' : 'border-white/10 text-white/75')
              }
            >
              {reason}
            </button>
          ))}
          <Button variant='warm' full disabled={!skipReason} onClick={confirmSkip}>
            记录并看下一位
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        title='查看匹配依据'
        description='这张票根会在双方确认后出现在消息里的同行房间。'
      >
        <div className='max-h-[60vh] space-y-3 overflow-y-auto pr-1'>
          <div className='soft-card p-3'>
            <p className='text-[12.5px] font-semibold text-ink-100'>推荐理由</p>
            <p className='mt-1.5 text-[12px] leading-relaxed text-white/70'>{shortReason(current.matchReason, 120)}</p>
          </div>
          <TicketStub
            concertTitle={concert?.title ?? '同场演出'}
            concertTime={concert?.dateLabel ?? ''}
            venue={concert?.venue ?? ''}
            user={me}
            candidate={person}
            sharedSong={sharedSong}
            purpose={purpose}
            principle={sameBoundary ? sharedSafety : '只在公开场合见面'}
            confirmState={confirmState}
            code={'NO.' + String(Math.abs(current.userId.length * 37 + current.score * 3) % 9000 + 1000)}
          />
          <OfficialPlaylistSource />
          <div className='soft-card flex items-start gap-2.5 p-3'>
            <MapPinIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
            <p className='text-[12.5px] leading-relaxed text-ink-200'>
              {concert?.meetingPoint.name}
              <span className='mt-0.5 block text-ink-400'>{concert?.meetingPoint.time}</span>
            </p>
          </div>
          <div className='soft-card flex items-start gap-2.5 p-3'>
            <ShieldIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
            <p className='text-[12.5px] leading-relaxed text-ink-200'>
              {sameBoundary ? sharedSafety : concert?.meetingPoint.note}
              <span className='mt-0.5 block text-ink-400'>不交换私人联系方式，随时可以退出同行。</span>
            </p>
          </div>
          <div className='soft-card p-3'>
            <p className='text-[12.5px] font-semibold text-ink-100'>音乐依据 · 4 个维度</p>
            <p className='mt-1 text-[11.5px] leading-relaxed text-white/45'>共同收藏 / 共同最近循环 / 曲风或情绪 / 听歌时段，全部来自官方参考歌单的演示数据。</p>
            <div className='mt-2.5 space-y-1.5'>
              {(current.scoreBreakdown.musicSignals ?? []).map((signal) => (
                <div key={signal.id} className='flex items-start gap-2 rounded-xl border border-white/8 bg-white/[0.025] px-3 py-2'>
                  <span className={'mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ' + (signal.ratio > 0 ? 'bg-brand-400' : 'bg-white/20')} />
                  <div className='min-w-0'>
                    <p className='text-[12.5px] text-ink-100'>
                      {signal.label}
                      <span className='ml-1.5 text-[11px] text-white/40'>权重 {signal.weight}%</span>
                    </p>
                    <p className='mt-0.5 text-[11.5px] leading-relaxed text-white/60'>{signal.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className='soft-card p-3'>
            <p className='text-[12.5px] font-semibold text-ink-100'>偏好明细</p>
            <div className='mt-2.5'>
              <PreferenceNotes breakdown={current.scoreBreakdown} />
            </div>
          </div>
          <div className='soft-card p-3'>
            <p className='text-[12.5px] font-semibold text-ink-100'>Agent 证据</p>
            <div className='mt-2.5'>
              <EvidenceList candidate={current} compact />
            </div>
          </div>
          <Button variant='ghost' size='sm' full onClick={() => navigate(`/concert/${concertId}/trace`)}>
            打开完整记录
          </Button>
          <p className='flex items-center justify-center gap-1.5 text-[11px] text-white/40'>
            <TicketIcon className='h-3.5 w-3.5' />
            票根只用于本次同场同行，活动结束后自动失效
          </p>
        </div>
      </Sheet>
    </div>
  )
}

/** 汇合页的极简外壳：只保留顶栏，避免整页被流程条与技术信息塞满。 */
function PageShellMin({
  title,
  onBack,
  children,
}: {
  title: string
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar title={title} onBack={onBack} />
      <main className='flex-1 px-4 pt-4'>{children}</main>
    </div>
  )
}
