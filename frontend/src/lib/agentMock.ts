// 前端版 Agent 编排器（与 backend/app/agent 同形）：
// 同样的工具序列、同样的硬条件、同样的评分与证据校验。
// 后端可用时 api.ts 会优先走后端 Agent，这条本地链路保证断网也能演示。
import { demoUsers } from '../data/demoData'
import type {
  AgentPhase,
  AgentState,
  AuthorizationScope,
  CandidateFacts,
  ChatStyle,
  DemoCase,
  ExcludedCandidate,
  GroupMember,
  MatchEvidence,
  ParsedIntent,
  PendingConfirmation,
  Purpose,
  RoomMember,
  RoomState,
  SafetyPref,
  ScoreBreakdown,
  ScoredCandidate,
  ToolTrace,
} from '../types'
import { buildIcebreakers, buildRoomTasks } from './content'
import { A2A_TOOLS, generateHandshakeReport } from './a2aNegotiation'
import { QUALIFY_MIN_SCORE, checkHardConstraints, rankCandidates } from './scoring'
import { AGENT_RUN_TIMEOUT_MS, AgentRunAbortedError, AgentRunTimeoutError } from '../services/agent/agentTypes'
import type { AgentProvider } from '../services/agent/agentTypes'
import {
  ALL_SCOPES,
  DEMO_VIEWER,
  PROVIDER_INFO,
  attendeesOf,
  candidateFacts,
  getEventContext,
  getMusicProfile,
  searchTracks,
  viewerFacts,
  viewerSocial,
} from './tmeMock'

export const AGENT_PHASES: Array<{ id: string; label: string; detail: string }> = [
  { id: 'understand', label: '正在理解需求', detail: '把你的原话拆成活动、歌曲、目的和安全边界' },
  { id: 'profile', label: '读取授权音乐偏好', detail: '只读取你授权的那几类 QQ 音乐数据' },
  { id: 'search', label: '检索同场候选人', detail: '在这一场的观众里找人，不跨场推荐' },
  { id: 'safety', label: '执行安全约束', detail: '按你设的硬条件先筛一遍，不符合的直接排除' },
  { id: 'rank', label: '计算同频程度', detail: '音乐偏好、演出期待、社交目的、交流与安全四项打分' },
  { id: 'plan', label: '生成同频方案', detail: '给出带证据的推荐理由和公开集合建议' },
]

const PHASE_OF_TOOL: Record<string, string> = {
  parse_social_intent: 'understand',
  get_authorized_music_profile: 'profile',
  get_event_context: 'profile',
  search_same_event_candidates: 'search',
  apply_safety_constraints: 'safety',
  rank_candidates: 'rank',
  build_group: 'plan',
  generate_grounded_reason: 'plan',
  // Mock 六步流程里的两个合成步骤
  agent_negotiation: 'rank',
  generate_candidates: 'plan',
  send_mutual_consent_invitation: 'plan',
  create_temporary_room: 'plan',
  collect_feedback: 'plan',
  verify_same_event: 'search', compare_arrival_plan: 'rank', compare_music_profile: 'rank', compare_social_intent: 'rank',
  negotiate_group_size: 'plan', verify_safety_constraints: 'safety', identify_conflicts: 'safety', generate_handshake_report: 'plan',
}

const TOOL_LABELS: Record<string, string> = {
  parse_social_intent: '解析自然语言需求',
  get_authorized_music_profile: '读取授权音乐画像',
  get_event_context: '读取演出上下文',
  search_same_event_candidates: '检索同场候选人',
  apply_safety_constraints: '执行安全硬约束',
  rank_candidates: '计算同频程度',
  build_group: '生成组队方案',
  generate_grounded_reason: '生成有证据的理由',
  agent_negotiation: '进行 Agent 结构化协商',
  generate_candidates: '生成 3 位同频候选人',
  send_mutual_consent_invitation: '发送双向确认邀请',
  create_temporary_room: '创建临时房间',
  collect_feedback: '收集反馈',
  verify_same_event: '核验同场演出', compare_arrival_plan: '对比到场计划', compare_music_profile: '对比音乐画像',
  compare_social_intent: '对比同行意图', negotiate_group_size: '协商组队人数', verify_safety_constraints: '核验安全边界',
  identify_conflicts: '识别冲突条件', generate_handshake_report: '生成预沟通报告',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name
}

