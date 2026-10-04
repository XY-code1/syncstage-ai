import { useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DemoMusicPlayer, useAudioPlayer } from '../components/music/DemoMusicPlayer'
import { QQMusicBar } from '../components/QQMusicBar'
import { LOCAL_DEMO_AUDIO_MANIFEST } from '../data/localDemoAudioManifest'
import { useConcertFlow } from '../store/concertFlow'
import { useSession } from '../store/session'

const THEMES = {
  'snow-drift': { background: 'from-[#06191d] via-[#071418] to-[#020707]', glow: 'bg-cyan-300/25', eyebrow: '冷青 · 雪雾', line: '让深夜的雪，帮你找到同样安静的人。', motion: 'snow' },
  'firework-burst': { background: 'from-[#102014] via-[#0d160a] to-[#030703]', glow: 'bg-amber-300/25', eyebrow: '荧光绿 · 烟花', line: '把最热烈的副歌，发给今晚同场的人。', motion: 'burst' },
  'city-scan': { background: 'from-[#160d2c] via-[#0d1026] to-[#04050b]', glow: 'bg-violet-400/25', eyebrow: '电光紫 · 城市扫描', line: '在城市的声波里，向同一目的地发出信号。', motion: 'scan' },
} as const

export function SongSelectPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const player = useAudioPlayer()
  const { authorized, selectConcert, setSelectedTrackId } = useSession()
  const { flow } = useConcertFlow(concertId)
  const touchStart = useRef(0)
  const index = Math.max(0, LOCAL_DEMO_AUDIO_MANIFEST.findIndex((track) => track.id === player.selectedTrackId))
  const track = LOCAL_DEMO_AUDIO_MANIFEST[index]
  const theme = THEMES[track.particlePreset]
  const particles = useMemo(() => Array.from({ length: 18 }, (_, i) => i), [])

  const choose = (next: number) => {
    player.pause()
    player.selectTrack(LOCAL_DEMO_AUDIO_MANIFEST[(next + LOCAL_DEMO_AUDIO_MANIFEST.length) % LOCAL_DEMO_AUDIO_MANIFEST.length].id)
  }
  const continueFlow = () => {
    selectConcert(concertId)
    setSelectedTrackId(track.id)
    navigate(authorized || flow.consentStatus === 'granted' ? `/concert/${concertId}/task` : `/concert/${concertId}/authorize`)
  }

  return <div className={`relative flex h-[100dvh] flex-col overflow-hidden bg-gradient-to-b ${theme.background} text-white transition-colors duration-500`}>
    <div className={`pointer-events-none absolute left-1/2 top-[32%] h-72 w-72 -translate-x-1/2 rounded-full blur-[90px] transition-colors duration-500 ${theme.glow}`} />
    <div aria-hidden className='pointer-events-none absolute inset-0 overflow-hidden'>
      {particles.map((particle) => <i key={`${track.id}-${particle}`} className={`absolute block rounded-full ${theme.motion === 'scan' ? 'h-px w-12' : 'h-1 w-1'} opacity-60`} style={{ left: `${8 + ((particle * 31) % 86)}%`, top: `${12 + ((particle * 47) % 72)}%`, background: track.accentColor, boxShadow: `0 0 12px ${track.accentColor}`, animation: `${theme.motion === 'snow' ? 'songSnow' : theme.motion === 'burst' ? 'songBurst' : 'songScan'} ${2.8 + (particle % 5) * .45}s ease-in-out ${particle * .12}s infinite` }} />)}
    </div>

    <QQMusicBar title='选择你的今夜信号' onBack={() => navigate('/')} right={<span className='text-xs text-white/45'>{index + 1}/3</span>} />
    <main className='relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-[calc(92px+env(safe-area-inset-bottom))] pt-4' style={{ touchAction: 'pan-y' }} onTouchStart={(event) => { touchStart.current = event.changedTouches[0].clientX }} onTouchEnd={(event) => { const delta = event.changedTouches[0].clientX - touchStart.current; if (Math.abs(delta) > 48) choose(index + (delta < 0 ? 1 : -1)) }}>
      <div className='text-center'>
        <p className='text-[13px] font-semibold tracking-[.2em]' style={{ color: track.accentColor }}>{theme.eyebrow}</p>
        <h1 className='mt-2 text-[28px] font-black'>哪首歌最像今晚的你？</h1>
        <p className='mx-auto mt-2 max-w-[320px] text-[15px] leading-relaxed text-white/65'>{theme.line}</p>
        <p className='mt-2 text-[12px] text-white/45'>{track.artist} · {track.mood.slice(0, 2).join(' · ')}</p>
        <p className='mt-1 text-[11px]' style={{ color: track.accentColor }}>{track.sourceLabel}</p>
      </div>
      <div className='relative mx-auto mt-6 flex h-[230px] w-full max-w-[330px] items-center justify-center'>
        <button type='button' aria-label='上一首' onClick={() => choose(index - 1)} className='absolute left-0 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/30 text-2xl'>‹</button>
        <div className='relative flex h-[210px] w-[210px] items-center justify-center rounded-full border border-white/15 bg-black/40 shadow-[0_0_70px_rgba(0,0,0,.55)]'>
          {[4, 9, 14].map((inset) => <div key={inset} className='absolute rounded-full border border-white/10' style={{ inset }} />)}
          <div className='relative z-10 flex h-24 w-24 items-center justify-center rounded-full px-2 text-center text-[14px] font-bold text-[#03110a]' style={{ background: track.accentColor }}>{track.title}</div>
        </div>
        <button type='button' aria-label='下一首' onClick={() => choose(index + 1)} className='absolute right-0 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/30 text-2xl'>›</button>
      </div>
      <DemoMusicPlayer tracks={[track]} reason='今夜的同频信号' className='mt-auto' />
      <p className='mt-2 text-center text-[12px] text-white/40'>左右滑动切歌 · 每次最多试听 30 秒</p>
    </main>
    <footer className='safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-white/10 bg-black/75 px-4 pt-3 backdrop-blur-xl'>
      <button type='button' onClick={continueFlow} className='flex min-h-[54px] w-full items-center justify-center rounded-full px-5 text-[17px] font-black text-[#03110a]' style={{ background: track.accentColor }}>就用这首寻找</button>
    </footer>
  </div>
}
