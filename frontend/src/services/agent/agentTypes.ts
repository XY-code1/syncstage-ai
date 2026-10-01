import type {
  AgentState,
  AuthorizationScope,
  CandidateFacts,
  ExcludedCandidate,
  MusicProfile,
  ParsedIntent,
} from '../../types'

/**
 * Agent 运行模式。
 *
 * - mock：初赛 Demo 默认。只用本地 JSON / TS 数据模拟，不访问任何大模型 API，
 *         页面必须明确标注「Demo 模拟 Agent」。
 * - live：只有在检测到有效模型配置（后端 /api/ai/status 返回 enabled）后才允许启用；
 *         未配置时直接报错，不静默回退、不无限等待。
 */
export type AgentMode = 'mock' | 'live'

/** live 模式下没有可用模型配置时抛出，页面据此展示「尚未配置大模型服务」。 */
export class AgentNotConfiguredError extends Error {
  readonly reason: string

  constructor(reason: string, message = '尚未配置大模型服务') {
    super(message)
    this.name = 'AgentNotConfiguredError'
    this.reason = reason
  }
}

/** 一次 Agent 任务的整体预算：10 秒内必须结束，否则进入 error 状态且不自动重试。 */
export const AGENT_RUN_TIMEOUT_MS = 10_000

/** 运行被取消（组件卸载 / 用户重新运行）时抛出。 */
export class AgentRunAbortedError extends Error {
  constructor(message = '本次运行已取消') {
    super(message)
    this.name = 'AgentRunAbortedError'
  }
}

/** 运行超过整体预算时抛出。 */
export class AgentRunTimeoutError extends Error {
  constructor(message = 'Agent 运行超过 10 秒，已自动中止') {
    super(message)
    this.name = 'AgentRunTimeoutError'
  }
}

export interface ParseIntentInput {
  text: string
  eventId: string
  userId: string
  scopes: AuthorizationScope[]
  /** 用户在确认页手动微调过的意图；live 模式下会一起交给后端会话。 */
  intent?: ParsedIntent | null
}

export interface BuildMusicProfileInput {
  userId: string
  scopes: AuthorizationScope[]
}

export interface SearchCandidatesCriteria {
  eventId: string
  userId: string
  scopes: AuthorizationScope[]
}

export interface NegotiateCandidateInput {
  eventId: string
  viewer: CandidateFacts
  candidate: CandidateFacts
  intent: ParsedIntent
}

export interface NegotiationResult {
  sharedSongs: string[]
  exchangedFields: string[]
  hiddenFields: string[]
  note: string
}

export interface IcebreakerContext {
  concertId: string
  concertTitle: string
  artist: string
  sharedSongs: string[]
  purposes: string[]
}

/**
 * 统一的模型能力接口。页面只依赖这一层，不得直接调用任何大模型 SDK 或 HTTP 接口。
 */
export interface AgentProvider {
  readonly mode: AgentMode
  /** 展示用名称，例如「Demo 模拟 Agent」。 */
  readonly label: string
  readonly isDemo: boolean
  readonly notice: string
  parseIntent(input: ParseIntentInput): Promise<ParsedIntent>
  buildMusicProfile(input: BuildMusicProfileInput): Promise<MusicProfile | null>
  searchCandidates(criteria: SearchCandidatesCriteria): Promise<CandidateFacts[]>
  filterBySafety(input: {
    viewer: CandidateFacts
    intent: ParsedIntent
    candidates: CandidateFacts[]
    eventId: string
  }): Promise<{ kept: CandidateFacts[]; excluded: ExcludedCandidate[] }>
  negotiateCandidate(input: NegotiateCandidateInput): Promise<NegotiationResult>
  generateIcebreakers(context: IcebreakerContext): Promise<string[]>
}

export interface AgentRunOutcome {
  state: AgentState
}
