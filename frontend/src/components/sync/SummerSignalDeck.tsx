import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { Button } from '../ui'
import { SparkleIcon } from '../icons'
import { cn } from '../../lib/cn'
import type { RevealCandidate } from '../../data/revealCandidates'

export const OPEN_DURATION_MS = 1200
export type RevealPhase = 'sealed' | 'opening' | 'revealed'
export type CaptureStage = 'sealed' | 'opening-40' | 'opening-80' | 'revealed'

const PARTICLES = Array.from({ length: 15 }, (_, index) => ({
  x: -116 + ((index * 53) % 230), y: -96 + ((index * 37) % 168), delay: 420 + (index % 5) * 52,
  color: ['#ffcf5b', '#ff91c1', '#77ead8', '#ffe69e'][index % 4], ribbon: index % 4 === 0,
}))
type ParticleStyle = CSSProperties & Record<'--x' | '--y' | '--c', string>

let cardAudioContext: AudioContext | null = null
function playCardOpenSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    cardAudioContext ??= new AudioContextClass()
    const context = cardAudioContext
    void context.resume()
    const now = context.currentTime

    // A short paper-like sweep followed by a soft two-note reveal chime.
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(520, now)
    oscillator.frequency.exponentialRampToValueAtTime(880, now + .34)
    gain.gain.setValueAtTime(.0001, now)
    gain.gain.exponentialRampToValueAtTime(.09, now + .045)
    gain.gain.exponentialRampToValueAtTime(.0001, now + .62)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(now); oscillator.stop(now + .65)

    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .25), context.sampleRate)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * (1 - i / channel.length)
    const sweep = context.createBufferSource()
    const filter = context.createBiquadFilter()
    const sweepGain = context.createGain()
    filter.type = 'bandpass'; filter.frequency.setValueAtTime(1400, now); filter.frequency.exponentialRampToValueAtTime(420, now + .25)
    sweepGain.gain.setValueAtTime(.045, now); sweepGain.gain.exponentialRampToValueAtTime(.0001, now + .25)
    sweep.buffer = buffer; sweep.connect(filter).connect(sweepGain).connect(context.destination)
    sweep.start(now); sweep.stop(now + .26)
  } catch {
    // Audio is enhancement-only; blocked Web Audio never interrupts card opening.
  }
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(media.matches)
    update(); media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return reduced
}

