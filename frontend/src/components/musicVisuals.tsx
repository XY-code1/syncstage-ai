import { useRef, type ReactNode } from 'react'
import { Avatar } from './Avatar'
import { CheckIcon, MapPinIcon, MusicIcon, ShieldIcon, TicketIcon } from './icons'
import { cn } from '../lib/cn'
import { MOTION, MOTION_OK, MOTION_REDUCE, gsap, useGSAP } from '../lib/gsapSetup'
import { useVisualBudget } from '../lib/visualBudget'

/**
 * 一起去现场的视觉语言：唱片、声波、雷达、集合点小地图。
 *
 * 全部动画都写在 index.css 里，并在 prefers-reduced-motion 下统一关闭，
 * 因此这里只负责摆放与配色，不自己实现动效逻辑。
 */

export const STAGE_BLUE = '#4a7dff'
export const STAGE_PURPLE = '#825cff'
export const SIGNAL_GREEN = '#31f58a'
export const WARM = '#ffc46b'

/** 唱片：外圈纹路 + 标签 + 中心孔。spin 时匀速旋转。 */
export function Vinyl({
  size = 96,
  accent = SIGNAL_GREEN,
  spin = false,
  fast = false,
  sizeCss,
  className,
}: {
  size?: number
  accent?: string
  spin?: boolean
  fast?: boolean
  /** 覆盖 width/height（例如 clamp()）；size 只用于推导纹路与中心孔的像素值。 */
  sizeCss?: string
  className?: string
}) {
  const root = useRef<HTMLSpanElement>(null)
  // 黑胶缓慢旋转：只有 spin 为真时才转；减少动效时完全不动。
  useGSAP(() => {
    const node = root.current
    if (!spin || !node) return
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      const tween = gsap.to(node, {
        rotation: 360,
        duration: fast ? MOTION.vinylFast : MOTION.vinyl,
        ease: 'none',
        repeat: -1,
        transformOrigin: '50% 50%',
      })
      return () => tween.kill()
    })
    return () => mm.revert()
  }, { dependencies: [spin, fast], scope: root })

  return (
    <span
      ref={root}
      className={cn('relative block shrink-0 rounded-full', spin && 'gsap-transform', className)}
      style={{
        width: sizeCss ?? size,
        height: sizeCss ?? size,
        background: `radial-gradient(circle at 50% 50%, #05070a 0%, #15191c 58%, #0b0d0f 100%)`,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 0 0 ${Math.max(2, size * 0.06)}px rgba(255,255,255,0.03)`,
      }}
      aria-hidden='true'
    >
      {/* 纹路 */}
      {[0.86, 0.72, 0.58].map((ratio) => (
        <span
          key={ratio}
          className='absolute rounded-full'
          style={{
            inset: `${((1 - ratio) / 2) * 100}%`,
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        />
      ))}
      {/* 标签 */}
      <span
        className='absolute rounded-full'
        style={{ inset: '32%', background: `linear-gradient(135deg, ${accent}, ${accent}66)` }}
      />
      {/* 中心孔 */}
      <span
        className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-stage-950'
        style={{ width: Math.max(5, size * 0.09), height: Math.max(5, size * 0.09) }}
      />
    </span>
  )
}

/** 声波条：active 时像均衡器一样起伏。 */
export function WaveformBars({
  bars = 7,
  accent = SIGNAL_GREEN,
  active = false,
  className,
  height = 22,
}: {
  bars?: number
  accent?: string
  active?: boolean
  className?: string
  height?: number
}) {
  const pattern = [0.45, 0.75, 1, 0.6, 0.9, 0.5, 0.8, 0.65, 0.95]
  const root = useRef<HTMLSpanElement>(null)
  // 声波流动（均衡器）：只有 active 时才起伏，用一条 stagger 补间驱动全部竖条，避免每根条各建一条。
  useGSAP(() => {
    const node = root.current
    if (!active || !node) return
    const items = node.querySelectorAll<HTMLElement>('[data-eq-bar]')
    if (!items.length) return
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      const tween = gsap.fromTo(
        items,
        { scaleY: 0.45 },
        {
          scaleY: 1,
          duration: 0.52,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          stagger: { each: 0.09, from: 'start' },
          transformOrigin: '50% 100%',
        },
      )
      return () => tween.kill()
    })
    return () => mm.revert()
  }, { dependencies: [active], scope: root })

  return (
    <span ref={root} className={cn('flex items-end gap-[3px]', className)} aria-hidden='true' style={{ height }}>
      {Array.from({ length: bars }).map((_, index) => {
        const ratio = pattern[index % pattern.length]
        return (
          <span
            key={index}
            data-eq-bar
            className='w-[3px] origin-bottom rounded-full'
            style={{
              height: Math.round(height * ratio),
              background: accent,
              opacity: 0.55 + (index % 3) * 0.15,
            }}
          />
        )
      })}
    </span>
  )
}

export interface RadarCandidate {
  id: string
  nickname: string
  from: string
  to: string
  score?: number
}

/**
 * 动态音乐雷达：中央旋转唱片，候选头像光点随进度逐步靠近。
 * progress 0 → 光点在雷达外圈；progress 1 → 全部汇入中心。
 */
export function MusicRadar({
  progress,
  candidates,
  active,
  merged = false,
  accent = SIGNAL_GREEN,
  className,
}: {
  progress: number
  candidates: RadarCandidate[]
  active: boolean
  merged?: boolean
  accent?: string
  className?: string
}) {
  const clamped = Math.max(0, Math.min(1, progress))
  // 雷达半径用像素算：外圈贴着最外面的同心圆，内圈刚好落在中央唱片外侧，
  // 光点才会从"远处"一点点汇到中心，而不是一上来就挤在唱片上。
  const outer = 112
  const inner = 64
  const radius = outer - (outer - inner) * clamped
  const shown = candidates.slice(0, 6)

  return (
    <div className={cn('relative mx-auto', className)} style={{ width: 252, height: 252 }} aria-hidden='true'>
      {/* 同心圆 */}
      {[1, 0.72, 0.46].map((ratio) => (
        <span
          key={ratio}
          className='absolute rounded-full'
          style={{
            inset: `${((1 - ratio) / 2) * 100}%`,
            border: `1px solid rgba(255,255,255,${0.07 + (1 - ratio) * 0.05})`,
          }}
        />
      ))}
      {/* 十字刻度 */}
      <span className='absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/[0.05]' />
      <span className='absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/[0.05]' />

      {/* 扫描扇形：只有运行时才转，符合"仅运行中的 Agent 允许发光" */}
      {active ? (
        <span
          className='radar-sweep absolute inset-0 rounded-full'
          style={{
            background: `conic-gradient(from 0deg, ${accent}00 0deg, ${accent}22 42deg, ${accent}00 60deg, ${accent}00 360deg)`,
          }}
        />
      ) : null}

      {/* 已扫过的圈：表示进度 */}
      <span
        className='absolute rounded-full transition-[inset] duration-700'
        style={{
          inset: `${((126 - radius) / 252) * 100}%`,
          border: `1px solid ${accent}55`,
        }}
      />

      {/* 候选光点 */}
      {shown.map((item, index) => {
        const angle = (-90 + (360 / Math.max(shown.length, 1)) * index) * (Math.PI / 180)
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        const percent = radius / outer
        return (
          <span
            key={item.id}
            className='absolute left-1/2 top-1/2'
            style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`, transition: 'transform 900ms cubic-bezier(0.22,0.9,0.3,1)' }}
          >
            <span className='relative block'>
              <span
                className={cn('radar-pulse absolute inset-0 rounded-full blur-md')}
                style={{ background: accent, opacity: active ? 0.5 : 0.22, transform: `scale(${0.92 + percent * 0.22})` }}
              />
              <Avatar name={item.nickname} from={item.from} to={item.to} size={clamped > 0.85 ? 34 : 28} />
            </span>
          </span>
        )
      })}

      {/* 中央唱片 */}
      <span className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
        <Vinyl size={104} accent={merged ? SIGNAL_GREEN : active ? STAGE_BLUE : '#454e57'} spin={active} />
      </span>
    </div>
  )
}

