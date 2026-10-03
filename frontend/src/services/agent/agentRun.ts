import type { AgentState, AuthorizationScope, DemoCase, DemoScenario, ParsedIntent, ToolTrace } from '../../types'
import { runAgent } from '../../lib/agentMock'
import {
  AGENT_LIVE_RUN_TIMEOUT_MS,
  AGENT_RUN_TIMEOUT_MS,
  AgentRunAbortedError,
  AgentRunTimeoutError,
  type AgentProvider,
} from './agentTypes'
import { startLiveAgentSession } from './liveAgentProvider'
import { reconcileMusicBasis } from '../../lib/musicReconcile'

/**
 * Agent 任务编排的唯一入口。
 *
 * 这里集中处理所有"防无限循环"的硬约束，页面与 store 都不需要再各自实现一遍：
 * - 一次任务只有一个 runId，同一个 runId 不会被启动两次；
 * - 整体超时 10 秒，超时直接进 error，不自动重试；
 * - 每一步最多重试 1 次；
 * - 外部 AbortSignal 可随时取消，取消后不再产生任何 onStep。
 */

export interface AgentTaskOptions {
  runId: string
  provider: AgentProvider
  eventId: string
  userId: string
  text: string
  scopes: AuthorizationScope[]
  demoCase: DemoCase
  scenario: DemoScenario
  intent: ParsedIntent | null
  signal: AbortSignal
  onStep?: (step: ToolTrace) => void
}

/** live 模式下回放后端真实轨迹的时间间隔：只为让进度页可读，不代表模型耗时。 */
const LIVE_STEP_PACE_MS = 180

export function newAgentRunId(): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(16).slice(2, 10) + Date.now().toString(16)
  return `run-${random}`
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new AgentRunAbortedError('本次运行已取消'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new AgentRunAbortedError('本次运行已取消'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

async function runLiveTask(options: AgentTaskOptions, signal: AbortSignal): Promise<AgentState> {
  // live 模式下这一次请求就是真实的大模型调用；失败会抛出带原因的错误。
  const session = await startLiveAgentSession({
    runId: options.runId,
    eventId: options.eventId,
    userId: options.userId,
    text: options.text,
    scopes: options.scopes,
    demoCase: options.demoCase,
    intent: options.intent,
  })
  // 逐条回放后端真实工具轨迹，让进度页有可读的节奏（数据全部来自后端，不是本地编造）
  for (const step of session.trace) {
    if (signal.aborted) throw new AgentRunAbortedError('本次运行已取消')
    options.onStep?.(step)
    await sleep(LIVE_STEP_PACE_MS, signal)
  }
  return session
}

async function runMockTask(options: AgentTaskOptions, signal: AbortSignal): Promise<AgentState> {
  return runAgent({
    eventId: options.eventId,
    userId: options.userId,
    text: options.text,
    scopes: options.scopes,
    demoCase: options.demoCase,
    scenario: options.scenario,
    intentOverride: options.intent,
    provider: options.provider,
    runId: options.runId,
    signal,
    deadline: Date.now() + AGENT_RUN_TIMEOUT_MS,
    onStep: options.onStep,
  })
}

export async function runAgentTask(options: AgentTaskOptions): Promise<AgentState> {
  // mock 流程固定 10 秒收尾；live 要真的等模型，预算放宽到 45 秒，但同样有界。
  const budgetMs = options.provider.mode === 'mock' ? AGENT_RUN_TIMEOUT_MS : AGENT_LIVE_RUN_TIMEOUT_MS
  const controller = new AbortController()
  let timedOut = false
  const onExternalAbort = () => controller.abort()
  options.signal.addEventListener('abort', onExternalAbort, { once: true })
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, budgetMs)

  try {
    const state = await (options.provider.mode === 'mock'
      ? runMockTask(options, controller.signal)
      : runLiveTask(options, controller.signal))
    // 音乐侧事实统一用官方参考歌单的本地演示数据对齐（见 lib/musicReconcile.ts）
    return reconcileMusicBasis(state)
  } catch (error) {
    if (timedOut) {
      throw new AgentRunTimeoutError('Agent 运行超过 ' + Math.round(budgetMs / 1000) + ' 秒仍未结束，已自动中止；没有拿到结果，请重新运行')
    }
    if (options.signal.aborted) {
      throw new AgentRunAbortedError('本次运行已取消')
    }
    throw error
  } finally {
    clearTimeout(timer)
    options.signal.removeEventListener('abort', onExternalAbort)
  }
}
