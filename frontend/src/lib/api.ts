// 数据访问层：
// - 默认 auto 模式：能连上后端 Agent 就用后端（真实工具调用 + 真实轨迹），
//   连不上就自动回退到前端本地镜像链路，保证断网也能完整演示。
// - VITE_USE_MOCK_API=true / false 可强制指定。
import { demoConcerts, demoUsers } from '../data/demoData'
import type {
  AgentState,
  AuthorizationScope,
  Concert,
  DemoCase,
  DemoScenario,
  DemoUser,
  MemoryCardData,
  MusicProfile,
  ParsedIntent,
  ProviderInfo,
  RoomState,
  RoomTask,
} from '../types'
import { createRoomState, feedbackState, inviteState, peerConfirmState, runAgent } from './agentMock'
import { buildMemoryCard } from './content'
import { MOCK_DISCLAIMER, PROVIDER_INFO, getMusicProfile } from './tmeMock'

export class ApiError extends Error {
  code: string

  constructor(message: string, code = 'UNKNOWN') {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

const FORCED_MODE = import.meta.env.VITE_USE_MOCK_API
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000'

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

interface RequestOptions {
  method?: 'GET' | 'POST'
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options
  try {
    const response = await fetch(API_BASE + path, {
      method,
      headers: body ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!response.ok) {
      const detail = await response.json().catch(() => null)
      const message = (detail && typeof detail.detail === 'string' && detail.detail) || '后端返回了 ' + response.status
      throw new ApiError(message, 'HTTP')
    }
    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError('无法连接后端服务，请确认后端已启动', 'NETWORK')
  }
}

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
  const mode = await resolveDataMode()
  if (mode === 'backend') {
    const data = await request<{ parsedIntent: ParsedIntent; usedFallback: boolean; provider: ProviderInfo }>(
      '/api/agent/intent/parse',
      {
        method: 'POST',
        body: { text: args.text, eventId: args.eventId, userId: args.userId, authorizedScopes: args.scopes },
      },
    )
    return { parsedIntent: data.parsedIntent, usedFallback: data.usedFallback, provider: data.provider }
  }

  await delay(420)
  const { ruleParseIntent } = await import('./agentMock')
  const profile = getMusicProfile(args.userId, args.scopes)
  const parsed = ruleParseIntent(args.text, args.eventId, profile?.gender ?? 'prefer-not-to-say', profile?.ageBand ?? '')
  return { parsedIntent: parsed, usedFallback: true, provider: PROVIDER_INFO }
}

export async function startAgent(args: {
  text: string
  eventId: string
  userId: string
  scopes: AuthorizationScope[]
  demoCase: DemoCase
  parsedIntent: ParsedIntent | null
  onStep?: (step: AgentState['trace'][number]) => void
}): Promise<AgentState> {
  const mode = await resolveDataMode()
  if (mode === 'backend') {
    // 「页面状态」是演示控制台的表现层开关：即使连上了后端 Agent，
    // 也要能演示弱网与异常，方便评审现场切换状态。
    if (scenario === 'error') {
      await delay(700)
      throw new ApiError('连接 Agent 服务超时（演示：网络异常）', 'NETWORK')
    }
    if (scenario === 'slow') await delay(2400)
    const state = await request<AgentState>('/api/agent/sessions', {
      method: 'POST',
      body: {
        eventId: args.eventId,
        userId: args.userId,
        text: args.text,
        authorizedScopes: args.scopes,
        parsedIntent: args.parsedIntent,
        demoCase: args.demoCase,
      },
    })
    args.onStep?.(state.trace[state.trace.length - 1])
    return state
  }

  try {
    return await runAgent({
      eventId: args.eventId,
      userId: args.userId,
      text: args.text,
      scopes: args.scopes,
      demoCase: args.demoCase,
      scenario,
      intentOverride: args.parsedIntent,
      onStep: args.onStep,
    })
  } catch (error) {
    throw error instanceof ApiError ? error : new ApiError('Agent 执行失败，请稍后重试', 'AGENT')
  }
}

export async function inviteAgent(state: AgentState, candidateId: string): Promise<AgentState> {
  if ((await resolveDataMode()) === 'backend') {
    return request<AgentState>(`/api/agent/sessions/${state.sessionId}/invite`, {
      method: 'POST',
      body: { candidateId },
    })
  }
  await delay(scenario === 'slow' ? 1800 : 620)
  return inviteState(state, candidateId)
}

export async function peerConfirmAgent(state: AgentState, accept: boolean): Promise<AgentState> {
  if ((await resolveDataMode()) === 'backend') {
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

export async function createRoomAgent(state: AgentState): Promise<CreateRoomResult> {
  if ((await resolveDataMode()) === 'backend') {
    const next = await request<AgentState>(`/api/agent/sessions/${state.sessionId}/room`, { method: 'POST' })
    return { state: next, room: (next.room as unknown as RoomState) ?? null }
  }
  await delay(scenario === 'slow' ? 1600 : 520)
  const outcome = createRoomState(state)
  return { state: outcome.state, room: outcome.room }
}

export async function feedbackAgent(state: AgentState, rating: string, tags: string[], comment: string): Promise<AgentState> {
  if ((await resolveDataMode()) === 'backend') {
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