/** 匹配成功：左右两条声波向中间汇合。 */
export function WaveMerge({ accent = SIGNAL_GREEN, className }: { accent?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2', className)} aria-hidden='true'>
      <WaveformBars bars={5} accent={STAGE_BLUE} height={26} className='animate-merge' />
      <span className='flex h-9 w-9 items-center justify-center rounded-full' style={{ background: `${accent}22`, boxShadow: `0 0 0 1px ${accent}66` }}>
        <span className='h-2.5 w-2.5 rounded-full' style={{ background: accent }} />
      </span>
      <WaveformBars bars={5} accent={STAGE_PURPLE} height={26} className='animate-merge-right' />
    </div>
  )
}

/** 公开集合点小地图：抽象街区 + 定位点 + 汇合路线，不接入任何真实地图服务。 */
export function MeetingMap({
  name,
  time,
  note,
  className,
}: {
  name: string
  time: string
  note: string
  className?: string
}) {
  return (
    <div className={cn('overflow-hidden rounded-2xl border border-white/8 bg-stage-850', className)}>
      <div className='relative h-[96px]'>
        <span
          className='absolute inset-0 opacity-[0.55]'
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        {/* 街区色块 */}
        <span className='absolute left-[8%] top-[14%] h-[30%] w-[26%] rounded-[6px] bg-white/[0.045]' />
        <span className='absolute left-[58%] top-[52%] h-[34%] w-[30%] rounded-[6px] bg-white/[0.04]' />
        <span className='absolute left-[36%] top-[10%] h-[16%] w-[16%] rounded-[6px] bg-white/[0.03]' />
        {/* 汇合路线 */}
        <svg className='absolute inset-0 h-full w-full' viewBox='0 0 240 96' preserveAspectRatio='none' aria-hidden='true'>
          <path d='M18 74 C 70 74, 92 40, 118 46' fill='none' stroke={STAGE_BLUE} strokeWidth='1.6' strokeDasharray='5 5' opacity='0.85' />
          <path d='M222 26 C 176 26, 152 44, 126 46' fill='none' stroke={STAGE_PURPLE} strokeWidth='1.6' strokeDasharray='5 5' opacity='0.85' />
        </svg>
        {/* 两个出发点 */}
        <span className='absolute bottom-[16px] left-[14px] h-2.5 w-2.5 rounded-full' style={{ background: STAGE_BLUE }} />
        <span className='absolute right-[14px] top-[22px] h-2.5 w-2.5 rounded-full' style={{ background: STAGE_PURPLE }} />
        {/* 集合点 */}
        <span className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
          <span className='relative flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/20 glow-confirmed'>
            <MapPinIcon className='h-4 w-4 text-brand-300' />
          </span>
        </span>
      </div>
      <div className='border-t border-white/6 px-3.5 py-3'>
        <p className='flex items-start gap-2 text-[14px] font-medium text-ink-100'>
          <MapPinIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
          {name}
        </p>
        <p className='mt-1.5 text-[13px] text-ink-400'>{time}</p>
        <p className='mt-1 flex items-start gap-2 text-[12.5px] leading-relaxed text-ink-400'>
          <ShieldIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300' />
          {note}
        </p>
      </div>
    </div>
  )
}

