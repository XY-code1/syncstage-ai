import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, Chip, DemoBadge, Sheet, StateView } from '../components/ui'
import { CardHeading } from '../components/musicVisuals'
import { AlertIcon, ChevronDownIcon, ClockIcon, MusicIcon, ShieldIcon, SparkleIcon, UsersIcon, WaveIcon } from '../components/icons'
import { CHAT_STYLE_OPTIONS, GROUP_SIZE_OPTIONS, MY_GENDER_OPTIONS, PURPOSE_OPTIONS, SAFETY_OPTIONS } from '../data/options'
import { parseIntentRequest } from '../lib/api'
import { useSession } from '../store/session'
import { useConcertFlow } from '../store/concertFlow'
import { ALL_SCOPES } from '../lib/tmeMock'
import type { ChatStyle, GroupSize, MyGender, ParsedIntent, Purpose, SafetyPref } from '../types'
import { useExitToFrequency } from '../hooks/useExitToFrequency'

const AGE_BANDS = ['', '18-22', '23-26', '27-30', '31+']

const EXAMPLES = [
  '想找两个也喜欢《烟花》的人一起候场，只在公开场合见面。',
  '我一个人去看，想找个同样是女生、能安静听完整场的人结伴入场。',
]

type SheetKey = 'music' | 'way' | 'vibe' | 'safety' | 'wrong' | 'examples'

/**
 * Agent 需求确认页。
 *
 * 一屏只做一件事：确认 Agent 对需求的理解。
 * - 四张摘要卡（音乐暗号 / 同行方式 / 现场氛围 / 安全边界），点卡片用 bottom sheet 改；
 * - 底部固定「就按这个找」与「有一处不对」；
 * - 解析来源、结构化字段等技术信息收进可折叠的「查看 Agent 工作过程」。
 */
