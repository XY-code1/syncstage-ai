import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { localDemoAudioByKey } from '../data/localDemoAudioManifest'
import { syncStagesOf } from '../lib/agentMock'
import { useAudioPlayer } from '../components/music/DemoMusicPlayer'
import { useExitToFrequency } from '../hooks/useExitToFrequency'
import { useSession } from '../store/session'

const MERGE_HOLD_MS=850
export function AgentProgressPage(){
 const player=useAudioPlayer();const track=localDemoAudioByKey(player.selectedTrackId);const {concertId='night-flight'}=useParams();const navigate=useNavigate();const location=useLocation();const started=useRef(false);const jumped=useRef<string|null>(null);const [menu,setMenu]=useState(false)
 const {agent,agentRunning,agentStarting,agentError,runAgent,pauseAgent,cancelAgent,agentMode,agentNotConfigured,setAgentMode}=useSession();const active=agentRunning||agentStarting;const paused=Boolean(agent?.status==='running'&&!active);const exit=useExitToFrequency(cancelAgent)
 const stages=useMemo(()=>syncStagesOf(agent?.trace??[]),[agent?.trace]);const done=stages.filter(s=>s.state==='done').length;const merged=Boolean(agent&&!active&&agent.status==='pending_confirmation'&&agent.rankedCandidates.length);const failed=Boolean(agentError||agent?.status==='error')
 useEffect(()=>{if(!location.pathname.endsWith('/searching')||started.current||active||agent)return;started.current=true;void runAgent({text:`寻找同场同行者，一起循环《${track.title}》，只在公开场合见面。`})},[active,agent,location.pathname,runAgent,track.title])
 useEffect(()=>{void player.playSelected()},[])
 useEffect(()=>{if(!merged||!agent||jumped.current===agent.sessionId)return;const id=window.setTimeout(()=>{jumped.current=agent.sessionId;navigate(`/concert/${concertId}/reveal`,{replace:true})},MERGE_HOLD_MS);return()=>clearTimeout(id)},[agent,concertId,merged,navigate])
 const visualStages=[{label:'听见你的旋律',done:done>=1},{label:'对齐音乐偏好',done:done>=3},{label:'找到同频的人',done:merged||done>=5}]
 if(agentMode==='live'&&agentNotConfigured)return <div className='signal-scene signal-search'><img className='signal-scene-bg' src={`${import.meta.env.BASE_URL}visuals/summer-concert-bg.webp`} alt=''/><div className='signal-scene-mask'/><div className='signal-error'><h1>音乐信号暂时没有送出</h1><p>{agentNotConfigured}</p><button onClick={()=>setAgentMode('mock')}>使用 Demo 模式继续</button></div></div>
 return <div className={`signal-scene signal-search ${merged?'signal-search-matched':''}`}>
  <img className='signal-scene-bg' src={`${import.meta.env.BASE_URL}visuals/summer-concert-bg.webp`} alt='晚霞逐渐进入夜色的演唱会人群'/><div className='signal-scene-mask'/>
  <header className='signal-header'><button aria-label='返回同频首页' onClick={exit}>‹</button><div><span>QQ音乐 · 一起去现场</span><button className='signal-more' aria-label='更多任务选项' onClick={()=>setMenu(v=>!v)}>•••</button></div>{menu&&<aside className='signal-menu'><button onClick={()=>{cancelAgent();navigate(`/concert/${concertId}/task`)}}>修改条件</button><button onClick={exit}>结束任务</button></aside>}</header>
  <main className='signal-search-main'><div className='signal-title'><h1>{paused?'音乐信号已暂停':'正在把你的音乐信号送向人群'}</h1><p>{paused?'继续后将沿用当前歌曲与条件':`寻找也在循环《${track.title}》的同场听众`}</p></div>
   <div className='signal-orbit' aria-label='音乐信号正在扩散'>
    <div className='signal-ribbon ribbon-a'/><div className='signal-ribbon ribbon-b'/>{Array.from({length:18},(_,i)=><i className='signal-firefly' key={i} style={{'--i':i} as React.CSSProperties}/>) }
    {[0,1,2].map(i=><span key={i} className={`audience-light audience-${i}`}><img src={`${import.meta.env.BASE_URL}portraits/demo-orange.webp`} alt='Demo同场听众'/></span>)}
    <article className='search-paper-card'><img src={`${import.meta.env.BASE_URL}visuals/summer-concert-home.webp`} alt='当前歌曲视觉封面'/><div><small>今夜信号</small><strong>{track.title}</strong><span>{track.artist}</span></div><b>♪</b></article>
   </div>
   <ol className='signal-progress'>{visualStages.map((s,i)=><li key={s.label} className={s.done?'done':i===visualStages.findIndex(x=>!x.done)?'current':''}><i>{s.done?'✓':''}</i><span>{s.label}</span></li>)}</ol>
   {failed?<div className='signal-status-card'><b>这次信号没有送达</b><p>{agentError||'请稍后重新尝试'}</p><button onClick={()=>void runAgent()}>重新寻找</button></div>:agent?.status==='no_match'?<div className='signal-status-card'><b>暂未找到同频的人</b><p>不会为了凑人数降低你的安全条件。</p></div>:null}
  </main>
  {(active||paused)&&<footer className='signal-search-action'><button onClick={()=>paused?void runAgent():pauseAgent()}>{paused?'继续寻找':'暂停寻找'}</button></footer>}
 </div>
}