/** 卡片标题行：给四张摘要卡与结果卡复用 */
export function CardHeading({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className='flex items-center gap-2'>
      {icon}
      <span className='text-[14px] font-semibold text-ink-100'>{title}</span>
      {hint ? <span className='ml-auto text-[12px] text-ink-400'>{hint}</span> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 双轨汇合：同频现场的统一视觉语言
//
// 两条轨道代表两个陌生用户：
//   用户轨道   QQ 音乐绿 → 青（#31f58a → #61c8ff）
//   候选人轨道 蓝 → 紫（#4a7dff → #825cff）
// 匹配成功时，两条轨道在"共同歌曲封面"处汇合。
//
// 只用 SVG + CSS，不引入 3D 库、不使用视频背景；所有装饰性动画都由
// index.css 里的 .track-flow / .orbit-spin / .fx-particle 驱动，
// 并在 prefers-reduced-motion 与低端机上自动降级为静态状态。
// ---------------------------------------------------------------------------

export const USER_TRACK = { from: '#31f58a', to: '#61c8ff' } as const
export const CANDIDATE_TRACK = { from: '#4a7dff', to: '#825cff' } as const

export interface TrackPerson {
  name: string
  from: string
  to: string
  /** 当前用户的自定义头像（data URL），候选人没有时就退回渐变首字 */
  src?: string | null
}

export interface TrackCover {
  title: string
  from: string
  to: string
  accent: string
}

/** 一条声波轨道：填充振幅包络 + 声波柱 + 一条沿轨道流动的高亮线。 */
function SoundWaveTrack({
  id,
  from,
  to,
  className,
  flow = true,
  bars = 19,
  seed = 0.6,
  mirror = false,
}: {
  id: string
  from: string
  to: string
  className?: string
  flow?: boolean
  bars?: number
  seed?: number
  /** 镜像方向：右轨从内侧开始收窄，读起来像声波正在往里走 */
  mirror?: boolean
}) {
  const flowRef = useRef<SVGLineElement>(null)
  // 声波流动：让描边偏移匀速循环；flow 为假或减少动效时保持静止。
  useGSAP(() => {
    const node = flowRef.current
    if (!flow || !node) return
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      const tween = gsap.fromTo(
        node,
        { strokeDashoffset: 0 },
        { strokeDashoffset: -24, duration: MOTION.flow, ease: 'none', repeat: -1 },
      )
      return () => tween.kill()
    })
    return () => mm.revert()
  }, { dependencies: [flow], scope: flowRef })

  const items = Array.from({ length: bars }, (_, index) => {
    const t = bars <= 1 ? 0.5 : index / (bars - 1)
    const envelope = Math.sin(Math.PI * t) ** 0.6
    const mask = mirror ? 0.24 + 0.76 * t : 1 - 0.76 * t
    const wave = Math.abs(Math.sin(t * Math.PI * 3.4 + seed))
    return { x: 5 + t * 190, amp: (4 + 47 * envelope * (0.34 + 0.66 * wave)) * mask }
  })
  const top = items.map((bar) => bar.x.toFixed(1) + ',' + (60 - bar.amp).toFixed(1)).join(' ')
  const bottom = [...items]
    .reverse()
    .map((bar) => bar.x.toFixed(1) + ',' + (60 + bar.amp).toFixed(1))
    .join(' ')

  return (
    <svg viewBox='0 0 200 120' preserveAspectRatio='none' className={className} aria-hidden='true'>
      <defs>
        <linearGradient id={id} x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0%' stopColor={from} />
          <stop offset='100%' stopColor={to} />
        </linearGradient>
        <linearGradient id={id + '-body'} x1='0' y1='0' x2='0' y2='1'>
          <stop offset='0%' stopColor={from} stopOpacity='0.04' />
          <stop offset='50%' stopColor={to} stopOpacity='0.26' />
          <stop offset='100%' stopColor={to} stopOpacity='0.04' />
        </linearGradient>
      </defs>
      <polygon points={top + ' ' + bottom} fill={'url(#' + id + '-body)'} />
      <line x1='3' y1='60' x2='197' y2='60' stroke={'url(#' + id + ')'} strokeWidth='2.6' strokeLinecap='round' opacity='0.5' />
      {items.map((bar, index) => (
        <rect
          key={index}
          x={bar.x - 2.3}
          y={60 - (bar.amp * 0.94) / 2}
          width='4.6'
          height={Math.max(2, bar.amp * 0.94)}
          rx='2.3'
          fill={'url(#' + id + ')'}
          opacity={0.55 + 0.4 * Math.abs(Math.sin(index * 1.27))}
        />
      ))}
      {flow ? (
        <line
          ref={flowRef}
          x1='3'
          y1='60'
          x2='197'
          y2='60'
          stroke='#ffffff'
          strokeWidth='2'
          strokeLinecap='round'
          strokeDasharray='3 21'
          opacity='0.55'
        />
      ) : null}
    </svg>
  )
}

/** 共同歌曲封面：用演出配色 + 唱片 + 声波拼出封面，不依赖任何外部图片 */
export function SongCover({
  title,
  from,
  to,
  accent,
  size = 68,
  className,
}: {
  title: string
  from: string
  to: string
  accent: string
  size?: number
  className?: string
}) {
  const initial = title.replace(/[《》\s]/g, '').slice(0, 1) || '音'
  return (
    <span
      className={cn('relative block shrink-0 overflow-hidden rounded-[18px] ring-1 ring-white/15', className)}
      style={{ width: size, height: size, backgroundImage: 'linear-gradient(140deg, ' + from + ' 0%, ' + to + ' 100%)' }}
      aria-hidden='true'
    >
      <span
        className='absolute inset-0'
        style={{ backgroundImage: 'radial-gradient(120% 110% at 22% 6%, ' + accent + '66 0%, transparent 62%)' }}
      />
      <span className='absolute bottom-1.5 left-1.5 flex h-[38%] items-end gap-[2px]'>
        {[6, 11, 17, 10, 6].map((height, index) => (
          <span key={index} className='w-[3px] rounded-full bg-white/80' style={{ height: height * 2 }} />
        ))}
      </span>
      <span
        className='absolute -bottom-3 -right-3 rounded-full border border-white/25 bg-black/45'
        style={{ width: size * 0.5, height: size * 0.5 }}
      >
        <span
          className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/80'
          style={{ width: Math.max(4, size * 0.09), height: Math.max(4, size * 0.09) }}
        />
      </span>
      <span className='absolute left-2 top-1.5 text-[13px] font-semibold text-white/90'>{initial}</span>
    </span>
  )
}
const NODE_SPOTS = [
  { left: '12%', top: '16%' },
  { left: '26%', top: '80%' },
  { left: '76%', top: '18%' },
  { left: '89%', top: '72%' },
]

export interface TrackBead {
  id: string
  state: 'pending' | 'done' | 'failed'
}

/**
 * 双轨声波舞台：首页、匹配过程、汇合揭晓共用同一套视觉语言。
 *
 *   apart       两条轨道各自从左右进入，中间是尚未汇合的共同曲目节点（首页首屏）
 *   converging  按真实进度靠近，每完成一步就在两轨之间亮起一个共同音符（Agent 匹配中）
 *   merged      两条轨道在共同歌曲封面处汇合（匹配成功 / 同频汇合）
 */
export function DualTrackStage({
  mode,
  progress = 0,
  user,
  candidate,
  cover,
  nodes = [],
  beads = [],
  className,
  height = 208,
  showPeople = true,
  candidateMasked = false,
  nodesMasked = false,
  nodeLabel,
  flow,
}: {
  mode: 'apart' | 'converging' | 'merged'
  progress?: number
  user: TrackPerson
  candidate: TrackPerson
  cover?: TrackCover
  nodes?: Array<TrackPerson & { faded?: boolean }>
  /** 两轨之间的共同节点：每完成一个匹配阶段就多亮起一个 */
  beads?: TrackBead[]
  className?: string
  height?: number
  showPeople?: boolean
  /** 候选端保持匿名剪影：揭晓前不显示头像，也不显示首字母 */
  candidateMasked?: boolean
  /** 环绕的候选节点同样保持匿名剪影 */
  nodesMasked?: boolean
  /** 汇合点的文字胶囊，例如「共同心动曲目」 */
  nodeLabel?: string
  /** 高亮线是否流动；默认跟随视觉预算，低端机与减少动效下自动关闭 */
  flow?: boolean
}) {
  const budget = useVisualBudget()
  const flowOn = flow ?? budget.particles
  const p = Math.max(0, Math.min(1, mode === 'merged' ? 1 : mode === 'apart' ? 0 : progress))
  const merged = mode === 'merged' || p >= 0.995
  const inner = 32 + 18 * p
  const avatar = Math.round(Math.min(56, Math.max(34, height * 0.21)))
  // 只有「可见的音符节点」才需要给封面让位；汇合后节点会淡出，封面反而应该长到最大，
  // 让共同歌曲成为整页的第一主体（并随 p 连续放大，避免汇合瞬间跳变）。
  const beadsVisible = beads.length > 0 && !merged
  const coverSize = Math.round(Math.min(beadsVisible ? 72 : 96, Math.max(56, height * (0.34 + 0.04 * p))))
  const bandH = Math.round(Math.min(170, Math.max(96, height * 0.64)))
  const beadSize = 26
  const spreadPx = Math.max(26, Math.round(height * 0.34))
  const side = merged
    ? 'calc(50% - ' + (coverSize / 2 + avatar - 8) + 'px)'
    : 'calc(' + inner + '% - ' + avatar + 'px)'

  const stage = useRef<HTMLDivElement>(null)
  const userAnchor = useRef<HTMLSpanElement>(null)
  const candidateAnchor = useRef<HTMLSpanElement>(null)
  const identityBox = useRef<HTMLSpanElement>(null)
  const prevProgress = useRef(p)
  const prevSignature = useRef('')
  const prevDoneBeads = useRef(0)
  const beadSignature = beads.map((bead) => bead.id + ':' + bead.state).join('|')
  const doneBeads = beads.filter((bead) => bead.state === 'done').length

  /** 和上面 CSS 完全一致的位置公式；只用来算这一帧要补多少像素差 */
  const sidePxAt = (value: number, width: number): number => {
    const valueMerged = value >= 0.995
    const valueCover = Math.round(
      Math.min(beads.length > 0 && !valueMerged ? 72 : 96, Math.max(56, height * (0.34 + 0.04 * value))),
    )
    return valueMerged
      ? width / 2 - (valueCover / 2 + avatar - 8)
      : ((32 + 18 * value) / 100) * width - avatar
  }

  // 头像沿轨道靠近：位置仍由 React 算，GSAP 只补「上一位置 → 新位置」的 transform 差值。
  useGSAP(() => {
    const node = stage.current
    const userEl = userAnchor.current
    const candidateEl = candidateAnchor.current
    const from = prevProgress.current
    prevProgress.current = p
    if (!node || !userEl || !candidateEl || from === p) return
    const width = node.clientWidth
    if (!width) return
    const delta = sidePxAt(from, width) - sidePxAt(p, width)
    const fromOpacity = 0.78 + 0.22 * from
    const toOpacity = 0.78 + 0.22 * p
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      const tweens = [
        gsap.fromTo(
          userEl,
          { x: delta, opacity: fromOpacity },
          { x: 0, opacity: toOpacity, duration: MOTION.approach, ease: MOTION.approachEase },
        ),
        gsap.fromTo(
          candidateEl,
          { x: -delta, opacity: fromOpacity },
          { x: 0, opacity: toOpacity, duration: MOTION.approach, ease: MOTION.approachEase },
        ),
      ]
      return () => tweens.forEach((tween) => tween.kill())
    })
    return () => mm.revert()
  }, { dependencies: [p], scope: stage })

  // 匹配阶段过渡：首次挂载依次浮现，之后每当有阶段真的完成，只让最新完成的节点弹一下。
  useGSAP(() => {
    const node = stage.current
    if (!node) return
    const first = prevSignature.current === ''
    prevSignature.current = beadSignature
    const wasDone = prevDoneBeads.current
    prevDoneBeads.current = doneBeads
    const all = node.querySelectorAll<HTMLElement>('[data-visual="track-bead"]')
    if (!all.length) return
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      if (first) {
        const tl = gsap.timeline()
        tl.fromTo(all, { scale: 0.6, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.4, ease: 'power2.out', stagger: 0.05 })
        return () => tl.kill()
      }
      if (doneBeads <= wasDone) return
      const fresh = Array.from(all)
        .filter((el) => el.getAttribute('data-bead-state') === 'done')
        .slice(wasDone)
      if (!fresh.length) return
      const tl = gsap.timeline()
      tl.fromTo(fresh, { scale: 0.7 }, { scale: 1, duration: 0.42, ease: 'back.out(2)', stagger: 0.06 })
      return () => tl.kill()
    })
    return () => mm.revert()
  }, { dependencies: [beadSignature], scope: stage })

  // 揭晓动效：匿名剪影与真人头像交叉过渡 + 一次绿紫融合闪光；减少动效时直接显示完成状态。
  useGSAP(() => {
    const box = identityBox.current
    if (!box) return
    const silhouette = box.querySelector<HTMLElement>('[data-identity-layer="silhouette"]')
    const person = box.querySelector<HTMLElement>('[data-identity-layer="person"]')
    const flash = box.querySelector<HTMLElement>('[data-identity-flash]')
    if (!silhouette || !person) return
    const mm = gsap.matchMedia()
    mm.add(MOTION_OK, () => {
      const tl = gsap.timeline()
      if (candidateMasked) {
        tl.set(person, { autoAlpha: 0, scale: 0.9 }).set(silhouette, { autoAlpha: 1, scale: 1 })
      } else {
        tl.to(silhouette, { autoAlpha: 0, scale: 1.06, duration: MOTION.reveal, ease: 'power2.out' }, 0)
          .to(person, { autoAlpha: 1, scale: 1, duration: MOTION.reveal, ease: 'power3.out' }, 0)
        if (flash) {
          tl.fromTo(
            flash,
            { autoAlpha: 0.95, scale: 0.78 },
            { autoAlpha: 0, scale: 1.55, duration: MOTION.flash, ease: 'power2.out' },
            0.06,
          )
        }
      }
      return () => tl.kill()
    })
    mm.add(MOTION_REDUCE, () => {
      gsap.set(silhouette, { autoAlpha: candidateMasked ? 1 : 0, scale: 1 })
      gsap.set(person, { autoAlpha: candidateMasked ? 0 : 1, scale: 1 })
      if (flash) gsap.set(flash, { autoAlpha: 0 })
    })
    return () => mm.revert()
  }, { dependencies: [candidateMasked], scope: identityBox })

  return (
    <div
      ref={stage}
      className={cn('relative w-full overflow-hidden', className)}
      style={{ height }}
      data-visual='dual-track'
      data-track-state={merged ? 'merged' : mode}
      data-track-progress={p.toFixed(2)}
      data-identity={candidateMasked ? 'anonymous' : 'revealed'}
      aria-hidden='true'
    >
      <span
        className='absolute inset-0'
        style={{
          backgroundImage:
            'radial-gradient(60% 80% at 2% 50%, rgba(49,245,138,0.18), transparent 64%),' +
            'radial-gradient(60% 80% at 98% 50%, rgba(130,92,255,0.2), transparent 64%)',
        }}
      />

      {nodes.map((node, index) => {
        const spot = NODE_SPOTS[index % NODE_SPOTS.length]
        return (
          <span
            key={node.name + index}
            className='fx-particle node-float absolute'
            style={{ left: spot.left, top: spot.top, animationDelay: index * 620 + 'ms', opacity: node.faded ? 0.2 : 1 }}
          >
            <Avatar name={node.name} from={node.from} to={node.to} size={22} className='opacity-80' silhouette={nodesMasked} />
          </span>
        )
      })}

      {/* 两条声波轨道：外端固定在两侧，内端随真实进度向中间靠拢 */}
      <span
        className='track-shift absolute left-0 top-1/2'
        style={{ width: inner + '%', height: bandH, transform: 'translateY(-50%)', opacity: 0.64 + 0.36 * p }}
      >
        {budget.particles ? (
          <span className='track-glow absolute inset-0 opacity-60'>
            <SoundWaveTrack id='sfl-track-user-glow' from={USER_TRACK.from} to={USER_TRACK.to} className='h-full w-full' flow={false} />
          </span>
        ) : null}
        <SoundWaveTrack
          id='sfl-track-user'
          from={USER_TRACK.from}
          to={USER_TRACK.to}
          className='absolute inset-0 h-full w-full'
          flow={flowOn}
        />
      </span>
      <span
        className='track-shift absolute right-0 top-1/2'
        style={{ width: inner + '%', height: bandH, transform: 'translateY(-50%)', opacity: 0.64 + 0.36 * p }}
      >
        {budget.particles ? (
          <span className='track-glow absolute inset-0 opacity-60'>
            <SoundWaveTrack
              id='sfl-track-cand-glow'
              from={CANDIDATE_TRACK.from}
              to={CANDIDATE_TRACK.to}
              className='h-full w-full'
              flow={false}
              seed={1.9}
              mirror
            />
          </span>
        ) : null}
        <SoundWaveTrack
          id='sfl-track-candidate'
          from={CANDIDATE_TRACK.from}
          to={CANDIDATE_TRACK.to}
          className='absolute inset-0 h-full w-full'
          flow={flowOn}
          seed={1.9}
          mirror
        />
      </span>

      {/* 尚未汇合时中间的虚线分隔：两条轨道靠近后自动消失 */}
      <span
        className='track-shift absolute left-1/2 top-[14%] w-px -translate-x-1/2'
        style={{
          height: '72%',
          backgroundImage: 'repeating-linear-gradient(180deg, rgba(255,255,255,0.3) 0 5px, transparent 5px 13px)',
          opacity: Math.max(0, 1 - p * 2),
        }}
      />

      {/* 两轨之间的共同节点：每完成一个匹配阶段就亮起一个共同音符 */}
      {beads.length ? (
        <>
          <span
            className='track-shift absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/12'
            style={{ width: 1, height: Math.round((spreadPx * 2 + beadSize) * (1 - p)), opacity: merged ? 0 : 1 }}
          />
          {beads.map((bead, index) => {
            const ratio = beads.length <= 1 ? 0 : (index - (beads.length - 1) / 2) / ((beads.length - 1) / 2)
            const offset = ratio * spreadPx * (1 - p)
            return (
              <span
                key={bead.id}
                className='track-shift absolute left-1/2 top-1/2 z-40'
                style={{ transform: 'translate(-50%, -50%) translateY(' + offset.toFixed(1) + 'px)', opacity: merged ? 0 : 1 }}
              >
                <span
                  data-visual='track-bead'
                  data-bead-state={bead.state}
                  className={cn(
                    'flex items-center justify-center rounded-full border backdrop-blur-sm',
                    bead.state === 'done'
                      ? 'glow-confirmed border-brand-500/70 bg-stage-900 text-brand-300'
                      : bead.state === 'failed'
                        ? 'border-warm-400/70 bg-stage-900 text-warm-400'
                        : 'border-dashed border-white/30 bg-stage-900 text-white/40',
                  )}
                  style={{ width: beadSize, height: beadSize }}
                >
                  <MusicIcon className='h-3.5 w-3.5' />
                </span>
              </span>
            )
          })}
        </>
      ) : null}

      {/* 共同歌曲封面：两条轨道的汇合点 */}
      {cover ? (
        <span
          className='track-shift absolute left-1/2 top-1/2 z-20'
          style={{
            opacity: 0.62 + 0.38 * p,
            transform: 'translate(-50%, -50%) scale(' + (0.9 + 0.1 * p).toFixed(3) + ')',
          }}
        >
          <span className='relative block'>
            {!merged ? (
              <span className='absolute -inset-2 rounded-[24px] border border-dashed border-white/20' />
            ) : null}
            <SongCover title={cover.title} from={cover.from} to={cover.to} accent={cover.accent} size={coverSize} />
            {merged ? <span className='merge-halo pointer-events-none absolute -inset-12 rounded-full' /> : null}
            {merged ? (
              <span className='sync-breathe pointer-events-none absolute -inset-2 rounded-[24px] border border-brand-500/55' />
            ) : null}
          </span>
        </span>
      ) : null}

      {/* 汇合点文字胶囊：明确这里是共同曲目，而不是一条装饰线 */}
      {cover && nodeLabel ? (
        <span
          className='absolute left-1/2 z-20 -translate-x-1/2'
          style={{ top: 'calc(50% + ' + (coverSize / 2 + 12) + 'px)' }}
        >
          <span
            className={cn(
              'flex items-center gap-1.5 rounded-pill border bg-stage-950/85 px-2.5 py-1 text-[10.5px] backdrop-blur',
              merged ? 'merge-node-pill text-white' : 'border-white/12 text-white/75',
            )}
          >
            <MusicIcon className='h-3 w-3 shrink-0 text-brand-300' />
            <span className='whitespace-nowrap'>
              {nodeLabel} · 《{cover.title}》
            </span>
          </span>
        </span>
      ) : null}

      {showPeople ? (
        <>
          <span
            ref={userAnchor}
            data-visual='track-anchor'
            className='gsap-transform absolute top-1/2 z-30'
            style={{ left: side, opacity: 0.78 + 0.22 * p }}
          >
            <span className='block -translate-y-1/2'>
              <Avatar name={user.name} from={user.from} to={user.to} size={avatar} showRing={merged} src={user.src} />
            </span>
          </span>
          <span
            ref={candidateAnchor}
            data-visual='track-anchor'
            className='gsap-transform absolute top-1/2 z-30'
            style={{ right: side, opacity: 0.78 + 0.22 * p }}
          >
            <span ref={identityBox} className='relative block -translate-y-1/2' style={{ width: avatar, height: avatar }}>
              <span
                data-identity-layer='silhouette'
                className={cn('identity-layer absolute inset-0', candidateMasked ? 'opacity-100' : 'opacity-0')}
              >
                <Avatar name={candidate.name} from={candidate.from} to={candidate.to} size={avatar} silhouette />
              </span>
              <span
                data-identity-layer='person'
                className={cn('identity-layer absolute inset-0', candidateMasked ? 'opacity-0' : 'opacity-100')}
              >
                <Avatar name={candidate.name} from={candidate.from} to={candidate.to} size={avatar} showRing={merged} src={candidate.src} />
              </span>
              {candidateMasked ? null : (
                <span data-identity-flash className='identity-flash pointer-events-none absolute -inset-2 rounded-full' />
              )}
            </span>
          </span>
        </>
      ) : null}
    </div>
  )
}

