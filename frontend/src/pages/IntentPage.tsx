import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MockNotice, QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, Chip, SectionTitle, StateView } from '../components/ui'
import { SparkleIcon } from '../components/icons'
import { CHAT_STYLE_OPTIONS, GROUP_SIZE_OPTIONS, PURPOSE_OPTIONS, SAFETY_OPTIONS } from '../data/options'
import { messageOf, useSession } from '../store/session'
import { parseIntentRequest } from '../lib/api'
import { DEMO_VIEWER, getMusicProfile } from '../lib/tmeMock'
import type { ChatStyle, GroupSize, ParsedIntent, Purpose, SafetyPref } from '../types'

const EXAMPLES = [
  '想找两个也喜欢《夜航的信》的人一起候场，只在公开场合见面。',
  '想找三个人一起排队，先聊熟再见面，交流节奏温和一点。',
  '我想安静听完整场，不需要一直聊天，结伴入场和离场。',
]

export function IntentPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { rawIntent, setRawIntent, scopes, saveParsedIntent, runAgent, pushToast, destroyEventAgent } = useSession()
  const [text, setText] = useState(rawIntent)
  const [intent, setIntent] = useState<ParsedIntent | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState<string[]>([])
  const profile = getMusicProfile(DEMO_VIEWER.userId, scopes)

  const parse = async () => {
    if (text.trim().length < 6) return
    setStatus('loading')
    setError('')
    try {
      const result = await parseIntentRequest({ text: text.trim(), eventId: concertId, scopes, userId: DEMO_VIEWER.userId })
      if (!result.parsedIntent) throw new Error('没能理解你的需求，请换一种说法')
      setRawIntent(text.trim())
      setIntent(result.parsedIntent)
      saveParsedIntent(result.parsedIntent)
      setStatus('idle')
    } catch (err) {
      setError(messageOf(err))
      setStatus('error')
      pushToast('解析失败，可以换一种说法再试', 'warn')
    }
  }

  const patch = (changes: Partial<ParsedIntent>) => {
    if (!intent) return
    const next = { ...intent, ...changes }
    setIntent(next)
    saveParsedIntent(next)
  }
  const toggle = <T,>(values: T[], value: T) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value]

  const start = () => {
    if (!intent) return
    saveParsedIntent(intent)
    navigate(`/concert/${concertId}/agent`)
    void runAgent({ intent })
  }

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar title='AI 同频同行助手' subtitle='对话描述需求，并在本页确认 Agent 的理解' onBack={() => navigate(`/concert/${concertId}/authorize`)} />
      <main className='flex-1 px-4 pb-40 pt-4'>
        <div className='flex flex-col gap-4'>
          <div>
            <h1 className='text-[19px] font-semibold text-white'>给同行 Agent 一个任务</h1>
            <p className='mt-2 text-[12px] leading-relaxed text-white/55'>描述希望它替你核对的歌曲、到场计划、人数和安全边界。Agent 只做结构化协商，不替你持续聊天。</p>
          </div>

          <Card className='signal-card'>
            <SectionTitle title='同行 Agent 眼中的你' hint='每项均可隐藏；编辑需求后会即时更新' />
            <div className='space-y-2'>
              {[
                ['音乐偏好', profile?.favoriteTracks.slice(0, 3).map((v) => `《${v.title}》`).join('、') || '未授权', '收藏歌曲'],
                ['常听歌手', profile?.topArtists.join('、') || '未授权', '常听歌手'],
                ['同行目的', intent?.purposes.join('、') || '等待你描述任务', '你这次的原话'],
                ['交流方式', intent?.chatStyle || '等待你描述任务', '你这次的原话'],
                ['到场计划', '开场前 40 分钟抵达公开集合点', '本场演出 + 用户确认'],
                ['组队人数', intent ? `${intent.groupSize} 人` : '等待你描述任务', '你这次的原话'],
                ['安全边界', intent?.safety.join('、') || '默认仅公开场合见面', '用户确认的硬规则'],
              ].map(([label, value, source]) => {
                const isHidden = hidden.includes(label)
                return <div key={label} className='rounded-xl border border-white/8 bg-black/15 px-3 py-2.5'>
                  <div className='flex items-center justify-between gap-2'><p className='text-sm font-medium text-white'>{label}</p><button className='text-xs text-brand-300' onClick={() => setHidden((prev) => isHidden ? prev.filter((v) => v !== label) : [...prev, label])}>{isHidden ? '恢复' : '隐藏'}</button></div>
                  <p className='mt-1 text-sm text-white/65'>{isHidden ? '已隐藏，不提供给候选 Agent' : value}</p><p className='mt-1 text-xs text-white/35'>来源：{source}</p>
                </div>
              })}
            </div>
            <Button className='mt-3' variant='ghost' size='sm' full onClick={() => { destroyEventAgent(); navigate(`/concert/${concertId}`) }}>销毁本场 Agent 并撤回授权</Button>
          </Card>

          <Card className='p-0'>
            <textarea value={text} onChange={(event) => { setText(event.target.value); setIntent(null) }} rows={5} maxLength={220}
              placeholder='例如：想找两个也喜欢《夜航的信》的人一起候场，只在公开场合见面。'
              className='w-full resize-none rounded-card bg-transparent px-4 py-3.5 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/25' />
            <div className='flex items-center justify-between border-t border-white/6 px-4 py-2.5'>
              <span className='text-[11px] text-white/35'>{text.length}/220</span>
              <button type='button' className='text-[11px] text-brand-300' onClick={() => { setText(''); setIntent(null) }}>清空</button>
            </div>
          </Card>

          {!intent ? (
            <>
              <div>
                <SectionTitle title='示例需求' />
                <div className='flex flex-col gap-2'>{EXAMPLES.map((example) => (
                  <button key={example} type='button' onClick={() => { setText(example); setIntent(null) }} className='rounded-2xl border border-white/10 bg-white/[0.025] px-3.5 py-3 text-left text-[12px] leading-relaxed text-white/65'>{example}</button>
                ))}</div>
              </div>
              <Button size='lg' full disabled={text.trim().length < 6 || status === 'loading'} icon={<SparkleIcon className='h-4 w-4' />} onClick={() => void parse()}>
                {status === 'loading' ? '正在理解任务…' : '让 Agent 理解任务'}
              </Button>
            </>
          ) : (
            <Card className='border-brand-500/35 bg-brand-500/[0.06]'>
              <SectionTitle title='Agent 的结构化理解' hint='确认或直接调整，再开始执行任务' />
              <div className='flex flex-wrap gap-2'>
                {intent.mentionedSongs.map((song) => <Chip key={song} label={`歌曲《${song}》`} size='sm' selected />)}
                {intent.mentionedArtists.map((artist) => <Chip key={artist} label={`歌手 ${artist}`} size='sm' selected />)}
              </div>
              <p className='mb-2 mt-4 text-[11px] text-white/45'>同行目的</p>
              <div className='flex flex-wrap gap-2'>{PURPOSE_OPTIONS.map((option) => <Chip key={option.value} label={option.value} size='sm' selected={intent.purposes.includes(option.value as Purpose)} onClick={() => patch({ purposes: toggle(intent.purposes, option.value as Purpose) })} />)}</div>
              <p className='mb-2 mt-4 text-[11px] text-white/45'>交流方式</p>
              <div className='flex flex-wrap gap-2'>{CHAT_STYLE_OPTIONS.map((option) => <Chip key={option.value} label={option.value} size='sm' selected={intent.chatStyle === option.value} onClick={() => patch({ chatStyle: option.value as ChatStyle })} />)}</div>
              <p className='mb-2 mt-4 text-[11px] text-white/45'>组队人数</p>
              <div className='flex flex-wrap gap-2'>{GROUP_SIZE_OPTIONS.map((option) => <Chip key={option.value} label={option.label} size='sm' selected={intent.groupSize === option.value} onClick={() => patch({ groupSize: option.value as GroupSize })} />)}</div>
              <p className='mb-2 mt-4 text-[11px] text-white/45'>确定性安全硬条件</p>
              <div className='flex flex-wrap gap-2'>{SAFETY_OPTIONS.map((option) => <Chip key={option.value} label={option.value} size='sm' selected={intent.safety.includes(option.value as SafetyPref)} onClick={() => patch({ safety: toggle(intent.safety, option.value as SafetyPref) })} />)}</div>
              <p className='mt-3 text-[11px] leading-relaxed text-white/45'>安全条件由确定性程序先过滤，不交给大模型自由判断。</p>
              <Button className='mt-4' size='lg' full icon={<SparkleIcon className='h-4 w-4' />} onClick={start}>确认需求，执行 Agent 任务</Button>
              <Button className='mt-2' variant='ghost' size='sm' full onClick={() => setIntent(null)}>修改原话</Button>
            </Card>
          )}

          {status === 'error' ? <StateView status='error' title='没能理解你的需求' description={error} actionLabel='重新解析' onAction={() => void parse()} /> : null}
          <MockNotice compact />
        </div>
      </main>
    </div>
  )
}
