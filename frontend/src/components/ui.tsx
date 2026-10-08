import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { MATCH_STAGES } from '../lib/agentMock'
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon, RefreshIcon, SparkleIcon } from './icons'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warm'
type ButtonSize = 'sm' | 'md' | 'lg'

const variantClass: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-stage-950 font-semibold hover:bg-brand-400 brand-glow',
  secondary: 'glass-card text-white/90 hover:border-white/20',
  ghost: 'text-white/65 hover:text-white',
  danger: 'bg-rose-400 text-stage-950 font-semibold',
  warm: 'bg-warm-400 text-stage-950 font-semibold',
}

const sizeClass: Record<ButtonSize, string> = {
  sm: 'min-h-11 px-3 gap-1.5 text-sm rounded-xl',
  md: 'min-h-[52px] px-4 gap-2 text-[15px] rounded-2xl',
  lg: 'h-[52px] px-5 gap-2 text-[15px] rounded-2xl',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  trailingIcon?: ReactNode
  full?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  trailingIcon,
  full,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        variantClass[variant],
        sizeClass[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  )
}

export function Card({
  children,
  className,
  glow,
}: {
  children: ReactNode
  className?: string
  glow?: boolean
}) {
  return (
    <div
      className={cn(
        'glass-card rounded-card p-4',
        glow && 'shadow-[0_14px_36px_-32px_rgba(49,194,124,0.7)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function SectionTitle({
  title,
  hint,
  right,
  icon,
  required,
}: {
  title: string
  hint?: string
  right?: ReactNode
  icon?: ReactNode
  required?: boolean
}) {
  return (
    <div className='mb-3 flex items-start justify-between gap-3'>
      <div className='min-w-0'>
        <div className='flex items-center gap-1.5 text-[15px] font-semibold text-white'>
          {icon}
          <span>{title}</span>
          {required ? <span className='text-[11px] font-normal text-brand-400'>必填</span> : null}
        </div>
        {hint ? <p className='mt-1 text-xs leading-relaxed text-white/45'>{hint}</p> : null}
      </div>
      {right}
    </div>
  )
}

export function Chip({
  label,
  selected,
  onClick,
  size = 'md',
  tone = 'brand',
}: {
  label: string
  selected?: boolean
  onClick?: () => void
  size?: 'sm' | 'md'
  tone?: 'brand' | 'neutral' | 'violet' | 'warm'
}) {
  const toneSelected: Record<string, string> = {
    brand: 'border-brand-500/60 bg-brand-500/18 text-brand-100',
    neutral: 'border-white/25 bg-white/10 text-white',
    violet: 'border-violet-400/60 bg-violet-400/18 text-violet-400',
    warm: 'border-warm-400/60 bg-warm-400/18 text-warm-400',
  }

  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border transition duration-150 active:scale-[0.97]',
        size === 'sm' ? 'min-h-8 px-2.5 py-1 text-sm' : 'min-h-10 px-3.5 py-2 text-sm',
        selected
          ? toneSelected[tone]
          : 'border-white/12 bg-white/[0.03] text-white/65 hover:border-white/25 hover:text-white/85',
      )}
    >
      {selected ? <CheckIcon className='h-3.5 w-3.5' /> : null}
      <span>{label}</span>
    </button>
  )
}

export function TagPill({
  label,
  onRemove,
  tone = 'brand',
}: {
  label: string
  onRemove?: () => void
  tone?: 'brand' | 'violet' | 'warm' | 'neutral'
}) {
  const toneClass: Record<string, string> = {
    brand: 'border-brand-500/35 bg-brand-500/12 text-brand-100',
    violet: 'border-violet-400/35 bg-violet-400/12 text-violet-400',
    warm: 'border-warm-400/35 bg-warm-400/12 text-warm-400',
    neutral: 'border-white/14 bg-white/[0.04] text-white/80',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px]',
        toneClass[tone],
      )}
    >
      {label}
      {onRemove ? (
        <button
          type='button'
          onClick={onRemove}
          aria-label={`移除标签 ${label}`}
          className='-mr-1 rounded-full p-0.5 text-current/70 transition hover:bg-white/10'
        >
          <CloseIcon className='h-3.5 w-3.5' />
        </button>
      ) : null}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton-shimmer rounded-xl', className)} />
}

