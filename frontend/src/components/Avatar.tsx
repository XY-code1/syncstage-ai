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
}: {
  name: string
  from: string
  to: string
  size?: number
  className?: string
  showRing?: boolean
}) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-stage-950',
        showRing && 'ring-2 ring-brand-500/45 ring-offset-2 ring-offset-stage-950',
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