/**
 * Mock Agent 的固定节奏：六步，每步约 500ms，总时长稳定在 3~5 秒。
 * 这里刻意不读取 cost，避免"每步延迟不一样"导致总时长不可预期。
 */
export const MOCK_STEP_DELAY_MS = 500
/** Mock 只产出 3 位候选人，与初赛 Demo 的展示口径一致。 */
export const MOCK_CANDIDATE_LIMIT = 3

export function phasesOf(trace: ToolTrace[]): AgentPhase[] {
  return AGENT_PHASES.map((phase) => {
    const steps = trace.filter((item) => item.phase === phase.id)
    const state: AgentPhase['state'] = steps.length === 0
      ? 'pending'
      : steps.every((step) => step.status === 'ok' || step.status === 'fallback')
        ? 'done'
        : 'failed'
    return { ...phase, state, steps }
  })
}

/**
 * 用户可见的四个阶段。六个内部阶段被折叠进「寻找同场用户」与「计算同频度」，
 * 一级进度只讲人话，完整工具轨迹进二级页面。
 */
export const MATCH_STAGES: Array<{ id: string; label: string; detail: string; phases: string[] }> = [
  { id: 'understand', label: '理解需求', detail: '把你的原话拆成活动、歌曲、目的与安全边界', phases: ['understand'] },
  { id: 'search', label: '寻找同场用户', detail: '只读取授权画像，并在这一场的观众里找人', phases: ['profile', 'search'] },
  { id: 'score', label: '计算同频度', detail: '先跑确定性安全硬条件，再按四个维度打分', phases: ['safety', 'rank'] },
  { id: 'plan', label: '生成组队方案', detail: '给出带证据的推荐理由与公开集合建议', phases: ['plan'] },
]

export interface MatchStage {
  id: string
  label: string
  detail: string
  state: 'pending' | 'done' | 'failed'
  steps: ToolTrace[]
}

export function stagesOf(trace: ToolTrace[]): MatchStage[] {
  const phases = phasesOf(trace)
  return MATCH_STAGES.map((stage) => {
    const steps = phases.filter((phase) => stage.phases.includes(phase.id)).flatMap((phase) => phase.steps)
    const state: MatchStage['state'] = steps.length === 0
      ? 'pending'
      : steps.every((step) => step.status === 'ok' || step.status === 'fallback')
        ? 'done'
        : 'failed'
    return { id: stage.id, label: stage.label, detail: stage.detail, state, steps }
  })
}

const PURPOSE_KEYWORDS: Record<Purpose, string[]> = {
  副歌一起唱: ['副歌', '合唱', '一起唱', '跟着唱', '唱出来', '大合唱'],
  一起排队候场: ['排队', '候场', '提前到', '一起等', '进场前'],
  演出后聊音乐: ['散场后', '演出后', '聊音乐', '聊歌', '找个地方', '结束后'],
  安静听完整场: ['安静', '不想说话', '认真听', '不聊天', '别说话'],
  拍照记录现场: ['拍照', '摄影', '照片', '拍一张', '出片', '相机'],
}

const STYLE_KEYWORDS: Record<ChatStyle, string[]> = {
  安静听歌: ['安静', '社恐', '不想聊天', '不说话', '内向', '只听歌'],
  温和慢热: ['慢热', '先聊', '慢慢', '温和', '不熟', '聊两句'],
  热情外放: ['热情', '外放', '健谈', '爱聊', '话多', '活跃', '自来熟'],
}

const SAFETY_KEYWORDS: Record<SafetyPref, string[]> = {
  只在公开场合见面: ['公开场合', '人多的地方', '灯光明亮', '安全的地方', '大厅'],
  不交换私人联系方式: ['不交换', '不加微信', '不要联系方式', '隐私'],
  希望同行者性别相同: ['同性', '性别相同', '只要女生', '只要男生', '女生一起', '男生一起'],
  结伴入场与离场: ['一起进场', '一起走', '结伴', '一起离场', '一起检票'],
  先在群里聊熟再见面: ['先聊熟', '先聊几次', '聊熟悉', '先聊聊'],
  不接受临时改约: ['不要临时', '别放鸽子', '守约', '别改时间'],
}

const MEETUP_YES = ['见面', '线下', '一起进', '集合', '碰头', '到场', '一起走', '约在']
const MEETUP_NO = ['不见面', '不线下', '只在线上', '房间聊就行', '不用见面']

