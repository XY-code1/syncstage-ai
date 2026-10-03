import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { LOCAL_DEMO_AUDIO_ENABLED, type LocalDemoAudio } from '../../data/localDemoAudioManifest'
import { cn } from '../../lib/cn'

type PlayerState = {
  activeKey: string | null
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  error: string | null
}

type PlayerApi = PlayerState & {
  play: (track: LocalDemoAudio) => Promise<void>
  pause: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
}

const initialState: PlayerState = { activeKey: null, playing: false, currentTime: 0, duration: 0, volume: 0.8, error: null }
const MusicPlayerContext = createContext<PlayerApi | null>(null)

/** 全站只持有一个 HTMLAudioElement；路由切换、页面隐藏和曲目切换都会停止旧音源。 */
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const trackRef = useRef<LocalDemoAudio | null>(null)
  const [state, setState] = useState(initialState)

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setState((prev) => ({ ...prev, playing: false }))
  }, [])

  const dispose = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    audioRef.current = null
    trackRef.current = null
    setState((prev) => ({ ...prev, activeKey: null, playing: false, currentTime: 0, duration: 0, error: null }))
  }, [])

  useEffect(() => dispose, [dispose])
  useEffect(() => { dispose() }, [location.pathname, dispose])
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) pause() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause])

  const play = useCallback(async (track: LocalDemoAudio) => {
    if (!LOCAL_DEMO_AUDIO_ENABLED || !track.localSrc) return
    let audio = audioRef.current
    if (!audio || trackRef.current?.trackKey !== track.trackKey) {
      dispose()
      audio = new Audio()
      audio.preload = 'metadata'
      audio.volume = state.volume
      audio.src = track.localSrc
      trackRef.current = track
      audioRef.current = audio
      const start = track.previewStartSeconds ?? 0
      const limit = track.previewDurationSeconds ?? 30
      audio.addEventListener('loadedmetadata', () => {
        if (start > 0 && Number.isFinite(audio!.duration)) audio!.currentTime = Math.min(start, audio!.duration)
        setState((prev) => ({ ...prev, duration: Math.min(audio!.duration || limit, start + limit), currentTime: audio!.currentTime }))
      })
      audio.addEventListener('timeupdate', () => {
        const end = start + limit
        if (audio!.currentTime >= end) {
          audio!.pause()
          audio!.currentTime = start
        }
        setState((prev) => ({ ...prev, currentTime: audio!.currentTime, playing: !audio!.paused }))
      })
      audio.addEventListener('ended', () => setState((prev) => ({ ...prev, playing: false })))
      audio.addEventListener('error', () => {
        audio!.pause()
        setState((prev) => ({ ...prev, playing: false, error: '本地授权音源加载失败，已降级为 QQ 音乐官方跳转。' }))
      })
      setState((prev) => ({ ...prev, activeKey: track.trackKey, currentTime: start, error: null }))
    }
    try {
      if (audio.paused) {
        await audio.play()
        setState((prev) => ({ ...prev, activeKey: track.trackKey, playing: true, error: null }))
      } else {
        audio.pause()
        setState((prev) => ({ ...prev, playing: false }))
      }
    } catch {
      audio.pause()
      setState((prev) => ({ ...prev, playing: false, error: '无法播放本地授权音源，已降级为 QQ 音乐官方跳转。' }))
    }
  }, [dispose, state.volume])

  const seek = useCallback((seconds: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = seconds
    setState((prev) => ({ ...prev, currentTime: seconds }))
  }, [])
  const setVolume = useCallback((volume: number) => {
    const safe = Math.max(0, Math.min(1, volume))
    if (audioRef.current) audioRef.current.volume = safe
    setState((prev) => ({ ...prev, volume: safe }))
  }, [])

  const value = useMemo(() => ({ ...state, play, pause, seek, setVolume }), [state, play, pause, seek, setVolume])
  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
}

function useMusicPlayer(): PlayerApi {
  const value = useContext(MusicPlayerContext)
  if (!value) throw new Error('DemoMusicPlayer 必须放在 MusicPlayerProvider 内')
  return value
}

const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`

export function DemoMusicPlayer({ tracks, reason, compact = false, className }: { tracks: LocalDemoAudio[]; reason?: string; compact?: boolean; className?: string }) {
  const player = useMusicPlayer()
  const [index, setIndex] = useState(0)
  const track = tracks[Math.min(index, Math.max(0, tracks.length - 1))]
  const localAvailable = Boolean(LOCAL_DEMO_AUDIO_ENABLED && track?.localSrc && player.error === null)
  if (!track) return null
  const active = player.activeKey === track.trackKey
  const current = active ? player.currentTime : track.previewStartSeconds ?? 0
  const duration = active ? player.duration : (track.previewStartSeconds ?? 0) + (track.previewDurationSeconds ?? 30)
  const select = (next: number) => { player.pause(); setIndex((next + tracks.length) % tracks.length) }

  return (
    <section data-demo-music-player data-playback-mode={localAvailable ? 'local' : 'official-link'} className={cn('rounded-2xl border border-white/10 bg-black/25 p-3', className)}>
      <p className='text-[11px] text-brand-300'>来自腾讯音乐高校AI Hackathon官方参考歌单</p>
      <div className='mt-1.5 flex min-w-0 items-center gap-2'>
        {tracks.length > 1 ? <button type='button' aria-label='上一首' onClick={() => select(index - 1)} className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-lg'>‹</button> : null}
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[15px] font-semibold text-white'>《{track.title}》</p>
          <p className='truncate text-[12px] text-white/50'>{track.artist}{reason ? ` · ${reason}` : ''}</p>
        </div>
        {tracks.length > 1 ? <button type='button' aria-label='下一首' onClick={() => select(index + 1)} className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-lg'>›</button> : null}
      </div>
      {localAvailable ? (
        <div className='mt-2 space-y-2'>
          <div className='flex items-center gap-2'>
            <button type='button' aria-label={active && player.playing ? '暂停' : '播放'} onClick={() => void player.play(track)} className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-400 font-bold text-stage-950'>{active && player.playing ? 'Ⅱ' : '▶'}</button>
            <input aria-label='播放进度' type='range' min={track.previewStartSeconds ?? 0} max={Math.max(duration, 1)} step='0.1' value={current} onChange={(event) => player.seek(Number(event.target.value))} className='min-w-0 flex-1 accent-[#31f58a]' />
            <span className='shrink-0 text-[11px] tabular-nums text-white/55'>{clock(current)} / {clock(duration)}</span>
          </div>
          {!compact ? <label className='flex min-h-11 items-center gap-2 text-[12px] text-white/55'><span>音量</span><input aria-label='音量' type='range' min='0' max='1' step='0.05' value={player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} className='flex-1 accent-[#31f58a]' /></label> : null}
        </div>
      ) : (
        <div className='mt-2'>
          {player.error ? <p role='alert' className='mb-2 text-[12px] text-warm-300'>{player.error}</p> : null}
          <a data-official-audio-fallback href={track.officialUrl} target='_blank' rel='noopener noreferrer' className='flex min-h-11 w-full items-center justify-center rounded-xl border border-brand-400/35 px-3 text-[14px] font-semibold text-brand-300'>前往QQ音乐播放</a>
          <p className='mt-1.5 text-[11px] leading-relaxed text-white/40'>当前为赛事Demo，未接入官方播放API</p>
        </div>
      )}
    </section>
  )
}
