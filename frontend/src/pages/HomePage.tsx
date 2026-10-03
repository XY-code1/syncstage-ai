import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { MyProfileAvatar } from '../components/UserAvatar'
import { Vinyl, WaveformBars } from '../components/musicVisuals'
import { ChevronRightIcon, ShieldIcon, SparkleIcon, UsersIcon } from '../components/icons'
import { fetchConcerts } from '../lib/api'
import { demoUsers } from '../data/demoData'
import { useConcertFlow } from '../store/concertFlow'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import type { Concert } from '../types'

export function HomePage() {
  const navigate = useNavigate()
  const { agent, room, matchResumable, startNewMatch, authorized, concertId } = useSession()
  const { profile } = useProfile()
  const [concerts, setConcerts] = useState<Concert[]>([])
  useEffect(() => { void fetchConcerts().then((items) => setConcerts(items.slice(0, 3))).catch(() => setConcerts([])) }, [])
  const concert = concerts[0]
  const candidate = demoUsers[0]
  // 只有「会话未终结」的结果才算可继续；撤回 / 拒绝 / 过期后不能再恢复旧结果页。
  const resultReady = matchResumable
  const confirmationStatus = agent?.pendingConfirmation.status
  const statusLabel = confirmationStatus === 'awaiting_peer'
    ? '等待对方确认'
    : confirmationStatus === 'declined'
      ? '对方暂未接受，可以继续寻找'
      : confirmationStatus === 'expired'
        ? '邀请已过期，可以重新匹配'
        : confirmationStatus === 'withdrawn'
          ? '上次邀请已撤回，可以重新匹配'
          : confirmationStatus === 'accepted' || confirmationStatus === 'confirmed'
            ? '双方已确认，可进入同行房间'
            : '同频匹配结果已就绪'
  const sharedSong = useMemo(() => agent?.rankedCandidates[0]?.sharedSongs[0] ?? '', [agent])
  const eventId = agent?.eventId ?? concert?.id ?? concertId ?? 'night-flight'
  // 与演出详情页 / 音乐授权页保持一致：只要这一场的音乐数据已授权（无论来自会话还是本机流程记录），
  // 直接回到任务确认页；否则先去演出详情页补授权。
  const { flow } = useConcertFlow(eventId)
  const consentGranted = authorized || flow.consentStatus === 'granted'
  const openPrimary = () => {
    if (room) return navigate(`/concert/${room.concertId}/room`)
    if (resultReady) return navigate(`/concert/${eventId}/reveal`)
    // 有历史结果但会话已终结（撤回 / 拒绝 / 过期）：强制开启全新会话，
    // 只保留演出、授权与用户条件，从任务确认页重新开始，而不是回放旧结果。
    if (agent) {
      startNewMatch()
      return navigate(consentGranted ? `/concert/${eventId}/task` : `/concert/${eventId}`)
    }
    navigate(concert ? `/concert/${concert.id}` : '/concerts')
  }

  return <div className='relative min-h-[calc(100dvh-72px)] overflow-hidden bg-[#020706] text-white'>
    <img src={`${import.meta.env.BASE_URL}concert-crowd-bg.png`} alt='' className='pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-70'/>
    <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-[#020706]/35 via-[#020706]/25 to-[#020706]'/>
    <header className='relative z-10 flex h-[68px] items-center gap-2 px-5 pt-2'>
      <span className='flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-black text-[#04110b]'>♪</span>
      <strong className='text-[18px]'>QQ音乐</strong><span className='text-white/35'>|</span><span className='font-semibold'>同频现场</span>
      <span className='ml-auto'><MyProfileAvatar size={36}/></span>
    </header>

    <main className='relative z-10 px-5 pb-28 pt-5'>
      {room || resultReady ? <button type='button' onClick={openPrimary} className='mb-3 flex min-h-11 w-full items-center rounded-2xl border border-brand-400/25 bg-black/45 px-3 text-left backdrop-blur-md'>
        <SparkleIcon className='mr-2 h-4 w-4 text-brand-300'/><span className='min-w-0 flex-1 truncate text-sm'>{room ? '临时同行房间进行中' : statusLabel}</span><ChevronRightIcon className='h-4 w-4 text-white/55'/>
      </button> : null}

      <section className='text-center'>
        <p className='text-sm tracking-[.22em] text-brand-200/80'>QQ音乐 · 一起去现场</p>
        <h1 className='mx-auto mt-4 max-w-[330px] text-[36px] font-black leading-[1.12] tracking-[-.04em]'>开场前，<br/>先遇见<span className='text-brand-300'>同频的人</span></h1>
        <div data-visual='dual-track' data-track-state='apart' data-track-progress='0' className='track-shift relative mx-auto mt-5 h-[245px] max-w-[350px]'>
          <div className='absolute left-0 top-8 z-10'><Avatar name={profile.nickname || '你'} from='#46f69a' to='#0aa66b' src={profile.avatar} size={66} showRing/></div>
          <div className='absolute right-0 top-8 z-10'><Avatar name={candidate.nickname} from={candidate.avatar.from} to={candidate.avatar.to} size={66} className='ring-2 ring-vibepurple-400/70 ring-offset-2 ring-offset-[#03100d]'/></div>
          <div className='absolute left-[46px] top-[80px] w-[105px] -rotate-6'><WaveformBars bars={15} height={54} active accent='#31f58a'/></div>
          <div className='absolute right-[46px] top-[80px] w-[105px] rotate-6'><WaveformBars bars={15} height={54} active accent='#8769ff'/></div>
          <div className='absolute left-1/2 top-[62px] z-20 -translate-x-1/2 rounded-full border border-brand-300/60 p-2 shadow-[0_0_38px_rgba(49,245,138,.36)]'><Vinyl size={128} spin accent='#31f58a'/></div>
          <div className='absolute bottom-0 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-brand-400/45 bg-black/55 px-4 py-2 text-sm backdrop-blur'>♪ 共同心动曲目 · <b className='text-brand-300'>{sharedSong}</b></div>
          <span className='sr-only'>两条轨道尚未汇合</span>
        </div>
        <button type='button' onClick={openPrimary} className='mt-5 flex min-h-14 w-full items-center justify-center rounded-full bg-brand-400 px-5 text-[18px] font-black text-[#03110a] shadow-[0_10px_34px_rgba(49,245,138,.28)] active:scale-[.99]'>
          {room ? '继续同行房间' : resultReady ? '查看同频结果' : agent ? '重新找同频搭子' : '开始找同频搭子'} <span className='ml-3 text-2xl'>→</span>
        </button>
        <div className='mt-4 flex items-center justify-center gap-3 text-sm text-white/65'><span className='flex items-center gap-1'><UsersIcon className='h-4 w-4 text-brand-300'/>同场匹配</span><span className='text-white/20'>|</span><span>♡ 双方确认</span><span className='text-white/20'>|</span><span className='flex items-center gap-1'><ShieldIcon className='h-4 w-4'/>公开场合见面</span></div>
      </section>
      <section className='mt-8'>
        <div className='mb-3 flex items-center justify-between'><h2 className='font-semibold'>近期演出</h2><button type='button' onClick={() => navigate('/concerts')} className='min-h-11 px-2 text-sm text-white/60'>查看全部</button></div>
        <div className='flex gap-3 overflow-x-auto pb-2'>{concerts.map((item) => <button key={item.id} type='button' onClick={() => navigate(`/concert/${item.id}`)} className='min-h-[88px] w-[78%] shrink-0 rounded-2xl border border-white/10 bg-[#101615]/90 p-3 text-left'><span className='block font-semibold'>{item.title}</span><span className='mt-1 block text-sm text-white/55'>{item.artist} · {item.dateLabel} · {item.city}</span></button>)}</div>
      </section>
    </main>
  </div>
}