export function IntentPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { rawIntent, setRawIntent, parsedIntent, saveParsedIntent, runAgent, scopes, judgeMode } = useSession()
  const { flow, patchFlow } = useConcertFlow(concertId)
  const exitToFrequency = useExitToFrequency()

  const [text, setText] = useState(rawIntent || '')
  const [intent, setIntent] = useState<ParsedIntent | null>(parsedIntent)
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [error, setError] = useState('')
  const [sheet, setSheet] = useState<SheetKey | null>(null)

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  const patch = (changes: Partial<ParsedIntent>) => {
    if (!intent) return
    const next = { ...intent, ...changes }
    setIntent(next)
    saveParsedIntent(next)
  }

  const authorizedCount = (flow.consentScopes.length || scopes.length || ALL_SCOPES.length)

  const parse = async () => {
    const trimmed = text.trim()
    if (trimmed.length < 6) return
    setStatus('loading')
    setError('')
    try {
      setRawIntent(trimmed)
      const result = await parseIntentRequest({ text: trimmed, eventId: concertId, scopes: flow.consentScopes, userId: 'u-viewer' })
      if (!result.parsedIntent) throw new Error('Agent 没有返回可用的结构化理解')
      setIntent(result.parsedIntent)
      saveParsedIntent(result.parsedIntent)
      setStatus('idle')
    } catch (issue) {
      setStatus('error')
      setError(issue instanceof Error ? issue.message : '没能理解你的需求')
    }
  }

  const start = () => {
    if (!intent) return
    saveParsedIntent(intent)
    patchFlow({ intent })
    navigate(`/concert/${concertId}/running`, { replace: true })
    void runAgent({ intent })
  }

  const cards = useMemo(() => {
    if (!intent) return []
    const songs = [...intent.mentionedSongs]
    const artists = [...intent.mentionedArtists]
    return [
      {
        key: 'music' as const,
        title: '音乐暗号',
        value: songs.length ? songs.map((song) => `《${song}》`).join('、') : artists.length ? artists.join('、') : '来自已授权的音乐画像',
        hint: `已授权 ${authorizedCount} 项画像`,
        icon: <MusicIcon className='h-4 w-4 text-brand-300' />,
        accent: 'brand' as const,
      },
      {
        key: 'way' as const,
        title: '同行方式',
        value: `${intent.groupSize} 人同行`,
        hint: intent.meetInPerson ? '接受现场见面' : '先在群里聊熟',
        icon: <UsersIcon className='h-4 w-4 text-stageblue-500' />,
        accent: 'blue' as const,
      },
      {
        key: 'vibe' as const,
        title: '现场氛围',
        value: intent.chatStyle,
        hint: intent.purposes[0] ?? '同场观演',
        icon: <WaveIcon className='h-4 w-4 text-vibepurple-500' />,
        accent: 'violet' as const,
      },
      {
        key: 'safety' as const,
        title: '安全边界',
        value: intent.safety[0] ?? '只在公开场合见面',
        hint: `共 ${intent.safety.length} 条安全条件`,
        icon: <ShieldIcon className='h-4 w-4 text-brand-300' />,
        accent: 'brand' as const,
      },
    ]
  }, [authorizedCount, intent])

  // ---------------------------------------------------------------- 输入态
  if (!intent) {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='AI 同频同行助手' subtitle='一句话说清你想和怎样的人一起去现场' onBack={exitToFrequency} />
        <main className='flex-1 px-4 pb-36 pt-4'>
          <h1 className='text-[19px] font-semibold text-ink-100'>给同行 Agent 一个任务</h1>
          <p className='mt-2 text-[13px] leading-relaxed text-ink-400'>
            Agent 只做结构化协商：核对歌曲、到场计划、人数与安全边界，不替你持续聊天。
          </p>

          <button
            type='button'
            onClick={() => navigate(`/concert/${concertId}/authorize?edit=1`)}
            className='mt-3 min-h-11 w-full rounded-2xl border border-white/8 bg-white/[0.03] px-3 text-left text-[13px] text-ink-400'
          >
            已授权 {authorizedCount} 项音乐画像 · <span className='text-brand-300'>修改</span>
          </button>

          <Card className='signal-card mt-3'>
            <CardHeading icon={<SparkleIcon className='h-4 w-4 text-brand-300' />} title='同行 Agent 眼中的你' hint='可编辑' />
            <p className='mt-1.5 text-[12.5px] leading-relaxed text-ink-400'>
              音乐偏好与常听歌手来自已授权画像；任务与安全边界来自本次输入。
            </p>
          </Card>

          <Card className='mt-3 p-0'>
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              maxLength={220}
              placeholder='例如：想找两个也喜欢《烟花》的人一起候场，只在公开场合见面。'
              className='w-full resize-none rounded-card bg-transparent px-4 py-3.5 text-[14px] leading-relaxed text-ink-100 outline-none placeholder:text-white/25'
            />
            <div className='flex items-center justify-between border-t border-white/6 px-4 py-2.5'>
              <span className='text-[12px] text-ink-400'>{text.length}/220</span>
              <button type='button' className='text-[12px] text-brand-300' onClick={() => setText('')}>
                清空
              </button>
            </div>
          </Card>

          <button
            type='button'
            onClick={() => setSheet('examples')}
            className='mt-3 flex min-h-11 w-full items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-3.5 text-left'
          >
            <span className='text-[13px] text-ink-400'>不知道怎么写？看看示例</span>
            <ChevronDownIcon className='h-4 w-4 text-ink-400' />
          </button>

          {status === 'error' ? (
            <div className='mt-3'>
              <StateView status='error' title='没能理解你的需求' description={error} actionLabel='重新解析' onAction={() => void parse()} />
            </div>
          ) : null}
        </main>

        <footer className='safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-white/8 bg-stage-950/96 px-4 pt-3 backdrop-blur-xl'>
          <Button size='lg' full icon={<SparkleIcon className='h-4 w-4' />} disabled={text.trim().length < 6 || status === 'loading'} onClick={() => void parse()}>
            {status === 'loading' ? '正在理解任务…' : '让 Agent 理解任务'}
          </Button>
        </footer>

        <Sheet open={sheet === 'examples'} onClose={() => setSheet(null)} title='示例需求' description='点一条直接填入，再按自己的情况改一改'>
          <div className='space-y-2'>
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type='button'
                onClick={() => {
                  setText(example)
                  setSheet(null)
                }}
                className='w-full rounded-2xl border border-white/10 bg-white/[0.025] px-3.5 py-3 text-left text-[13px] leading-relaxed text-ink-400'
              >
                {example}
              </button>
            ))}
          </div>
        </Sheet>
      </div>
    )
  }

  // ---------------------------------------------------------------- 确认态（一屏）
  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar
        title='确认 Agent 的理解'
        subtitle='一屏确认 · 点任意一张卡就能改'
        onBack={exitToFrequency}
        right={judgeMode ? <DemoBadge label='评委模式' /> : undefined}
      />

      <main className='flex-1 px-4 pb-40 pt-4'>
        <div className='soft-card p-3'>
          <p className='text-[11.5px] text-ink-400'>你的原话</p>
          <p className='mt-1 line-clamp-2 text-[13px] leading-relaxed text-ink-100'>“{rawIntent || text}”</p>
        </div>

        <div className='mt-3 grid grid-cols-2 gap-2.5'>
          {cards.map((card) => (
            <button
              key={card.key}
              type='button'
              onClick={() => setSheet(card.key)}
              className='soft-card min-h-[112px] p-3 text-left transition active:scale-[0.98]'
            >
              <span className='flex items-center gap-1.5'>
                {card.icon}
                <span className='text-[13px] font-medium text-ink-400'>{card.title}</span>
              </span>
              <span className='mt-2 block text-[14px] font-semibold leading-snug text-ink-100'>{card.value}</span>
              <span className='mt-1.5 block text-[12px] leading-snug text-ink-400'>{card.hint}</span>
              <span className='mt-2 block text-[11.5px] text-brand-300'>点这里修改</span>
            </button>
          ))}
        </div>

        <details className='soft-card mt-3 p-0'>
          <summary className='flex min-h-11 cursor-pointer list-none items-center justify-between px-3.5 text-[13px] text-ink-400'>
            查看 Agent 工作过程
            <ChevronDownIcon className='h-4 w-4' />
          </summary>
          <div className='border-t border-white/6 px-3.5 py-3'>
            <p className='text-[12px] leading-relaxed text-ink-400'>{intent.note || 'Agent 已把你的需求拆成结构化条件。'}</p>
            <dl className='mt-2.5 space-y-1.5 text-[12px]'>
              <div className='flex gap-2'>
                <dt className='w-20 shrink-0 text-ink-400'>同场活动</dt>
                <dd className='text-ink-100'>{intent.eventId || concertId}</dd>
              </div>
              <div className='flex gap-2'>
                <dt className='w-20 shrink-0 text-ink-400'>同行目的</dt>
                <dd className='text-ink-100'>{intent.purposes.join('、') || '同场观演'}</dd>
              </div>
              <div className='flex gap-2'>
                <dt className='w-20 shrink-0 text-ink-400'>安全条件</dt>
                <dd className='text-ink-100'>{intent.safety.join('、') || '未指定'}</dd>
              </div>
              <div className='flex gap-2'>
                <dt className='w-20 shrink-0 text-ink-400'>见面方式</dt>
                <dd className='text-ink-100'>{intent.meetInPerson ? '接受线下见面' : '只在线上沟通'}</dd>
              </div>
            </dl>
            <button
              type='button'
              onClick={() => navigate(`/concert/${concertId}/trace`)}
              className='mt-3 text-[12px] text-brand-300'
            >
              查看完整工具调用记录
            </button>
          </div>
        </details>

        <p className='mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-400/80'>
          <ClockIcon className='h-3 w-3' />
          确认后 Agent 才会开始检索同场候选人
        </p>
      </main>

      <footer className='safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-white/8 bg-stage-950/96 px-4 pt-3 backdrop-blur-xl'>
        <div className='flex gap-2'>
          <Button size='lg' className='flex-1 glow-cta' icon={<SparkleIcon className='h-4 w-4' />} onClick={start}>
            就按这个找
          </Button>
          <Button size='lg' variant='secondary' onClick={() => setSheet('wrong')}>
            有一处不对
          </Button>
        </div>
        <p className='pb-1 pt-2 text-center text-[11px] text-ink-400/70'>
          {intent.groupSize} 人同行 · {intent.safety.length} 条安全条件 · 安全条件由确定性程序先过滤
        </p>
      </footer>

      {/* ---------------- bottom sheet：改一项 ---------------- */}
      <Sheet open={sheet === 'music'} onClose={() => setSheet(null)} title='音乐暗号' description='Agent 用它判断你们想听的歌是否重合'>
        <div className='space-y-3'>
          <Field label='想听的歌'>
            {intent.mentionedSongs.length ? (
              intent.mentionedSongs.map((song) => (
                <Chip key={song} label={`《${song}》`} size='sm' selected onClick={() => patch({ mentionedSongs: toggle(intent.mentionedSongs, song) })} />
              ))
            ) : (
              <p className='text-[12.5px] text-ink-400'>没有识别到具体歌曲，将使用已授权画像里的收藏与常听。</p>
            )}
          </Field>
          <Field label='常听歌手'>
            {intent.mentionedArtists.length ? (
              intent.mentionedArtists.map((artist) => (
                <Chip key={artist} label={artist} size='sm' selected onClick={() => patch({ mentionedArtists: toggle(intent.mentionedArtists, artist) })} />
              ))
            ) : (
              <p className='text-[12.5px] text-ink-400'>未指定，使用已授权画像。</p>
            )}
          </Field>
          <p className='text-[11.5px] leading-relaxed text-ink-400'>
            取消勾选就是告诉 Agent「这一项不对」，它不会再用这条去匹配。
          </p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'way'} onClose={() => setSheet(null)} title='同行方式' description='人数、性别与见面方式会作为硬条件先过滤一遍'>
        <div className='space-y-3'>
          <Field label='组队人数'>
            {GROUP_SIZE_OPTIONS.map((option) => (
              <Chip key={option.value} label={option.label} size='sm' selected={intent.groupSize === option.value} onClick={() => patch({ groupSize: option.value as GroupSize })} />
            ))}
          </Field>
          <Field label='见面方式'>
            <Chip label='需要线下见面' size='sm' selected={intent.meetInPerson} onClick={() => patch({ meetInPerson: !intent.meetInPerson })} />
            <Chip label='希望同行者性别相同' size='sm' selected={intent.sameGenderOnly} onClick={() => patch({ sameGenderOnly: !intent.sameGenderOnly })} />
            <Chip label='严格模式' size='sm' selected={intent.strict} onClick={() => patch({ strict: !intent.strict })} />
          </Field>
          {intent.sameGenderOnly ? (
            <Field label='我是'>
              {MY_GENDER_OPTIONS.map((option) => (
                <Chip key={option.value} label={option.label} size='sm' selected={intent.meGender === option.value} onClick={() => patch({ meGender: option.value as MyGender })} />
              ))}
            </Field>
          ) : null}
          <Field label='年龄段'>
            {AGE_BANDS.map((band) => (
              <Chip key={band || 'any'} label={band || '不限'} size='sm' selected={intent.ageBand === band} onClick={() => patch({ ageBand: band })} />
            ))}
          </Field>
        </div>
      </Sheet>

      <Sheet open={sheet === 'vibe'} onClose={() => setSheet(null)} title='现场氛围' description='交流节奏与同行目的，用来算「社交目的」和「交流偏好」'>
        <div className='space-y-3'>
          <Field label='交流方式'>
            {CHAT_STYLE_OPTIONS.map((option) => (
              <Chip key={option.value} label={option.value} size='sm' selected={intent.chatStyle === option.value} onClick={() => patch({ chatStyle: option.value as ChatStyle })} />
            ))}
          </Field>
          <Field label='同行目的'>
            {PURPOSE_OPTIONS.map((option) => (
              <Chip key={option.value} label={option.value} size='sm' selected={intent.purposes.includes(option.value as Purpose)} onClick={() => patch({ purposes: toggle(intent.purposes, option.value as Purpose) })} />
            ))}
          </Field>
        </div>
      </Sheet>

      <Sheet open={sheet === 'safety'} onClose={() => setSheet(null)} title='安全边界' description='这些条件下 Agent 会直接过滤掉不符合的候选人'>
        <div className='space-y-3'>
          <Field label='我的安全偏好'>
            {SAFETY_OPTIONS.map((option) => (
              <Chip key={option.value} label={option.value} size='sm' selected={intent.safety.includes(option.value as SafetyPref)} onClick={() => patch({ safety: toggle(intent.safety, option.value as SafetyPref) })} />
            ))}
          </Field>
          <p className='text-[11.5px] leading-relaxed text-ink-400'>安全条件由确定性程序先过滤，不交给大模型自由判断。</p>
        </div>
      </Sheet>

      <Sheet open={sheet === 'wrong'} onClose={() => setSheet(null)} title='哪一项不对？' description='点一下直接改；如果整句都不对，就重新描述需求'>
        <div className='space-y-2'>
          {cards.map((card) => (
            <button
              key={card.key}
              type='button'
              onClick={() => setSheet(card.key)}
              className='flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left'
            >
              {card.icon}
              <span className='min-w-0 flex-1'>
                <span className='block text-[13.5px] text-ink-100'>{card.title}</span>
                <span className='block truncate text-[12px] text-ink-400'>{card.value}</span>
              </span>
              <span className='text-[12px] text-brand-300'>修改</span>
            </button>
          ))}
          <button
            type='button'
            onClick={() => {
              setSheet(null)
              setIntent(null)
            }}
            className='flex w-full items-center gap-2 rounded-2xl border border-warm-400/30 bg-warm-400/[0.07] p-3 text-left text-[13px] text-warm-400'
          >
            <AlertIcon className='h-4 w-4' />
            整句都不对，重新描述需求
          </button>
        </div>
      </Sheet>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className='mb-2 text-[12px] text-ink-400'>{label}</p>
      <div className='flex flex-wrap gap-2'>{children}</div>
    </div>
  )
}
