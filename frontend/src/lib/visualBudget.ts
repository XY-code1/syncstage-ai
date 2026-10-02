import { useEffect, useMemo, useState } from 'react'

/**
 * 视觉预算：统一决定"这一台设备能跑多少装饰性动效"。
 *
 * - prefers-reduced-motion：用户明确要求减少动态效果 → 关闭轨迹流动、旋转与粒子，
 *   只保留"状态变化"本身（位置/颜色仍然会切换到新状态，只是不做动画）。
 * - 低性能设备（核心数 / 内存偏低）：自动减少粒子与模糊，保证主链路流畅。
 *
 * 只影响装饰性动效，不影响任何数据与业务状态。
 */
export interface VisualBudget {
  /** 系统开启了"减少动态效果" */
  reduced: boolean
  /** 低端机（核心数或内存偏低） */
  lowPower: boolean
  /** 是否渲染粒子、模糊等高成本装饰 */
  particles: boolean
  /** 是否允许装饰性动画（流动 / 旋转 / 浮动） */
  motion: boolean
  /** 挂在场景根节点上的类名：低端机走静态样式 */
  rootClassName: string
}

function readLowPower(): boolean {
  if (typeof navigator === 'undefined') return false
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8
  const memory = typeof (navigator as Navigator & { deviceMemory?: number }).deviceMemory === 'number'
    ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
    : 8
  return cores <= 4 || memory <= 4
}

export function useVisualBudget(): VisualBudget {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return useMemo(() => {
    const lowPower = readLowPower()
    const motion = !reduced && !lowPower
    return {
      reduced,
      lowPower,
      particles: motion,
      motion,
      rootClassName: lowPower ? 'budget-low' : reduced ? 'budget-reduced' : '',
    }
  }, [reduced])
}