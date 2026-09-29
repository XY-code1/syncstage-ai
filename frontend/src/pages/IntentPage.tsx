import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MockNotice, QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, SectionTitle, StateView } from '../components/ui'
import { SparkleIcon } from '../components/icons'
import { messageOf, useSession } from '../store/session'
import { parseIntentRequest } from '../lib/api'
import { DEMO_VIEWER } from '../lib/tmeMock'

const EXAMPLES = [
  '帮我找个安静一点的女生一起候场，最好同龄，副歌能一起唱，只在公开场合见面。',
  '想找两三个人一起排队、一起拍照，散场后各自回家，先聊熟再见面。',
  '我一个人来看，想找人一起把《夜航的信》唱完，最好也喜欢星野回声。',
  '想到现场认真听完整场，不聊天也行，先在线下集合点碰面一起进场。',
]

export function IntentPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { rawIntent, setRawIntent, scopes, saveParsedIntent, pushToast } = useSession()
  const [text, setText] = useState(rawIntent)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')

  const submit = async () => {
    if (text.trim().length < 6) return
    setStatus('loading')
    setError('')
    try {
      const result = await parseIntentRequest({ text: text.trim(), eventId: concertId, scopes, userId: DEMO_VIEWER.userId })
      if (!result.parsedIntent) throw new Error('没能理解你的需求，请换一种说法')
      setRawIntent(text.trim())
      saveParsedIntent(result.parsedIntent)
      navigate(`/concert/${concertId}/intent/confirm`)
    } catch (err) {
      setError(messageOf(err))
      setStatus('error')
      pushToast('解析失败，可以换一种说法再试', 'warn')
    } finally {
      setStatus('idle')
    }
  }

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar title='说出你的需求' subtitle='同频现场 · 用自然语言描述想找什么样的同行者' onBack={() => navigate(`/concert/${concertId}/authorize`)} />

      <main className='flex-1 px-4 pb-40 pt-4'>
        <div className='flex flex-col gap-4'>
          <div>
            <h1 className='text-[19px] font-semibold text-white'>想和什么样的人一起看这场演出？</h1>
            <p className='mt-2 text-[12px] leading-relaxed text-white/55'>
              像跟朋友说话一样写就行。Agent 会自己从中识别活动、歌曲、同行目的、交流风格、人数和安全边界，
              然后去调用对应的工具。
            </p>
          </div>

          <Card className='p-0'>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              maxLength={220}
              placeholder='例如：帮我找个安静一点的女生一起候场，最好同龄，副歌能一起唱，只在公开场合见面。'
              className='w-full resize-none rounded-card bg-transparent px-4 py-3.5 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/25'
            />
            <div className='flex items-center justify-between border-t border-white/6 px-4 py-2.5'>
              <span className='text-[11px] text-white/35'>{text.length}/220</span>
              <button
                type='button'
                className='text-[11px] text-white/45 transition hover:text-white/70'
                onClick={() => setText('')}
              >
                清空
              </button>
            </div>
          </Card>

          <div>
            <SectionTitle title='不知道怎么写？试试这些' />
            <div className='flex flex-col gap-2'>
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type='button'
                  onClick={() => setText(example)}
                  className='rounded-2xl border border-white/10 bg-white/[0.025] px-3.5 py-3 text-left text-[12px] leading-relaxed text-white/65 transition hover:border-brand-500/40 hover:text-white/85'
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          {status === 'error' ? (
            <StateView
              status='error'
              title='没能理解你的需求'
              description={error}
              actionLabel='重新提交'
              onAction={() => void submit()}
            />
          ) : null}

          <MockNotice compact />

          <Card>
            <SectionTitle title='Agent 接下来会做什么' hint='你可以在下一步确认它理解得对不对' />
            <ol className='flex flex-col gap-1.5 text-[12px] leading-relaxed text-white/60'>
              <li>1. 把你的原话拆成结构化意图，等你确认</li>
              <li>2. 读取你授权的音乐偏好（收藏 / 歌手 / 近期播放 / 关注演出 / 歌单标签）</li>
              <li>3. 在这一场的观众里检索候选人，先过一遍安全硬条件</li>
              <li>4. 按四个维度打分，生成只引用真实共同点的推荐理由</li>
              <li>5. 双方都确认后才创建临时房间</li>
            </ol>
            <Button variant='ghost' size='sm' className='mt-3 px-0' onClick={() => navigate(`/concert/${concertId}/preferences`)}>
              想更精确？用表单补充细节 ›
            </Button>
          </Card>
        </div>
      </main>

      <footer className='safe-bottom sticky bottom-0 z-30 border-t border-white/8 bg-stage-950/92 px-4 pt-3 backdrop-blur-xl'>
        <Button
          size='lg'
          full
          disabled={text.trim().length < 6 || status === 'loading'}
          icon={<SparkleIcon className='h-4 w-4' />}
          onClick={() => void submit()}
        >
          {status === 'loading' ? 'Agent 正在理解你的需求…' : '让 Agent 理解我的需求'}
        </Button>
        <p className='pb-1 pt-2 text-center text-[11px] text-white/40'>
          {text.trim().length < 6 ? '至少写 6 个字，Agent 才猜得准' : '下一步你可以逐项修改它的理解结果'}
        </p>
      </footer>
    </div>
  )
}