const GROUP_PATTERNS: Array<[RegExp, 2 | 3 | 4]> = [
  [/(?:两|2)\s*[个位]?\s*人/, 2],
  [/(?:三|3)\s*[个位]?\s*人/, 3],
  [/(?:四|4)\s*[个位]?\s*人/, 4],
  [/一对(?:一|1)/, 2],
]

export function ruleParseIntent(text: string, eventId: string, viewerGender: string, viewerAgeBand: string): ParsedIntent {
  const body = (text || '').trim()
  const match = (table: Record<string, string[]>): string[] =>
    Object.entries(table)
      .filter(([, keywords]) => keywords.some((keyword) => body.includes(keyword)))
      .map(([label]) => label)

  const purposes = match(PURPOSE_KEYWORDS) as Purpose[]
  const safety = match(SAFETY_KEYWORDS) as SafetyPref[]
  const styles = match(STYLE_KEYWORDS)[0] as ChatStyle | undefined

  let meGender: ParsedIntent['meGender'] =
    viewerGender === 'female' || viewerGender === 'male' ? viewerGender : 'prefer-not-to-say'
  let sameGenderOnly = safety.includes('希望同行者性别相同')
  if (body.includes('只要女生') || body.includes('女生一起')) {
    sameGenderOnly = true
    meGender = 'female'
  }
  if (body.includes('只要男生') || body.includes('男生一起')) {
    sameGenderOnly = true
    meGender = 'male'
  }

  let meetInPerson = true
  if (MEETUP_NO.some((keyword) => body.includes(keyword))) meetInPerson = false
  else if (MEETUP_YES.some((keyword) => body.includes(keyword))) meetInPerson = true

  let groupSize: 2 | 3 | 4 = 3
  for (const [pattern, size] of GROUP_PATTERNS) {
    if (pattern.test(body)) {
      groupSize = size
      break
    }
  }

  const tracks = searchTracks(body)
  const mentionedSongs = Array.from(new Set(tracks.map((track) => track.title)))
  const mentionedArtists = Array.from(new Set(tracks.map((track) => track.artist)))
  const concert = getEventContext(eventId)
  if (concert && body.includes(concert.artist) && !mentionedArtists.includes(concert.artist)) {
    mentionedArtists.push(concert.artist)
  }

  let ageBand = ''
  if (['同龄', '差不多大', '年龄相近', '年纪相仿'].some((keyword) => body.includes(keyword))) ageBand = viewerAgeBand
  if (body.includes('大学生') || body.includes('学生')) ageBand = '18-22'

  return {
    eventId,
    mentionedSongs,
    mentionedArtists,
    purposes,
    chatStyle: styles ?? '温和慢热',
    groupSize,
    sameGenderOnly,
    meGender,
    meetInPerson,
    ageBand: ageBand || viewerAgeBand,
    strict: ['严格', '完全一样', '必须同岁', '一模一样'].some((keyword) => body.includes(keyword)),
    safety,
    note: `规则解析：从你的原话里识别出 ${purposes.length} 个目的、${mentionedSongs.length} 首歌`,
  }
}

export function emptyAgentState(): AgentState {
  return {
    sessionId: '',
    userId: DEMO_VIEWER.userId,
    eventId: '',
    rawIntent: '',
    parsedIntent: null,
    musicProfile: null,
    candidateIds: [],
    excludedCandidates: [],
    rankedCandidates: [],
    proposedGroup: {},
    evidence: [],
    pendingConfirmation: { required: false, status: 'none' },
    roomId: null,
    status: 'collecting_intent',
    error: '',
    authorizedScopes: [],
    scenario: 'normal',
    trace: [],
    phases: phasesOf([]),
    provider: PROVIDER_INFO,
    createdAt: 0,
    updatedAt: 0,
  }
}

interface RunArgs {
  eventId: string
  userId: string
  text: string
  scopes: AuthorizationScope[]
  demoCase: DemoCase
  scenario: 'normal' | 'slow' | 'error'
  intentOverride?: ParsedIntent | null
  onStep?: (trace: ToolTrace) => void
  /** 统一适配层：由调用方（services/agent/agentRun）注入，页面不直接调用任何 SDK。 */
  provider?: AgentProvider
  /** 本次任务的唯一 runId；同一 runId 只会被执行一次。 */
  runId?: string
  /** 外部取消信号（组件卸载 / 用户重新运行）。 */
  signal?: AbortSignal
  /** 整体超时时刻（毫秒时间戳）。超过后本步骤直接失败，不再继续。 */
  deadline?: number
}

