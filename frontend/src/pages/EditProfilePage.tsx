import { useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserAvatar } from '../components/UserAvatar'
import {
  ArrowLeftIcon,
  CakeIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  GlobeIcon,
  LockIcon,
  MapPinIcon,
  PersonIcon,
  PhoneIcon,
  EditIcon,
} from '../components/icons'
import { Button, Sheet } from '../components/ui'
import { AVATAR_ACCEPT, toAvatarDataUrl } from '../lib/avatar'
import { cn } from '../lib/cn'
import {
  CONTACT_TYPES,
  GENDER_LABEL,
  VISIBILITY_HINT,
  VISIBILITY_LABEL,
  ageFromBirthday,
  useProfile,
} from '../store/profile'
import type { Gender, UserProfile, Visibility } from '../store/profile'
import { useSession } from '../store/session'

const GENDERS: Gender[] = ['female', 'male', 'undisclosed', 'custom']
const VISIBILITIES: Visibility[] = ['public', 'matches', 'private']

export function EditProfilePage() {
  const navigate = useNavigate()
  const { profile, update } = useProfile()
  const { pushToast } = useSession()
  const [draft, setDraft] = useState<UserProfile>(profile)
  const [visibilityField, setVisibilityField] = useState<keyof UserProfile['visibility'] | null>(null)
  const [avatarError, setAvatarError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)
  const age = ageFromBirthday(draft.birthday)

  const patch = (next: Partial<UserProfile>) => setDraft((prev) => ({ ...prev, ...next }))

  const pickAvatar = async (file: File | undefined) => {
    if (!file) return
    setAvatarError('')
    try {
      // 校验 jpg/png/webp + 原图大小 -> 居中裁剪 -> 256×256 -> 压缩到 500KB 以内
      // 失败时不写入 draft，旧头像保持不变
      patch({ avatar: await toAvatarDataUrl(file) })
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : '头像处理失败')
    }
  }

  const save = () => {
    update({ ...draft, updatedAt: Date.now() })
    pushToast('资料已保存，我的与聊天头像已同步', 'success')
    navigate('/me')
  }

  return (
    <div data-page='edit-profile' className='flex min-h-[100dvh] flex-col bg-stage-950'>
      <header className='safe-top sticky top-0 z-30 border-b border-white/6 bg-stage-950/94 px-3 pb-2.5 pt-2 backdrop-blur-xl'>
        <div className='flex items-center gap-2.5'>
          <button
            type='button'
            onClick={() => navigate('/me')}
            aria-label='返回我的'
            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/70'
          >
            <ArrowLeftIcon className='h-4 w-4' />
          </button>
          <div className='min-w-0 flex-1'>
            <p className='font-serif text-[19px] font-semibold tracking-[.12em] text-white'>我的现场通行证</p>
            <p className='text-[11.5px] tracking-[.12em] text-white/55'>音乐让我们相遇</p>
          </div>
        </div>
      </header>

      <main className='flex-1 pb-32'>
        <section className='mt-3 px-4'>
          <div className='flex items-center gap-3.5'>
            <UserAvatar size={64} showRing preview={{ nickname: draft.nickname, avatar: draft.avatar || `${import.meta.env.BASE_URL}portraits/demo-orange.webp` }} />
            <div className='min-w-0 flex-1'>
              <button
                type='button'
                onClick={() => fileRef.current?.click()}
                className='inline-flex items-center gap-1.5 rounded-pill border border-brand-500/40 bg-brand-500/10 px-3 py-1.5 text-[12px] text-brand-200'
              >
                <CameraIcon className='h-3.5 w-3.5' />
                更换头像
              </button>
              {draft.avatar ? (
                <button type='button' onClick={() => patch({ avatar: null })} className='ml-2 text-[11px] text-white/40'>
                  移除
                </button>
              ) : null}
              <p className='mt-1 text-[11.5px] text-ink-400'>
                支持 jpg / png / webp，原图不超过 8MB
                <br />
                会居中裁剪并压到 256×256（小于 500KB）
              </p>
            </div>
            <input
              ref={fileRef}
              type='file'
              accept={AVATAR_ACCEPT}
              className='hidden'
              onChange={(event) => {
                void pickAvatar(event.target.files?.[0])
                event.target.value = ''
              }}
            />
          </div>
          {avatarError ? <p className='mt-1.5 text-[11px] text-rose-300'>{avatarError}</p> : null}
        </section>

        <Row label='昵称' hint='聊天与我的页面显示的名字'>
          <input
            value={draft.nickname}
            maxLength={16}
            onChange={(event) => patch({ nickname: event.target.value })}
            placeholder='给自己起个名字'
            className='w-full bg-transparent text-right text-[14px] text-ink-100 outline-none placeholder:text-white/25'
          />
        </Row>

        <Row label='SyncStage ID' hint='唯一标识，不可修改'>
          <span className='text-[14px] text-ink-100/45'>{draft.syncStageId}</span>
        </Row>

        <Row label='生日' hint={age === null ? '填写后自动计算年龄' : `自动计算：${age} 岁`} Icon={CakeIcon}>
          <div className='flex items-center justify-end gap-2'>
            <input
              type='date'
              value={draft.birthday}
              onChange={(event) => patch({ birthday: event.target.value })}
              className='bg-transparent text-right text-[14px] text-ink-100 outline-none [color-scheme:dark]'
            />
            <VisibilityButton field='birthday' draft={draft} onOpen={setVisibilityField} />
          </div>
        </Row>

        <div className='px-4 pt-4'>
          <div className='flex items-center gap-2'>
            <PersonIcon className='h-3.5 w-3.5 text-white/40' />
            <p className='text-[13px] text-ink-400'>性别</p>
            <span className='ml-auto'>
              <VisibilityButton field='gender' draft={draft} onOpen={setVisibilityField} />
            </span>
          </div>
          <div className='mt-2 flex gap-2'>
            {GENDERS.map((value) => (
              <button
                key={value}
                type='button'
                onClick={() => patch({ gender: value })}
                className={cn(
                  'flex-1 rounded-xl border py-2 text-[12px] transition',
                  draft.gender === value
                    ? 'border-brand-500/50 bg-brand-500/12 text-brand-100'
                    : 'border-white/10 bg-white/[0.03] text-white/60',
                )}
              >
                {GENDER_LABEL[value]}
              </button>
            ))}
          </div>
          {draft.gender === 'custom' ? (
            <input
              value={draft.genderCustom}
              maxLength={10}
              onChange={(event) => patch({ genderCustom: event.target.value })}
              placeholder='自定义性别'
              className='mt-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] text-ink-100 outline-none placeholder:text-white/25'
            />
          ) : null}
        </div>

        <Row label='所在城市' hint='用于推荐同城演出' Icon={MapPinIcon}>
          <div className='flex items-center justify-end gap-2'>
            <input
              value={draft.city}
              maxLength={12}
              onChange={(event) => patch({ city: event.target.value })}
              placeholder='填写城市'
              className='w-24 bg-transparent text-right text-[14px] text-ink-100 outline-none placeholder:text-white/25'
            />
            <VisibilityButton field='city' draft={draft} onOpen={setVisibilityField} />
          </div>
        </Row>

        <Row label='个性签名' hint='Agent 会用这句话理解你的观演风格' Icon={EditIcon}>
          <input
            value={draft.signature}
            maxLength={40}
            onChange={(event) => patch({ signature: event.target.value })}
            placeholder='一句话介绍自己'
            className='w-full bg-transparent text-right text-[14px] text-ink-100 outline-none placeholder:text-white/25'
          />
        </Row>

        <div className='px-4 pt-4'>
          <div className='flex items-center gap-2'>
            <PhoneIcon className='h-3.5 w-3.5 text-white/40' />
            <p className='text-[13px] text-ink-400'>社交联系方式</p>
            <span className='ml-auto'>
              <VisibilityButton field='contact' draft={draft} onOpen={setVisibilityField} />
            </span>
          </div>
          <div className='mt-2 flex gap-2'>
            <select
              value={draft.contactType}
              onChange={(event) => patch({ contactType: event.target.value })}
              className='w-24 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-2 text-[14px] text-ink-100 outline-none'
            >
              {CONTACT_TYPES.map((type) => (
                <option key={type} value={type} className='bg-stage-900'>
                  {type}
                </option>
              ))}
            </select>
            <input
              value={draft.contactValue}
              maxLength={40}
              onChange={(event) => patch({ contactValue: event.target.value })}
              placeholder='填写账号'
              className='min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[14px] text-ink-100 outline-none placeholder:text-white/25'
            />
          </div>
          <p className='mt-1.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-white/35'>
            <LockIcon className='mt-0.5 h-3 w-3 shrink-0' />
            默认不向陌生匹配对象公开，只有你主动选择才会展示。Agent 不会在推荐理由里写联系方式。
          </p>
        </div>

        <p className='px-4 pt-4 text-[10.5px] leading-relaxed text-white/30'>
          可见性说明：{VISIBILITIES.map((value) => `${VISIBILITY_LABEL[value]}（${VISIBILITY_HINT[value]}）`).join('；')}。
        </p>
      </main>

      <footer className='safe-bottom fixed bottom-0 left-1/2 z-30 w-full max-w-[390px] -translate-x-1/2 border-t border-white/8 bg-stage-950/96 px-4 pt-3 backdrop-blur-xl'>
        <Button size='lg' full disabled={!dirty || !draft.nickname.trim()} onClick={save}>
          保存资料
        </Button>
        <button type='button' onClick={() => navigate('/me')} className='w-full py-2 text-center text-[11.5px] text-white/45'>
          取消并返回
        </button>
      </footer>

      <Sheet
        open={visibilityField !== null}
        onClose={() => setVisibilityField(null)}
        title='谁可以看到'
        description={visibilityField ? `设置「${visibilityField === 'contact' ? '社交联系方式' : visibilityField === 'birthday' ? '生日' : visibilityField === 'gender' ? '性别' : '所在城市'}」的可见范围` : ''}
      >
        <div className='space-y-2'>
          {VISIBILITIES.map((value) => {
            const active = visibilityField ? draft.visibility[visibilityField] === value : false
            return (
              <button
                key={value}
                type='button'
                onClick={() => {
                  if (visibilityField) patch({ visibility: { ...draft.visibility, [visibilityField]: value } })
                  setVisibilityField(null)
                }}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left',
                  active ? 'border-brand-500/50 bg-brand-500/10' : 'border-white/10',
                )}
              >
                <span className={cn('mt-1 h-3.5 w-3.5 shrink-0 rounded-full border', active ? 'border-brand-400 bg-brand-500' : 'border-white/25')} />
                <span className='min-w-0 flex-1'>
                  <span className='flex items-center gap-1.5 text-[14px] text-ink-100'>
                    {value === 'private' ? <LockIcon className='h-3.5 w-3.5 text-white/50' /> : <GlobeIcon className='h-3.5 w-3.5 text-brand-300' />}
                    {VISIBILITY_LABEL[value]}
                  </span>
                  <span className='mt-0.5 block text-[11px] text-white/45'>{VISIBILITY_HINT[value]}</span>
                </span>
                {active ? <CheckIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' /> : null}
              </button>
            )
          })}
        </div>
      </Sheet>
    </div>
  )
}

