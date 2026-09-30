import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { MockNotice, QQMusicBar } from '../components/QQMusicBar'
import { Button, Card, Chip, DemoBadge, SectionTitle, StateView } from '../components/ui'
import { SparkleIcon } from '../components/icons'
import { CHAT_STYLE_OPTIONS, GROUP_SIZE_OPTIONS, MY_GENDER_OPTIONS, PURPOSE_OPTIONS, SAFETY_OPTIONS } from '../data/options'
import { useSession } from '../store/session'
import type { ChatStyle, GroupSize, MyGender, ParsedIntent, Purpose, SafetyPref } from '../types'

const AGE_BANDS = ['', '18-22', '23-26', '27-30', '31+']

export function IntentConfirmPage() {
  const { concertId = 'night-flight' } = useParams()
  const navigate = useNavigate()
  const { parsedIntent, rawIntent, saveParsedIntent, runAgent } = useSession()
  const [intent, setIntent] = useState<ParsedIntent | null>(parsedIntent)
  const [starting, setStarting] = useState(false)

  const toggle = <T,>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  const patch = (changes: Partial<ParsedIntent>) => {
    if (!intent) return
    const next = { ...intent, ...changes }
    setIntent(next)
    saveParsedIntent(next)
  }

  const summary = useMemo(() => {
    if (!intent) return []
    return [
      { label: '同场活动', value: intent.eventId || concertId, tone: 'neutral' as const },
      ...intent.mentionedSongs.map((song) => ({ label: `想听《${song}》`, value: song, tone: 'brand' as const })),
      ...intent.purposes.map((purpose) => ({ label: purpose, value: purpose, tone: 'brand' as const })),
      { label: `交流风格：${intent.chatStyle}`, value: intent.chatStyle, tone: 'neutral' as const },
      { label: `组队人数：${intent.groupSize} 人`, value: 'size', tone: 'neutral' as const },
      { label: intent.sameGenderOnly ? '希望同行者性别相同' : '性别不限', value: 'gender', tone: 'neutral' as const },
      { label: intent.meetInPerson ? '接受线下见面' : '暂时只在线上', value: 'meetup', tone: 'warm' as const },
      ...(intent.ageBand ? [{ label: `年龄段：${intent.ageBand}${intent.strict ? '（严格）' : ''}`, value: 'age', tone: 'neutral' as const }] : []),
      ...intent.safety.map((item) => ({ label: item, value: item, tone: 'violet' as const })),
    ]
  }, [concertId, intent])

  const start = async () => {
    if (!intent) return
    setStarting(true)
    saveParsedIntent(intent)
    navigate(`/concert/${concertId}/agent`)
    void runAgent({ intent })
    setStarting(false)
  }

  if (!intent) {
    return (
      <div className='flex min-h-screen flex-col'>
        <QQMusicBar title='确认 Agent 的理解' onBack={() => navigate(`/concert/${concertId}/intent`)} />
        <main className='flex-1 px-4 pt-4'>
          <StateView
            status='empty'
            title='还没有可以确认的意图'
            description='先写一句你的需求，Agent 才能给出结构化理解。'
            actionLabel='去写需求'
            onAction={() => navigate(`/concert/${concertId}/intent`)}
          />
        </main>
      </div>
    )
  }

  return (
    <div className='flex min-h-screen flex-col'>
      <QQMusicBar title='确认 Agent 的理解' subtitle='一起去现场 · 下面每一项都可以改' onBack={() => navigate(`/concert/${concertId}/intent`)} right={<DemoBadge label='Agent 解析' />} />

      <main className='flex-1 px-4 pb-40 pt-4'>
        <div className='flex flex-col gap-5'>
          <Card className='border-brand-500/30 bg-brand-500/[0.06]'>
            <p className='text-[11px] text-white/45'>你的原话</p>
            <p className='mt-1.5 text-[13px] leading-relaxed text-white/85'>“{rawIntent}”</p>
            <p className='mt-2 text-[11px] text-white/40'>{intent.note}</p>
          </Card>

          <div>
            <SectionTitle title='Agent 从你的话里读出的信息' hint='觉得哪一项不对，直接点掉或者换一个' />
            <div className='flex flex-wrap gap-2'>
              {summary.map((item, index) => (
                <span
                  key={`${item.value}-${index}`}
                  className={
                    'rounded-pill border px-3 py-1.5 text-[12px] ' +
                    (item.tone === 'brand'
                      ? 'border-brand-500/40 bg-brand-500/12 text-brand-100'
                      : item.tone === 'violet'
                        ? 'border-violet-400/40 bg-violet-400/12 text-violet-400'
                        : item.tone === 'warm'
                          ? 'border-warm-400/40 bg-warm-400/12 text-warm-400'
                          : 'border-white/12 bg-white/[0.04] text-white/70')
                  }
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title='同行目的' hint='Agent 会用它计算"社交目的"维度' />
            <div className='flex flex-wrap gap-2'>
              {PURPOSE_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.value}
                  size='sm'
                  selected={intent.purposes.includes(option.value as Purpose)}
                  onClick={() => patch({ purposes: toggle(intent.purposes, option.value as Purpose) })}
                />
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title='交流风格' hint='Agent 会用它计算"交流与安全偏好"维度' />
            <div className='flex flex-wrap gap-2'>
              {CHAT_STYLE_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.value}
                  size='sm'
                  selected={intent.chatStyle === option.value}
                  onClick={() => patch({ chatStyle: option.value as ChatStyle })}
                />
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title='组队人数' />
            <div className='flex flex-wrap gap-2'>
              {GROUP_SIZE_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.label}
                  size='sm'
                  selected={intent.groupSize === option.value}
                  onClick={() => patch({ groupSize: option.value as GroupSize })}
                />
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title='性别与见面方式' hint='性别相同与线下见面会作为硬条件先过滤一遍' />
            <div className='flex flex-wrap gap-2'>
              <Chip
                label='希望同行者性别相同'
                size='sm'
                selected={intent.sameGenderOnly}
                onClick={() => patch({ sameGenderOnly: !intent.sameGenderOnly })}
              />
              <Chip
                label='需要线下见面'
                size='sm'
                selected={intent.meetInPerson}
                onClick={() => patch({ meetInPerson: !intent.meetInPerson })}
              />
              <Chip
                label='严格模式（年龄与人数必须一致）'
                size='sm'
                selected={intent.strict}
                onClick={() => patch({ strict: !intent.strict })}
              />
            </div>
            {intent.sameGenderOnly ? (
              <div className='mt-2.5 flex flex-wrap gap-2'>
                {MY_GENDER_OPTIONS.map((option) => (
                  <Chip
                    key={option.value}
                    label={`我是${option.label}`}
                    size='sm'
                    selected={intent.meGender === option.value}
                    onClick={() => patch({ meGender: option.value as MyGender })}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <SectionTitle title='年龄段' hint='默认按和你自己相近的年龄段匹配' />
            <div className='flex flex-wrap gap-2'>
              {AGE_BANDS.map((band) => (
                <Chip
                  key={band || 'any'}
                  label={band || '不限'}
                  size='sm'
                  selected={intent.ageBand === band}
                  onClick={() => patch({ ageBand: band })}
                />
              ))}
            </div>
          </div>

          <div>
            <SectionTitle title='安全偏好' hint='其中「性别相同」会作为硬条件直接过滤候选人' />
            <div className='flex flex-wrap gap-2'>
              {SAFETY_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.value}
                  size='sm'
                  selected={intent.safety.includes(option.value as SafetyPref)}
                  onClick={() => patch({ safety: toggle(intent.safety, option.value as SafetyPref) })}
                />
              ))}
            </div>
          </div>

          <MockNotice compact />

          <div className='flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.02] px-3.5 py-3'>
            <span className='text-[12px] text-white/50'>想手动微调音乐标签？</span>
            <Button variant='ghost' size='sm' onClick={() => navigate(`/concert/${concertId}/tags`)}>
              打开标签编辑
            </Button>
          </div>
        </div>
      </main>

      <footer className='safe-bottom sticky bottom-0 z-30 border-t border-white/8 bg-stage-950/92 px-4 pt-3 backdrop-blur-xl'>
        <Button size='lg' full icon={<SparkleIcon className='h-4 w-4' />} disabled={starting} onClick={() => void start()}>
          确认无误，让 Agent 开始匹配
        </Button>
        <p className='pb-1 pt-2 text-center text-[11px] text-white/40'>
          下一步可以看到 Agent 依次调用了哪些工具
        </p>
      </footer>
    </div>
  )
}
