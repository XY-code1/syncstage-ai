import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LOCAL_DEMO_AUDIO_ENABLED, localDemoAudioByKey, type LocalDemoAudio } from '../../data/localDemoAudioManifest'
import { CUE_GAIN, cueTrack, type AudioCue } from '../../data/tracks'
import { cn } from '../../lib/cn'
import { useAudioReactiveEngine } from './AudioReactiveProvider'

export type { AudioCue }

/**
 * 全站唯一音频引擎（Demo 专用，只播放本地授权音源）。
 *
 * 硬约束：
 * - 只有用户手势解锁后才会发声（unlock / 点击播放按钮），页面打开时绝不自动播放；
 * - 首次播放 800ms 淡入，任何切歌都是 500ms 交叉淡入淡出，不会突然切断；
 * - 单曲最多试听 30 秒；
 * - 两套 HTMLAudioElement 交替当"唱盘"，交叉淡入淡出靠音量斜坡而不是切 src；
 * - 本地音源缺失 / 加载失败时静默降级为「在QQ音乐试听」，不抛错、不显示错误弹窗；
 * - Provider 挂在路由之上，路由切换时播放状态与进度都持续存在。
 */

const SELECTED_TRACK_KEY = 'sfl.selectedTrack.v1'
/** 默认音量：演示场景统一低音量，15%。 */
const DEFAULT_VOLUME = 0.15
/** 入口音乐淡入时长。 */
const FADE_IN_MS = 800
/** 所有切歌的交叉淡入淡出时长。 */
const CROSSFADE_MS = 500
/** 暂停 / 静音时的短淡出，避免爆音。 */
const FADE_OUT_MS = 220
/** 单曲最多试听时长（秒）。 */
const PREVIEW_LIMIT_SECONDS = 30

type PlayerState = {
  /** 音频是否已被用户手势解锁；未解锁时所有播放请求都被静默忽略。 */
  armed: boolean
  activeKey: string | null
  activeCue: AudioCue | null
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  /** 本地音源不可用（开关关闭 / 文件缺失 / 加载失败）时置真，页面降级为 QQ 音乐试听。 */
  fallback: boolean
  selectedTrackId: string
}

type PlayerApi = PlayerState & {
  /** 由一次真实点击调用：解锁浏览器音频（iPhone Safari 兼容）并建好唱盘。 */
  unlock: () => void
  play: (track: LocalDemoAudio) => Promise<void>
  playCue: (cue: AudioCue) => Promise<void>
  releaseCue: () => Promise<void>
  /** 清掉场景音乐，确保正在放的是用户自己选的那首歌（没有解锁时不发声）。 */
  playSelected: () => Promise<void>
  pause: () => void
  toggle: () => void
  seek: (seconds: number) => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  selectTrack: (trackId: string) => void
}

interface Deck {
  el: HTMLAudioElement
  key: string | null
}

const initialState: PlayerState = {
  armed: false,
  activeKey: null,
  activeCue: null,
  playing: false,
  currentTime: 0,
  duration: 0,
  volume: DEFAULT_VOLUME,
  muted: false,
  fallback: false,
  selectedTrackId: 'sfl-demo-track-01',
}