/** 每一步最多重试 1 次；超时或取消不再重试。 */
const STEP_MAX_RETRY = 1

function sleepUntilAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms)
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runAgent(args: RunArgs): Promise<AgentState> {
  const { eventId, text, scopes, demoCase, scenario } = args
  const signal = args.signal
  const deadline = args.deadline ?? Date.now() + AGENT_RUN_TIMEOUT_MS
  const provider = args.provider
  const state = emptyAgentState()
  state.sessionId = args.runId ?? 'mock-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4)
  state.eventId = eventId
  state.rawIntent = text
  state.authorizedScopes = scopes
  state.scenario = demoCase
  state.status = 'running'
  state.createdAt = Date.now()
  state.provider = PROVIDER_INFO

  // slow 只用于"弱网加载态"演示：6 步 × 800ms ≈ 4.8s，必须留在整体 10 秒超时内。
  const pace = scenario === 'slow' ? 1.6 : 1

  const assertAlive = (): void => {
    if (signal?.aborted) throw new AgentRunAbortedError('本次运行已取消')
    if (Date.now() > deadline) throw new AgentRunTimeoutError('Agent 运行超过 10 秒，已自动中止')
  }

  /** 任何一步最多重试 1 次；取消 / 超时不再重试。 */
  const retryOnce = async <T,>(fn: () => Promise<T> | T): Promise<T> => {
    let lastError: unknown = null
    for (let attempt = 0; attempt <= STEP_MAX_RETRY; attempt += 1) {
      assertAlive()
      try {
        return await fn()
      } catch (error) {
        if (error instanceof AgentRunAbortedError || error instanceof AgentRunTimeoutError) throw error
        lastError = error
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Agent 步骤执行失败')
  }

  const record = async (
    name: string,
    inputSummary: string,
    outputSummary: string,
    options: { status?: ToolTrace['status']; usedFallback?: boolean; cost?: number } = {},
  ): Promise<ToolTrace> => {
    assertAlive()
    await sleepUntilAbort(Math.round(MOCK_STEP_DELAY_MS * pace), signal)
    assertAlive()
    const step: ToolTrace = {
      name,
      label: toolLabel(name),
      phase: PHASE_OF_TOOL[name] ?? 'plan',
      status: options.status ?? 'ok',
      inputSummary,
      outputSummary,
      durationMs: Math.round(MOCK_STEP_DELAY_MS * (0.85 + Math.random() * 0.3)),
      usedFallback: options.usedFallback ?? false,
      error: '',
    }
    state.trace = [...state.trace, step]
    state.phases = phasesOf(state.trace)
    args.onStep?.(step)
    return step
  }

  const viewer = viewerFacts(scopes)
  const social = viewerSocial()

  // 1. 理解意图（mock 走本地规则；接口由统一适配层提供）
  const parsed = args.intentOverride ?? await retryOnce(() => provider
    ? provider.parseIntent({ text, eventId, userId: social.userId, scopes })
    : ruleParseIntent(text, eventId, social.gender, viewer.ageBand))
  const forceFallback = demoCase === 'ai_fallback' || scenario === 'error'
  await record(
    'parse_social_intent',
    `原话："${text.slice(0, 40)}${text.length > 40 ? '…' : ''}"`,
    `活动：${parsed.eventId}；歌曲：${parsed.mentionedSongs.length ? parsed.mentionedSongs.slice(0, 3).join('、') : '未点名'}`
      + `；目的：${parsed.purposes.length ? parsed.purposes.join('、') : '未明确'}；风格：${parsed.chatStyle}`
      + `；人数：${parsed.groupSize}；性别：${parsed.sameGenderOnly ? '要求同性' : '不限'}`
      + `；见面：${parsed.meetInPerson ? '需要线下见面' : '可以只在线上'}`
      + (forceFallback ? '（本次演示指定"大模型不可用"，直接使用本地规则解析 fallback）' : '（大模型未启用，使用本地规则解析 fallback）'),
    { status: 'fallback', usedFallback: true, cost: 420 },
  )
  state.parsedIntent = parsed

  if (scenario === 'error') {
    state.status = 'error'
    state.error = '网络连接不稳定，Agent 执行中断，请稍后重试'
    state.updatedAt = Date.now()
    return state
  }

  // 2. 读取授权音乐画像
  const profile = viewer
  await record(
    'get_authorized_music_profile',
    `user_id=${social.userId}，授权范围=${scopes.map((scope) => scope).join('、') || '无'}`,
    `读取到脱敏音乐画像：收藏 ${profile.favoriteTitles.length} 首 · 常听歌手 ${profile.topArtists.length} 位`
      + ` · 近期播放 ${profile.recentTitles.length} 条 · 关注演出 ${profile.followedEventIds.length} 场`
      + ` · 歌单标签 ${profile.playlistTags.length} 个`,
    { cost: 300 },
  )
  state.musicProfile = await retryOnce(() => provider
    ? provider.buildMusicProfile({ userId: social.userId, scopes })
    : getMusicProfile(social.userId, scopes))

  // 3. 读取演出上下文
  const concert = getEventContext(eventId)
  if (!concert) {
    state.status = 'error'
    state.error = '没有找到这场演出'
    state.updatedAt = Date.now()
    return state
  }
  state.evidence = []

  // 4. 检索同场候选人
  const pool = await retryOnce<CandidateFacts[]>(() => provider
    ? provider.searchCandidates({ eventId, userId: social.userId, scopes })
    : attendeesOf(eventId)
        .map((user) => candidateFacts(user.id, ALL_SCOPES))
        .filter((item): item is CandidateFacts => Boolean(item)))
  state.candidateIds = pool.map((item) => item.userId)
  await record(
    'search_same_event_candidates',
    `event_id=${eventId}；演出：${concert.title} · ${concert.artist} · ${concert.venue}`,
    `同场候选池 ${pool.length} 人：${pool.slice(0, 4).map((item) => item.nickname).join('、')}${pool.length > 4 ? '…' : ''}`
      + `；公开集合点：${concert.meetingPoint.name}`,
    { cost: 500 },
  )

  const intent: ParsedIntent = demoCase === 'safety_no_match'
    ? { ...parsed, sameGenderOnly: true, meetInPerson: true, groupSize: 2, strict: true }
    : parsed
  if (demoCase === 'safety_no_match') state.parsedIntent = intent

  // 5. 执行安全硬约束（确定性过滤，永远不交给大模型自由判断）
  const safety = await retryOnce(() => {
    if (provider) return provider.filterBySafety({ viewer, intent, candidates: pool, eventId })
    const localExcluded: ExcludedCandidate[] = []
    const localKept: CandidateFacts[] = []
    for (const candidate of pool) {
      const reason = checkHardConstraints({
        viewer,
        intent,
        candidate,
        eventId,
        blockedUserIds: social.blockedUserIds,
        reportedUserIds: social.reportedUserIds,
      })
      if (reason) localExcluded.push(reason)
      else localKept.push(candidate)
    }
    return { kept: localKept, excluded: localExcluded }
  })
  const kept = safety.kept
  const excluded = safety.excluded
  state.excludedCandidates = excluded
  state.candidateIds = kept.map((item) => item.userId)

  const ruleCounts = new Map<string, number>()
  for (const item of excluded) ruleCounts.set(item.rule, (ruleCounts.get(item.rule) ?? 0) + 1)
  const ruleDetail = Array.from(ruleCounts.entries()).map(([rule, count]) => `${rule} ${count} 人`).join('，')
  await record(
    'apply_safety_constraints',
    `候选 ${pool.length} 人，硬条件：同场 / 年龄 ${intent.ageBand || '不限'} / ${intent.sameGenderOnly ? '性别相同' : '性别不限'}`
      + ` / ${intent.groupSize} 人 / ${intent.meetInPerson ? '需要线下见面' : '可只在线上'} / 未拉黑举报`,
    `通过 ${kept.length} 人，排除 ${excluded.length} 人（${ruleDetail || '没有被排除的人'}）`,
    { cost: 320 },
  )

  if (kept.length === 0) {
    state.rankedCandidates = []
    state.proposedGroup = {}
    state.pendingConfirmation = {
      required: false,
      status: 'blocked',
      reason: '所有同场候选人都被硬条件排除了，包括性别、年龄段、见面意愿等安全要求',
      nextAction: 'relax',
    }
    state.status = 'no_match'
    state.updatedAt = Date.now()
    return state
  }

  // 6. Agent 结构化协商：只交换匿名结构字段，不做自由聊天
  const negotiation = await retryOnce(() => (provider && kept.length > 0)
    ? provider.negotiateCandidate({ eventId, viewer, candidate: kept[0], intent })
    : null)
  await record(
    'agent_negotiation',
    `与 ${kept.length} 位候选做匿名结构化协商：${A2A_TOOLS.length} 项核验（同场 / 到场计划 / 音乐画像 / 社交意图 / 人数 / 安全边界 / 冲突）`,
    `完成 ${kept.length} 轮结构化协商；未交换真实姓名、联系方式、精确位置或原始听歌历史`
      + (negotiation ? `；核验项：${negotiation.note}` : ''),
    { cost: 500 },
  )

  // 7. 生成 3 位候选人：打分 + 组队方案 + 带证据的推荐理由
  const ranked = rankCandidates(viewer, intent, kept).slice(0, MOCK_CANDIDATE_LIMIT)
  state.rankedCandidates = ranked
  state.handshakeReports = Object.fromEntries(ranked.map((item) => [item.userId, generateHandshakeReport(state, item)]))
  const evidence: Array<MatchEvidence & { userId?: string; nickname?: string }> = []
  const seen = new Set<string>()
  for (const item of ranked) {
    for (const entry of item.evidence) {
      const key = `${entry.kind}|${entry.text}`
      if (seen.has(key)) continue
      seen.add(key)
      evidence.push({ ...entry, userId: item.userId, nickname: item.candidate.nickname })
    }
  }
  state.evidence = evidence

  // 7. 生成组队方案
  const qualifying = ranked.filter((item) => item.score >= QUALIFY_MIN_SCORE)
  let groupSummary = '没有达到阈值的候选人'
  if (qualifying.length > 0) {
    const targetSize = Math.max(2, Math.min(intent.groupSize, qualifying.length + 1))
    const picked = qualifying.slice(0, targetSize - 1)
    const members: GroupMember[] = [
      { userId: viewer.userId, nickname: '你', role: 'me', score: null },
      ...picked.map((item, index) => ({
        userId: item.userId,
        nickname: item.candidate.nickname,
        role: (index === 0 ? 'partner' : 'companion') as GroupMember['role'],
        score: item.score,
      })),
    ]
    const shrunk = members.length < intent.groupSize
    state.proposedGroup = {
      size: members.length,
      requestedSize: intent.groupSize,
      shrunk,
      members,
      qualifyMinScore: QUALIFY_MIN_SCORE,
      meetingPoint: concert.meetingPoint,
      meetingNote: '只推荐有工作人员、灯光明亮的公开区域',
      rationale:
        `从 ${ranked.length} 位同频候选人里选出 ${picked.length} 位，最低同频分 ${picked[picked.length - 1].score} 分`
        + (shrunk ? `；符合条件的人不足 ${intent.groupSize} 人，已自动缩小为 ${members.length} 人小组` : ''),
    }
    groupSummary = `组队方案：${members.length} 人（${members.map((member) => member.nickname).join('、')}）${shrunk ? '，已缩小规模' : ''}`
  }
  // 6.1 生成有证据的理由（引用校验不通过就退化成短句，绝不编造）
  let grounded = 0
  for (const item of ranked) {
    const reason = reasonFor(item)
    item.matchReason = reason
    if (reason) grounded += 1
  }
  state.pendingConfirmation = {
    required: true,
    status: 'awaiting_user',
    reason: '需要你先确认想邀请谁，对方同意后才会创建临时房间',
    candidateId: ranked[0]?.userId ?? null,
    nextAction: 'invite',
  }
  state.status = 'pending_confirmation'
  state.updatedAt = Date.now()
  const icebreakers = await retryOnce(() => provider
    ? provider.generateIcebreakers({
        concertId: eventId,
        concertTitle: concert.title,
        artist: concert.artist,
        sharedSongs: ranked[0]?.sharedSongs ?? [],
        purposes: intent.purposes,
      })
    : Promise.resolve([] as string[]))
  await record(
    'generate_candidates',
    `候选 ${kept.length} 人，权重：音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全 15%`,
    `生成 ${ranked.length} 位同频候选人，最高分 ${ranked[0].score}（${ranked[0].candidate.nickname}），`
      + `${grounded} 位附带了可核验的推荐理由；${groupSummary}`
      + (icebreakers.length ? `；已准备 ${icebreakers.length} 条破冰话题` : ''),
    { cost: 500 },
  )

  state.phases = phasesOf(state.trace)
  state.updatedAt = Date.now()
  return state
}

const CLOSING: Record<string, string> = {
  high: '可以先在公开集合点碰头，再决定要不要一起进场。',
  mid: '可以先在集合点聊两句，合适再一起候场。',
  low: '共同点不算多，如果对方的理由打动了你也可以聊聊看。',
}

const PREFERRED = ['expected', 'intent_song', 'purpose', 'artist', 'recent', 'tag', 'safety']

/** 只引用 evidence 里真实存在的共同点，引用校验不通过就退化成短句 */
export function reasonFor(item: ScoredCandidate): string {
  const evidence = item.evidence
  if (evidence.length === 0) return ''
  const ordered = [...evidence].sort((a, b) => {
    const ai = PREFERRED.indexOf(a.kind)
    const bi = PREFERRED.indexOf(b.kind)
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
  })
  const parts = [ordered[0].text]
  for (const entry of ordered.slice(1)) {
    if (['song', 'expected', 'intent_song', 'purpose'].includes(entry.kind)) parts.push(entry.text)
    if (parts.length >= 3) break
  }
  let reason = parts.join('；') + '。' + (CLOSING[item.band] ?? CLOSING.low)
  if (unsupportedQuotes(reason, evidence).length > 0) reason = ordered[0].text + '。' + (CLOSING[item.band] ?? CLOSING.low)
  if (unsupportedQuotes(reason, evidence).length > 0) reason = CLOSING[item.band] ?? CLOSING.low
  return reason
}

export function unsupportedQuotes(reason: string, evidence: MatchEvidence[]): string[] {
  const allowed = new Set<string>()
  for (const entry of evidence) {
    entry.items.forEach((item) => allowed.add(item))
    allowed.add(entry.text)
  }
  const missing: string[] = []
  const pattern = /《([^》]+)》|「([^」]+)」/g
  let matched = pattern.exec(reason)
  while (matched) {
    const token = matched[1] ?? matched[2]
    if (token && !allowed.has(token)) missing.push(token)
    matched = pattern.exec(reason)
  }
  return missing
}

// ---------------------------------------------------------------------------
// 状态推进（双向确认 -> 房间）
// ---------------------------------------------------------------------------

export function inviteState(state: AgentState, candidateId: string): AgentState {
  const pending: PendingConfirmation = {
    required: true,
    status: 'awaiting_peer',
    candidateId,
    proposerConfirmed: true,
    peerConfirmed: false,
    reason: '需要双方都确认后才创建临时房间',
    nextAction: 'wait_peer',
  }
  const step: ToolTrace = {
    name: 'send_mutual_consent_invitation',
    label: toolLabel('send_mutual_consent_invitation'),
    phase: 'plan',
    status: 'ok',
    inputSummary: `candidate=${candidateId}`,
    outputSummary: '邀请已发送，等待对方确认；确认前不会创建房间',
    durationMs: 180,
    usedFallback: false,
    error: '',
  }
  const trace = [...state.trace, step]
  return { ...state, pendingConfirmation: pending, status: 'pending_confirmation', trace, phases: phasesOf(trace), updatedAt: Date.now() }
}

export function peerConfirmState(state: AgentState, accept: boolean): AgentState {
  const pending = state.pendingConfirmation
  if (!pending.required || !pending.proposerConfirmed) return state
  return {
    ...state,
    pendingConfirmation: {
      ...pending,
      peerConfirmed: accept,
      status: accept ? 'both_confirmed' : 'declined',
      nextAction: accept ? 'create_temporary_room' : 'back_to_matches',
      reason: accept ? '双方都已确认，Agent 可以创建临时房间了' : '对方暂时不方便，换一个人试试',
    },
    updatedAt: Date.now(),
  }
}

export function createRoomState(state: AgentState): { state: AgentState; room: RoomState | null; trace: ToolTrace } {
  const pending = state.pendingConfirmation
  const trace: ToolTrace = {
    name: 'create_temporary_room',
    label: toolLabel('create_temporary_room'),
    phase: 'plan',
    status: 'ok',
    inputSummary: `partner=${pending.candidateId ?? '未指定'}，双方均已确认`,
    outputSummary: '',
    durationMs: 320,
    usedFallback: false,
    error: '',
  }

  if (!pending.required || !pending.proposerConfirmed || !pending.peerConfirmed) {
    trace.status = 'error'
    trace.error = '双方尚未都确认，不能创建房间'
    trace.outputSummary = '双方尚未都确认，房间未创建（必须双向确认）'
    return { state: { ...state, error: trace.error, trace: [...state.trace, trace], phases: phasesOf([...state.trace, trace]) }, room: null, trace }
  }

  const concert = getEventContext(state.eventId)
  const members = state.proposedGroup.members ?? []
  const partnerId = pending.candidateId ?? members.find((member) => member.role !== 'me')?.userId ?? null
  const partnerItem = state.rankedCandidates.find((item) => item.userId === partnerId) ?? null

  const roomMembers: RoomMember[] = [
    {
      userId: state.userId,
      nickname: '你',
      avatar: { from: '#31c27c', to: '#0d6b45' },
      isMe: true,
      role: 'me',
      confirmed: true,
      note: '发起人',
      chatStyle: state.parsedIntent?.chatStyle ?? '温和慢热',
    },
    ...members
      .filter((member) => member.role !== 'me')
      .map((member, index) => ({
        userId: member.userId,
        nickname: member.nickname,
        avatar: partnerItem?.candidate.avatar ?? { from: '#61c8ff', to: '#0b1116' },
        isMe: false,
        role: (index === 0 ? 'partner' : 'companion') as RoomMember['role'],
        confirmed: true,
        note: index === 0 ? '对方已确认同行' : '同场小组成员',
        chatStyle: partnerItem?.candidate.chatStyle ?? '温和慢热',
      })),
  ]

  if (!concert) {
    trace.status = 'error'
    trace.error = '找不到这场演出'
    trace.outputSummary = trace.error
    return { state: { ...state, error: trace.error, trace: [...state.trace, trace] }, room: null, trace }
  }

  const sharedSongs = partnerItem?.sharedSongs ?? []
  const roomId = `room-${state.sessionId.slice(-6)}-${String(Date.now()).slice(-5)}`
  const room: RoomState = {
    roomId,
    concertId: state.eventId,
    concertTitle: concert.title,
    meetingPoint: concert.meetingPoint,
    members: roomMembers,
    icebreakers: buildIcebreakers({
      concert,
      sharedSongs,
      partner: demoUsers.find((user) => user.id === partnerId) ?? null,
      prefs: {
        likedSongs: state.musicProfile?.favoriteTracks.map((track) => track.title) ?? [],
        likedArtists: state.musicProfile?.topArtists ?? [],
        expectedTracks: [],
        story: '',
        purposes: state.parsedIntent?.purposes ?? [],
        chatStyle: state.parsedIntent?.chatStyle ?? '温和慢热',
        groupSize: state.parsedIntent?.groupSize ?? 3,
        safety: state.parsedIntent?.safety ?? [],
        myGender: state.parsedIntent?.meGender ?? 'prefer-not-to-say',
      },
    }),
    tasks: buildRoomTasks(concert),
    createdAt: Date.now(),
    meetingConfirmed: false,
  }

  trace.outputSummary =
    `已创建临时房间 ${roomId}：成员 ${roomMembers.length} 人，公开集合点「${concert.meetingPoint.name}」，破冰问题 ${room.icebreakers.length} 条`

  const nextTrace = [...state.trace, trace]
  return {
    state: {
      ...state,
      trace: nextTrace,
      phases: phasesOf(nextTrace),
      roomId,
      status: 'room_created',
      error: '',
      pendingConfirmation: { ...pending, status: 'confirmed' },
      updatedAt: Date.now(),
    },
    room,
    trace,
  }
}

export function feedbackState(state: AgentState, rating: string, tags: string[], comment: string): AgentState {
  const label = rating === 'good' ? '有帮助' : rating === 'bad' ? '没帮助' : '一般'
  const trace: ToolTrace = {
    name: 'collect_feedback',
    label: toolLabel('collect_feedback'),
    phase: 'plan',
    status: 'ok',
    inputSummary: `rating=${label}，tags=${tags.join('、') || '无'}`,
    outputSummary: `反馈已记录（本地 Demo），会用于后续调整匹配权重${comment ? '：' + comment : ''}`,
    durationMs: 180,
    usedFallback: false,
    error: '',
  }
  const nextTrace = [...state.trace, trace]
  return { ...state, trace: nextTrace, phases: phasesOf(nextTrace), updatedAt: Date.now() }
}

export type { ScoreBreakdown }

