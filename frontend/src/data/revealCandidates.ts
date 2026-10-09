export type RevealAccent = 'orange' | 'violet' | 'cyan'

export type RevealCandidate = {
  candidateId: string
  /** Existing business-layer id. Invite/room state continues to use this id. */
  sourceUserId: string
  displayName: string
  avatar: string
  avatarFallback: string
  matchScore: number
  sharedSong: string
  artist: string
  reason: string
  musicTags: string[]
  accent: RevealAccent
}

export const matchCandidates: RevealCandidate[] = [
  {
    candidateId: 'u-orange-01', sourceUserId: 'u-01', displayName: '靠近舞台的橘子',
    avatar: 'avatars/candidate-orange.webp', avatarFallback: '橙', matchScore: 80,
    sharedSong: '烟花', artist: '永彬Ryan.B', reason: '你们都想在副歌一起唱',
    musicTags: ['现场合唱', '热烈', '靠近舞台'], accent: 'orange',
  },
  {
    candidateId: 'u-jiangli-01', sourceUserId: 'u-08', displayName: '写歌的江离',
    avatar: 'avatars/candidate-jiangli.webp', avatarFallback: '江', matchScore: 74,
    sharedSong: '北京昨夜下了雪', artist: 'Lambert凌杰', reason: '你们都喜欢安静听完整首歌',
    musicTags: ['深夜循环', '冷静', '创作'], accent: 'violet',
  },
  {
    candidateId: 'u-ache-01', sourceUserId: 'u-04', displayName: '带着相机的阿澈',
    avatar: 'avatars/candidate-ache.webp', avatarFallback: '澈', matchScore: 67,
    sharedSong: '发个定位', artist: '永彬Ryan.B', reason: '你们都想记录散场后的现场',
    musicTags: ['摄影', '散场音乐', '轻松'], accent: 'cyan',
  },
]

export function revealCandidateById(candidateId?: string | null) {
  return matchCandidates.find((candidate) => candidate.candidateId === candidateId) ?? null
}

export function sourceCandidateId(candidateId?: string | null) {
  return revealCandidateById(candidateId)?.sourceUserId ?? candidateId ?? ''
}
