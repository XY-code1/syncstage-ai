import { useEffect, useMemo, useRef, useState } from 'react'
import { PointMaterial, Points } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { ParticleStageStatus, ParticleStageTier } from './particleStageTypes'

/**
 * 「同频现场」粒子舞台的 R3F 场景。
 *
 * 设计约束：
 * - 全部粒子走 BufferGeometry + Points / 顶点着色器，不给每颗粒子建 React 组件；
 * - positions / attributes 等大数组只在 useMemo 里生成一次；
 * - useFrame 里只改 uniform 与 transform，绝不 setState；
 * - 场景在「名义空间」（4.8 × 7.4）里绘制，再整体缩放到画布比例，移动端不裁切。
 */

const NOMINAL_W = 4.8
const NOMINAL_H = 7.4
const CORE_R = 1.05
const CORE_Y = -0.65
const WAVE_X = 1.62
const WAVE_W = 0.55
const WAVE_H = 4.9
const WAVE_Y = -0.45
const AVATAR_X = 1.72
const AVATAR_Y = 2.5
const AVATAR_SIZE = 0.86

/** 静止帧（减少动效 / 暂停）使用的时间点：取一个形已经展开的时刻，避免停在 t=0 的原始状态。 */
const STATIC_T = 14

const GREEN = new THREE.Color('#4bffa6')
const PURPLE = new THREE.Color('#a184ff')
const MINT = new THREE.Color('#c7ffe4')

/** 各档位的粒子预算：高密度但可控，软件渲染 / 低端机自动落到 low。 */
const BUDGET: Record<ParticleStageTier, {
  waveRows: number
  waveCols: number
  core: number
  dust: number
  link: number
}> = {
  high: { waveRows: 200, waveCols: 15, core: 1600, dust: 1500, link: 900 },
  mid: { waveRows: 120, waveCols: 10, core: 720, dust: 640, link: 420 },
  low: { waveRows: 70, waveCols: 6, core: 300, dust: 240, link: 170 },
}

// ------------------------------------------------------------------ shaders

/** 通用 uv 直通顶点着色器：背景板、黑胶、光晕面片共用。 */
const UV_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

/** 深黑绿演唱会背景：底部舞台泛光 + 竖向灯柱 + 暗角。 */
const BACKDROP_FRAG = `
uniform float uTime;
uniform float uEnergy;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p * vec2(1.25, 1.0));
  vec3 deep = vec3(0.006, 0.026, 0.020);
  vec3 mid = vec3(0.016, 0.068, 0.050);
  float haze = smoothstep(0.80, 0.0, r);
  vec3 col = mix(deep, mid, haze);
  float floorGlow = smoothstep(0.55, 0.0, length((vUv - vec2(0.5, 0.2)) * vec2(1.0, 1.5)));
  col += vec3(0.05, 0.21, 0.14) * floorGlow * (0.30 + 0.40 * uEnergy);
  float beams = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    beams += pow(abs(sin(vUv.x * 9.42477 + fi * 0.9 + uTime * 0.06)), 16.0);
  }
  col += vec3(0.03, 0.12, 0.09) * beams * smoothstep(0.0, 0.65, vUv.y) * (0.30 + 0.55 * uEnergy);
  col *= smoothstep(1.05, 0.25, r);
  gl_FragColor = vec4(col, 1.0);
}
`

/** 光晕面片：中心亮、边缘透明的径向渐变，用 uIntensity 驱动呼吸。 */
const GLOW_QUAD_FRAG = `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uSoft;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.0, d);
  a = pow(max(a, 0.0), uSoft);
  gl_FragColor = vec4(uColor * uIntensity, a * uIntensity);
}
`

