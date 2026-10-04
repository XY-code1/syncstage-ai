import { Component, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas } from '@react-three/fiber'
import type { RootState } from '@react-three/fiber'
import { Avatar } from '../Avatar'
import { Vinyl, WaveformBars } from '../musicVisuals'
import { cn } from '../../lib/cn'
import { FrequencyParticleScene } from './FrequencyParticleScene'
import type { ParticleStageStatus, ParticleStageTier } from './particleStageTypes'

export type { ParticleStageStatus, ParticleStageTier } from './particleStageTypes'

/**
 * 高密度音乐粒子舞台（同频现场主视觉）。
 *
 * - 组件本身只做能力探测、降级与状态映射；真正的 3D 场景在 FrequencyParticleScene 里，
 *   三层粒子全部走 BufferGeometry，不阻塞主线程，也不拦页面点击（pointer-events: none）。
 * - WebGL 不可用 / 初始化失败 / 上下文丢失：退回现有 CSS 静态背景。
 * - prefers-reduced-motion 或 status = paused：停止强动画，只保留当前视觉状态。
 */
export interface FrequencyParticleStageProps {
  status: ParticleStageStatus
  /** 0–1，来自 Agent 真实进度：只影响聚合/扫描强度，不伪造时间轴。 */
  progress?: number
  leftAvatar?: string
  rightAvatar?: string
  leftName?: string
  rightName?: string
  reducedMotion?: boolean
  className?: string
  /** stage = 完整舞台；ambient = 只当背景粒子层，不参与任何视觉中心。 */
  variant?: 'stage' | 'ambient'
}

interface StageHardware {
  supported: boolean
  software: boolean
  cores: number
  memory: number
  mobile: boolean
}

interface StageCapability {
  tier: ParticleStageTier
  dpr: number
}

/** 主动关闭 3D 的开关：自动化测试与「低配设备兜底」都走它，回到 CSS 静态背景。 */
function forcedFallback(): boolean {
  if (typeof window === 'undefined') return false
  if ((window as Window & { __SFL_FORCE_WEBGL_FALLBACK__?: boolean }).__SFL_FORCE_WEBGL_FALLBACK__) return true
  try {
    return window.localStorage.getItem('sfl.disableWebgl') === '1'
  } catch {
    return false
  }
}

