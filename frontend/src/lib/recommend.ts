import type { AuthorizationScope, CandidateFacts, ExcludedCandidate, ParsedIntent, ScoredCandidate } from '../types'
import { reasonFor } from './agentMock'
import { checkHardConstraints, rankCandidates } from './scoring'
import { DEMO_VIEWER, attendeesOf, candidateFacts, viewerFacts } from './tmeMock'

/**
 * 「同频」一级页面的推荐数据。
 * 复用 Agent 同一套硬条件与评分公式，只是不产生工具轨迹，
 * 让用户可以在一级页面直接看到人，而不是先跑一遍任务。
 */

export function defaultIntent(concertId: string): ParsedIntent {
  return {
    eventId: concertId,
    mentionedSongs: [...DEMO_VIEWER.expectedTracks],
    mentionedArtists: DEMO_VIEWER.likedArtists.slice(0, 2),
    purposes: [...DEMO_VIEWER.purposes],
    chatStyle: DEMO_VIEWER.chatStyle,
    groupSize: DEMO_VIEWER.groupSize,
    sameGenderOnly: false,
    meGender: 'prefer-not-to-say',
    meetInPerson: true,
    ageBand: '23-26',
    strict: false,
    safety: [...DEMO_VIEWER.safety],
    note: '',
  }
}

export interface RecommendationBundle {
  results: ScoredCandidate[]
  excluded: ExcludedCandidate[]
}

export function recommendTeammates(args: {
  concertId: string
  scopes: AuthorizationScope[]
  intent?: ParsedIntent | null
  limit?: number
}): RecommendationBundle {
  const { concertId, scopes, intent: provided, limit } = args
  const viewer = viewerFacts(scopes)
  const intent = provided ?? defaultIntent(concertId)

  const pool: CandidateFacts[] = []
  const excluded: ExcludedCandidate[] = []

  for (const user of attendeesOf(concertId)) {
    if (user.id === DEMO_VIEWER.userId) continue
    const facts = candidateFacts(user.id, scopes)
    if (!facts) continue
    const reason = checkHardConstraints({
      viewer,
      intent,
      candidate: facts,
      eventId: concertId,
      blockedUserIds: [],
      reportedUserIds: [],
    })
    if (reason) {
      excluded.push(reason)
      continue
    }
    pool.push(facts)
  }

  const results = rankCandidates(viewer, intent, pool).map((item) => ({ ...item, matchReason: reasonFor(item) }))
  return { results: typeof limit === 'number' ? results.slice(0, limit) : results, excluded }
}

/** 卡片上最多展示三条共同点，优先音乐，其次演出期待与安全边界 */
export function sharedHighlights(item: ScoredCandidate, concertTitle: string): string[] {
  const highlights: string[] = []
  if (item.sharedSongs.length > 0) highlights.push(`共同收藏《${item.sharedSongs.slice(0, 2).join('》《')}》`)
  if (item.sharedArtists.length > 0) highlights.push(`都常听 ${item.sharedArtists.slice(0, 2).join('、')}`)
  if (item.sharedTags.length > 0) highlights.push(`歌单标签：${item.sharedTags.slice(0, 2).join('、')}`)
  if (item.sharedPurposes.length > 0) highlights.push(`都想${item.sharedPurposes.slice(0, 2).join('、')}`)
  if (item.sharedSafety.length > 0) highlights.push(`安全边界一致：${item.sharedSafety[0]}`)
  highlights.push(`共同演出：${concertTitle}`)
  return highlights.slice(0, 4)
}
