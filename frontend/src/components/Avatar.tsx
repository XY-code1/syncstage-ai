import { cn } from '../lib/cn'

function initialOf(name: string): string {
  const segment = name.split('的').pop() ?? name
  return segment.slice(0, 1) || name.slice(0, 1) || '同'
}

export function Avatar({
  name,
  from,
  to,
  size = 44,
  className,
  showRing,
  src,
  silhouette,
}: {
  name: string
  from: string
  to: string
  size?: number
  className?: string
  showRing?: boolean
  /** 自定义头像（data URL / 图片地址），用于"我的"当前用户 */
  src?: string | null
  /** 匿名剪影：尚未揭晓的候选轨迹端点，不显示首字母，避免像表单占位符 */
  silhouette?: boolean
}) {
  const ring = showRing ? 'ring-2 ring-brand-500/45 ring-offset-2 ring-offset-stage-950' : undefined
  if (silhouette) {
    return (
      <div
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full border border-dashed border-white/25 bg-white/[0.05]',
          ring,
          className,
        )}
        style={{ width: size, height: size }}
        aria-hidden='true'
      >
        <svg
          viewBox='0 0 24 24'
          width={Math.round(size * 0.54)}
          height={Math.round(size * 0.54)}
          className='text-white/35'
          fill='currentColor'
        >
          <circle cx='12' cy='8.6' r='3.7' />
          <path d='M4.9 20.2c0-3.7 3.2-6.3 7.1-6.3s7.1 2.6 7.1 6.3z' />
        </svg>
      </div>
    )
  }
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('shrink-0 rounded-full object-cover', ring, className)}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-stage-950',
        ring,
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-hidden='true'
    >
      {initialOf(name)}
    </div>
  )
}
