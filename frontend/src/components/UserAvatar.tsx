import type { MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/cn'
import { useProfile } from '../store/profile'
import { Avatar } from './Avatar'

/**
 * 当前用户头像的唯一出口。
 *
 * 所有涉及"当前用户"的位置（首页右上角、我的、编辑资料、聊天室、房间确认卡片）
 * 都必须用这个组件读同一个 store，禁止各页面自己维护一份头像状态。
 * 头像是 data URL，存在 profile store 里，改完立刻全局重渲染。
 */
export function UserAvatar({
  size = 44,
  className,
  showRing,
  onClick,
  label = '我的',
  preview,
}: {
  size?: number
  className?: string
  showRing?: boolean
  /** 传入后渲染成按钮：点击区域至少 44×44，满足移动端可点面积要求 */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  label?: string
  /** 编辑资料页的草稿预览：只有这一处允许覆盖 store 的值，保存后仍以 store 为准 */
  preview?: { nickname: string; avatar: string | null }
}) {
  const { profile } = useProfile()
  const nickname = preview ? preview.nickname : profile.nickname
  const source = preview ? preview.avatar : profile.avatar
  const avatar = (
    <Avatar
      name={nickname || '你'}
      from='#31f58a'
      to='#0b1116'
      size={size}
      className={className}
      showRing={showRing}
      src={source}
    />
  )

  if (!onClick) return avatar

  return (
    <button
      type='button'
      onClick={onClick}
      aria-label={label}
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500',
      )}
    >
      {avatar}
    </button>
  )
}

/** 首页/我的页共用的"点头像去我的"行为 */
export function MyProfileAvatar({ size = 32, className }: { size?: number; className?: string }) {
  const navigate = useNavigate()
  return <UserAvatar size={size} className={className} onClick={() => navigate('/me')} />
}