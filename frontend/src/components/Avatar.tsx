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
}: {
  name: string
  from: string
  to: string
  size?: number
  className?: string
  showRing?: boolean
  /** 自定义头像（data URL / 图片地址），用于"我的"当前用户 */
  src?: string | null
}) {
  const ring = showRing ? 'ring-2 ring-brand-500/45 ring-offset-2 ring-offset-stage-950' : undefined
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