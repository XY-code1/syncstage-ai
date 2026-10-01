import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '../components/PageShell'
import { PlusIcon, SparkleIcon } from '../components/icons'
import { Button, Card, Chip, Labeled, SectionTitle, Skeleton, StateView, TagPill } from '../components/ui'
import {
  ARTIST_LIBRARY,
  CHAT_STYLE_OPTIONS,
  GROUP_SIZE_OPTIONS,
  MY_GENDER_OPTIONS,
  PURPOSE_OPTIONS,
  SAFETY_OPTIONS,
  songLibrary,
} from '../data/options'
import { fetchConcert } from '../lib/api'
import { messageOf, useSession } from '../store/session'
import type { ChatStyle, Concert, GroupSize, MyGender, Preferences, Purpose, SafetyPref } from '../types'

const DEFAULT_PREFS: Preferences = {
  likedSongs: [],
  likedArtists: [],
  expectedTracks: [],
  story: '',
  purposes: [],
  chatStyle: '温和慢热',
  groupSize: 3,
  safety: ['只在公开场合见面'],
  myGender: 'prefer-not-to-say',
}

function toggle<T>(list: T[], value: T, max?: number): T[] {
  if (list.includes(value)) return list.filter((item) => item !== value)
  if (max && list.length >= max) return list
  return [...list, value]
}

