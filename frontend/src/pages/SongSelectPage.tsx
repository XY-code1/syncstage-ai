import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAudioPlayer } from '../components/music/DemoMusicPlayer'
import { LOCAL_DEMO_AUDIO_ENABLED, LOCAL_DEMO_AUDIO_MANIFEST } from '../data/localDemoAudioManifest'
import { useSession } from '../store/session'
import { SignalAudioReactiveLayer } from '../components/music/AudioReactiveVisuals'
import { useAudioReactive } from '../components/music/AudioReactiveProvider'
import { ImmersiveMusicStage } from '../components/music/ImmersiveMusicStage'

const clock = (value: number) => `0:${String(Math.floor(value)).padStart(2, '0')}`

export function SongSelectPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const player = useAudioPlayer()
  const reactive = useAudioReactive()
  const { selectConcert, setSelectedTrackId, startNewMatch } = useSession()
  const touchStart = useRef(0)
  const [leaving, setLeaving] = useState(false)
  const index = Math.max(0, LOCAL_DEMO_AUDIO_MANIFEST.findIndex((track) => track.id === player.selectedTrackId))
  const track = LOCAL_DEMO_AUDIO_MANIFEST[index]
  const active = player.activeKey === track.id
  const local = LOCAL_DEMO_AUDIO_ENABLED && Boolean(track.localPreviewSrc) && !(player.fallback && active)
  const artwork = `${import.meta.env.BASE_URL}visuals/summer-concert-home.webp`

  const choose = (next: number) => {
    player.pause()
    player.selectTrack(LOCAL_DEMO_AUDIO_MANIFEST[(next + 3) % 3].id)
  }
  const continueFlow = () => {
    setLeaving(true)
    selectConcert(concertId === 'night-voyage' ? 'night-flight' : concertId)
    startNewMatch()
    setSelectedTrackId(track.id)
    window.setTimeout(
      () => navigate(`/concert/${concertId}/searching`, { state: { startFromSong: true } }),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480,
    )
  }

  return (
    <div className={`signal-scene signal-select immersive-song ${leaving ? 'signal-scene-leaving' : ''}`}>
      <img className='signal-scene-bg' src={`${import.meta.env.BASE_URL}visuals/summer-concert-bg.webp`} alt='夏日晚霞中的户外音乐节' />
      <div className='signal-scene-mask' />
      <SignalAudioReactiveLayer />
      <header className='signal-header immersive-song-header'>
        <button aria-label='返回首页' onClick={() => navigate('/home')}>‹</button>
        <div><span>QQ音乐 · 一起去现场</span><b>{index + 1}/3</b></div>
        <em>概念功能 Demo</em>
      </header>
      <main
        className='immersive-song-main'
        onTouchStart={(event) => { touchStart.current = event.changedTouches[0].clientX }}
        onTouchEnd={(event) => {
          const distance = event.changedTouches[0].clientX - touchStart.current
          if (Math.abs(distance) > 48) choose(index + (distance < 0 ? 1 : -1))
        }}
      >
        <div className='immersive-song-title'>
          <h1>今夜，和同频的人相遇</h1>
          <p>选择你的今夜信号 · 把一首歌写进同频卡</p>
        </div>
        <ImmersiveMusicStage artwork={artwork} title={track.title} />
        <section
          className='immersive-song-track'
          style={{ '--track-accent': track.accentColor, '--audio-bass': reactive.normalizedBass } as CSSProperties}
          aria-label={`当前歌曲 ${track.title}`}
        >
          <h2>{track.title}</h2>
          <p>{track.artist}</p>
          <div className='immersive-song-tags'>{track.mood.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>
          {local ? (
            <div className='immersive-song-progress'>
              <span>{clock(active ? player.currentTime : 0)}</span>
              <input aria-label='播放进度' type='range' min='0' max={Math.max(player.duration || 30, 1)} value={active ? player.currentTime : 0} onChange={(event) => player.seek(Number(event.target.value))} />
              <span>0:30</span>
            </div>
          ) : (
            <a className='immersive-song-official' href={track.qqMusicUrl} target='_blank' rel='noopener noreferrer'>在QQ音乐试听</a>
          )}
          {player.fallback && active ? <small>演示音频暂不可用</small> : null}
        </section>
        <div className='immersive-song-controls'>
          <button aria-label='上一首' onClick={() => choose(index - 1)}>◀</button>
          {local ? <button className='immersive-play' aria-label={active && player.playing ? '暂停' : '播放'} onClick={() => void player.play(track)}>{active && player.playing ? 'Ⅱ' : '▶'}</button> : <span className='immersive-play is-disabled'>♪</span>}
          <button aria-label='下一首' onClick={() => choose(index + 1)}>▶</button>
        </div>
      </main>
      <footer className='signal-action immersive-song-action'><button onClick={continueFlow}>把这首歌写进同频卡 <span>→</span></button></footer>
    </div>
  )
}