const MusicPlayerContext = createContext<PlayerApi | null>(null)

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function AudioProvider({ children }: { children: ReactNode }) {
  const { attach: attachReactiveAudio, resume: resumeReactiveAudio } = useAudioReactiveEngine()
  const [state, setState] = useState<PlayerState>(() => {
    let selected = initialState.selectedTrackId
    try {
      selected = window.sessionStorage.getItem(SELECTED_TRACK_KEY) || selected
    } catch {
      // 忽略存储失败
    }
    return { ...initialState, selectedTrackId: selected }
  })

  const decksRef = useRef<{ a: Deck; b: Deck } | null>(null)
  const currentSlotRef = useRef<'a' | 'b'>('a')
  const activeKeyRef = useRef<string | null>(null)
  const activeCueRef = useRef<AudioCue | null>(null)
  const selectedRef = useRef(state.selectedTrackId)
  const armedRef = useRef(false)
  const volumeRef = useRef(DEFAULT_VOLUME)
  const mutedRef = useRef(false)
  const rafRef = useRef(new Map<HTMLAudioElement, number>())
  const cueTimerRef = useRef<number | null>(null)
  /** 用户刚点了暂停：淡出期间 timeupdate 不能把 playing 翻回 true。 */
  const pauseIntentRef = useRef(false)

  useEffect(() => {
    selectedRef.current = state.selectedTrackId
  }, [state.selectedTrackId])

  const clearCueTimer = useCallback(() => {
    if (cueTimerRef.current !== null) {
      window.clearTimeout(cueTimerRef.current)
      cueTimerRef.current = null
    }
  }, [])

  const cancelRamp = useCallback((el: HTMLAudioElement) => {
    const id = rafRef.current.get(el)
    if (id !== undefined) {
      cancelAnimationFrame(id)
      rafRef.current.delete(el)
    }
  }, [])

  /** 用 rAF 做音量斜坡：所有淡入淡出都只改 volume，不切歌、不断流。 */
  const fadeTo = useCallback((el: HTMLAudioElement, target: number, ms: number, onDone?: () => void) => {
    cancelRamp(el)
    const from = el.volume
    const to = clamp01(target)
    if (ms <= 0 || Math.abs(from - to) < 0.001) {
      el.volume = to
      onDone?.()
      return
    }
    const started = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - started) / ms)
      el.volume = clamp01(from + (to - from) * t)
      if (t < 1) {
        rafRef.current.set(el, requestAnimationFrame(tick))
      } else {
        rafRef.current.delete(el)
        onDone?.()
      }
    }
    rafRef.current.set(el, requestAnimationFrame(tick))
  }, [cancelRamp])

  const targetVolume = useCallback((cue: AudioCue | null) => {
    const base = mutedRef.current ? 0 : volumeRef.current
    return clamp01(base * (cue ? CUE_GAIN[cue] : 1))
  }, [])

  const ensureDecks = useCallback(() => {
    if (decksRef.current) return decksRef.current
    const make = (slot: 'a' | 'b'): Deck => {
      const el = new Audio()
      el.preload = 'auto'
      el.volume = 0
      el.setAttribute('playsinline', 'true')
      const deck: Deck = { el, key: null }
      attachReactiveAudio(el)
      el.addEventListener('loadedmetadata', () => {
        if (currentSlotRef.current !== slot) return
        const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : PREVIEW_LIMIT_SECONDS
        setState((prev) => ({ ...prev, duration: Math.min(total, PREVIEW_LIMIT_SECONDS) }))
      })
      el.addEventListener('timeupdate', () => {
        if (currentSlotRef.current !== slot) return
        if (el.currentTime >= PREVIEW_LIMIT_SECONDS) {
          el.pause()
          el.currentTime = 0
          setState((prev) => ({ ...prev, playing: false, currentTime: 0 }))
          return
        }
        setState((prev) => ({ ...prev, currentTime: el.currentTime, playing: pauseIntentRef.current ? false : !el.paused }))
      })
      el.addEventListener('ended', () => {
        if (currentSlotRef.current !== slot) return
        setState((prev) => ({ ...prev, playing: false }))
      })
      el.addEventListener('error', () => {
        // 本地音源不存在 / 解码失败：静默降级，页面显示「在QQ音乐试听」，不报错
        if (!deck.key || activeKeyRef.current !== deck.key) return
        el.pause()
        setState((prev) => ({ ...prev, playing: false, fallback: true }))
      })
      return deck
    }
    decksRef.current = { a: make('a'), b: make('b') }
    return decksRef.current
  }, [attachReactiveAudio])

  const startTrack = useCallback(
    async (track: LocalDemoAudio, options: { cue: AudioCue | null; fadeMs?: number }) => {
      const cue = options.cue
      pauseIntentRef.current = false
      const decks = ensureDecks()
      const prevSlot = currentSlotRef.current
      const previous = decks[prevSlot]
      const nextSlot: 'a' | 'b' = prevSlot === 'a' ? 'b' : 'a'
      const next = decks[nextSlot]
      const wasPlaying = activeKeyRef.current !== null && previous.key !== null && !previous.el.paused && previous.el.currentTime > 0
      const fadeMs = options.fadeMs ?? (wasPlaying ? CROSSFADE_MS : FADE_IN_MS)
      const canPlayLocal = LOCAL_DEMO_AUDIO_ENABLED && Boolean(track.localPreviewSrc)

      if (!canPlayLocal) {
        cancelRamp(previous.el)
        previous.el.pause()
        previous.key = null
        activeKeyRef.current = null
        activeCueRef.current = cue
        setState((prev) => ({
          ...prev,
          activeKey: track.id,
          activeCue: cue,
          playing: false,
          fallback: true,
          currentTime: 0,
          duration: Math.min(track.duration, PREVIEW_LIMIT_SECONDS),
        }))
        return
      }

      // 同一首已经在播：只校准音量，不重头播放
      if (activeKeyRef.current === track.id && previous.key === track.id && !previous.el.paused) {
        activeCueRef.current = cue
        fadeTo(previous.el, targetVolume(cue), FADE_OUT_MS)
        setState((prev) => ({ ...prev, activeCue: cue, playing: true, fallback: false }))
        return
      }

      next.key = track.id
      next.el.src = track.localPreviewSrc as string
      next.el.currentTime = 0
      next.el.volume = 0
      cancelRamp(next.el)

      // 先切到新唱盘：事件与状态都以新音源为准
      currentSlotRef.current = nextSlot
      activeKeyRef.current = track.id
      activeCueRef.current = cue
      setState((prev) => ({
        ...prev,
        activeKey: track.id,
        activeCue: cue,
        fallback: false,
        currentTime: 0,
        duration: Math.min(track.duration, PREVIEW_LIMIT_SECONDS),
      }))

      try {
        // 必须在用户手势的同一个任务里同步调用 play()，iPhone Safari 才允许发声
        await next.el.play()
        setState((prev) => ({ ...prev, playing: true }))
        // 交叉淡入淡出：新音源淡入、旧音源同步淡出
        fadeTo(next.el, targetVolume(cue), fadeMs)
        if (previous !== next && previous.key) {
          const fading = previous
          fadeTo(fading.el, 0, CROSSFADE_MS, () => {
            fading.el.pause()
            fading.el.removeAttribute('src')
            fading.el.load()
            fading.key = null
          })
        }
      } catch {
        // 播放被拒绝（未解锁 / 浏览器拦截）：静默停下，交给页面走降级入口
        next.el.pause()
        next.key = null
        currentSlotRef.current = prevSlot
        activeKeyRef.current = previous.key
        activeCueRef.current = null
        setState((prev) => ({ ...prev, playing: false, activeKey: previous.key, activeCue: null }))
      }
    },
    [cancelRamp, ensureDecks, fadeTo, targetVolume],
  )

  const releaseCueRef = useRef<(() => void) | null>(null)

  const pause = useCallback(() => {
    pauseIntentRef.current = true
    const decks = decksRef.current
    const active = decks?.[currentSlotRef.current]
    if (active) fadeTo(active.el, 0, FADE_OUT_MS, () => active.el.pause())
    setState((prev) => ({ ...prev, playing: false }))
  }, [fadeTo])

  const unlock = useCallback(() => {
    resumeReactiveAudio()
    armedRef.current = true
    ensureDecks()
    setState((prev) => (prev.armed ? prev : { ...prev, armed: true }))
  }, [ensureDecks, resumeReactiveAudio])

  const playCue = useCallback(
    async (cue: AudioCue) => {
      // 没有用户手势解锁过就绝不自动播放
      if (!armedRef.current) return
      clearCueTimer()
      await startTrack(cueTrack(cue), { cue })
      if (cue === 'highlight') {
        cueTimerRef.current = window.setTimeout(() => {
          cueTimerRef.current = null
          releaseCueRef.current?.()
        }, 5000)
      }
    },
    [clearCueTimer, startTrack],
  )

  const releaseCue = useCallback(async () => {
    clearCueTimer()
    const cue = activeCueRef.current
    activeCueRef.current = null
    setState((prev) => (prev.activeCue === null ? prev : { ...prev, activeCue: null }))
    if (!cue || !armedRef.current) return
    const decks = decksRef.current
    const active = decks?.[currentSlotRef.current]
    if (!active?.key) return
    // 从场景音乐回到用户自己选的那首歌，仍然走 500ms 交叉淡入淡出
    await startTrack(localDemoAudioByKey(selectedRef.current), { cue: null, fadeMs: CROSSFADE_MS })
  }, [clearCueTimer, startTrack])

  releaseCueRef.current = () => {
    void releaseCue()
  }

  const playSelected = useCallback(async () => {
    if (!armedRef.current) return
    clearCueTimer()
    activeCueRef.current = null
    setState((prev) => (prev.activeCue === null ? prev : { ...prev, activeCue: null }))
    const track = localDemoAudioByKey(selectedRef.current)
    const decks = decksRef.current
    const active = decks?.[currentSlotRef.current]
    if (activeKeyRef.current === track.id && active && !active.el.paused) return
    await startTrack(track, { cue: null, fadeMs: CROSSFADE_MS })
  }, [clearCueTimer, startTrack])

  const play = useCallback(
    async (track: LocalDemoAudio) => {
      unlock()
      const decks = decksRef.current
      const active = decks?.[currentSlotRef.current]
      if (activeKeyRef.current === track.id && active && !active.el.paused) {
        pause()
        return
      }
      await startTrack(track, { cue: null })
    },
    [pause, startTrack, unlock],
  )

  const resume = useCallback(async () => {
    if (!armedRef.current) return
    const decks = decksRef.current
    const active = decks?.[currentSlotRef.current]
    if (active?.key) {
      const cue = activeCueRef.current
      await startTrack(localDemoAudioByKey(active.key), { cue, fadeMs: FADE_IN_MS })
      return
    }
    await playSelected()
  }, [playSelected, startTrack])

  const toggle = useCallback(() => {
    const decks = decksRef.current
    const active = decks?.[currentSlotRef.current]
    if (active && !active.el.paused) {
      pause()
      return
    }
    void resume()
  }, [pause, resume])

  const seek = useCallback((seconds: number) => {
    const decks = decksRef.current
    const active = decks?.[currentSlotRef.current]
    if (!active) return
    const limit = Math.min(seconds, PREVIEW_LIMIT_SECONDS)
    active.el.currentTime = limit
    setState((prev) => ({ ...prev, currentTime: limit }))
  }, [])

  const setVolume = useCallback(
    (volume: number) => {
      const safe = clamp01(volume)
      volumeRef.current = safe
      const decks = decksRef.current
      const active = decks?.[currentSlotRef.current]
      if (active) fadeTo(active.el, targetVolume(activeCueRef.current), 150)
      setState((prev) => ({ ...prev, volume: safe }))
    },
    [fadeTo, targetVolume],
  )

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current
    mutedRef.current = next
    const decks = decksRef.current
    const active = decks?.[currentSlotRef.current]
    if (active) fadeTo(active.el, targetVolume(activeCueRef.current), FADE_OUT_MS)
    setState((prev) => ({ ...prev, muted: next }))
  }, [fadeTo, targetVolume])

  const selectTrack = useCallback((trackId: string) => {
    selectedRef.current = trackId
    try {
      window.sessionStorage.setItem(SELECTED_TRACK_KEY, trackId)
    } catch {
      // 忽略存储失败
    }
    setState((prev) => ({ ...prev, selectedTrackId: trackId }))
  }, [])

  // 页面不可见时停声，但不改变业务状态；回来不自动续播（避免强制自动播放）
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [pause])

  // Provider 卸载（整页刷新）时彻底释放
  useEffect(
    () => () => {
      clearCueTimer()
      const decks = decksRef.current
      if (decks) {
        for (const deck of [decks.a, decks.b]) {
          cancelRamp(deck.el)
          deck.el.pause()
          deck.el.removeAttribute('src')
          deck.el.load()
        }
      }
      rafRef.current.clear()
    },
    [cancelRamp, clearCueTimer],
  )

  const value = useMemo(
    () => ({ ...state, unlock, play, playCue, releaseCue, playSelected, pause, toggle, seek, setVolume, toggleMute, selectTrack }),
    [state, unlock, play, playCue, releaseCue, playSelected, pause, toggle, seek, setVolume, toggleMute, selectTrack],
  )
  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>
}

