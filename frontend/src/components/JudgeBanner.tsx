import { useEffect, useRef } from 'react'
import { useSession } from '../store/session'

/** 评委演示模式开启时的顶部提示条：会显示 Agent 的工具名、输入输出、耗时与 fallback 状态 */
export function JudgeBanner() {
  const { judgeMode, demoCase, dataMode } = useSession()
  const ref = useRef<HTMLDivElement>(null)

  // 提示条占文档流高度：把实测高度写进 --judge-banner-h，满屏页面才能正好让位（见 index.css）
  useEffect(() => {
    const root = document.documentElement
    if (!judgeMode) {
      root.style.removeProperty('--judge-banner-h')
      return undefined
    }
    const el = ref.current
    const sync = () => root.style.setProperty('--judge-banner-h', (el ? el.offsetHeight : 0) + 'px')
    sync()
    if (typeof ResizeObserver === 'undefined') {
      return () => root.style.removeProperty('--judge-banner-h')
    }
    const observer = new ResizeObserver(sync)
    if (el) observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--judge-banner-h')
    }
  }, [judgeMode, demoCase, dataMode])

  if (!judgeMode) return null

  const caseLabel =
    demoCase === 'normal' ? '案例 1 · 正常匹配成功' : demoCase === 'safety_no_match' ? '案例 2 · 安全条件过滤后无匹配' : '案例 3 · 大模型不可用走 fallback'

  return (
    <div
      ref={ref}
      className='sticky top-0 z-40 border-b border-brand-500/25 bg-brand-800/85 px-4 py-1.5 backdrop-blur-xl'
    >
      <p className='text-center text-[10.5px] leading-snug text-brand-100'>
        评委演示模式 · {caseLabel} · 数据源：{dataMode === 'backend' ? '后端 Agent' : '前端本地镜像'}
      </p>
    </div>
  )
}
