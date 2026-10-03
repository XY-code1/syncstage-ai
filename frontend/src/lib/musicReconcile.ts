// 官方参考歌单「音乐依据」对齐层（前端）。
//
// 背景：初赛没有 TME 官方 API，官方参考歌单的本地演示数据只存在于前端
// （src/data/officialHackathonPlaylist.ts）。后端 Phase 2 镜像
// （backend/app/demo_data.py / mock_qqmusic.py）目前仍是早先的一批虚构曲目，
// 若直接展示，匹配结果就会引用虚构歌曲。
//
// 本层在拿到 Agent 结果后，用与后端完全同一套权重的本地评分引擎（./scoring）
// 重新推导「音乐侧」字段：
// 1. 共同收藏 / 共同最近循环 / 曲风情绪 / 听歌时段永远来自官方参考歌单；
// 2. 音乐依据不足时同样封顶，绝不只靠一首共同歌曲拿到高分；
// 3. 只重算与音乐有关的维度（音乐偏好、演出期待）和音乐类证据，
//    社交目的 / 交流与安全偏好仍沿用 Agent 原始结果；
// 4. 未授权任何音乐数据时按「暂无足够音乐依据」处理，不硬凑共同点。
//
// 这不改后端 API 契约，也不改 Agent 状态机：工具调用轨迹、意图解析、
// 破冰对话仍然是 Agent 真实跑出来的结果，只是把「音乐事实」换成本地官方歌单版本。

import type {
  AgentState,
  AuthorizationScope,
  CandidateFacts,
  MatchEvidence,
  MusicBasis,
  ParsedIntent,
  ScoreDimension,
  ScoredCandidate,
} from '../types'
import { reasonFor } from './agentMock'
import { bandOf, MUSIC_CAP, scoreCandidate } from './scoring'
import { candidateFacts, viewerFacts } from './tmeMock'

/**
 * 引用「音乐侧」事实的证据类型。
 * 这些条目必须用官方参考歌单重新推导，否则旧镜像里的虚构曲目会泄漏到页面。
 */
const MUSIC_EVIDENCE_KINDS: ReadonlyArray<MatchEvidence['kind']> = [
  'song',
  'expected',
  'intent_song',
  'recent',
  'artist',
  'tag',
  'mood',
  'listening_time',
]

/** 没有解析结果时的中性意图：只影响音乐类证据措辞，不影响社交条件 */
function neutralIntent(state: AgentState): ParsedIntent {
  return {
    eventId: state.eventId,
    mentionedSongs: [],
    mentionedArtists: [],
    purposes: [],
    chatStyle: '温和慢热',
    groupSize: 3,
    sameGenderOnly: false,
    meGender: 'prefer-not-to-say',
    meetInPerson: true,
    ageBand: '',
    strict: false,
    safety: [],
    note: '',
  }
}

function dimensionOf(dimensions: ScoreDimension[], id: string): ScoreDimension | undefined {
  return dimensions.find((dimension) => dimension.id === id)
}

/**
 * 重算一位候选人的音乐侧字段。
 * 未授权音乐的候选人（如 u-08）本地事实里音乐字段全空，会自然落到 insufficient。
 */
function reconcileCandidate(
  item: ScoredCandidate,
  viewer: CandidateFacts,
  intent: ParsedIntent,
  scopes: readonly AuthorizationScope[],
): ScoredCandidate {
  const facts = candidateFacts(item.userId, scopes) ?? candidateFacts(item.userId, [])
  if (!facts) return item

  const local = scoreCandidate(viewer, intent, facts)
  const localDimensions = local.scoreBreakdown.dimensions
  const backendDimensions = item.scoreBreakdown?.dimensions ?? []

  // 音乐偏好与演出期待都由音乐事实推导，必须用官方歌单版本；
  // 社交目的与交流安全偏好与音乐无关，沿用 Agent 原始结果。
  const musicDimension = dimensionOf(localDimensions, 'music')
  const expectedDimension = dimensionOf(localDimensions, 'expected')
  const socialDimension = dimensionOf(backendDimensions, 'social') ?? dimensionOf(localDimensions, 'social')
  const styleDimension = dimensionOf(backendDimensions, 'style_safety') ?? dimensionOf(localDimensions, 'style_safety')
  const dimensions = [musicDimension, expectedDimension, socialDimension, styleDimension].filter(
    (dimension): dimension is ScoreDimension => Boolean(dimension),
  )

  const musicBasis: MusicBasis = local.musicBasis
  const rawTotal = dimensions.reduce((sum, dimension) => sum + dimension.points, 0)
  const score = Math.max(0, Math.min(MUSIC_CAP[musicBasis], Math.round(rawTotal)))
  const band = bandOf(score)

  const keptEvidence = (item.evidence ?? []).filter((entry) => !MUSIC_EVIDENCE_KINDS.includes(entry.kind))
  const evidence = [...local.evidence, ...keptEvidence]

  return {
    ...item,
    candidate: { ...item.candidate, ...facts },
    score,
    band,
    scoreBreakdown: {
      ...item.scoreBreakdown,
      total: score,
      band,
      dimensions,
      musicSignals: local.scoreBreakdown.musicSignals,
      musicBasis,
    },
    musicBasis,
    sharedSongs: local.sharedSongs,
    sharedArtists: local.sharedArtists,
    sharedRecent: local.sharedRecent,
    sharedTags: local.sharedTags,
    sharedMoods: local.sharedMoods,
    sharedListeningWindows: local.sharedListeningWindows,
    sharedExpectedTracks: local.sharedExpectedTracks,
    evidence,
    matchReason: reasonFor({ ...item, score, band, evidence }),
  }
}

/**
 * 用官方参考歌单的本地演示数据对齐整份 Agent 结果。
 * 对 mock / live 两种模式都是幂等的：mock 模式本来就是这套数据，重算结果一致。
 */
export function reconcileMusicBasis<T extends AgentState>(state: T): T {
  const ranked = state?.rankedCandidates
  if (!Array.isArray(ranked) || ranked.length === 0) return state

  const scopes: AuthorizationScope[] = Array.isArray(state.authorizedScopes) ? state.authorizedScopes : []
  const viewer = viewerFacts(scopes)
  if (!viewer) return state

  const intent = state.parsedIntent ?? neutralIntent(state)
  const candidates = ranked.map((item) => reconcileCandidate(item, viewer, intent, scopes))

  // 音乐维度变了，排序必须跟着变，否则第一位可能不是本轮真正最同频的人。
  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.sharedSongs.length !== a.sharedSongs.length) return b.sharedSongs.length - a.sharedSongs.length
    return b.sharedPurposes.length - a.sharedPurposes.length
  })

  const evidence: Array<MatchEvidence & { userId?: string; nickname?: string }> = []
  const seen = new Set<string>()
  for (const item of candidates) {
    for (const entry of item.evidence) {
      const key = entry.kind + '|' + entry.text
      if (seen.has(key)) continue
      seen.add(key)
      evidence.push({ ...entry, userId: item.userId, nickname: item.candidate.nickname })
    }
  }

  return { ...state, rankedCandidates: candidates, evidence }
}