export interface OrbitNode extends TrackPerson {
  id: string
  /** 被硬条件过滤掉的候选人：柔和淡出，不出现红叉或"淘汰"文案 */
  faded?: boolean
}

/**
 * 匹配中的动态轨道：中央是用户头像，两条音乐轨道绕着它旋转，
 * 候选头像以声波节点形式从周围出现，并随真实进度向中心收拢。
 * 只有 active 为真（后端任务真的在跑）时才旋转，不存在无边界的空转动画。
 */
export function SyncOrbitStage({
  progress,
  nodes,
  active,
  merged = false,
  user,
  className,
  size = 236,
}: {
  progress: number
  nodes: OrbitNode[]
  active: boolean
  merged?: boolean
  user: TrackPerson
  className?: string
  size?: number
}) {
  const p = Math.max(0, Math.min(1, progress))
  const outer = size * 0.44
  const inner = size * 0.26
  const radius = outer - (outer - inner) * p
  const shown = nodes.slice(0, 6)
  const circumference = 2 * Math.PI * (size / 2) * 0.98

  return (
    <div
      className={cn('relative mx-auto', className)}
      style={{ width: size, height: size }}
      data-visual='orbit'
      aria-hidden='true'
    >
      <svg viewBox={'0 0 ' + size + ' ' + size} className='absolute inset-0 h-full w-full'>
        <defs>
          <linearGradient id='sfl-orbit-user' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%' stopColor={USER_TRACK.from} />
            <stop offset='100%' stopColor={USER_TRACK.to} />
          </linearGradient>
          <linearGradient id='sfl-orbit-cand' x1='1' y1='0' x2='0' y2='1'>
            <stop offset='0%' stopColor={CANDIDATE_TRACK.from} />
            <stop offset='100%' stopColor={CANDIDATE_TRACK.to} />
          </linearGradient>
        </defs>
        {[0.9, 0.66, 0.44].map((ratio) => (
          <circle
            key={ratio}
            cx={size / 2}
            cy={size / 2}
            r={(size / 2) * ratio - 3}
            fill='none'
            stroke='rgba(255,255,255,0.07)'
          />
        ))}
        <circle
          className={active && !merged ? 'orbit-spin' : undefined}
          cx={size / 2}
          cy={size / 2}
          r={(size / 2) * 0.88}
          fill='none'
          stroke='url(#sfl-orbit-user)'
          strokeWidth='1.6'
          strokeDasharray='7 11'
          opacity={active || merged ? 0.9 : 0.4}
          style={{ transformOrigin: '50% 50%' }}
        />
        <circle
          className={active && !merged ? 'orbit-spin-rev' : undefined}
          cx={size / 2}
          cy={size / 2}
          r={(size / 2) * 0.76}
          fill='none'
          stroke='url(#sfl-orbit-cand)'
          strokeWidth='1.6'
          strokeDasharray='3 14'
          opacity={active || merged ? 0.85 : 0.35}
          style={{ transformOrigin: '50% 50%' }}
        />
        <circle cx={size / 2} cy={size / 2} r={(size / 2) * 0.98} fill='none' stroke='rgba(255,255,255,0.08)' strokeWidth='3' />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={(size / 2) * 0.98}
          fill='none'
          stroke={merged ? SIGNAL_GREEN : STAGE_BLUE}
          strokeWidth='3'
          strokeLinecap='round'
          strokeDasharray={circumference * p + ' ' + circumference}
          transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'}
          style={{ transition: 'stroke-dasharray 820ms cubic-bezier(0.22,0.9,0.3,1), stroke 420ms ease' }}
        />
      </svg>

      {active && !merged ? (
        <span
          className='radar-sweep absolute inset-2 rounded-full'
          style={{
            background:
              'conic-gradient(from 0deg, ' + STAGE_BLUE + '00 0deg, ' + STAGE_BLUE + '26 40deg, ' + STAGE_BLUE + '00 58deg, ' + STAGE_BLUE + '00 360deg)',
          }}
        />
      ) : null}

      <span className='absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
        <Avatar name={user.name} from={user.from} to={user.to} size={64} showRing={merged} src={user.src} />
      </span>

      {shown.map((node, index) => {
        const angle = ((-90 + (360 / Math.max(shown.length, 1)) * index) * Math.PI) / 180
        const x = Math.cos(angle) * radius
        const y = Math.sin(angle) * radius
        return (
          <span
            key={node.id}
            className='track-shift absolute left-1/2 top-1/2'
            style={{
              transform: 'translate(-50%, -50%) translate(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px)',
              opacity: node.faded ? 0.16 : 1,
            }}
          >
            <span className='relative block'>
              {(active || merged) && !node.faded ? (
                <span
                  className='radar-pulse absolute inset-0 rounded-full blur-md'
                  style={{ background: merged ? SIGNAL_GREEN : STAGE_BLUE, opacity: 0.4 }}
                />
              ) : null}
              <Avatar name={node.name} from={node.from} to={node.to} size={p > 0.8 || merged ? 32 : 26} src={node.src} />
            </span>
          </span>
        )
      })}
    </div>
  )
}