/** 左右声波：顶点着色器里按行位移，uScan 形成一条上下扫过的亮带。 */
const WAVE_VERT = `
uniform float uTime;
uniform float uAmp;
uniform float uScan;
uniform float uSpread;
uniform float uSize;
uniform float uDpr;
uniform float uFit;
uniform vec3 uColorLeft;
uniform vec3 uColorRight;
attribute float aSeed;
attribute float aRow;
attribute float aCol;
attribute float aSize;
attribute float aSide;
varying vec3 vColor;
varying float vGlow;
void main() {
  vec3 p = position;
  float env = sin(clamp(aCol, 0.0, 1.0) * 3.14159265);
  float dir = aSide * 2.0 - 1.0;
  float phase = aSide * 1.7;
  float primary = sin(aRow * 19.0 + uTime * 1.5 + aSeed * 6.28318 + phase);
  float secondary = sin(aRow * 6.0 - uTime * 0.85 + aSeed * 3.14159);
  p.x += (primary * 0.62 + secondary * 0.38) * uAmp * env * uSpread * dir;
  p.y += sin(uTime * 0.7 + aSeed * 6.28318) * 0.02;
  p.z += cos(aRow * 10.0 + uTime * 1.1 + aSeed * 2.0) * 0.12 * env;
  float scanDelta = aRow - uScan;
  float scan = uScan >= 0.0 ? exp(-scanDelta * scanDelta * 48.0) : 0.0;
  vGlow = (0.28 + 0.72 * env) * (0.55 + 0.45 * uAmp) + scan * 1.5;
  vColor = mix(uColorLeft, uColorRight, aSide) * (0.72 + scan * 0.6);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uSize * uFit * uDpr * (1.0 + scan * 0.8) * (300.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`

/** 中央能量核心：常驻环状星群，uAggregate 把它们收拢到中心。 */
const CORE_VERT = `
uniform float uTime;
uniform float uAggregate;
uniform float uSpin;
uniform float uSize;
uniform float uDpr;
uniform float uFit;
attribute float aSeed;
attribute float aAngle;
attribute float aRadius;
attribute float aSize;
varying float vGlow;
varying float vT;
void main() {
  float r = mix(aRadius, aRadius * 0.24, uAggregate);
  r *= 1.0 + 0.05 * sin(uTime * 2.2 + aSeed * 6.28318);
  float ang = aAngle + uTime * uSpin * (0.55 + 0.9 * aSeed);
  vec3 p = vec3(
    cos(ang) * r,
    sin(ang) * r * 0.94,
    position.z * (1.0 - uAggregate * 0.45) + sin(uTime * 1.3 + aSeed * 6.28318) * 0.05
  );
  float twinkle = 0.5 + 0.5 * sin(uTime * 1.9 + aSeed * 6.28318);
  vGlow = 0.35 + 0.65 * twinkle + uAggregate * 0.5;
  vT = aSeed;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uSize * uFit * uDpr * (1.0 + uAggregate * 0.5) * (300.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`

