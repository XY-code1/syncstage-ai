import type { Concert } from '../types'
import { cn } from '../lib/cn'
import { DemoBadge } from './ui'

export function Poster({
  concert,
  size = 'detail',
  className,
}: {
  concert: Concert
  size?: 'detail' | 'mini'
  className?: string
}) {
  const { poster } = concert
  const isDetail = size === 'detail'

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-card border border-white/8',
        isDetail ? 'aspect-[4/3]' : 'aspect-[16/9]',
        className,
      )}
      style={{
        backgroundImage: `linear-gradient(148deg, ${poster.from} 0%, ${poster.via} 48%, ${poster.to} 100%)`,
      }}
    >
      <div className='poster-grain absolute inset-0 opacity-70' />
      <div
        className='absolute -right-10 -top-12 h-40 w-40 rounded-full opacity-30 blur-2xl'
        style={{ background: poster.accent }}
      />
      <div className='absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-stage-950/85 to-transparent' />

      <div className='absolute left-0 top-0 flex w-full items-start justify-between p-4'>
        <span className='rounded-pill border border-white/18 bg-white/10 px-2.5 py-1 text-[10px] tracking-[0.18em] text-white/85'>
          现场预告
        </span>
        <DemoBadge label={concert.ticketStatus} />
      </div>

      <div className='absolute inset-x-0 bottom-0 p-4'>
        <p className='text-[11px] tracking-[0.22em] text-white/60'>{concert.artist.toUpperCase()}</p>
        <h2
          className={cn(
            'mt-1 font-semibold leading-tight text-white drop-shadow-[0_2px_16px_rgba(0,0,0,0.6)]',
            isDetail ? 'text-[28px]' : 'text-lg',
          )}
        >
          {concert.title}
        </h2>
        {isDetail ? (
          <p className='mt-2 text-[12px] text-white/65'>{concert.subtitle}</p>
        ) : null}
        <div className='mt-3 flex flex-wrap gap-1.5'>
          {poster.keywords.map((keyword) => (
            <span
              key={keyword}
              className='rounded-pill border border-white/14 bg-stage-950/35 px-2.5 py-1 text-[11px] text-white/75 backdrop-blur'
            >
              #{keyword}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