export function SummerSignalDeck({
  candidates, index, onIndexChange, onPrimary, captureStage,
}: {
  candidates: RevealCandidate[]
  index: number
  onIndexChange: (next: number) => void
  onPrimary: (item: RevealCandidate) => void
  /** 仅供视觉验收截图使用，不改变正式交互。 */
  captureStage?: CaptureStage
}) {
  const reduced = useReducedMotion()
  const safeIndex = Math.min(Math.max(index, 0), Math.max(candidates.length - 1, 0))
  const item = candidates[safeIndex]
  const [phase, setPhase] = useState<RevealPhase>('sealed')
  const [drag, setDrag] = useState(0)
  const startY = useRef<number | null>(null)

  useEffect(() => {
    if (phase !== 'opening' || captureStage) return
    const timer = window.setTimeout(() => setPhase('revealed'), OPEN_DURATION_MS)
    return () => window.clearTimeout(timer)
  }, [phase, captureStage])
  useEffect(() => { if (reduced && !captureStage) setPhase('revealed') }, [reduced, captureStage])

  const shownStage: CaptureStage | RevealPhase = captureStage ?? phase
  const shownPhase: RevealPhase = captureStage === 'sealed' ? 'sealed' : captureStage === 'revealed' ? 'revealed' : captureStage ? 'opening' : phase
  const open = useCallback(() => {
    if (phase !== 'sealed') return
    playCardOpenSound()
    setPhase(reduced ? 'revealed' : 'opening')
  }, [phase, reduced])
  const next = () => {
    if (candidates.length <= 1) return
    const nextIndex = (safeIndex + 1) % candidates.length
    onIndexChange(nextIndex)
    setPhase('revealed')
  }

  if (!item) return null
  const dragging = shownPhase === 'sealed' && startY.current !== null
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (shownPhase !== 'sealed' || captureStage) return
    startY.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (startY.current === null) return
    setDrag(Math.min(0, Math.max(-130, event.clientY - startY.current)))
  }
  const release = () => {
    if (startY.current === null) return
    if (drag < -42) open()
    startY.current = null; setDrag(0)
  }
  const keyOpen = (event: KeyboardEvent<HTMLDivElement>) => {
    if (shownPhase === 'sealed' && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open() }
  }

  return (
    <section data-signal-deck data-candidate-id={item.candidateId} data-deck-phase={shownPhase} data-deck-index={safeIndex} data-deck-total={candidates.length} data-accent={item.accent} className='sync-deck-wrap mx-auto w-full max-w-[374px]'>
      <div
        key={item.candidateId}
        className={cn('sync-greeting-card', `sync-card-${shownStage}`, shownPhase === 'sealed' && 'cursor-grab')}
        role={shownPhase === 'sealed' ? 'button' : undefined}
        tabIndex={shownPhase === 'sealed' ? 0 : undefined}
        aria-label={shownPhase === 'sealed' ? '向上拆开同频卡' : undefined}
        style={{ transform: shownPhase === 'sealed' && drag ? `translateY(${drag * .32}px)` : undefined, transition: dragging ? 'none' : undefined }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={release} onPointerCancel={release}
        onClick={() => { if (shownPhase === 'sealed') open() }} onKeyDown={keyOpen}
      >
        <div className='sync-card-light' aria-hidden='true' />
        <div className='sync-paper-center'>
          <div className='sync-ticket-notch sync-notch-top' /><div className='sync-ticket-notch sync-notch-bottom' />
          <div className='sync-paper-grain' aria-hidden='true' />
          <div className='sync-reveal-content'>
            <CandidateAvatar candidate={item} />
            <p data-deck-part='name' className='mt-2 text-[20px] font-black text-[#4d3727]'>{item.displayName}</p>
            <p data-deck-part='score' className='sync-score mt-1'>{item.matchScore}<span>%</span><b>同频</b></p>
            <p data-deck-part='song' className='mt-3 text-[13px] font-semibold text-[#86664f]'>共同歌曲：《{item.sharedSong}》</p>
            <p className='mt-1 text-[11px] text-[#9a806a]'>{item.artist}</p>
            <div className='sync-music-tags mt-2'>{item.musicTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
            <div className='my-3 h-px bg-[#d9b878]/50' />
            <p data-deck-part='reason' className='text-[15px] leading-relaxed text-[#5b4634]'>{item.reason}</p>
            <div data-deck-part='actions' className='sync-card-actions mt-5 space-y-2.5'>
              <Button full size='lg' className='sync-agent-button min-h-[52px]' icon={<SparkleIcon className='h-4 w-4' />} onClick={(event) => { event.stopPropagation(); onPrimary(item) }}>让 Agent 先聊</Button>
              <button type='button' className='min-h-11 w-full text-[14px] font-semibold text-[#816950]' onClick={(event) => { event.stopPropagation(); next() }}>换一张</button>
              <p className='text-[11px] text-[#806d5d]'>公开场合见面 · 双向确认</p>
            </div>
          </div>
        </div>

        <div className='sync-paper-flap sync-paper-left' aria-hidden='true'><span className='sync-flap-back' /><span className='sync-flap-art'>☀</span><i className='sync-palm'>⌁</i></div>
        <div className='sync-paper-flap sync-paper-right' aria-hidden='true'><span className='sync-flap-back' /><span className='sync-flap-words'>音乐<br />让我们相遇</span><i className='sync-sun'>◒</i></div>

        {shownPhase === 'opening' ? <div className='pointer-events-none absolute inset-0 z-30 overflow-visible' aria-hidden='true'>
          {PARTICLES.map((particle, index) => <i key={index} className={cn('sync-particle', particle.ribbon && 'sync-ribbon')} style={{ '--x': `${particle.x}px`, '--y': `${particle.y}px`, '--c': particle.color, animationDelay: `${particle.delay}ms` } as ParticleStyle} />)}
        </div> : null}
        {shownPhase === 'sealed' ? <div className='sync-sealed-cta'><span>↑</span><b>向上拆开同频卡</b></div> : null}
      </div>
    </section>
  )
}

function CandidateAvatar({ candidate }: { candidate: RevealCandidate }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [candidate.avatar])
  if (failed) return <span data-deck-part='avatar' role='img' aria-label={`${candidate.displayName}头像加载失败，显示文字头像${candidate.avatarFallback}`} className='sync-demo-avatar sync-avatar-fallback'>{candidate.avatarFallback}</span>
  return <img data-deck-part='avatar' src={`${import.meta.env.BASE_URL}${candidate.avatar}`} alt={`${candidate.displayName}的Demo头像`} className='sync-demo-avatar' onError={() => setFailed(true)} />
}
