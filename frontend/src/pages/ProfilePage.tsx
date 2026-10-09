import { useNavigate } from 'react-router-dom'
import { ChevronRightIcon, MusicIcon, TicketIcon, UsersIcon } from '../components/icons'
import { useProfile, DEFAULT_PROFILE } from '../store/profile'
import { useSession } from '../store/session'
import { useQQMusicAuth } from '../store/qqMusicAuth'
import { FEATURED_TRACKS } from '../data/tracks'

const entries = [
  { to: '/me/shows', label: '我的演出', Icon: TicketIcon },
  { to: '/me/friends', label: '同频好友', Icon: UsersIcon },
  { to: '/me/music', label: '音乐画像', Icon: MusicIcon },
]

export function ProfilePage() {
  const navigate = useNavigate()
  const { profile, age, genderLabel } = useProfile()
  const { scopes } = useSession()
  const { qqMusicUser, revoke } = useQQMusicAuth()

  return <div className='summer-account-page'>
    <header className='summer-heading'>
      <span className='summer-eyebrow'>QQ音乐 · 一起去现场</span>
      <h1>我的</h1><p>把你的音乐，唱成你的名字</p>
    </header>
    <section className='summer-glass music-identity'>
      <div className='identity-top'>
        <img className='identity-portrait' src={profile.avatar || import.meta.env.BASE_URL + 'portraits/demo-orange.webp'} alt='你头像' />
        <div><h2>{profile.nickname === DEFAULT_PROFILE.nickname ? '你' : profile.nickname}</h2><p>{[age !== null ? age + '岁' : null, genderLabel, profile.city].filter(Boolean).join(' · ')}</p></div>
        <button onClick={() => navigate('/me/edit')} className='identity-edit'>编辑资料</button>
      </div>
      <p className='identity-signature'>{profile.signature === DEFAULT_PROFILE.signature ? '晚风、海边和可以一起唱歌的人' : profile.signature || '晚风、海边和可以一起唱歌的人'}</p>
      <div className='flex flex-wrap items-center gap-2'>
        <span className='summer-pill'>{qqMusicUser.authorized ? `QQ音乐画像 · Demo已授权 ${scopes.length}项` : 'QQ音乐画像 · 未授权'}</span>
        {qqMusicUser.authorized ? <button type='button' onClick={() => void revoke()} className='min-h-11 rounded-full border border-white/20 px-3 text-[14px] text-white/80'>撤回授权</button> : null}
      </div>
    </section>
    <section className='music-profile-section'>
      <div className='summer-section-title'><h2>我的音乐底色</h2><span>Demo 音乐画像</span></div>
      <div className='identity-tracks'>{FEATURED_TRACKS.map((track, i) => <button key={track.id} onClick={() => navigate('/me/music')} aria-label={'查看音乐画像 ' + track.title}><span className={'demo-song-art demo-song-art-' + i}><span>♪</span><small>DEMO</small></span><strong>{track.title}</strong></button>)}</div>
      <div className='identity-tags'>{['深夜循环', '现场合唱', '夏日晚风'].map(tag => <span key={tag}>{tag}</span>)}</div>
    </section>
    <div className='identity-stats summer-glass'>{[{ value: 14, label: '场演出' }, { value: 6, label: '次匹配' }, { value: 6, label: '位同频好友' }].map(s => <div key={s.label}><strong>{s.value}</strong><span>{s.label}</span></div>)}</div>
    <section className='summer-glass identity-menu'>{entries.map(e => <button key={e.to} onClick={() => navigate(e.to)}><e.Icon /><span>{e.label}</span><ChevronRightIcon /></button>)}</section>
    <details className='summer-glass identity-settings'><summary>更多设置 <span>＋</span></summary><div>{[{ to: '/me/privacy', label: '隐私与安全' }, { to: '/me/music', label: '音乐授权' }, { to: '/me/settings', label: '数据源和设置' }].map(e => <button key={e.label} onClick={() => navigate(e.to)}>{e.label}<ChevronRightIcon /></button>)}</div></details>
    <p className='summer-disclaimer'>音乐身份与同频关系 · 头像与经历为演示数据</p>
  </div>
}