/** 同频度：把真实的综合匹配度画成一圈"双色轨道"，中央写「同频 xx%」 */
export function SyncScoreDial({ score, size = 92, className }: { score: number; size?: number; className?: string }) {
  const stroke = 6
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, Math.round(score)))
  const dash = (clamped / 100) * circumference
  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} aria-hidden='true'>
        <defs>
          <linearGradient id='sfl-score-grad' x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0%' stopColor={USER_TRACK.from} />
            <stop offset='100%' stopColor={CANDIDATE_TRACK.from} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={radius} fill='none' stroke='rgba(255,255,255,0.09)' strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill='none'
          stroke='url(#sfl-score-grad)'
          strokeWidth={stroke}
          strokeLinecap='round'
          strokeDasharray={dash + ' ' + (circumference - dash)}
          transform={'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')'}
        />
      </svg>
      <div className='absolute inset-0 flex flex-col items-center justify-center'>
        <span className='text-[9.5px] tracking-[0.22em] text-white/45'>同频</span>
        <span className='text-[23px] font-semibold leading-none text-white'>
          {clamped}
          <span className='text-[12px] text-white/60'>%</span>
        </span>
      </div>
    </div>
  )
}

/** 同行票根：演出名称与时间 / 双方头像 / 共同歌曲 / 同行方式 / 公开集合原则 / 双方确认状态 */
export function TicketStub({
  concertTitle,
  concertTime,
  venue,
  user,
  candidate,
  sharedSong,
  purpose,
  principle,
  confirmState,
  code,
  className,
}: {
  concertTitle: string
  concertTime: string
  venue: string
  user: TrackPerson
  candidate: TrackPerson
  sharedSong: string
  purpose: string
  principle: string
  confirmState: string
  code: string
  className?: string
}) {
  return (
    <div className={cn('relative overflow-hidden rounded-card border border-white/10 bg-surface-2', className)}>
      <div className='flex items-center gap-2 px-3.5 pt-3'>
        <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-500/15 text-brand-300'>
          <TicketIcon className='h-4 w-4' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[13.5px] font-semibold text-ink-100'>{concertTitle}</p>
          <p className='truncate text-[11.5px] text-ink-400'>
            {concertTime} · {venue}
          </p>
        </div>
        <span className='shrink-0 text-[10px] tracking-wider text-white/35'>{code}</span>
      </div>

      <div className='relative mt-2.5 flex items-center px-3.5'>
        <span className='absolute -left-2 h-4 w-4 rounded-full bg-stage-950' />
        <span
          className='h-px flex-1'
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 5px, transparent 5px 11px)' }}
        />
        <span className='absolute -right-2 h-4 w-4 rounded-full bg-stage-950' />
      </div>

      <div className='flex items-center gap-2.5 px-3.5 pt-2.5'>
        <Avatar name={user.name} from={user.from} to={user.to} size={30} src={user.src} />
        <span className='flex min-w-0 items-center gap-1 rounded-pill border border-brand-500/40 bg-brand-500/12 px-2 py-[3px] text-[10.5px] text-brand-100'>
          <MusicIcon className='h-3 w-3 shrink-0' />
          <span className='truncate'>同频 · {sharedSong}</span>
        </span>
        <Avatar name={candidate.name} from={candidate.from} to={candidate.to} size={30} src={candidate.src} />
      </div>

      <dl className='mt-2.5 px-3.5 pb-3'>
        <div className='flex items-start gap-2 text-[11.5px]'>
          <dt className='w-16 shrink-0 text-white/40'>同行方式</dt>
          <dd className='min-w-0 flex-1 text-ink-100'>{purpose}</dd>
        </div>
        <div className='mt-1.5 flex items-start gap-2 text-[11.5px]'>
          <dt className='w-16 shrink-0 text-white/40'>集合原则</dt>
          <dd className='min-w-0 flex-1 text-ink-100'>{principle}</dd>
        </div>
        <div className='mt-2 flex items-center gap-1.5 border-t border-white/6 pt-2 text-[11.5px]'>
          <CheckIcon className='h-3.5 w-3.5 shrink-0 text-brand-300' />
          <dt className='text-white/40'>双方确认</dt>
          <dd className='text-brand-200'>{confirmState}</dd>
        </div>
      </dl>
    </div>
  )
}

