import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, DemoBadge } from '../components/ui'
import { ShieldIcon, MusicIcon, UsersIcon } from '../components/icons'

const flow = ['演出详情', '画像授权', '需求确认', 'Agent 执行', '结果邀请', '限时房间']
const paths = ['/', '/concert/night-voyage', '/concert/night-voyage/select-song', '/concert/night-voyage/searching', '/concert/night-voyage/sync/reveal', '/concert/night-voyage/room']
const tools = ['parse_social_intent', 'get_authorized_music_profile', 'search_same_event_candidates', 'apply_safety_constraints', 'rank_candidates', 'create_temporary_room']

export function ShowcasePage() {
  const navigate = useNavigate()
  return <main className='showcase-grid min-h-screen bg-stage-950 px-5 pb-16 pt-8 text-white'>
    <section className='relative overflow-hidden rounded-[28px] border border-brand-500/25 bg-[#0d1413] px-5 py-8'>
      <div className='absolute -right-12 -top-12 h-40 w-40 rounded-full bg-brand-500/20 blur-3xl' />
      <DemoBadge label='腾讯音乐高校 AI 黑客松 · 概念 Demo' />
      <p className='mt-8 text-sm font-medium text-brand-300'>QQ音乐 · 一起去现场</p>
      <h1 className='mt-2 text-[36px] font-semibold leading-[1.08] tracking-[-0.04em]'>在开场之前，<br />找到和你同频的人。</h1>
      <p className='mt-4 text-base text-white/60'>AI 同频同行助手</p>
      <Button className='mt-7' full size='lg' onClick={() => navigate('/')}>进入产品演示</Button>
    </section>
    <ShowSection eyebrow='01 / USER PAIN' title='独自观演，不该等于独自抵达'>买票后到开场前存在一段平台尚未服务的空白：想找同行者，却缺少可信音乐证据、同场约束与安全确认。</ShowSection>
    <ShowSection eyebrow='02 / PLATFORM OPPORTUNITY' title='QQ音乐资产让匹配理由可验证'>收藏歌曲、常听歌手、歌单标签和关注演出，不只是兴趣描述，而是能被 Agent 调用、组合与解释的音乐证据。</ShowSection>
    <section className='mt-6 rounded-[24px] border border-white/10 bg-[#10151b] p-5'><Eyebrow>03 / CORE FLOW</Eyebrow><h2 className='mt-2 text-xl font-semibold'>六步完成一次安全组队</h2><div className='mt-5 grid grid-cols-2 gap-2'>{flow.map((item, i)=><div key={item} className='rounded-2xl border border-white/8 bg-white/[.025] p-3'><span className='text-xs text-brand-300'>0{i+1}</span><p className='mt-1 text-sm'>{item}</p></div>)}</div></section>
    <section className='signal-card mt-6 rounded-[24px] p-5'><Eyebrow>04 / AGENT ARCHITECTURE</Eyebrow><h2 className='mt-2 text-xl font-semibold'>可见计划、真实调用、确定性安全</h2><div className='mt-4 space-y-2'>{tools.map((tool, i)=><div key={tool} className='flex items-center gap-3 rounded-xl bg-black/20 px-3 py-2.5'><span className='flex h-7 w-7 items-center justify-center rounded-full bg-violet-400/15 text-xs text-violet-400'>{i+1}</span><code className='text-xs text-white/75'>{tool}</code></div>)}</div></section>
    <section className='mt-6'><Eyebrow>05 / SIX MOBILE SCREENS</Eyebrow><h2 className='mt-2 text-xl font-semibold'>从演出页自然进入，再回到平台关系</h2><div className='mt-4 grid grid-cols-2 gap-3'>{flow.map((item,i)=><button key={item} onClick={()=>navigate(paths[i])} className='min-h-32 rounded-[22px] border border-white/10 bg-gradient-to-b from-[#182029] to-[#0a0d11] p-3 text-left'><span className='text-xs text-white/35'>SCREEN 0{i+1}</span><div className='signal-line mt-5 h-1 w-12 rounded-full'/><p className='mt-3 text-sm font-medium'>{item}</p></button>)}</div></section>
    <section className='mt-6 grid gap-3'><Value icon={<ShieldIcon className='h-5 w-5'/>} title='安全机制' text='公开集合点、硬规则过滤、双向确认、精确位置默认关闭。'/><Value icon={<MusicIcon className='h-5 w-5'/>} title='平台价值' text='把听歌关系延伸至线下演出，让音乐资产成为可信连接的基础。'/><Value icon={<UsersIcon className='h-5 w-5'/>} title='边界清晰' text='不做开放私信，不做陌生人信息流，只服务同场演出前与候场期。'/></section>
    <p className='mt-8 text-center text-sm leading-relaxed text-white/40'>本作品为参赛概念Demo，当前使用模拟数据，未调用QQ音乐官方内部API。</p>
  </main>
}
function Eyebrow({children}:{children:ReactNode}){return <p className='text-xs font-semibold tracking-[.18em] text-brand-300'>{children}</p>}
function ShowSection({eyebrow,title,children}:{eyebrow:string;title:string;children:ReactNode}){return <section className='mt-6 rounded-[24px] border border-white/10 bg-[#10151b] p-5'><Eyebrow>{eyebrow}</Eyebrow><h2 className='mt-2 text-xl font-semibold'>{title}</h2><p className='mt-3 text-sm leading-6 text-white/60'>{children}</p></section>}
function Value({icon,title,text}:{icon:ReactNode;title:string;text:string}){return <div className='rounded-[22px] border border-white/10 bg-[#10151b] p-4'><div className='text-brand-300'>{icon}</div><h3 className='mt-3 text-base font-semibold'>{title}</h3><p className='mt-1 text-sm leading-6 text-white/55'>{text}</p></div>}
