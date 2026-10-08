import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MyProfileAvatar } from '../components/UserAvatar'
import { useAudioPlayer } from '../components/music/DemoMusicPlayer'
import { AudioSpectrumBars, HomeAudioReactiveLayer } from '../components/music/AudioReactiveVisuals'
import { useAudioReactive } from '../components/music/AudioReactiveProvider'
import { LOCAL_DEMO_AUDIO_ENABLED } from '../data/localDemoAudioManifest'
import { cueTrack, trackById } from '../data/tracks'
import { demoConcerts } from '../data/demoData'
import { useSession } from '../store/session'
import { QQMusicAuthorizationSheet } from '../components/QQMusicAuthorizationSheet'
import { useQQMusicAuth } from '../store/qqMusicAuth'

const HOME_LISTENERS = 128
const avatars = [0, 1, 2, 3]

export function HomePage() {
  const navigate = useNavigate()
  const player = useAudioPlayer()
  const reactive = useAudioReactive()
  const { concertId, selectConcert } = useSession()
  const { qqMusicUser } = useQQMusicAuth()
  const [authorizationOpen, setAuthorizationOpen] = useState(false)
  const [playHint, setPlayHint] = useState(false)
  const concert = demoConcerts.find(event => event.id === concertId) ?? demoConcerts[0]
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer) }, [])
  const eventTime = Date.parse(concert.date.replace(' ', 'T') + ':00+08:00')
  const seconds = Math.max(0, Math.floor((eventTime - now) / 1000))
  const units = [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
  const entryTrack = cueTrack('entry')
  const track = player.activeKey ? trackById(player.activeKey) : entryTrack
  const local = LOCAL_DEMO_AUDIO_ENABLED && !player.fallback
  const targetId = concert.id === 'night-flight' ? 'night-voyage' : concert.id
  const enter = () => {
    selectConcert(concert.id)
    player.unlock()
    if (!player.playing) void player.play(entryTrack)
    window.setTimeout(() => { if (!player.playing) setPlayHint(true) }, 350)
    if (!qqMusicUser.authorized) { setAuthorizationOpen(true); return }
    navigate(`/concert/${targetId}/select-song`)
  }

  return <div data-home-summer className='summer-home relative min-h-[100dvh] overflow-hidden text-white'>
    <img src={`${import.meta.env.BASE_URL}visuals/summer-concert-home.webp`} alt='日落海岸音乐节舞台、灯光与人群' className='home-summer-bg pointer-events-none absolute inset-0 h-full w-full object-cover' />
    <HomeAudioReactiveLayer />
    <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-[#28326b]/20 via-transparent to-[#15283c]/80' />
    <header className='relative z-10 flex h-14 items-center gap-2 px-5'>
      <span className='flex h-7 w-7 items-center justify-center rounded-full bg-[#ffe637] text-lg font-bold text-[#00ab6b]'>♪</span>
      <strong className='text-[18px]'>QQ音乐</strong>
      <span className='rounded-full border border-white/45 px-2 py-1 text-[11px] text-white/85'>概念功能 Demo</span>
      <span className='ml-auto'><MyProfileAvatar size={32} /></span>
    </header>
    <main className='relative z-10 flex min-h-[calc(100dvh-56px)] flex-col px-5 pb-5'>
      <section className='pt-2'>
        <p className='font-serif text-[28px] italic tracking-widest'>{concert.title} <span className='text-[#ffdd9f]'>✦</span></p>
        <p className='mt-1 text-[13px] tracking-[.4em]'>2026 · {concert.city}站</p>
        <h1 className='mt-7 font-serif text-[44px] font-semibold leading-[1.2] tracking-[-.035em] drop-shadow-md'>晚风一吹，<br />我们就同频了</h1>
        <p className='mt-4 text-[15px] leading-[1.9] tracking-[.09em]'>一个人来的你，<br />也能遇见同频的音乐伙伴。</p>
        <div data-event-countdown className='mt-4 w-[242px] rounded-[22px] border border-white/45 bg-[#f6c5a2]/20 px-4 py-3 shadow-[0_0_25px_rgba(255,214,152,.16)] backdrop-blur-sm'>
          <p className='text-[12px] font-medium'>{concert.dateLabel} · {seconds > 0 ? '即将开启' : '演出即将开始'}</p>
          {seconds > 0 ? <div className='mt-2 flex justify-between'>{units.map((value,index) => <div key={index} className='text-center'><b className='text-[25px] tabular-nums'>{String(value).padStart(2,'0')}</b><span className='mt-1 block text-[11px]'>{['天','时','分','秒'][index]}</span></div>)}</div> : null}
        </div>
      </section>
      <section className='mt-auto pt-5'>
        <div className='flex min-h-[52px] items-center gap-2 rounded-full border border-white/40 bg-[#26365c]/60 px-3 backdrop-blur-md'>
          <div className='flex -space-x-3'>{avatars.map((index) => <img key={index} src={`${import.meta.env.BASE_URL}portraits/demo-orange.webp`} alt={`Demo 听众 ${index+1}`} className='h-8 w-8 rounded-full border-2 border-[#dce3f4] object-cover' style={{filter: index % 2 ? 'hue-rotate(18deg)' : undefined, objectPosition: `${40+index*5}% center`}} />)}</div>
          <p className='whitespace-nowrap text-[12px]'><b className='mr-1 text-[24px] text-[#57ffc0]'>{HOME_LISTENERS}</b>位同场听众正在靠近</p>
        </div>
        <button type='button' onClick={enter} className='mt-4 flex min-h-[56px] w-full items-center justify-center gap-3 rounded-full border border-[#b6ffdd]/70 bg-[#33f8ac] text-[19px] font-black text-[#062a26] shadow-[0_0_28px_rgba(33,255,170,.35)]'>✧ 今晚同频 <span className='text-2xl'>›</span></button>
        {playHint && !player.playing ? <p role='status' className='mt-2 text-center text-[12px] text-white/85'>轻触播放，开启今晚的同频</p> : null}
        <p className='my-3 text-center text-[11px] tracking-[.13em] text-white/85'>音乐让陌生的我们，在此刻相遇</p>
        <div data-home-music-bar className='flex min-h-[68px] items-center gap-3 rounded-[22px] border border-white/45 bg-[#4b527e]/50 p-2.5 backdrop-blur-lg transition-shadow duration-300' style={{ boxShadow: `0 0 ${10 + reactive.normalizedBass * 24}px rgba(255,155,85,${0.12 + reactive.normalizedBass * 0.24})` }}>
          <img src={`${import.meta.env.BASE_URL}visuals/summer-concert-home.webp`} alt='Demo 音乐视觉封面' className='h-12 w-12 rounded-xl object-cover' />
          <div className='min-w-0 flex-1'><p className='truncate text-[16px] font-bold'>{track.title}</p><p className='mt-1 text-[12px] text-white/75'>{track.artist}</p></div>
          <AudioSpectrumBars className='w-[58px]' />
          {local ? <div className='flex shrink-0 flex-col items-center gap-1'><button type='button' aria-label={player.playing ? '暂停音乐' : '试听音乐'} onClick={() => { player.unlock(); if(player.playing) player.pause(); else void player.play(track) }} className='flex h-11 w-11 items-center justify-center rounded-full border border-white/60 text-xl'>{player.playing ? 'Ⅱ' : '▶'}</button><a href={track.qqMusicUrl} target='_blank' rel='noopener noreferrer' className='text-[9px] text-white/80 underline underline-offset-2'>QQ音乐</a></div> : <a href={track.qqMusicUrl} target='_blank' rel='noopener noreferrer' className='flex min-h-11 shrink-0 flex-col items-center justify-center rounded-full border border-white/40 px-2 text-[10px]'>{player.fallback ? <span>演示音频暂不可用</span> : null}<span>QQ音乐试听</span></a>}
        </div>
      </section>
    </main>
    <QQMusicAuthorizationSheet open={authorizationOpen} onClose={() => setAuthorizationOpen(false)} onAuthorized={() => { setAuthorizationOpen(false); navigate(`/concert/${targetId}/select-song`) }} />
  </div>
}