export function useAudioPlayer(): PlayerApi {
  const value = useContext(MusicPlayerContext)
  if (!value) throw new Error('DemoMusicPlayer 必须放在 MusicPlayerProvider 内')
  return value
}

/** 兼容已有页面命名，后续页面可渐进迁移。 */
export const MusicPlayerProvider = AudioProvider
export const useMusicPlayer = useAudioPlayer

const clock = (value: number) => `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}`

export function DemoMusicPlayer({ tracks, reason, compact = false, className }: { tracks: LocalDemoAudio[]; reason?: string; compact?: boolean; className?: string }) {
  const player = useAudioPlayer()
  const [index, setIndex] = useState(0)
  const track = tracks[Math.min(index, Math.max(0, tracks.length - 1))]
  const failedHere = player.fallback && player.activeKey === track?.id
  const localAvailable = Boolean(LOCAL_DEMO_AUDIO_ENABLED && track?.localPreviewSrc) && !failedHere
  if (!track) return null
  const active = player.activeKey === track.id
  const current = active ? player.currentTime : 0
  const duration = active ? player.duration : Math.min(track.duration, PREVIEW_LIMIT_SECONDS)
  const select = (next: number) => { player.pause(); setIndex((next + tracks.length) % tracks.length) }

  return (
    <section data-demo-music-player data-playback-mode={localAvailable ? 'local' : 'official-link'} className={cn('rounded-2xl border border-white/10 bg-black/25 p-3', className)}>
      <p className='text-[11px] text-brand-300'>{track.sourceLabel}</p>
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
            <input aria-label='播放进度' type='range' min={0} max={Math.max(duration, 1)} step='0.1' value={current} onChange={(event) => player.seek(Number(event.target.value))} className='min-w-0 flex-1 accent-[#31f58a]' />
            <span className='shrink-0 text-[11px] tabular-nums text-white/55'>{clock(current)} / {clock(duration)}</span>
          </div>
          {!compact ? <label className='flex min-h-11 items-center gap-2 text-[12px] text-white/55'><span>音量</span><input aria-label='音量' type='range' min='0' max='1' step='0.05' value={player.volume} onChange={(event) => player.setVolume(Number(event.target.value))} className='flex-1 accent-[#31f58a]' /></label> : null}
          <div className='flex items-center justify-between gap-3 text-[11px] text-white/45'>
            <a href={track.qqMusicUrl} target='_blank' rel='noopener noreferrer' className='shrink-0 text-brand-300 underline-offset-2 hover:underline'>QQ音乐试听</a>
          </div>
        </div>
      ) : (
        <div className='mt-2'>
          <a data-official-audio-fallback href={track.qqMusicUrl} target='_blank' rel='noopener noreferrer' className='flex min-h-11 w-full items-center justify-center rounded-xl border border-brand-400/35 px-3 text-[14px] font-semibold text-brand-300'>在QQ音乐试听</a>
          <p className='mt-1.5 text-[11px] leading-relaxed text-white/40'>当前为赛事Demo，未接入官方播放API · 每次最多试听 30 秒</p>
        </div>
      )}
    </section>
  )
}
