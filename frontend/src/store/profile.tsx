import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * 当前用户的资料（昵称 / 头像 / 生日 / 性别 / 城市 / 联系方式 / 可见性）。
 * 演示环境持久化在 localStorage，刷新后仍然存在；头像用 data URL 保存。
 */

export type Gender = 'female' | 'male' | 'undisclosed' | 'custom'
export type Visibility = 'public' | 'matches' | 'private'

export const GENDER_LABEL: Record<Gender, string> = {
  female: '女',
  male: '男',
  undisclosed: '不公开',
  custom: '自定义',
}

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  public: '所有人可见',
  matches: '仅匹配对象可见',
  private: '仅自己可见',
}

export const VISIBILITY_HINT: Record<Visibility, string> = {
  public: '同频页面和匹配结果里都会展示',
  matches: '只有进入匹配/房间的人能看到',
  private: 'Agent 也不会把它写进推荐理由',
}

export interface UserProfile {
  nickname: string
  syncStageId: string
  birthday: string
  gender: Gender
  genderCustom: string
  city: string
  signature: string
  contactType: string
  contactValue: string
  avatar: string | null
  visibility: {
    birthday: Visibility
    gender: Visibility
    city: Visibility
    contact: Visibility
  }
  updatedAt: number
}

export const CONTACT_TYPES = ['微信', 'QQ', '手机号', '邮箱', '其它'] as const

export const DEFAULT_PROFILE: UserProfile = {
  nickname: 'Demo 访客',
  syncStageId: 'SFL-2308-4471',
  birthday: '2003-06-14',
  gender: 'female',
  genderCustom: '',
  city: '上海',
  signature: '第一次用一起去现场，想找个人一起把副歌唱完',
  contactType: '微信',
  contactValue: '',
  avatar: null,
  visibility: {
    birthday: 'matches',
    gender: 'matches',
    city: 'public',
    // 联系方式默认不向陌生匹配对象公开
    contact: 'private',
  },
  updatedAt: 0,
}

const KEY = 'sfl.profile.v1'

function read(): UserProfile {
  if (typeof window === 'undefined') return DEFAULT_PROFILE
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return DEFAULT_PROFILE
    const parsed = JSON.parse(raw) as Partial<UserProfile>
    return {
      ...DEFAULT_PROFILE,
      ...parsed,
      visibility: { ...DEFAULT_PROFILE.visibility, ...(parsed.visibility ?? {}) },
    }
  } catch {
    return DEFAULT_PROFILE
  }
}

export function ageFromBirthday(birthday: string): number | null {
  if (!birthday) return null
  const born = new Date(birthday)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const monthDiff = now.getMonth() - born.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1
  return age >= 0 && age < 120 ? age : null
}

interface ProfileValue {
  profile: UserProfile
  age: number | null
  genderLabel: string
  update: (patch: Partial<UserProfile>) => void
  setVisibility: (field: keyof UserProfile['visibility'], value: Visibility) => void
  reset: () => void
}

const ProfileContext = createContext<ProfileValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(read)

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(profile))
    } catch {
      // 存储失败（例如头像过大）时忽略，页面仍然可用
    }
  }, [profile])

  const update = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...prev, ...patch, updatedAt: Date.now() }))
  }, [])

  const setVisibility = useCallback((field: keyof UserProfile['visibility'], value: Visibility) => {
    setProfile((prev) => ({
      ...prev,
      visibility: { ...prev.visibility, [field]: value },
      updatedAt: Date.now(),
    }))
  }, [])

  const reset = useCallback(() => setProfile({ ...DEFAULT_PROFILE, updatedAt: Date.now() }), [])

  const value = useMemo<ProfileValue>(
    () => ({
      profile,
      age: ageFromBirthday(profile.birthday),
      genderLabel: profile.gender === 'custom' ? profile.genderCustom || '自定义' : GENDER_LABEL[profile.gender],
      update,
      setVisibility,
      reset,
    }),
    [profile, update, setVisibility, reset],
  )

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
}

export function useProfile(): ProfileValue {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('ProfileProvider missing')
  return ctx
}