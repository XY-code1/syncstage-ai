import type { AgentState, AuthorizationScope, CandidateFacts, DemoCase, ExcludedCandidate, MusicProfile, ParsedIntent } from '../../types'
import { ApiError, apiRequest, fetchAiStatus } from '../../lib/http'
import { ALL_SCOPES, candidateFacts } from '../../lib/tmeMock'
import {
  AgentNotConfiguredError,
  type AgentProvider,
  type BuildMusicProfileInput,
  type IcebreakerContext,
  type NegotiateCandidateInput,
  type NegotiationResult,
  type ParseIntentInput,
  type SearchCandidatesCriteria,
} from './agentTypes'

/**
 * 真实模型 Agent。
 *
 * 关键约束：
 * - API Key 只存在后端环境变量里，前端只调用自家后端接口，绝不直连任何大模型；
 * - 未配置模型时（/api/ai/status.enabled=false 或后端不是 AGENT_MODE=live）直接抛
 *   AgentNotConfiguredError，页面展示「尚未配置大模型服务」并提供切换到 Demo 模式，
 *   绝不静默回退、也绝不无限等待；
 * - 一次任务只创建一个后端会话，不轮询、不自动重试。
 */

export const LIVE_AGENT_LABEL = '真实模型 Agent'
export const LIVE_AGENT_NOTICE = '由后端调用已配置的大模型生成，失败会明确报错'

/** live 模式下与模型/会话相关的请求超时（整体预算由 runAgentTask 控制）。 */
const LIVE_REQUEST_TIMEOUT_MS = 9000

/** 最近一次 live 会话。那些"由后端会话内部完成"的步骤从这里读真实数据。 */
let lastSession: AgentState | null = null

export function rememberLiveSession(state: AgentState | null): void {
  lastSession = state
}

export function getLiveSession(): AgentState | null {
  return lastSession
}

function requireSession(): AgentState {
  if (!lastSession) {
    throw new AgentNotConfiguredError('no_session', '真实模型会话尚未开始')
  }
  return lastSession
}

export interface LiveSessionArgs {
  eventId: string
  userId: string
  text: string
  scopes: AuthorizationScope[]
  demoCase: DemoCase
  intent: ParsedIntent | null
  /** 本次任务唯一的 runId（由 runAgentTask 生成）；后端据此拒绝重复启动。 */
  runId: string
}

/** POST /api/agent/run 的响应：runId + 真实 AgentState + 模型使用情况。 */
interface LiveRunResponse {
  runId: string
  status: 'running' | 'done' | 'error'
  mode: string
  provider: { name: string; model: string; configured: boolean; isMock: boolean }
  state: AgentState
  llm?: Record<string, unknown>
  error?: { code?: string; message?: string; hint?: string }
}

/** 后端如果还在跑（当前实现是同步返回），最多读 5 次就停，绝不无限轮询。 */
const MAX_RUN_POLLS = 5
const RUN_POLL_INTERVAL_MS = 400

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 建立一次真实模型运行：后端拿到需求后调用大模型完成整条流水线，
 * 返回带真实 trace 的 AgentState。这是 live 模式下唯一会触达模型的一次请求。
 */
export async function startLiveAgentSession(args: LiveSessionArgs): Promise<AgentState> {
  try {
    let payload = await apiRequest<LiveRunResponse>('/api/agent/run', {
      method: 'POST',
      timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
      body: {
        runId: args.runId,
        eventId: args.eventId,
        userId: args.userId,
        text: args.text,
        authorizedScopes: args.scopes,
        parsedIntent: args.intent,
        demoCase: args.demoCase,
      },
    })
    // 后端是同步跑完整条流水线的；万一将来改成异步，这里也只在有限的次数内取结果
    for (let attempt = 0; payload.status === 'running' && attempt < MAX_RUN_POLLS; attempt += 1) {
      await delay(RUN_POLL_INTERVAL_MS)
      payload = await apiRequest<LiveRunResponse>('/api/agent/runs/' + encodeURIComponent(payload.runId), {
        timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
      })
    }
    if (payload.status === 'error' || !payload.state) {
      const info = payload.error ?? {}
      throw new ApiError(info.message || 'Agent 运行失败', info.code || 'LLM', { hint: info.hint })
    }
    rememberLiveSession(payload.state)
    return payload.state
  } catch (error) {
    if (error instanceof AgentNotConfiguredError) throw error
    // 后端不可用 / 模型报错都要如实抛出，由页面显示失败原因
    throw error
  }
}