const CORE_FRAG = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;
varying float vGlow;
varying float vT;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.05, d);
  if (a <= 0.002) discard;
  vec3 col = mix(uColorA, uColorB, vT) * (0.45 + vGlow);
  gl_FragColor = vec4(col, a * uOpacity * clamp(vGlow, 0.0, 1.6));
}
`

/** 两位用户之间的连接粒子：沿弧线铺开，uConnection 控制点亮，脉冲来回移动。 */
const LINK_VERT = `
uniform float uTime;
uniform float uConnection;
uniform float uSize;
uniform float uDpr;
uniform float uFit;
uniform vec3 uColorLeft;
uniform vec3 uColorRight;
attribute float aT;
attribute float aJitter;
attribute float aSize;
varying vec3 vColor;
varying float vGlow;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 1.1 + aT * 6.28318) * 0.05;
  p.z += sin(uTime * 0.8 + aJitter * 12.0) * 0.05;
  float travel = fract(uTime * 0.22);
  float d = abs(aT - travel);
  d = min(d, 1.0 - d);
  float pulse = exp(-d * d * 110.0);
  vGlow = uConnection * (0.22 + pulse * 1.8);
  vColor = mix(uColorLeft, uColorRight, aT);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * uSize * uFit * uDpr * (1.0 + pulse * 1.4) * (300.0 / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`

/** 声波与连接粒子共用的圆形发光点。 */
const GLOW_FRAG = `
uniform float uOpacity;
varying vec3 vColor;
varying float vGlow;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float a = smoothstep(0.5, 0.05, d);
  if (a <= 0.002) discard;
  gl_FragColor = vec4(vColor * (0.45 + vGlow), a * uOpacity * clamp(vGlow, 0.0, 1.6));
}
`

/** 黑胶唱片：同心纹路 + 标签 + 中心孔 + 高光边。 */
const VINYL_FRAG = `
uniform float uTime;
uniform float uEnergy;
uniform vec3 uAccent;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p) * 2.0;
  float grooves = 0.5 + 0.5 * sin(r * 140.0 - uTime * 0.5);
  vec3 col = vec3(0.012, 0.022, 0.024) + grooves * 0.016;
  float sheen = smoothstep(0.05, 0.45, r) * smoothstep(1.0, 0.55, r);
  col += uAccent * sheen * 0.09 * (0.35 + 0.65 * uEnergy);
  float label = 1.0 - smoothstep(0.30, 0.36, r);
  col = mix(col, uAccent * 0.30 + vec3(0.01, 0.02, 0.02), label * 0.85);
  float hole = 1.0 - smoothstep(0.055, 0.085, r);
  col = mix(col, vec3(0.003, 0.006, 0.006), hole);
  float rim = smoothstep(0.9, 1.0, r);
  col += uAccent * rim * (0.35 + 0.5 * uEnergy);
  gl_FragColor = vec4(col, 1.0);
}
`

// ---------------------------------------------------------------- geometry

interface WaveBuffers {
  positions: Float32Array
  aSeed: Float32Array
  aRow: Float32Array
  aCol: Float32Array
  aSize: Float32Array
  aSide: Float32Array
}

function buildWaves(rows: number, cols: number): WaveBuffers {
  const perSide = rows * cols
  const total = perSide * 2
  const positions = new Float32Array(total * 3)
  const aSeed = new Float32Array(total)
  const aRow = new Float32Array(total)
  const aCol = new Float32Array(total)
  const aSize = new Float32Array(total)
  const aSide = new Float32Array(total)
  let i = 0
  for (let side = 0; side < 2; side += 1) {
    const dir = side === 0 ? -1 : 1
    for (let r = 0; r < rows; r += 1) {
      const rowT = rows <= 1 ? 0.5 : r / (rows - 1)
      for (let c = 0; c < cols; c += 1) {
        const colT = cols <= 1 ? 0.5 : c / (cols - 1)
        positions[i * 3] = dir * WAVE_X + (colT - 0.5) * WAVE_W
        positions[i * 3 + 1] = WAVE_Y + (rowT - 0.5) * WAVE_H
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.24
        aSeed[i] = Math.random()
        aRow[i] = rowT
        aCol[i] = colT
        aSize[i] = 0.5 + Math.random() * 1.6
        aSide[i] = side
        i += 1
      }
    }
  }
  return { positions, aSeed, aRow, aCol, aSize, aSide }
}

interface CoreBuffers {
  positions: Float32Array
  aSeed: Float32Array
  aAngle: Float32Array
  aRadius: Float32Array
  aSize: Float32Array
}

function buildCore(count: number): CoreBuffers {
  const positions = new Float32Array(count * 3)
  const aSeed = new Float32Array(count)
  const aAngle = new Float32Array(count)
  const aRadius = new Float32Array(count)
  const aSize = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2
    const radius = CORE_R * (0.26 + Math.pow(Math.random(), 0.62) * 0.8)
    positions[i * 3] = Math.cos(angle) * radius
    positions[i * 3 + 1] = Math.sin(angle) * radius * 0.94
    positions[i * 3 + 2] = (Math.random() - 0.5) * 0.3
    aSeed[i] = Math.random()
    aAngle[i] = angle
    aRadius[i] = radius
    aSize[i] = 0.5 + Math.random() * 1.5
  }
  return { positions, aSeed, aAngle, aRadius, aSize }
}

interface LinkBuffers {
  positions: Float32Array
  aT: Float32Array
  aJitter: Float32Array
  aSize: Float32Array
}

function buildLink(count: number): LinkBuffers {
  const positions = new Float32Array(count * 3)
  const aT = new Float32Array(count)
  const aJitter = new Float32Array(count)
  const aSize = new Float32Array(count)
  for (let i = 0; i < count; i += 1) {
    const t = count <= 1 ? 0.5 : i / (count - 1)
    const jitter = Math.random() - 0.5
    positions[i * 3] = THREE.MathUtils.lerp(-AVATAR_X, AVATAR_X, t)
    positions[i * 3 + 1] = AVATAR_Y + Math.sin(t * Math.PI) * 0.36 + jitter * 0.16
    positions[i * 3 + 2] = jitter * 0.3
    aT[i] = t
    aJitter[i] = jitter
    aSize[i] = 0.5 + Math.random() * 1.4
  }
  return { positions, aT, aJitter, aSize }
}

function buildDust(count: number, width: number, height: number): Float32Array {
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = (Math.random() - 0.5) * width * 1.2
    positions[i * 3 + 1] = (Math.random() - 0.5) * height * 1.2
    positions[i * 3 + 2] = -0.6 - Math.random() * 2.2
  }
  return positions
}

// ------------------------------------------------------------------ textures

function initialOf(name: string): string {
  const segment = name.split('的').pop() ?? name
  return segment.slice(0, 1) || name.slice(0, 1) || '同'
}

/** 128×128 的圆形头像底：渐变 + 首字；没有真人头像时用它兜底（不使用未授权照片）。 */
function makeInitialTexture(name: string, from: string, to: string): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const gradient = ctx.createLinearGradient(0, 0, size, size)
    gradient.addColorStop(0, from)
    gradient.addColorStop(1, to)
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(4,12,9,0.92)'
    ctx.font = `600 ${Math.round(size * 0.42)}px "PingFang SC", system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initialOf(name), size / 2, size / 2 + size * 0.02)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function makeImageTexture(image: HTMLImageElement): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    const scale = Math.max(size / image.width, size / image.height) || 1
    const w = image.width * scale
    const h = image.height * scale
    ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h)
    ctx.restore()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** 头像贴图：先用首字兜底，图片加载成功后再换成裁剪成圆形的真人头像。 */
