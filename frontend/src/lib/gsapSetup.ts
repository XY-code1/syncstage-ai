import gsap from 'gsap'
import { useGSAP } from '@gsap/react'

/**
 * 统一的 GSAP 入口：插件注册与全局生命周期只在这里做一次，组件里不要各自 registerPlugin。
 *
 * 分工（与视觉实现约定一致）：
 * - React 负责页面结构，CSS / SVG 负责黑胶、票根、环形轨道与声波的静态外形；
 * - GSAP 只负责「连续动效」：黑胶缓慢旋转、声波流动、头像沿轨道靠近、匹配阶段过渡、揭晓动效；
 * - 匹配阶段动效全部由真实 Agent 状态（stage / progress）驱动，不存在按时间伪造进度的补间。
 *
 * 三条硬约束：
 * 1. prefers-reduced-motion：所有补间挂在 MOTION_OK 分支，减少动效时只把元素直接设为结束状态；
 * 2. 页面不可见 / 失焦：暂停整条 globalTimeline，回到前台再恢复（不改任何业务状态）；
 * 3. 全部动效只碰 transform / opacity / autoAlpha 与描边，不逐帧改 left / width 等布局属性。
 */
gsap.registerPlugin(useGSAP)

/** 允许跑补间的媒体条件。 */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)'
/** 用户要求减少动态效果。 */
export const MOTION_REDUCE = '(prefers-reduced-motion: reduce)'

/** 缓动与时长常量：三页共用同一套，避免各写各的手感。 */
export const MOTION = {
  approach: 0.82,
  approachEase: 'power3.out',
  flow: 1.8,
  vinyl: 7,
  vinylFast: 2.4,
  reveal: 0.52,
  flash: 0.92,
} as const

let lifecycleInstalled = false
let paused = false

function pauseAll(): void {
  if (paused) return
  paused = true
  gsap.globalTimeline.pause()
  // 仍由 CSS 驱动的装饰动画（粒子、呼吸、雷达）也一起停，见 index.css 的 html[data-motion-paused]
  if (typeof document !== 'undefined') document.documentElement.dataset.motionPaused = '1'
}

function resumeAll(): void {
  if (!paused) return
  paused = false
  gsap.globalTimeline.resume()
  if (typeof document !== 'undefined') delete document.documentElement.dataset.motionPaused
}

function installMotionLifecycle(): void {
  if (lifecycleInstalled || typeof window === 'undefined' || typeof document === 'undefined') return
  lifecycleInstalled = true
  // 切标签 / 切应用：整页不可见时停掉所有补间，回来再继续
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseAll()
    else resumeAll()
  })
  // 窗口失焦（点到别的窗口、被遮挡）：同样停掉，重新聚焦再继续
  window.addEventListener('blur', pauseAll)
  window.addEventListener('focus', resumeAll)
}

installMotionLifecycle()

export { gsap, useGSAP }