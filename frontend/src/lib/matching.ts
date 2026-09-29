// 兼容层：把旧的表单式偏好转成新评分引擎的输入。
// 真正的评分逻辑只有一份：src/lib/scoring.ts（与 backend/app/agent/scoring.py 同权重）。
import type {
  CandidateFacts,
  Concert,
  DemoUser,
  ExcludedCandidate,
  MatchEvidence,
  ParsedIntent,
  Preferences,
  ScoredCandidate,
} from '../types'
import { checkHardConstraints, rankCandidates } from './scoring'
import { ageBandOf, meetupWillingnessOf } from './tmeMock'
import { reasonFor } from './agentMock'

export const STORY_KEYWORDS = [
  '深夜', '加班', '失恋', '毕业', '考研', '通勤', '海边', '夏天', '一个人', '朋友', '现场',
  '第一次', '大学', '高中', '下雨', '地铁', '夜班', '旅行', '画画', '写歌', '副歌', '耳机',
]

export function extractStoryKeywords(text: string): string[] {
  return STORY_KEYWORDS.filter((keyword) => (text || '').includes(keyword))
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

export function factsFromPrefs(prefs: Preferences, concertId: string): CandidateFacts {
  return {
    userId: 'u-viewer',
    nickname: '你',
    gender: (prefs.myGender === 'prefer-not-to-say' ? 'undisclosed' : prefs.myGender) as CandidateFacts['gender'],
    ageBand: prefs.ageBand ?? '',
    city: '',
    favoriteTitles: prefs.likedSongs,
    topArtists: prefs.likedArtists,
    recentTitles: [],
    playlistTags: [],
    followedEventIds: concertId ? [concertId] : [],
    purposes: prefs.purposes,
    expectedTracks: prefs.expectedTracks,
    chatStyle: prefs.chatStyle,
    groupSize: prefs.groupSize,
    safety: prefs.safety,
    meetupWillingness: meetupWillingnessOf(prefs.safety, prefs.chatStyle),
    story: prefs.story,
    headline: '',
    profileLabel: '',
    avatar: { from: '#31c27c', to: '#0b1116' },
    showCount: 0,
    activeHint: '',
    isDemo: true,
  }
}

export function intentFromPrefs(prefs: Preferences, concertId: string): ParsedIntent {
  return {
    eventId: concertId,
    mentionedSongs: prefs.expectedTracks,
    mentionedArtists: prefs.likedArtists,
    purposes: prefs.purposes,
    chatStyle: prefs.chatStyle,
    groupSize: prefs.groupSize,
    sameGenderOnly: prefs.safety.includes('希望同行者性别相同'),
    meGender: prefs.myGender,
    meetInPerson: true,
    ageBand: prefs.ageBand ?? '',
    strict: false,
    safety: prefs.safety,
    note: '',
  }
}

export function factsFromCandidate(candidate: DemoUser | CandidateFacts): CandidateFacts {
  const raw = candidate as DemoUser
  return {
    userId: raw.id,
    nickname: raw.nickname,
    gender: raw.gender,
    ageBand: ageBandOf(raw.profileLabel),
    city: raw.city,
    favoriteTitles: raw.likedSongs,
    topArtists: raw.likedArtists,
    recentTitles: [],
    playlistTags: [],
    followedEventIds: raw.concertIds,
    purposes: raw.purposes,
    expectedTracks: raw.expectedTracks,
    chatStyle: raw.chatStyle,
    groupSize: raw.groupSize,
    safety: raw.safety,
    meetupWillingness: meetupWillingnessOf(raw.safety, raw.chatStyle),
    story: raw.story,
    headline: raw.headline,
    profileLabel: raw.profileLabel,
    avatar: raw.avatar,
    showCount: raw.showCount,
    activeHint: raw.activeHint,
    isDemo: true,
  }
}

export interface MatchOutcome {
  results: ScoredCandidate[]
  /** 兼容旧字段：被硬条件排除的候选人 */
  blocked: DemoUser[]
  /** 每位被排除的候选人对应的规则与原因，便于向用户解释 */
  excluded: ExcludedCandidate[]
  available: DemoUser[]
  evidence: MatchEvidence[]
}

/** 与 backend/app/matching.py 等价的兼容实现 */
export function computeMatches(prefs: Preferences, pool: DemoUser[], relax = false): MatchOutcome {
  const concertId = pool[0]?.concertIds[0] ?? ''
  const viewer = factsFromPrefs(prefs, concertId)
  const intent = intentFromPrefs(prefs, concertId)

  const blocked: DemoUser[] = []
  const excluded: ExcludedCandidate[] = []
  const available: DemoUser[] = []
  const kept: CandidateFacts[] = []

  for (const user of pool) {
    const facts = factsFromCandidate(user)
    if (!relax) {
      const reason = checkHardConstraints({
        viewer,
        intent,
        candidate: facts,
        eventId: concertId,
        blockedUserIds: [],
        reportedUserIds: [],
      })
      if (reason) {
        blocked.push(user)
        excluded.push(reason)
        continue
      }
    }
    available.push(user)
    kept.push(facts)
  }

  const results = rankCandidates(viewer, intent, kept).map((item) => ({ ...item, matchReason: reasonFor(item) }))
  const evidence = results.flatMap((item) => item.evidence)

  return { results, blocked, excluded, available, evidence }
}

export function songCountOf(concert: Concert): number {
  return concert.setlist.length
}