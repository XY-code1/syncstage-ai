import { useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAudioPlayer } from '../components/music/DemoMusicPlayer'
import { LOCAL_DEMO_AUDIO_ENABLED, LOCAL_DEMO_AUDIO_MANIFEST } from '../data/localDemoAudioManifest'
import { useSession } from '../store/session'

const clock = (value:number) => `0:${String(Math.floor(value)).padStart(2,'0')}`
export function SongSelectPage(){
 const {concertId='night-flight'}=useParams();const navigate=useNavigate();const player=useAudioPlayer();const {selectConcert,setSelectedTrackId,startNewMatch}=useSession();const touchStart=useRef(0);const [leaving,setLeaving]=useState(false)
 const index=Math.max(0,LOCAL_DEMO_AUDIO_MANIFEST.findIndex(t=>t.id===player.selectedTrackId));const track=LOCAL_DEMO_AUDIO_MANIFEST[index];const active=player.activeKey===track.id;const local=LOCAL_DEMO_AUDIO_ENABLED&&Boolean(track.localPreviewSrc)&&!(player.fallback&&active)
 const choose=(next:number)=>{player.pause();player.selectTrack(LOCAL_DEMO_AUDIO_MANIFEST[(next+3)%3].id)}
 const continueFlow=()=>{setLeaving(true);selectConcert(concertId==='night-voyage'?'night-flight':concertId);startNewMatch();setSelectedTrackId(track.id);window.setTimeout(()=>navigate(`/concert/${concertId}/searching`,{state:{startFromSong:true}}),window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:480)}
 return <div className={`signal-scene signal-select ${leaving?'signal-scene-leaving':''}`}>
  <img className='signal-scene-bg' src={`${import.meta.env.BASE_URL}visuals/summer-concert-bg.webp`} alt='夏日晚霞中的户外音乐节'/><div className='signal-scene-mask'/>
  <header className='signal-header'><button aria-label='返回首页' onClick={()=>navigate('/home')}>‹</button><div><span>QQ音乐 · 一起去现场</span><b>{index+1}/3</b></div></header>
  <main className='signal-select-main' onTouchStart={e=>{touchStart.current=e.changedTouches[0].clientX}} onTouchEnd={e=>{const d=e.changedTouches[0].clientX-touchStart.current;if(Math.abs(d)>48)choose(index+(d<0?1:-1))}}>
   <div className='signal-title'><h1>选择你的今夜信号</h1><p>把一首歌，写进今晚的同频卡</p></div>
   <div className='signal-card-shell'><button aria-label='上一首' className='signal-arrow signal-arrow-left' onClick={()=>choose(index-1)}>‹</button>
    <article className='paper-track-card' style={{'--track-accent':track.accentColor} as CSSProperties}>
     <div className='paper-tab'>音乐让我们相遇</div><img src={`${import.meta.env.BASE_URL}visuals/summer-concert-home.webp`} alt='Demo歌曲视觉封面'/>
     <h2>{track.title}</h2><p className='paper-artist'>{track.artist}</p><div className='paper-tags'>{track.mood.slice(0,3).map(tag=><span key={tag}>{tag}</span>)}</div>
     <div className='paper-wave' aria-hidden>{Array.from({length:24},(_,i)=><i key={i} style={{height:`${8+(i*11)%28}px`}}/>)}</div>
     {local?<div className='paper-player'><button aria-label={active&&player.playing?'暂停':'播放'} onClick={()=>void player.play(track)}>{active&&player.playing?'Ⅱ':'▶'}</button><input aria-label='播放进度' type='range' min='0' max={Math.max(player.duration||30,1)} value={active?player.currentTime:0} onChange={e=>player.seek(Number(e.target.value))}/><span>{clock(active?player.currentTime:0)}/0:30</span></div>:<a className='paper-official-link' href={track.qqMusicUrl} target='_blank' rel='noopener noreferrer'>在QQ音乐试听</a>}
     <small>{track.sourceLabel} · 最多试听30秒</small>
    </article><button aria-label='下一首' className='signal-arrow signal-arrow-right' onClick={()=>choose(index+1)}>›</button>
   </div>
  </main><footer className='signal-action'><button onClick={continueFlow}>把这首歌写进同频卡 <span>→</span></button></footer>
 </div>
}
