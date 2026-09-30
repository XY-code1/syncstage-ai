import type { AgentState, HandshakeReport, ScoredCandidate } from '../types'

export const A2A_TOOLS = [
  'verify_same_event', 'compare_arrival_plan', 'compare_music_profile', 'compare_social_intent',
  'negotiate_group_size', 'verify_safety_constraints', 'identify_conflicts', 'generate_handshake_report',
] as const

const FORBIDDEN_FIELDS = ['真实姓名', '联系方式', '精确位置', '原始听歌历史']

export function generateHandshakeReport(_agent: AgentState, item: ScoredCandidate): HandshakeReport {
  const agreements = [
    '已核验为同一场演出',
    ...(item.sharedSongs.length ? [`共同喜欢 ${item.sharedSongs.slice(0, 2).map((v) => `《${v}》`).join('、')}`] : []),
    ...(item.sharedArtists.length ? [`共同歌手：${item.sharedArtists.join('、')}`] : []),
    ...(item.sharedPurposes.length ? [`同行目的：${item.sharedPurposes.join('、')}`] : []),
  ]
  const conflicts = [...item.differences]
  const needsHumanConfirmation = conflicts.length
    ? ['到场时间与集合时刻需双方真人确认', ...conflicts.map((value) => `确认差异：${value}`)]
    : ['到场时间与集合时刻需双方真人确认']
  const evidence = item.evidence.slice(0, 6).map((entry) => ({ field: entry.sourceLabel, value: entry.text, source: entry.source }))
  return {
    candidateId: item.userId,
    agreements,
    conflicts,
    needsHumanConfirmation,
    evidence,
    hiddenFields: FORBIDDEN_FIELDS,
    safetyResult: item.blockedBySafety ? 'blocked' : 'passed',
    exchangedFields: ['eventId', 'arrivalWindow', 'musicTags', 'socialIntent', 'groupSize', 'safetyConstraints'],
  }
}

export function containsSensitiveExchange(report: HandshakeReport): boolean {
  return report.exchangedFields.some((field) => ['realName', 'phone', 'contact', 'exactLocation', 'rawListeningHistory'].includes(field))
}
