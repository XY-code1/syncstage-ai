import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { CheckIcon, EditIcon, PlusIcon, SparkleIcon } from '../components/icons'
import { Button, Card, SectionTitle, StateView, TagPill } from '../components/ui'
import { extractStoryKeywords } from '../lib/matching'
import { addTag, buildAiTags, reflectTagsToPreferences, removeTag } from '../lib/tags'
import { useSession } from '../store/session'
import type { AiTags, Preferences } from '../types'

const WEIGHTS = [
  { label: '共同喜欢歌曲', value: '权重最高', detail: '每一首共同歌曲都会明显提高匹配度' },
  { label: '共同期待曲目', value: '权重高', detail: '决定你们会不会在同一首歌里同时抬头' },
  { label: '共同同行目的', value: '权重高', detail: '想一起合唱，还是只想安静听完，差别很大' },
  { label: '交流风格与组队人数', value: '权重中', detail: '决定破冰节奏和房间里有几个人' },
  { label: '安全偏好', value: '硬性条件', detail: '不符合的候选人不会出现在匹配结果里' },
]

export function TagConfirmPage() {
  const { concertId = '' } = useParams()
  const navigate = useNavigate()
  const { prefs, parsedIntent, savePrefs, pushToast } = useSession()
  // 没有填过表单时，用 Agent 解析出来的结构化意图兜底
  const basePrefs: Preferences = prefs ?? {
    likedSongs: parsedIntent?.mentionedSongs ?? [],
    likedArtists: parsedIntent?.mentionedArtists ?? [],
    expectedTracks: parsedIntent?.mentionedSongs ?? [],
    story: '',
    purposes: parsedIntent?.purposes ?? [],
    chatStyle: parsedIntent?.chatStyle ?? '温和慢热',
    groupSize: parsedIntent?.groupSize ?? 3,
    safety: parsedIntent?.safety ?? [],
    myGender: parsedIntent?.meGender ?? 'prefer-not-to-say',
  }
  const [draft, setDraft] = useState<AiTags | null>(() => buildAiTags(basePrefs))
  const [storyDraft, setStoryDraft] = useState(basePrefs.story ?? '')
  const [editingGroup, setEditingGroup] = useState<string | null>(null)
  const [newTag, setNewTag] = useState('')

  if (!prefs && !parsedIntent) {
    return (
      <PageShell title='音乐标签微调' step={0} onBack={() => navigate(`/concert/${concertId}/task`)}>
        <StateView
          status='empty'
          title='还没有你的偏好信息'
          description='先告诉系统你喜欢什么歌、想找什么样的同行者，这里才会出现可以确认的标签。'
          actionLabel='去填写偏好'
          onAction={() => navigate(`/concert/${concertId}/preferences`)}
        />
      </PageShell>
    )
  }

  const current = draft ?? buildAiTags(basePrefs)

  const commitStory = (value: string) => {
    setStoryDraft(value)
    setDraft((prev) => {
      const base = prev ?? buildAiTags(basePrefs)
      const keywords = extractStoryKeywords(value)
      return {
        ...base,
        storyKeywords: keywords,
        groups: base.groups.map((group) => (group.id === 'story' ? { ...group, tags: keywords } : group)),
      }
    })
  }

  const confirm = () => {
    const keywords = extractStoryKeywords(storyDraft)
    const nextPrefs = {
      ...reflectTagsToPreferences(basePrefs, current),
      story: storyDraft.trim() || basePrefs.story,
    }
    savePrefs(nextPrefs)
    void keywords
    pushToast('标签已保存，Agent 会把这些标签当作补充偏好', 'success')
    navigate(`/concert/${concertId}/task/confirm`)
  }

  return (
    <PageShell
      title='音乐标签微调'
      subtitle='这些是从你的填写内容里整理出来的标签'
      step={0}
      onBack={() => navigate(`/concert/${concertId}/task/confirm`)}
      footer={
        <div className='flex flex-col gap-2'>
          <Button size='lg' full icon={<CheckIcon className='h-4 w-4' />} onClick={confirm}>
            保存这些标签
          </Button>
          <Button variant='ghost' size='sm' full onClick={() => navigate(`/concert/${concertId}/task/confirm`)}>
            返回确认页
          </Button>
        </div>
      }
    >
      <div className='flex flex-col gap-6'>
        <Card className='border-brand-500/25 bg-brand-500/[0.06]' glow>
          <div className='flex items-start gap-3'>
            <span className='mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500/18 text-brand-300'>
              <SparkleIcon className='h-4 w-4' />
            </span>
            <div>
              <p className='text-[13px] text-brand-100'>标签整理完成</p>
              <p className='mt-1 text-[12px] leading-relaxed text-white/60'>{current.summary}</p>
            </div>
          </div>
        </Card>

        {current.groups.map((group) => (
          <section key={group.id}>
            <SectionTitle title={group.title} hint={group.hint} />
            <div className='flex flex-wrap gap-2'>
              {group.tags.length === 0 ? (
                <span className='text-[12px] text-white/35'>这一组暂时是空的，可以手动补一个</span>
              ) : null}
              {group.tags.map((tag) => (
                <TagPill
                  key={tag}
                  label={tag}
                  tone={group.id === 'safety' ? 'violet' : group.id === 'story' ? 'warm' : 'brand'}
                  onRemove={() => setDraft((prev) => removeTag(prev ?? buildAiTags(basePrefs), group.id, tag))}
                />
              ))}
            </div>

            {editingGroup === group.id ? (
              <div className='mt-3 flex items-center gap-2'>
                <input
                  autoFocus
                  value={newTag}
                  onChange={(event) => setNewTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && newTag.trim()) {
                      setDraft((prev) => addTag(prev ?? buildAiTags(basePrefs), group.id, newTag))
                      setNewTag('')
                      setEditingGroup(null)
                    }
                  }}
                  placeholder={group.id === 'music' ? '例如：《夏天的最后一场雨》或 #乐队名' : '输入一个新标签'}
                  className='h-10 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/30 focus:border-brand-500/50 focus:outline-none'
                />
                <Button
                  size='sm'
                  onClick={() => {
                    if (!newTag.trim()) return
                    setDraft((prev) => addTag(prev ?? buildAiTags(basePrefs), group.id, newTag))
                    setNewTag('')
                    setEditingGroup(null)
                  }}
                >
                  加入
                </Button>
                <Button variant='ghost' size='sm' onClick={() => setEditingGroup(null)}>
                  取消
                </Button>
              </div>
            ) : (
              <button
                type='button'
                onClick={() => {
                  setEditingGroup(group.id)
                  setNewTag('')
                }}
                className='mt-3 inline-flex items-center gap-1 rounded-pill border border-dashed border-white/18 px-3 py-1.5 text-[12px] text-white/50 transition hover:border-brand-500/50 hover:text-brand-200'
              >
                <PlusIcon className='h-3.5 w-3.5' />
                添加标签
              </button>
            )}
          </section>
        ))}

        <section>
          <SectionTitle
            title='听歌故事'
            hint='标签里最有人味的一段，可以在这里再改一次'
            icon={<EditIcon className='h-4 w-4 text-brand-400' />}
          />
          <textarea
            value={storyDraft}
            onChange={(event) => commitStory(event.target.value.slice(0, 160))}
            rows={4}
            className='w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-white placeholder:text-white/30 focus:border-brand-500/50 focus:outline-none'
          />
          <div className='mt-2 flex flex-wrap gap-1.5'>
            {current.storyKeywords.length === 0 ? (
              <span className='text-[11px] text-white/35'>还没有识别到场景关键词</span>
            ) : (
              current.storyKeywords.map((keyword) => (
                <span
                  key={keyword}
                  className='rounded-pill border border-warm-400/30 bg-warm-400/10 px-2.5 py-1 text-[11px] text-warm-400'
                >
                  #{keyword}
                </span>
              ))
            )}
          </div>
        </section>

        <section>
          <SectionTitle title='这些标签会怎么用' hint='匹配结果里的每一条理由，都来自上面对应的标签' />
          <Card className='p-0'>
            {WEIGHTS.map((item) => (
              <div key={item.label} className='border-b border-white/6 px-4 py-3 last:border-b-0'>
                <div className='flex items-center justify-between gap-3'>
                  <span className='text-[13px] text-white/85'>{item.label}</span>
                  <span className='rounded-pill border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 text-[10px] text-brand-200'>
                    {item.value}
                  </span>
                </div>
                <p className='mt-1 text-[11px] leading-relaxed text-white/45'>{item.detail}</p>
              </div>
            ))}
          </Card>
        </section>

        <Card className='border-white/10'>
          <p className='text-[11px] leading-relaxed text-white/45'>
            标签只会用于这次演出的同频匹配。你可以随时回到上一页重新填写，或者直接在匹配结果页放宽条件。
          </p>
        </Card>
      </div>
    </PageShell>
  )
}