/**
 * 双人同行票：匹配成功页的主角，首屏直接完整展示，不需要点二级入口。
 *
 * 票面从上到下依次是：演出名称与唯一票号 → 双轨汇合主视觉（共同曲目节点 + 同频印章）
 * → 两位用户（候选端在揭晓前保持匿名剪影）→ 同行目的 / 安全边界 / 公开集合点
 * → 可撕票根。同频百分比只作为票面印章，不承担主视觉。
 */
export function CompanionTicket({
  concertTitle,
  concertTime,
  venue,
  meetingPoint,
  user,
  candidate,
  candidateTag,
  masked,
  cover,
  sharedSong,
  purpose,
  principle,
  confirmState,
  code,
  stamp,
  className,
}: {
  concertTitle: string
  concertTime: string
  venue: string
  meetingPoint: string
  user: TrackPerson
  candidate: TrackPerson
  candidateTag: string
  /** 候选端是否还处于匿名剪影状态 */
  masked: boolean
  cover?: TrackCover
  sharedSong: string
  purpose: string
  principle: string
  confirmState: string
  code: string
  /** 同频印章，例如「同频 81%」 */
  stamp: string
  className?: string
}) {
  return (
    <section className={cn('companion-ticket relative overflow-hidden rounded-[22px] border border-white/12 bg-surface-2', className)}>
      <header className='flex items-center gap-2.5 px-4 pt-3.5'>
        <span className='flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-500/15 text-brand-300'>
          <TicketIcon className='h-4 w-4' />
        </span>
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[15px] font-semibold text-ink-100'>{concertTitle}</p>
          <p className='truncate text-[11.5px] text-ink-400'>
            {concertTime} · {venue}
          </p>
        </div>
        <span className='shrink-0 text-right text-[10px] leading-tight tracking-wider text-white/40'>
          {code}
          <span className='mt-0.5 block text-[9.5px] text-white/25'>Demo 票面</span>
        </span>
      </header>

      <div className='relative mx-3 mt-2.5 overflow-hidden rounded-[16px] border border-white/8 bg-[#070a0e]'>
        <DualTrackStage
          mode='merged'
          user={user}
          candidate={candidate}
          cover={cover}
          height={136}
          nodeLabel='共同曲目'
          candidateMasked={masked}
        />
        <span className='ticket-stamp pointer-events-none absolute right-2.5 top-2.5'>{stamp}</span>
      </div>

      <div className='mt-3 flex items-center gap-3 px-4' data-identity={masked ? 'anonymous' : 'revealed'}>
        <div className='flex min-w-0 flex-1 items-center gap-2.5'>
          <Avatar name={user.name} from={user.from} to={user.to} size={36} src={user.src} />
          <span className='min-w-0'>
            <span className='block truncate text-[13.5px] font-semibold text-ink-100'>{user.name}</span>
            <span className='block truncate text-[10.5px] text-white/40'>发起人 · 同场观众</span>
          </span>
        </div>
        <div
          className='flex min-w-0 flex-1 items-center justify-end gap-2.5 text-right'
          data-visual='reveal-person'
          data-person={candidate.name}
        >
          <span className='min-w-0'>
            <span
              className={cn(
                'block truncate text-[13.5px] font-semibold',
                masked ? 'text-white/30' : 'animate-rise text-ink-100',
              )}
            >
              {masked ? '等待揭晓' : candidate.name}
            </span>
            <span className='block truncate text-[10.5px] text-white/40'>{masked ? '匿名同场听众' : candidateTag}</span>
          </span>
          <span className='relative block shrink-0' style={{ width: 36, height: 36 }}>
            <span className={cn('identity-layer absolute inset-0', masked ? 'opacity-100' : 'opacity-0')}>
              <Avatar name={candidate.name} from={candidate.from} to={candidate.to} size={36} silhouette />
            </span>
            <span className={cn('identity-layer absolute inset-0', masked ? 'scale-90 opacity-0' : 'scale-100 opacity-100')}>
              <Avatar name={candidate.name} from={candidate.from} to={candidate.to} size={36} src={candidate.src} showRing />
            </span>
            {masked ? null : <span className='identity-flash pointer-events-none absolute -inset-2 rounded-full' />}
          </span>
        </div>
      </div>

      <dl className='mt-3 space-y-1.5 px-4 text-[12px]'>
        <div className='flex items-start gap-2.5'>
          <dt className='w-[68px] shrink-0 text-white/40'>同行目的</dt>
          <dd className='min-w-0 flex-1 text-ink-100'>{purpose}</dd>
        </div>
        <div className='flex items-start gap-2.5'>
          <dt className='w-[68px] shrink-0 text-white/40'>安全边界</dt>
          <dd className='min-w-0 flex-1 text-ink-100'>{principle}</dd>
        </div>
        <div className='flex items-start gap-2.5'>
          <dt className='w-[68px] shrink-0 text-white/40'>公开集合点</dt>
          <dd className='min-w-0 flex-1 text-ink-100'>{meetingPoint}</dd>
        </div>
      </dl>

      <div className='relative mt-3 px-4'>
        <span className='absolute -left-2 -top-2 h-4 w-4 rounded-full bg-stage-950' />
        <span
          className='block h-px w-full'
          style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0 6px, transparent 6px 13px)' }}
        />
        <span className='absolute -right-2 -top-2 h-4 w-4 rounded-full bg-stage-950' />
      </div>

      <div className='flex items-center gap-2.5 px-4 pb-3.5 pt-2.5'>
        <Avatar name={candidate.name} from={candidate.from} to={candidate.to} size={26} silhouette={masked} src={candidate.src} />
        <div className='min-w-0 flex-1'>
          <p className='truncate text-[11.5px] text-ink-200'>同频 ·《{sharedSong}》</p>
          <p className='truncate text-[10px] text-white/35'>{confirmState}</p>
        </div>
        <span className='shrink-0 rounded-pill border border-white/12 px-2 py-[3px] text-[10px] text-white/45'>撕下票根</span>
      </div>
    </section>
  )
}
