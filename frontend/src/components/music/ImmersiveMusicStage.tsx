import type { CSSProperties } from 'react'
import { useAudioReactive } from './AudioReactiveProvider'
import { AudioSpectrumBars } from './AudioReactiveVisuals'

/** Decorative-only music scene. The surrounding page keeps the real controls and content. */
export function ImmersiveMusicStage({
  artwork,
  title,
  compact = false,
}: {
  artwork: string
  title: string
  compact?: boolean
}) {
  const audio = useAudioReactive()
  const style = {
    '--stage-bass': audio.normalizedBass,
    '--stage-mid': audio.normalizedMid,
    '--stage-treble': audio.normalizedTreble,
  } as CSSProperties

  return (
    <div className={`immersive-music-stage ${compact ? 'immersive-music-stage-compact' : ''}`} style={style} aria-hidden='true'>
      <span className='immersive-ribbon immersive-ribbon-a' />
      <span className='immersive-ribbon immersive-ribbon-b' />
      <span className='immersive-ribbon immersive-ribbon-c' />
      <span className='immersive-vinyl'>
        <span className='immersive-vinyl-groove' />
        <img src={artwork} alt='' />
        <span className='immersive-vinyl-hole' />
      </span>
      <span className='immersive-stage-caption'>{title}</span>
      <AudioSpectrumBars className='immersive-stage-spectrum' />
    </div>
  )
}