/** WebGL 能力 + 设备档位：一次探测，软件渲染 / 无头浏览器直接落到 low，保证测试与老机器都稳。 */
function readHardware(): StageHardware {
  const forced = forcedFallback()
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  const cores = nav && typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 8
  const memory = nav && typeof (nav as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
    ? (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
    : 8
  const matches = (query: string) => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches
  const mobile = matches('(pointer: coarse)') || (typeof window !== 'undefined' && window.innerWidth < 768)

  if (forced || typeof document === 'undefined') {
    return { supported: false, software: false, cores, memory, mobile }
  }
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null
    if (!gl) return { supported: false, software: false, cores, memory, mobile }
    const debug = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = String(
      (debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '',
    )
    const software = (nav ? /headless/i.test(nav.userAgent) : false)
      || /swiftshader|software|llvmpipe|basic render|microsoft basic/i.test(renderer)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return { supported: true, software, cores, memory, mobile }
  } catch {
    return { supported: false, software: false, cores, memory, mobile }
  }
}

function buildCapability(hardware: StageHardware, reduced: boolean): StageCapability {
  const deviceRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const capped = Math.min(deviceRatio, hardware.mobile ? 1 : 1.5)
  const dpr = Math.max(1, capped)
  if (reduced) return { tier: 'low', dpr }
  if (hardware.software) return { tier: 'low', dpr: Math.min(dpr, 1) }
  if (hardware.cores <= 4 || hardware.memory <= 4) return { tier: 'low', dpr }
  if (hardware.mobile) return { tier: 'mid', dpr }
  if (hardware.cores >= 8 && hardware.memory >= 8) return { tier: 'high', dpr }
  return { tier: 'mid', dpr }
}

function useMediaReduced(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return reduced
}

/** WebGL 初始化 / 渲染期抛错时把舞台交回 CSS 静态背景。 */
class SceneErrorBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** 现有 CSS 静态背景：WebGL 不可用时的兜底，沿用页面既有的黑绿舞台语言。 */
function FrequencyStageFallback({
  leftAvatar,
  rightAvatar,
  leftName = '你',
  rightName = '同频听众',
  ambient = false,
}: {
  leftAvatar?: string
  rightAvatar?: string
  leftName?: string
  rightName?: string
  ambient?: boolean
}) {
  return (
    <div
      data-visual='particle-stage-fallback'
      className='pointer-events-none absolute inset-0 overflow-hidden'
      aria-hidden='true'
    >
      <div
        className='absolute inset-0'
        style={{
          background:
            'radial-gradient(120% 78% at 50% 108%, rgba(49,245,138,0.18), transparent 62%),'
            + 'radial-gradient(90% 66% at 84% -12%, rgba(130,92,255,0.16), transparent 64%),'
            + 'linear-gradient(180deg, #04100c 0%, #020806 100%)',
        }}
      />
      {ambient ? null : (
      <>
      <span className='absolute left-1/2 top-[36%] -translate-x-1/2 -translate-y-1/2 opacity-70'>
        <Vinyl size={132} accent='#31f58a' />
      </span>
      <WaveformBars bars={13} height={58} accent='#31f58a' className='absolute left-[7%] top-[36%] w-[74px] -translate-y-1/2 -rotate-6 opacity-75' />
      <WaveformBars bars={13} height={58} accent='#8769ff' className='absolute right-[7%] top-[36%] w-[74px] -translate-y-1/2 rotate-6 opacity-75' />
      <span className='absolute left-[7%] top-[15%] rounded-full border border-brand-400/50 bg-stage-950/80 p-1'>
        <Avatar name={leftName} from='#31f58a' to='#0d6b45' src={leftAvatar} size={44} />
      </span>
      <span className='absolute right-[7%] top-[15%] rounded-full border border-vibepurple-500/55 bg-stage-950/80 p-1'>
        <Avatar name={rightName} from='#8b6cff' to='#2a1a5e' src={rightAvatar} size={44} />
      </span>
      </>
      )}
    </div>
  )
}

export function FrequencyParticleStage({
  status,
  progress = 0,
  leftAvatar,
  rightAvatar,
  leftName = '你',
  rightName = '同频听众',
  variant = 'stage',
  reducedMotion,
  className,
}: FrequencyParticleStageProps) {
  const ambient = variant === 'ambient'
  const [hardware, setHardware] = useState<StageHardware | null>(null)
  const [failed, setFailed] = useState(false)
  const mediaReduced = useMediaReduced()
  const reduced = reducedMotion === true || mediaReduced

  useEffect(() => {
    setHardware(readHardware())
  }, [])

  const capability = useMemo(() => (hardware ? buildCapability(hardware, reduced) : null), [hardware, reduced])

  // 暂停时记住进入暂停前的执行阶段：继续后视觉能原样回到那一阶段。
  const [resumeStatus, setResumeStatus] = useState<ParticleStageStatus>(status === 'paused' ? 'idle' : status)
  useEffect(() => {
    if (status !== 'paused') setResumeStatus(status)
  }, [status])

  const handleCreated = useCallback((state: RootState) => {
    const canvas = state.gl.domElement
    canvas.addEventListener(
      'webglcontextlost',
      (event: Event) => {
        event.preventDefault()
        setFailed(true)
      },
      false,
    )
  }, [])

  const webglFailed = failed || (hardware !== null && !hardware.supported)
  const ready = hardware !== null && !webglFailed && capability !== null
  const frozen = reduced || status === 'paused'
  const webglState = hardware === null ? 'detecting' : webglFailed ? 'fallback' : 'ok'

  return (
    <div
      data-visual='particle-stage'
      data-webgl={webglState}
      data-stage-status={status}
      data-stage-resume-status={resumeStatus}
      data-particle-tier={capability?.tier ?? 'off'}
      aria-hidden='true'
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      {webglFailed ? (
        <FrequencyStageFallback
          ambient={ambient}
          leftAvatar={leftAvatar}
          rightAvatar={rightAvatar}
          leftName={leftName}
          rightName={rightName}
        />
      ) : null}

      {ready && capability ? (
        <SceneErrorBoundary onError={() => setFailed(true)}>
          <Canvas
            style={{ pointerEvents: 'none' }}
            dpr={capability.dpr}
            frameloop={frozen ? 'demand' : 'always'}
            gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
            camera={{ position: [0, 0, 6.4], fov: 42, near: 0.1, far: 40 }}
            onCreated={handleCreated}
          >
            <FrequencyParticleScene
              variant={variant}
              status={status}
              progress={progress}
              tier={capability.tier}
              dpr={capability.dpr}
              reduced={reduced}
              leftAvatar={leftAvatar}
              rightAvatar={rightAvatar}
              leftName={leftName}
              rightName={rightName}
            />
          </Canvas>
        </SceneErrorBoundary>
      ) : null}
    </div>
  )
}

export default FrequencyParticleStage
