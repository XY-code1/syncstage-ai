// 数据访问层：
// - 默认 auto 模式：能连上后端 Agent 就用后端（真实工具调用 + 真实轨迹），
//   连不上就自动回退到前端本地镜像链路，保证断网也能完整演示。
// - VITE_USE_MOCK_API=true / false 可强制指定。
import { demoConcerts, demoUsers } from '../data/demoData'
import type {
  AgentState,
  AuthorizationScope,
  Concert,
  DemoScenario,
  DemoUser,
  MemoryCardData,
  MusicProfile,
  ParsedIntent,
  ProviderInfo,
  RoomState,
  RoomTask,
} from '../types'
import { createRoomState, feedbackState, inviteState, peerConfirmState } from './agentMock'
import { getAgentProvider, readAgentMode } from '../services/agent/agentProvider'
import { AgentNotConfiguredError } from '../services/agent/agentTypes'
import { probeLiveAvailability } from '../services/agent/liveAgentProvider'
import { buildMemoryCard } from './content'
import { API_BASE, ApiError, apiRequest, fetchAiStatus } from './http'
import { MOCK_DISCLAIMER, PROVIDER_INFO, getMusicProfile } from './tmeMock'

// HTTP 层（fetch + 超时 + 错误归一化）已抽到 ./http，这里只做转发，
// 避免 services/agent 与本文件互相 import 形成循环依赖。
export { API_BASE, ApiError, apiRequest, fetchAiStatus }
export type { ApiErrorOptions, AiStatus, RequestOptions } from './http'

const FORCED_MODE = import.meta.env.VITE_USE_MOCK_API

let scenario: DemoScenario = 'normal'
let resolvedMode: 'mock' | 'backend' | null = FORCED_MODE === 'true' ? 'mock' : FORCED_MODE === 'false' ? 'backend' : null

export function setDemoScenario(next: DemoScenario): void {
  scenario = next
}

export function getDemoScenario(): DemoScenario {
  return scenario
}

export function getDataMode(): 'mock' | 'backend' | 'probing' {
  return resolvedMode ?? 'probing'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** 探测后端是否可用（只探一次，结果缓存） */
export async function resolveDataMode(): Promise<'mock' | 'backend'> {
  if (resolvedMode) return resolvedMode
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const response = await fetch(API_BASE + '/api/health', { signal: controller.signal })
    clearTimeout(timer)
    resolvedMode = response.ok ? 'backend' : 'mock'
  } catch {
    resolvedMode = 'mock'
  }
  return resolvedMode
}

const request = apiRequest

// ---------------------------------------------------------------------------
// 演出与音乐数据
// ---------------------------------------------------------------------------

export async function fetchConcerts(): Promise<Concert[]> {
  if ((await resolveDataMode()) === 'backend') {
    const data = await request<{ items: Concert[] }>('/api/concerts')
    return data.items
  }
  await delay(240)
  return demoConcerts
}

export async function fetchConcert(concertId: string): Promise<Concert> {
  if ((await resolveDataMode()) === 'backend') return request<Concert>('/api/concerts/' + concertId)
  await delay(260)
  const concert = demoConcerts.find((item) => item.id === concertId)
  if (!concert) throw new ApiError('这场演出暂时找不到了', 'NOT_FOUND')
  return concert
}

export async function fetchProviderInfo(): Promise<ProviderInfo> {
  if ((await resolveDataMode()) === 'backend') {
    try {
      return await request<ProviderInfo>('/api/agent/provider')
    } catch {
      return PROVIDER_INFO
    }
  }
  return { ...PROVIDER_INFO, notice: MOCK_DISCLAIMER }
}

