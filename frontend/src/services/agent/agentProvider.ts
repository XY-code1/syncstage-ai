import type { AgentMode, AgentProvider } from './agentTypes'
import { liveAgentProvider } from './liveAgentProvider'
import { mockAgentProvider } from './mockAgentProvider'

/**
 * 根据环境变量与本地覆盖选择 Agent Provider。
 *
 * - VITE_AGENT_MODE=mock（默认）：Demo 模拟 Agent，不访问任何大模型 API
 * - VITE_AGENT_MODE=live        ：真实模型 Agent，未配置时由调用方展示「尚未配置大模型服务」
 *
 * 运行期允许用「切换 Demo 模式」按钮写入本地覆盖（localStorage），
 * 便于现场演示时从 live 退回 mock，而不需要重新构建。
 */
const ENV_MODE = String(import.meta.env.VITE_AGENT_MODE ?? '').trim().toLowerCase()
export const DEFAULT_AGENT_MODE: AgentMode = ENV_MODE === 'live' ? 'live' : 'mock'

const MODE_KEY = 'sfl.agentMode.v1'

export const AGENT_MODE_LABEL: Record<AgentMode, string> = {
  mock: 'Demo 模拟 Agent',
  live: '真实模型 Agent',
}

/** live 模式下"没有可用模型"的统一文案：只有这一种解释，绝不静默回退到 mock。 */
export const AGENT_NOT_CONFIGURED_TITLE = '尚未配置大模型服务'

const UNAVAILABLE_REASONS: Record<string, string> = {
  no_api_key: '后端没有配置 API Key（backend/.env 的 LLM_API_KEY），无法调用大模型',
  no_model: '后端没有配置模型名（backend/.env 的 LLM_MODEL）',
  forbidden: '后端显式关闭了大模型（AI_FORCE_FALLBACK）',
  agent_mode_mock: '后端 AGENT_MODE=mock，没有开启真实模型模式',
  agent_mode_not_live: '后端 AGENT_MODE=mock，没有开启真实模型模式',
  LLM_NOT_CONFIGURED: '后端没有可用的模型配置，无法进入真实模型模式',
  backend_unreachable: '连不上后端服务，无法确认模型配置',
  no_session: '真实模型会话尚未开始',
}

export function describeAgentUnavailable(reason: string): string {
  return UNAVAILABLE_REASONS[reason] ?? '没有检测到可用的大模型配置'
}

export function isAgentMode(value: unknown): value is AgentMode {
  return value === 'mock' || value === 'live'
}

export function readAgentMode(): AgentMode {
  if (typeof window === 'undefined') return DEFAULT_AGENT_MODE
  try {
    const raw = window.localStorage.getItem(MODE_KEY)
    return isAgentMode(raw) ? raw : DEFAULT_AGENT_MODE
  } catch {
    return DEFAULT_AGENT_MODE
  }
}

export function writeAgentMode(mode: AgentMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(MODE_KEY, mode)
  } catch {
    // 存储不可用时仅影响本次会话，忽略即可
  }
}

export function clearAgentModeOverride(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(MODE_KEY)
  } catch {
    // 忽略
  }
}

export function getAgentProvider(mode: AgentMode = readAgentMode()): AgentProvider {
  return mode === 'live' ? liveAgentProvider : mockAgentProvider
}