export function ScoreRing({ score, size = 66 }: { score: number; size?: number }) {
  const stroke = 5
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const dash = (Math.max(0, Math.min(score, 100)) / 100) * circumference
  const color = score >= 80 ? '#31c27c' : score >= 62 ? '#61c8ff' : '#ffc46b'

  return (
    <div className='relative shrink-0' style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden='true'>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke='rgba(255,255,255,0.08)'
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap='round'
          strokeDasharray={`${dash} ${circumference - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className='absolute inset-0 flex flex-col items-center justify-center'>
        <span className='text-[17px] font-semibold leading-none text-white'>{score}</span>
        <span className='mt-0.5 text-[10px] text-white/45'>匹配度</span>
      </div>
    </div>
  )
}

export function DemoBadge({ label = 'DEMO 数据' }: { label?: string }) {
  return (
    <span className='inline-flex items-center rounded-pill border border-warm-400/35 bg-warm-400/12 px-2 py-0.5 text-[10px] font-medium tracking-wide text-warm-400'>
      {label}
    </span>
  )
}

export function Divide({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-white/8', className)} />
}

export function StateView({
  status,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: {
  status: 'loading' | 'empty' | 'error' | 'info'
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
  secondaryLabel?: string
  onSecondary?: () => void
}) {
  const iconMap = {
    loading: <SparkleIcon className='h-6 w-6 text-brand-400' />,
    empty: <InfoIcon className='h-6 w-6 text-white/60' />,
    error: <AlertIcon className='h-6 w-6 text-rose-400' />,
    info: <InfoIcon className='h-6 w-6 text-brand-400' />,
  }

  return (
    <div className='flex flex-col items-center rounded-card border border-white/8 bg-white/[0.025] px-6 py-9 text-center'>
      <div
        className={cn(
          'mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]',
          status === 'loading' && 'animate-pulse',
        )}
      >
        {iconMap[status]}
      </div>
      <p className='text-[15px] font-semibold text-white'>{title}</p>
      {description ? (
        <p className='mt-2 max-w-[280px] text-xs leading-relaxed text-white/50'>{description}</p>
      ) : null}
      {actionLabel && onAction ? (
        <Button className='mt-5' icon={<RefreshIcon className='h-4 w-4' />} onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {secondaryLabel && onSecondary ? (
        <Button variant='ghost' size='sm' className='mt-2' onClick={onSecondary}>
          {secondaryLabel}
        </Button>
      ) : null}
    </div>
  )
}

export function Sheet({
  open,
  title,
  description,
  onClose,
  children,
  className,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  if (!open) return null

  return (
    <div className='fixed inset-0 z-50 flex items-end justify-center animate-fade' role='dialog' aria-modal='true'>
      <button
        type='button'
        aria-label='关闭'
        onClick={onClose}
        className='absolute inset-0 cursor-default bg-stage-950/80 backdrop-blur-sm'
      />
      <div className={cn('safe-bottom relative w-full max-w-[440px] animate-rise rounded-t-[26px] border-t border-white/12 bg-stage-900 px-5 pb-4 pt-5', className)}>
        <div className='mb-1 flex items-start justify-between gap-4'>
          <div>
            <p className='text-base font-semibold text-white'>{title}</p>
            {description ? <p className='mt-1.5 text-xs leading-relaxed text-white/50'>{description}</p> : null}
          </div>
          <button
            type='button'
            onClick={onClose}
            aria-label='关闭弹窗'
            className='rounded-full border border-white/10 p-1.5 text-white/60 transition hover:text-white'
          >
            <CloseIcon className='h-4 w-4' />
          </button>
        </div>
        <div className='mt-4'>{children}</div>
      </div>
    </div>
  )
}

/** 任务进度条：与 Agent 匹配的四阶段保持一致（理解需求 → 寻找同场用户 → 计算同频度 → 生成组队方案） */
export function ProgressSteps({ current }: { current: number }) {
  return (
    <div className='flex items-center gap-1.5'>
      {MATCH_STAGES.map((stage, index) => {
        const done = index < current
        const active = index === current
        return (
          <div key={stage.id} className='flex flex-1 flex-col items-center gap-1'>
            <div
              className={cn(
                'h-1 w-full rounded-full transition',
                done ? 'bg-brand-500/70' : active ? 'bg-brand-500' : 'bg-white/10',
              )}
            />
            <span
              className={cn(
                'whitespace-nowrap text-[10px] tracking-wide',
                active ? 'text-brand-300' : done ? 'text-white/45' : 'text-white/25',
              )}
            >
              {stage.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function Labeled({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <div className='mb-2 flex items-baseline gap-2'>
        <span className='text-[13px] font-medium text-white/85'>{label}</span>
        {required ? <span className='text-[11px] text-brand-400'>必填</span> : null}
        {hint ? <span className='text-[11px] text-white/35'>{hint}</span> : null}
      </div>
      {children}
    </div>
  )
}