function useAvatarTexture(src: string | undefined, name: string, from: string, to: string): THREE.Texture {
  const [remote, setRemote] = useState<THREE.Texture | null>(null)
  const base = useMemo(() => makeInitialTexture(name, from, to), [name, from, to])

  useEffect(() => {
    if (!src) {
      setRemote(null)
      return undefined
    }
    let cancelled = false
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (cancelled) return
      try {
        setRemote(makeImageTexture(image))
      } catch {
        setRemote(null)
      }
    }
    image.onerror = () => {
      if (!cancelled) setRemote(null)
    }
    image.src = src
    return () => {
      cancelled = true
    }
  }, [src])

  useEffect(() => () => base.dispose(), [base])
  useEffect(() => () => remote?.dispose(), [remote])

  return remote ?? base
}

// ------------------------------------------------------------------- pieces

type GlowUniforms = {
  uColor: { value: THREE.Color }
  uIntensity: { value: number }
  uSoft: { value: number }
}

function GlowQuad({ uniforms, size, position }: {
  uniforms: GlowUniforms
  size: number
  position: [number, number, number]
}) {
  return (
    <mesh position={position} scale={[size, size, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={UV_VERT}
        fragmentShader={GLOW_QUAD_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  )
}

function AvatarOrb({ position, size, src, name, from, to }: {
  position: [number, number, number]
  size: number
  src?: string
  name: string
  from: string
  to: string
}) {
  const texture = useAvatarTexture(src, name, from, to)
  return (
    <group position={position}>
      <sprite scale={[size, size, 1]}>
        <spriteMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
      </sprite>
      <mesh position={[0, 0, 0.01]}>
        <ringGeometry args={[size * 0.5, size * 0.55, 48]} />
        <meshBasicMaterial color={from} transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>
    </group>
  )
}

// -------------------------------------------------------------------- scene

export interface FrequencyParticleSceneProps {
  status: ParticleStageStatus
  progress: number
  tier: ParticleStageTier
  dpr: number
  reduced: boolean
  leftAvatar?: string
  rightAvatar?: string
  leftName?: string
  rightName?: string
}

export function FrequencyParticleScene({
  status,
  progress,
  tier,
  dpr,
  reduced,
  leftAvatar,
  rightAvatar,
  leftName = '你',
  rightName = '同频听众',
}: FrequencyParticleSceneProps) {
  const viewport = useThree((state) => state.viewport)
  const invalidate = useThree((state) => state.invalidate)
  const budget = BUDGET[tier]

  const fit = useMemo(() => {
    const byWidth = viewport.width / NOMINAL_W
    const byHeight = viewport.height / NOMINAL_H
    return Math.max(0.2, Math.min(1.1, byWidth, byHeight))
  }, [viewport.width, viewport.height])

  const waves = useMemo(() => buildWaves(budget.waveRows, budget.waveCols), [budget.waveRows, budget.waveCols])
  const core = useMemo(() => buildCore(budget.core), [budget.core])
  const link = useMemo(() => buildLink(budget.link), [budget.link])
  const dust = useMemo(
    () => buildDust(budget.dust, viewport.width, viewport.height),
    [budget.dust, viewport.width, viewport.height],
  )
  const waveCount = budget.waveRows * budget.waveCols * 2

  const uniforms = useMemo(() => {
    const point = () => ({ uSize: { value: 0.055 }, uDpr: { value: 1 }, uFit: { value: 1 } })
    return {
      backdrop: { uTime: { value: 0 }, uEnergy: { value: 0.25 } },
      vinyl: { uTime: { value: 0 }, uEnergy: { value: 0.4 }, uAccent: { value: GREEN.clone() } },
      wave: {
        ...point(),
        uTime: { value: 0 },
        uAmp: { value: 0.25 },
        uScan: { value: -1 },
        uSpread: { value: 0.55 },
        uOpacity: { value: 0.9 },
        uColorLeft: { value: GREEN.clone() },
        uColorRight: { value: PURPLE.clone() },
      },
      core: {
        ...point(),
        uTime: { value: 0 },
        uAggregate: { value: 0.15 },
        uSpin: { value: 0.6 },
        uOpacity: { value: 0.95 },
        uColorA: { value: MINT.clone() },
        uColorB: { value: GREEN.clone() },
      },
      link: {
        ...point(),
        uTime: { value: 0 },
        uConnection: { value: 0 },
        uOpacity: { value: 1 },
        uColorLeft: { value: GREEN.clone() },
        uColorRight: { value: PURPLE.clone() },
      },
      halo: { uColor: { value: GREEN.clone() }, uIntensity: { value: 0.3 }, uSoft: { value: 2.6 } },
      leftOrb: { uColor: { value: GREEN.clone() }, uIntensity: { value: 0.22 }, uSoft: { value: 2.2 } },
      rightOrb: { uColor: { value: PURPLE.clone() }, uIntensity: { value: 0.22 }, uSoft: { value: 2.2 } },
    }
  }, [])

  const vinylRef = useRef<THREE.Mesh | null>(null)
  const coreGroupRef = useRef<THREE.Group | null>(null)
  const dustRef = useRef<THREE.Group | null>(null)
  const dustMaterialRef = useRef<THREE.PointsMaterial | null>(null)

  const driver = useRef({
    t: STATIC_T,
    energy: 0.25,
    amp: 0.25,
    aggregate: 0.15,
    connection: 0,
    scan: -1,
    surge: 0,
    first: true,
    prev: status,
  })

  const sizeScale = Math.max(0.55, Math.min(1.25, fit))
  useEffect(() => {
    for (const set of [uniforms.wave, uniforms.core, uniforms.link]) {
      set.uDpr.value = dpr
      set.uFit.value = sizeScale
    }
    invalidate()
  }, [dpr, invalidate, sizeScale, uniforms])

  // 冻结（暂停 / 减少动效）时用 demand 模式少渲染，但仍保证至少画出一帧。
  useEffect(() => {
    invalidate()
  }, [invalidate, reduced, status])

  useFrame((_, delta) => {
    const d = driver.current
    for (const set of [uniforms.wave, uniforms.core, uniforms.link]) {
      set.uDpr.value = dpr
      set.uFit.value = sizeScale
    }

    if (status !== d.prev) {
      if (status === 'matched') d.surge = 1
      d.prev = status
    }

    const frozen = reduced || status === 'paused'
    if (frozen && !d.first) {
      // 冻结：不推进时钟，保留当前视觉状态（暂停后可原样继续）。
      return
    }

    d.t += frozen ? 0 : Math.min(delta, 0.05)

    const p = THREE.MathUtils.clamp(progress, 0, 1)
    let target: { energy: number; amp: number; aggregate: number; connection: number; scan: number }
    switch (status) {
      case 'analyzing':
        target = { energy: 0.6 + p * 0.25, amp: 0.4, aggregate: 0.4 + p * 0.5, connection: 0.05, scan: -1 }
        break
      case 'searching':
        target = { energy: 0.95, amp: 0.9, aggregate: 0.16, connection: 0.14, scan: (d.t * 0.35) % 1 }
        break
      case 'matched':
        target = { energy: 0.95, amp: 0.62, aggregate: 0.32, connection: 1, scan: -1 }
        break
      case 'paused':
      case 'idle':
      default:
        target = { energy: 0.2, amp: 0.24, aggregate: 0.12, connection: 0, scan: -1 }
    }

    const k = d.first ? 1 : Math.min(1, delta * 3.2)
    d.energy += (target.energy - d.energy) * k
    d.amp += (target.amp - d.amp) * k
    d.aggregate += (target.aggregate - d.aggregate) * k
    d.connection += (target.connection - d.connection) * k
    d.scan = target.scan
    d.surge = d.first ? d.surge : d.surge * Math.exp(-delta * 1.6)
    d.first = false

    const breath = 0.5 + 0.5 * Math.sin(d.t * 1.35)
    const surge = d.surge

    uniforms.backdrop.uTime.value = d.t
    uniforms.backdrop.uEnergy.value = d.energy
    uniforms.vinyl.uTime.value = d.t
    uniforms.vinyl.uEnergy.value = d.energy
    uniforms.vinyl.uAccent.value.copy(d.connection > 0.5 ? MINT : GREEN)

    uniforms.wave.uTime.value = d.t
    uniforms.wave.uAmp.value = d.amp
    uniforms.wave.uScan.value = d.scan
    uniforms.wave.uOpacity.value = 0.55 + d.energy * 0.5

    uniforms.core.uTime.value = d.t
    uniforms.core.uAggregate.value = d.aggregate
    uniforms.core.uSpin.value = 0.5 + d.energy * 0.9
    uniforms.core.uOpacity.value = 0.6 + d.energy * 0.4

    uniforms.link.uTime.value = d.t
    uniforms.link.uConnection.value = d.connection

    uniforms.halo.uIntensity.value = 0.2 + d.energy * 0.32 + breath * 0.12 + surge * 0.4
    uniforms.leftOrb.uIntensity.value = 0.16 + d.connection * 0.4 + breath * 0.06
    uniforms.rightOrb.uIntensity.value = 0.16 + d.connection * 0.4 + breath * 0.06

    if (vinylRef.current) vinylRef.current.rotation.z += delta * (0.06 + d.energy * 0.24)
    if (coreGroupRef.current) coreGroupRef.current.rotation.z += delta * 0.05
    if (dustRef.current) {
      dustRef.current.rotation.z += delta * 0.012
      dustRef.current.position.y = Math.sin(d.t * 0.16) * 0.12
    }
    if (dustMaterialRef.current) dustMaterialRef.current.opacity = 0.22 + d.energy * 0.24
  })

  return (
    <>
      <color attach='background' args={['#020806']} />

      {/* 远景微光粒子 */}
      <group ref={dustRef}>
        <Points positions={dust} stride={3} frustumCulled={false}>
          <PointMaterial
            ref={(node) => {
              dustMaterialRef.current = node
            }}
            transparent
            color='#9dffd0'
            size={0.03}
            sizeAttenuation
            depthWrite={false}
            opacity={0.28}
            blending={THREE.AdditiveBlending}
          />
        </Points>
      </group>

      {/* 深黑绿演唱会背景 */}
      <mesh position={[0, 0, -4]} scale={[viewport.width * 1.9, viewport.height * 1.9, 1]}>
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          uniforms={uniforms.backdrop}
          vertexShader={UV_VERT}
          fragmentShader={BACKDROP_FRAG}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      <group scale={fit}>
        {/* 呼吸光 */}
        <GlowQuad uniforms={uniforms.halo} size={CORE_R * 5.2} position={[0, CORE_Y, -0.8]} />

        {/* 中央黑胶唱片 + 能量核心 */}
        <group ref={coreGroupRef} position={[0, CORE_Y, 0]}>
          <mesh ref={vinylRef} position={[0, 0, -0.32]}>
            <circleGeometry args={[CORE_R * 0.99, 96]} />
            <shaderMaterial
              uniforms={uniforms.vinyl}
              vertexShader={UV_VERT}
              fragmentShader={VINYL_FRAG}
            />
          </mesh>
          <points frustumCulled={false}>
            <bufferGeometry>
              <bufferAttribute attach='attributes-position' args={[core.positions, 3]} />
              <bufferAttribute attach='attributes-aSeed' args={[core.aSeed, 1]} />
              <bufferAttribute attach='attributes-aAngle' args={[core.aAngle, 1]} />
              <bufferAttribute attach='attributes-aRadius' args={[core.aRadius, 1]} />
              <bufferAttribute attach='attributes-aSize' args={[core.aSize, 1]} />
            </bufferGeometry>
            <shaderMaterial
              uniforms={uniforms.core}
              vertexShader={CORE_VERT}
              fragmentShader={CORE_FRAG}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
            />
          </points>
        </group>

        {/* 左绿右紫两条高密度声波 */}
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach='attributes-position' args={[waves.positions, 3]} count={waveCount} />
            <bufferAttribute attach='attributes-aSeed' args={[waves.aSeed, 1]} />
            <bufferAttribute attach='attributes-aRow' args={[waves.aRow, 1]} />
            <bufferAttribute attach='attributes-aCol' args={[waves.aCol, 1]} />
            <bufferAttribute attach='attributes-aSize' args={[waves.aSize, 1]} />
            <bufferAttribute attach='attributes-aSide' args={[waves.aSide, 1]} />
          </bufferGeometry>
          <shaderMaterial
            uniforms={uniforms.wave}
            vertexShader={WAVE_VERT}
            fragmentShader={GLOW_FRAG}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        {/* 两位用户之间的粒子连接 */}
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute attach='attributes-position' args={[link.positions, 3]} />
            <bufferAttribute attach='attributes-aT' args={[link.aT, 1]} />
            <bufferAttribute attach='attributes-aJitter' args={[link.aJitter, 1]} />
            <bufferAttribute attach='attributes-aSize' args={[link.aSize, 1]} />
          </bufferGeometry>
          <shaderMaterial
            uniforms={uniforms.link}
            vertexShader={LINK_VERT}
            fragmentShader={GLOW_FRAG}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </points>

        {/* 两位用户 */}
        <GlowQuad uniforms={uniforms.leftOrb} size={AVATAR_SIZE * 2.8} position={[-AVATAR_X, AVATAR_Y, -0.1]} />
        <GlowQuad uniforms={uniforms.rightOrb} size={AVATAR_SIZE * 2.8} position={[AVATAR_X, AVATAR_Y, -0.1]} />
        <AvatarOrb position={[-AVATAR_X, AVATAR_Y, 0]} size={AVATAR_SIZE} src={leftAvatar} name={leftName} from='#31f58a' to='#0d6b45' />
        <AvatarOrb position={[AVATAR_X, AVATAR_Y, 0]} size={AVATAR_SIZE} src={rightAvatar} name={rightName} from='#8b6cff' to='#2a1a5e' />
      </group>
    </>
  )
}

export default FrequencyParticleScene