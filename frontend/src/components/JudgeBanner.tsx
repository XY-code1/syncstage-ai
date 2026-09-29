import { useSession } from '../store/session'

/** 评委演示模式开启时的顶部提示条：会显示 Agent 的工具名、输入输出、耗时与 fallback 状态 */
export function JudgeBanner() {
  const { judgeMode, demoCase, dataMode } = useSession()
  if (!judgeMode) return null

  const caseLabel =
    demoCase === 'normal' ? '案例 1 · 正常匹配成功' : demoCase === 'safety_no_match' ? '案例 2 · 安全条件过滤后无匹配' : '案例 3 · 大模型不可用走 fallback'

  return (
    <div className='sticky top-0 z-40 border-b border-brand-500/25 bg-brand-800/85 px-4 py-1.5 backdrop-blur-xl'>
      <p className='text-center text-[10.5px] leading-snug text-brand-100'>
        评委演示模式 · {caseLabel} · 数据源：{dataMode === 'backend' ? '后端 Agent' : '前端本地镜像'}
      </p>
    </div>
  )
}