export const liveAgentProvider: AgentProvider = {
  mode: 'live',
  label: LIVE_AGENT_LABEL,
  isDemo: false,
  notice: LIVE_AGENT_NOTICE,

  async parseIntent(input: ParseIntentInput): Promise<ParsedIntent> {
    const data = await apiRequest<{ parsedIntent: ParsedIntent | null; source?: string }>('/api/agent/parse-intent', {
      method: 'POST',
      body: { text: input.text, eventId: input.eventId, userId: input.userId, authorizedScopes: input.scopes },
      timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
    })
    if (!data.parsedIntent) {
      // 后端解析失败时必须报错，不能假装解析成功了
      throw new ApiError('大模型没有返回可用的意图解析结果', 'LLM_EMPTY')
    }
    return data.parsedIntent
  },

  async buildMusicProfile(_input: BuildMusicProfileInput): Promise<MusicProfile | null> {
    // 真实画像由后端在会话内按授权范围组装，这里回读会话结果
    return requireSession().musicProfile
  },

  async searchCandidates(_criteria: SearchCandidatesCriteria): Promise<CandidateFacts[]> {
    const session = requireSession()
    return session.candidateIds
      .map((id) => candidateFacts(id, ALL_SCOPES))
      .filter((item): item is CandidateFacts => Boolean(item))
  },

  async filterBySafety(input: {
    viewer: CandidateFacts
    intent: ParsedIntent
    candidates: CandidateFacts[]
    eventId: string
  }): Promise<{ kept: CandidateFacts[]; excluded: ExcludedCandidate[] }> {
    const session = requireSession()
    const excludedIds = new Set(session.excludedCandidates.map((item) => item.userId))
    return {
      kept: input.candidates.filter((item) => !excludedIds.has(item.userId)),
      excluded: session.excludedCandidates,
    }
  },

  async negotiateCandidate(input: NegotiateCandidateInput): Promise<NegotiationResult> {
    const session = requireSession()
    const report = session.handshakeReports?.[input.candidate.userId]
    if (!report) {
      throw new ApiError('后端没有返回这位候选人的结构化协商结果', 'LLM_EMPTY')
    }
    return {
      sharedSongs: input.candidate.favoriteTitles.filter((title) => input.viewer.favoriteTitles.includes(title)),
      exchangedFields: report.exchangedFields,
      hiddenFields: report.hiddenFields,
      note: report.agreements.join('；'),
    }
  },

  async generateIcebreakers(context: IcebreakerContext): Promise<string[]> {
    const data = await apiRequest<{ questions: string[] }>(`/api/concerts/${context.concertId}/icebreakers`, {
      method: 'POST',
      body: { prefs: {}, sharedSongs: context.sharedSongs },
      timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
    })
    return data.questions ?? []
  },
}

/**
 * live 是否可用：以后端 /api/ai/status 的真实探测为准。
 * 探测失败、模型未配置、或后端本身没开 AGENT_MODE=live 都一律视为不可用。
 */
export async function probeLiveAvailability(): Promise<{ ok: boolean; reason: string }> {
  try {
    const status = await fetchAiStatus()
    if (status.agentMode && status.agentMode !== 'live') {
      return { ok: false, reason: 'agent_mode_mock' }
    }
    // 有网关状态就以网关为准（mode / provider / model / configured 都由后端给出）
    if (status.llm) {
      return { ok: status.llm.configured, reason: status.llm.configured ? 'ready' : status.llm.reason }
    }
    return { ok: status.enabled, reason: status.enabled ? 'ready' : status.reason }
  } catch {
    return { ok: false, reason: 'backend_unreachable' }
  }
}
