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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runAgent(args: RunArgs): Promise<AgentState> {
  const { eventId, text, scopes, demoCase, scenario } = args
  const state = emptyAgentState()
  state.sessionId = 'mock-' + Math.random().toString(16).slice(2, 10) + Date.now().toString(16).slice(-4)
  state.eventId = eventId
  state.rawIntent = text
  state.authorizedScopes = scopes
  state.scenario = demoCase
  state.status = 'running'
  state.createdAt = Date.now()
  state.provider = PROVIDER_INFO

  const pace = scenario === 'slow' ? 3.2 : 1

  const record = async (
    name: string,
    inputSummary: string,
    outputSummary: string,
    options: { status?: ToolTrace['status']; usedFallback?: boolean; cost?: number } = {},
  ): Promise<ToolTrace> => {
    await sleep(Math.round((options.cost ?? 260) * pace))
    const step: ToolTrace = {
      name,
      label: toolLabel(name),
      phase: PHASE_OF_TOOL[name] ?? 'plan',
      status: options.status ?? 'ok',
      inputSummary,
      outputSummary,
      durationMs: Math.round((options.cost ?? 260) * (0.7 + Math.random() * 0.6)),
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

  // 1. 理解意图
  const parsed = args.intentOverride ?? ruleParseIntent(text, eventId, social.gender, viewer.ageBand)
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
  state.musicProfile = getMusicProfile(social.userId, scopes)

  // 3. 读取演出上下文
  const concert = getEventContext(eventId)
  if (!concert) {
    state.status = 'error'
    state.error = '没有找到这场演出'
    state.updatedAt = Date.now()
    return state
  }
  state.evidence = []
  await record(
    'get_event_context',
    `event_id=${eventId}`,
    `${concert.title} · ${concert.artist} · ${concert.city}${concert.venue}；同场标记同频意愿的观众 ${attendeesOf(eventId).length} 人`
      + `；公开集合点：${concert.meetingPoint.name}`,
    { cost: 220 },
  )

  // 4. 检索同场候选人
  const pool = attendeesOf(eventId)
    .map((user) => candidateFacts(user.id, ALL_SCOPES))
    .filter((item): item is CandidateFacts => Boolean(item))
  state.candidateIds = pool.map((item) => item.userId)
  await record(
    'search_same_event_candidates',
    `event_id=${eventId}，同场观众 ${attendeesOf(eventId).length} 人`,
    `同场候选池 ${pool.length} 人：${pool.slice(0, 4).map((item) => item.nickname).join('、')}${pool.length > 4 ? '…' : ''}`,
    { cost: 520 },
  )

  const intent: ParsedIntent = demoCase === 'safety_no_match'
    ? { ...parsed, sameGenderOnly: true, meetInPerson: true, groupSize: 2, strict: true }
    : parsed
  if (demoCase === 'safety_no_match') state.parsedIntent = intent

  // 5. 执行安全硬约束
  const excluded: ExcludedCandidate[] = []
  const kept: CandidateFacts[] = []
  for (const candidate of pool) {
    const reason = checkHardConstraints({
      viewer,
      intent,
      candidate,
      eventId,
      blockedUserIds: social.blockedUserIds,
      reportedUserIds: social.reportedUserIds,
    })
    if (reason) excluded.push(reason)
    else kept.push(candidate)
  }
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

  // 6. 计算同频程度
  const ranked = rankCandidates(viewer, intent, kept)
  state.rankedCandidates = ranked
  state.handshakeReports = Object.fromEntries(ranked.map((item) => [item.userId, generateHandshakeReport(state, item)]))
  for (const name of A2A_TOOLS) {
    await record(name, '仅交换匿名结构字段', `${name} 完成；未交换真实姓名、联系方式、精确位置或原始听歌历史`, { cost: 70 })
  }
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
  await record(
    'rank_candidates',
    `候选 ${kept.length} 人，权重：音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全 15%`,
    `为 ${ranked.length} 位候选人打了分，最高分 ${ranked[0].score}（${ranked[0].candidate.nickname}），共生成 ${ranked[0].evidence.length} 条证据`,
    { cost: 420 },
  )

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
  await record('build_group', `期望 ${intent.groupSize} 人，候选 ${qualifying.length} 人达到阈值`, groupSummary, { cost: 300 })

  // 8. 生成有证据的理由
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
  await record(
    'generate_grounded_reason',
    `对 ${ranked.length} 位候选人的 evidence 做引用校验`,
    `为 ${grounded} 位候选人生成了带证据的推荐理由；推荐首位：${ranked[0].candidate.nickname}（${ranked[0].score} 分）`,
    { cost: 260 },
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