export function PreferencesPage() {
  const { concertId = '' } = useParams()
  const navigate = useNavigate()
  const { prefs: storedPrefs, savePrefs, pushToast } = useSession()
  const [concert, setConcert] = useState<Concert | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')
  const [form, setForm] = useState<Preferences>(() => storedPrefs ?? DEFAULT_PREFS)
  const [customSong, setCustomSong] = useState('')
  const [touched, setTouched] = useState(false)

  const load = useCallback(async () => {
    setStatus('loading')
    try {
      const data = await fetchConcert(concertId)
      setConcert(data)
      setStatus('ready')
    } catch (err) {
      setError(messageOf(err))
      setStatus('error')
    }
  }, [concertId])

  useEffect(() => {
    void load()
  }, [load])

  const songOptions = useMemo(() => (concert ? songLibrary(concert) : []), [concert])

  const missing = useMemo(() => {
    const list: string[] = []
    if (form.likedSongs.length === 0) list.push('至少选一首喜欢的歌')
    if (form.expectedTracks.length === 0) list.push('至少选一首期待曲目')
    if (form.story.trim().length < 12) list.push('听歌故事再多写一点（12 字以上）')
    if (form.purposes.length === 0) list.push('至少选一个同行目的')
    if (form.safety.length === 0) list.push('至少选择一条安全偏好')
    return list
  }, [form])

  const progress = Math.round(((5 - missing.length) / 5) * 100)

  const submit = () => {
    setTouched(true)
    if (missing.length > 0) {
      pushToast(missing[0], 'warn')
      return
    }
    savePrefs({ ...form, story: form.story.trim() })
    navigate(`/concert/${concertId}/task`)
  }

  const addCustomSong = () => {
    const value = customSong.trim()
    if (!value) return
    setForm((prev) => ({
      ...prev,
      likedSongs: prev.likedSongs.includes(value) ? prev.likedSongs : [...prev.likedSongs, value],
    }))
    setCustomSong('')
  }

  return (
    <PageShell
      title='填写同频偏好'
      subtitle={concert ? `${concert.title} · ${concert.dateLabel}` : '正在读取演出信息'}
      step={0}
      onBack={() => navigate(`/concert/${concertId}`)}
      footer={
        status === 'ready' ? (
          <div className='flex flex-col gap-2'>
            <div className='flex items-center justify-between text-[11px] text-white/45'>
              <span>已填写 {progress}%</span>
              <span>{missing.length === 0 ? '信息齐了，可以生成标签' : `还差 ${missing.length} 项`}</span>
            </div>
            <Button size='lg' full icon={<SparkleIcon className='h-4 w-4' />} onClick={submit}>
              保存偏好，回到需求描述
            </Button>
          </div>
        ) : null
      }
    >
      {status === 'loading' ? (
        <div className='flex flex-col gap-5'>
          <Skeleton className='h-24 w-full' />
          <Skeleton className='h-40 w-full' />
          <Skeleton className='h-32 w-full' />
        </div>
      ) : null}

      {status === 'error' ? (
        <StateView
          status='error'
          title='没能读取这场演出'
          description={error}
          actionLabel='重新加载'
          onAction={() => void load()}
        />
      ) : null}

      {status === 'ready' && concert ? (
        <div className='flex flex-col gap-6'>
          <Card className='border-brand-500/25 bg-brand-500/[0.06]'>
            <p className='text-[12px] leading-relaxed text-white/65'>
              这里填写的内容只会用于这场演出的同频匹配，不会显示给全场观众，也不会用于任何广告投放。
            </p>
          </Card>

          <section>
            <SectionTitle
              title='喜欢歌曲'
              hint={`最多选 5 首，已选 ${form.likedSongs.length} 首`}
              required
            />
            <div className='flex flex-wrap gap-2'>
              {songOptions.map((song) => (
                <Chip
                  key={song}
                  label={`《${song}》`}
                  selected={form.likedSongs.includes(song)}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, likedSongs: toggle(prev.likedSongs, song, 5) }))
                  }
                />
              ))}
            </div>

            {form.likedSongs.some((song) => !songOptions.includes(song)) ? (
              <div className='mt-3 flex flex-wrap gap-2'>
                {form.likedSongs
                  .filter((song) => !songOptions.includes(song))
                  .map((song) => (
                    <TagPill
                      key={song}
                      label={`《${song}》 · 自己写的`}
                      onRemove={() =>
                        setForm((prev) => ({
                          ...prev,
                          likedSongs: prev.likedSongs.filter((item) => item !== song),
                        }))
                      }
                    />
                  ))}
              </div>
            ) : null}

            <div className='mt-3 flex items-center gap-2'>
              <input
                value={customSong}
                onChange={(event) => setCustomSong(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addCustomSong()
                }}
                placeholder='歌单里还有别的歌？写在这里'
                className='h-10 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-[13px] text-white placeholder:text-white/30 focus:border-brand-500/50 focus:outline-none'
              />
              <Button variant='secondary' size='md' icon={<PlusIcon className='h-4 w-4' />} onClick={addCustomSong}>
                添加
              </Button>
            </div>
          </section>

          <section>
            <SectionTitle title='常听音乐人' hint='可多选，用于补充音乐口味' />
            <div className='flex flex-wrap gap-2'>
              {ARTIST_LIBRARY.map((artist) => (
                <Chip
                  key={artist}
                  label={artist}
                  selected={form.likedArtists.includes(artist)}
                  onClick={() =>
                    setForm((prev) => ({ ...prev, likedArtists: toggle(prev.likedArtists, artist, 4) }))
                  }
                />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle
              title='期待曲目'
              hint={`这场演出你最想听到的歌，已选 ${form.expectedTracks.length} 首`}
              required
            />
            <div className='flex flex-wrap gap-2'>
              {concert.setlist.map((track) => (
                <Chip
                  key={track}
                  label={`《${track}》`}
                  selected={form.expectedTracks.includes(track)}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      expectedTracks: toggle(prev.expectedTracks, track, 4),
                    }))
                  }
                />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle
              title='听歌故事'
              hint='写下你和这些歌的一次真实经历，匹配理由会用到它'
              required
            />
            <textarea
              value={form.story}
              onChange={(event) => setForm((prev) => ({ ...prev, story: event.target.value.slice(0, 160) }))}
              rows={4}
              placeholder='例如：考研那年在图书馆闭馆后一直听《雨中电台》，这次想听听现场版。'
              className='w-full resize-none rounded-2xl border border-white/10 bg-white/[0.03] px-3.5 py-3 text-[13px] leading-relaxed text-white placeholder:text-white/30 focus:border-brand-500/50 focus:outline-none'
            />
            <div className='mt-1.5 flex items-center justify-between text-[11px] text-white/35'>
              <span>不需要写真名、学校或联系方式</span>
              <span>{form.story.length}/160</span>
            </div>
          </section>

          <section>
            <SectionTitle title='同行目的' hint='这场演出里，你希望有人陪你做什么' required />
            <div className='flex flex-col gap-2'>
              {PURPOSE_OPTIONS.map((option) => {
                const selected = form.purposes.includes(option.value)
                return (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        purposes: toggle<Purpose>(prev.purposes, option.value),
                      }))
                    }
                    className={
                      'flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition ' +
                      (selected
                        ? 'border-brand-500/50 bg-brand-500/12'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20')
                    }
                  >
                    <span>
                      <span className={'block text-[13px] ' + (selected ? 'text-brand-100' : 'text-white/85')}>
                        {option.value}
                      </span>
                      <span className='mt-0.5 block text-[11px] text-white/45'>{option.hint}</span>
                    </span>
                    <span
                      className={
                        'h-4 w-4 shrink-0 rounded-full border ' +
                        (selected ? 'border-brand-400 bg-brand-500' : 'border-white/25')
                      }
                    />
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <SectionTitle title='交流风格' hint='决定破冰的节奏，也会影响匹配顺序' required />
            <div className='grid grid-cols-1 gap-2'>
              {CHAT_STYLE_OPTIONS.map((option) => {
                const selected = form.chatStyle === option.value
                return (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => setForm((prev) => ({ ...prev, chatStyle: option.value as ChatStyle }))}
                    className={
                      'rounded-2xl border px-3.5 py-3 text-left transition ' +
                      (selected
                        ? 'border-brand-500/50 bg-brand-500/12'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20')
                    }
                  >
                    <span className={'block text-[13px] ' + (selected ? 'text-brand-100' : 'text-white/85')}>
                      {option.value}
                    </span>
                    <span className='mt-0.5 block text-[11px] text-white/45'>{option.hint}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <SectionTitle title='组队人数' hint='2～4 人的临时小组，散场自动解散' required />
            <div className='grid grid-cols-3 gap-2'>
              {GROUP_SIZE_OPTIONS.map((option) => {
                const selected = form.groupSize === option.value
                return (
                  <button
                    key={option.value}
                    type='button'
                    onClick={() => setForm((prev) => ({ ...prev, groupSize: option.value as GroupSize }))}
                    className={
                      'rounded-2xl border px-3 py-3 text-center transition ' +
                      (selected
                        ? 'border-brand-500/50 bg-brand-500/12'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20')
                    }
                  >
                    <span className={'block text-[13px] ' + (selected ? 'text-brand-100' : 'text-white/85')}>
                      {option.label}
                    </span>
                    <span className='mt-1 block text-[10px] leading-snug text-white/45'>{option.hint}</span>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <SectionTitle title='安全偏好' hint='这一组会作为硬性条件优先过滤匹配结果' required />
            <div className='flex flex-wrap gap-2'>
              {SAFETY_OPTIONS.map((option) => (
                <Chip
                  key={option.value}
                  label={option.value}
                  selected={form.safety.includes(option.value)}
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      safety: toggle<SafetyPref>(prev.safety, option.value),
                    }))
                  }
                />
              ))}
            </div>

            {form.safety.includes('希望同行者性别相同') ? (
              <div className='mt-4'>
                <Labeled label='我的性别' hint='仅用于同性同行偏好，不会展示给其他用户'>
                  <div className='flex gap-2'>
                    {MY_GENDER_OPTIONS.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        selected={form.myGender === option.value}
                        onClick={() => setForm((prev) => ({ ...prev, myGender: option.value as MyGender }))}
                      />
                    ))}
                  </div>
                </Labeled>
              </div>
            ) : null}
          </section>

          {touched && missing.length > 0 ? (
            <Card className='border-rose-400/35 bg-rose-400/[0.07]'>
              <p className='text-[12px] text-rose-100'>还差一点信息：</p>
              <ul className='mt-2 flex flex-col gap-1'>
                {missing.map((item) => (
                  <li key={item} className='text-[12px] text-white/65'>
                    · {item}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  )
}
