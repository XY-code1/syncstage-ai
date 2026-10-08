import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { ShieldIcon } from '../components/icons'
import { demoConcerts } from '../data/demoData'
import { revealCandidateById } from '../data/revealCandidates'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'

/** 一屏完成 Agent 破冰：先看同频邀请，再看 AI 对齐方案，最终只保留三种真人操作。 */
export function AgentIcebreakPage() {
  const { concertId = 'night-flight', candidateId = '' } = useParams()
  const navigate = useNavigate()
  const { agent, invite } = useSession()
  const { profile } = useProfile()
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [step, setStep] = useState(0)
  const [inviteState, setInviteState] = useState<'idle' | 'waiting' | 'accepted'>('idle')
  const concert = demoConcerts.find((item) => item.id === concertId)
  const reveal = revealCandidateById(candidateId)
  const candidate = agent?.rankedCandidates.find((item) => item.userId === candidateId) ?? agent?.rankedCandidates[0]
  const name = profile.nickname || 'Demo访客'
  const peerName = reveal?.displayName ?? candidate?.candidate.nickname ?? '同频搭子'
  const song = reveal?.sharedSong ?? candidate?.sharedSongs?.[0] ?? '暂无足够音乐依据'
  const score = reveal?.matchScore ?? candidate?.score ?? 80
  const reason = reveal?.reason ?? '你们都想在副歌一起唱'
  const steps = useMemo(() => ['共同演出', '共同歌曲', '到场时间', '公开集合点'], [])

  useEffect(() => {
    if (!started || paused || step >= steps.length) return undefined
    const timer = window.setTimeout(() => setStep((value) => value + 1), 650)
    return () => window.clearTimeout(timer)
  }, [paused, started, step, steps.length])

  useEffect(() => {
    if (inviteState !== 'waiting') return undefined
    const timer = window.setTimeout(() => setInviteState('accepted'), 3000)
    return () => window.clearTimeout(timer)
  }, [inviteState])

  if (!candidate) {
    return <div className='flex min-h-[100dvh] items-center justify-center bg-[#10162d] p-6 text-center text-white'>暂无可用匹配，请先完成同频寻找。</div>
  }

  return (
    <div data-visual='icebreak' className='summer-home relative flex min-h-[100dvh] flex-col overflow-hidden text-white'>
      <img src={`${import.meta.env.BASE_URL}visuals/summer-concert-bg.webp`} alt='' className='pointer-events-none absolute inset-0 h-full w-full object-cover' />
      <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-[#18245a]/40 via-[#1f214d]/55 to-[#10162d]/90' />
      <div className='relative z-10 flex min-h-[100dvh] flex-col px-4 safe-top'>
        <header className='flex items-center gap-3 py-3'>
          <button type='button' onClick={() => navigate(`/concert/${concertId}/matches`)} aria-label='返回候选人' className='flex h-11 w-11 items-center justify-center rounded-full border border-white/30 bg-white/10 text-xl backdrop-blur-md'>‹</button>
          <div className='min-w-0 flex-1'><p className='text-[11px] uppercase tracking-[.24em] text-white/65'>QQ音乐 · 一起去现场</p><h1 className='truncate text-[21px] font-semibold'>同频邀请卡</h1></div>
          <span className='text-[12px] text-white/65'>{started ? '2 / 2' : '1 / 2'}</span>
        </header>
        <main className='flex flex-1 flex-col justify-center gap-3 pb-4'>
          {!started ? (
            <section className='rounded-[28px] border border-[#ffe6bd]/55 bg-[#fff4d9]/95 p-5 text-[#402d27] shadow-[0_20px_60px_rgba(0,0,0,.28)]'>
              <p className='text-center text-[12px] font-medium tracking-[.18em] text-[#ad6d44]'>夜航计划 · 同场邀请</p>
              <div className='mt-4 flex items-center justify-center gap-5'><Avatar name={name} from='#31f58a' to='#0d6b45' size={58} src={profile.avatar} /><span className='text-2xl text-[#ef9f58]'>♪</span>{reveal ? <img src={`${import.meta.env.BASE_URL}${reveal.avatar}`} alt={`${peerName}的头像`} className='h-[58px] w-[58px] rounded-full border-4 border-[#f7b86a] object-cover' /> : <Avatar name={peerName} from='#ffb070' to='#7c4dba' size={58} />}</div>
              <h2 className='mt-4 text-center text-[24px] font-bold'>{peerName}</h2><p className='mt-1 text-center text-[42px] font-black leading-none text-[#1d9c60]'>{score}% <span className='text-[14px] font-semibold text-[#705c53]'>同频</span></p>
              <div className='mt-4 grid grid-cols-3 gap-2 text-center text-[11px] text-[#6d554b]'>{[`共同演出 · ${concert?.title ?? '夜航计划'}`, `共同歌曲 · ${song}`, `到场 · ${concert?.meetingPoint.time ?? '18:50'}`].map((item) => <div key={item} className='rounded-2xl bg-[#f4dfbf] px-2 py-2'>{item}</div>)}</div>
              <p className='mt-4 text-center text-[15px] font-semibold'>{reason}</p><p className='mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-[#806c61]'><ShieldIcon className='h-4 w-4' />仅在公开场合见面 · 不交换私人联系方式</p>
            </section>
          ) : (
            <section className='rounded-[28px] border border-white/25 bg-[#18214f]/75 p-5 shadow-[0_20px_60px_rgba(0,0,0,.28)] backdrop-blur-xl'>
              <div className='flex items-center gap-3'>{reveal ? <img src={`${import.meta.env.BASE_URL}${reveal.avatar}`} alt={`${peerName}的头像`} className='h-14 w-14 rounded-full border-2 border-[#c994ff] object-cover' /> : null}<div><p className='text-[12px] text-brand-200'>{inviteState === 'waiting' ? '邀请已送达，等她回应' : inviteState === 'accepted' ? '你们的同频计划成立了' : 'AI 正在对齐你们的音乐信号'}</p><h2 className='text-[22px] font-semibold'>{name} × {peerName}</h2></div></div>
              <div className='my-6 flex items-center justify-center gap-1'>{steps.map((label, index) => <div key={label} className='flex flex-1 flex-col items-center gap-2'><span className={`flex h-9 w-9 items-center justify-center rounded-full border text-sm ${index < step ? 'border-brand-300 bg-brand-300 text-stage-950' : 'border-white/30 text-white/45'}`}>{index < step ? '✓' : index + 1}</span><span className='text-center text-[10px] text-white/65'>{label}</span></div>)}</div>
              <div className='rounded-2xl border border-white/15 bg-white/10 p-4'><p className='text-[11px] tracking-[.15em] text-brand-200'>同频方案卡</p><p className='mt-2 text-[18px] font-semibold'>一起听《{song}》</p><p className='mt-1 text-[13px] text-white/65'>{concert?.meetingPoint.time ?? '18:50'} · {concert?.meetingPoint.name ?? '公开集合点'}</p></div>
            </section>
          )}
        </main>
        <footer className='safe-bottom pb-3'>{!started ? <button type='button' onClick={() => { setStarted(true); setStep(1) }} className='flex min-h-[56px] w-full items-center justify-center rounded-full bg-[#31f28b] text-[18px] font-bold text-[#062a26] shadow-[0_0_28px_rgba(49,242,139,.35)]'>让 AI 先替我们破冰 <span className='ml-2'>→</span></button> : step < steps.length ? <button type='button' onClick={() => setPaused((value) => !value)} className='min-h-12 w-full rounded-full border border-white/35 bg-white/10 text-[15px]'>{paused ? '继续 AI' : '暂停 AI'}</button> : inviteState === 'idle' ? <button type='button' onClick={() => { setInviteState('waiting'); void invite(candidate.userId) }} className='flex min-h-[56px] w-full items-center justify-center rounded-full bg-[#31f28b] text-[18px] font-bold text-[#062a26]'>发起同频邀请 <span className='ml-2'>→</span></button> : inviteState === 'waiting' ? <div className='space-y-2'><div className='flex items-center justify-center gap-3 text-[14px] text-white/80'><span className='h-2.5 w-2.5 animate-pulse rounded-full bg-brand-300' />邀请已送达，等她回应</div><div className='grid grid-cols-2 gap-2'><button type='button' onClick={() => setInviteState('idle')} className='min-h-12 rounded-full border border-white/35 bg-white/10 px-2 text-[13px]'>撤回邀请</button><button type='button' onClick={() => navigate('/home')} className='min-h-12 rounded-full border border-white/35 bg-white/10 px-2 text-[13px]'>返回演出页</button></div></div> : <div className='space-y-2'><p className='text-center text-[14px] text-brand-200'>写歌的江离已接受邀请</p><div className='grid grid-cols-2 gap-2'><button type='button' onClick={() => navigate(`/concert/${concertId}/room`)} className='min-h-12 rounded-full bg-[#31f28b] px-2 text-[13px] font-bold text-[#062a26]'>一起听这首歌</button><button type='button' onClick={() => navigate('/home')} className='min-h-12 rounded-full border border-white/35 bg-white/10 px-2 text-[13px]'>查看集合点</button></div></div>} <p className='mt-2 text-center text-[11px] text-white/60'>Agent 只对齐授权的结构化信息，是否同行由你确认</p></footer>
      </div>
    </div>
  )
}