function Row({
  label,
  hint,
  Icon,
  children,
}: {
  label: string
  hint?: string
  Icon?: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <section className='mt-3 border-y border-white/6 bg-white/[0.02] px-4 py-2.5'>
      <div className='flex items-center gap-2'>
        {Icon ? <Icon className='h-3.5 w-3.5 text-white/40' /> : null}
        <p className='text-[13px] text-ink-400'>{label}</p>
        {hint ? <p className='ml-auto truncate text-[10.5px] text-white/30'>{hint}</p> : null}
      </div>
      <div className='mt-1.5 flex items-center'>{children}</div>
    </section>
  )
}

function VisibilityButton({
  field,
  draft,
  onOpen,
}: {
  field: keyof UserProfile['visibility']
  draft: UserProfile
  onOpen: (field: keyof UserProfile['visibility']) => void
}) {
  const value = draft.visibility[field]
  return (
    <button
      type='button'
      onClick={() => onOpen(field)}
      className='inline-flex shrink-0 items-center gap-0.5 rounded-pill border border-white/10 px-2 py-[3px] text-[10.5px] text-white/55'
    >
      {value === 'private' ? <LockIcon className='h-3 w-3' /> : <GlobeIcon className='h-3 w-3' />}
      {VISIBILITY_LABEL[value]}
      <ChevronRightIcon className='h-3 w-3' />
    </button>
  )
}