export function fetchLocalMusicProfile(userId: string, scopes: AuthorizationScope[]): MusicProfile | null {
  return getMusicProfile(userId, scopes)
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface ParseIntentResult {
  parsedIntent: ParsedIntent | null
  usedFallback: boolean
  provider: ProviderInfo
}

export async function parseIntentRequest(args: {
  text: string
  eventId: string
  scopes: AuthorizationScope[]
  userId: string
}): Promise<ParseIntentResult> {
  // 意图解析同样只走统一适配层：mock 用本地规则，live 调后端（后端再调大模型）。
  const provider = getAgentProvider(readAgentMode())
  if (provider.mode === 'live') {
    const availability = await probeLiveAvailability()
    if (!availability.ok) throw new AgentNotConfiguredError(availability.reason)
  }
  const parsedIntent = await provider.parseIntent({
    text: args.text,
    eventId: args.eventId,
    userId: args.userId,
    scopes: args.scopes,
    intent: null,
  })
  return {
    parsedIntent,
    usedFallback: provider.isDemo,
    provider: provider.isDemo ? { ...PROVIDER_INFO, notice: MOCK_DISCLAIMER } : { ...PROVIDER_INFO, isDemo: false, notice: provider.notice },
  }
}

/**
 * Agent 运行时的数据通道。由运行模式决定，不由"后端是否在线"决定：
 * mock 模式下所有确认/建房都走本地状态，绝不偷偷请求后端（也就不可能调用大模型）。
 */
export type AgentTransport = 'mock' | 'backend'

export async function inviteAgent(state: AgentState, candidateId: string, transport: AgentTransport): Promise<AgentState> {
  if (transport === 'backend') {
    return request<AgentState>(`/api/agent/sessions/${state.sessionId}/invite`, {
      method: 'POST',
      body: { candidateId },
    })
  }
  await delay(scenario === 'slow' ? 1800 : 620)
  return inviteState(state, candidateId)
}

export async function peerConfirmAgent(state: AgentState, accept: boolean, transport: AgentTransport): Promise<AgentState> {
  if (transport === 'backend') {
    return request<AgentState>(`/api/agent/sessions/${state.sessionId}/peer-confirm`, {
      method: 'POST',
      body: { accept },
    })
  }
  await delay(scenario === 'slow' ? 2200 : 900)
  return peerConfirmState(state, accept)
}

export interface CreateRoomResult {
  state: AgentState
  room: RoomState | null
}

export async function createRoomAgent(state: AgentState, transport: AgentTransport): Promise<CreateRoomResult> {
  if (transport === 'backend') {
    const next = await request<AgentState>(`/api/agent/sessions/${state.sessionId}/room`, { method: 'POST' })
    return { state: next, room: (next.room as unknown as RoomState) ?? null }
  }
  await delay(scenario === 'slow' ? 1600 : 520)
  const outcome = createRoomState(state)
  return { state: outcome.state, room: outcome.room }
}

export async function feedbackAgent(state: AgentState, rating: string, tags: string[], comment: string, transport: AgentTransport): Promise<AgentState> {
  if (transport === 'backend') {
    return request<AgentState>(`/api/agent/sessions/${state.sessionId}/feedback`, {
      method: 'POST',
      body: { rating, tags, comment },
    })
  }
  await delay(240)
  return feedbackState(state, rating, tags, comment)
}

// ---------------------------------------------------------------------------
// 房间任务 / 回忆卡 / 举报
// ---------------------------------------------------------------------------

export async function fetchRoomTasks(concertId: string): Promise<RoomTask[]> {
  if ((await resolveDataMode()) === 'backend') return request<RoomTask[]>('/api/concerts/' + concertId + '/room-tasks')
  await delay(200)
  const { buildRoomTasks } = await import('./content')
  const concert = demoConcerts.find((item) => item.id === concertId)
  if (!concert) throw new ApiError('找不到这场演出', 'NOT_FOUND')
  return buildRoomTasks(concert)
}

export async function fetchMemoryCard(args: {
  concertId: string
  partnerId: string | null
  companionIds: string[]
  sharedSongs: string[]
}): Promise<MemoryCardData> {
  const { concertId, partnerId, companionIds, sharedSongs } = args
  if ((await resolveDataMode()) === 'backend') {
    return request<MemoryCardData>('/api/concerts/' + concertId + '/memory-card', {
      method: 'POST',
      body: { prefs: {}, partnerId, companionIds, sharedSongs },
    })
  }
  await delay(scenario === 'slow' ? 2200 : 900)
  const concert = demoConcerts.find((item) => item.id === concertId)
  if (!concert) throw new ApiError('找不到这场演出', 'NOT_FOUND')
  const partner = demoUsers.find((user) => user.id === partnerId) ?? null
  const companions = companionIds
    .map((id) => demoUsers.find((user) => user.id === id))
    .filter((user): user is DemoUser => Boolean(user))
  return buildMemoryCard({
    concert,
    prefs: {
      likedSongs: [],
      likedArtists: [],
      expectedTracks: [],
      story: '',
      purposes: [],
      chatStyle: '温和慢热',
      groupSize: 3,
      safety: [],
      myGender: 'prefer-not-to-say',
    },
    partner,
    companions,
    sharedSongs,
  })
}

export async function submitReport(reason: string, userId: string | null): Promise<{ ok: true }> {
  if ((await resolveDataMode()) === 'backend') {
    await request<{ id: number }>('/api/reports', { method: 'POST', body: { reason, targetUserId: userId } })
    return { ok: true }
  }
  await delay(600)
  void reason
  void userId
  return { ok: true }
}

// ---------------------------------------------------------------------------
// 真实大模型对话（ChatRoom）
// 注意：这里不做任何 mock 回退。后端不可用或模型失败时必须抛错，由 UI 展示失败原因。
// ---------------------------------------------------------------------------

export interface ChatSuggestion {
  title: string
  place: string
  time: string
  note: string
}

export interface AgentChatReply {
  reply: string
  suggestion: ChatSuggestion | null
  source: 'model' | 'demo-fallback'
  agentName: string
  model: string
  elapsedMs: number
  finishReason: string
  requestId: string
  parseWarning: string | null
  fallbackReason?: string
  usage?: Record<string, number | null>
}

export interface AgentChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface AgentChatRequestInput {
  threadId: string
  threadKind: 'agent' | 'group' | 'dm' | 'system'
  concertId: string
  roomId?: string | null
  peerName?: string | null
  messages: AgentChatTurn[]
}

/** 真实大模型对话：超时给足 90 秒，失败会抛出带 code / hint 的 ApiError。 */
export async function sendAgentChat(payload: AgentChatRequestInput): Promise<AgentChatReply> {
  // 开发环境打印完整链路，便于对照后端 [llm:chat] 日志定位问题：
  // 前端发出 -> 后端 -> 大模型 -> 返回（source 必须是 model，绝不是本地模板）。
  if (import.meta.env.DEV) {
    console.info(
      `[agent-chat] → ${API_BASE}/api/agent/chat kind=${payload.threadKind} concert=${payload.concertId}`
        + ` room=${payload.roomId ?? '-'} messages=${payload.messages.length}`,
    )
  }
  const startedAt = Date.now()
  try {
    const reply = await request<AgentChatReply>('/api/agent/chat', { method: 'POST', body: payload, timeoutMs: 90000 })
    if (import.meta.env.DEV) {
      console.info(
        `[agent-chat] ← source=${reply.source} model=${reply.model} elapsedMs=${reply.elapsedMs}`
          + ` requestId=${reply.requestId} chars=${reply.reply.length} parseWarning=${reply.parseWarning ?? '-'}`,
      )
    }
    return reply
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn(
        `[agent-chat] ✗ waitedMs=${Date.now() - startedAt} code=${error instanceof ApiError ? error.code : 'UNKNOWN'}`
          + ` status=${error instanceof ApiError ? error.status : null}`
          + ` message=${error instanceof Error ? error.message : String(error)}`
          + ` hint=${error instanceof ApiError ? error.hint : ''}`
          + ` detail=${error instanceof ApiError ? error.detail : ''}`,
      )
    }
    throw error
  }
}

