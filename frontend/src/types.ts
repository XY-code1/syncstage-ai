export type Purpose = '一起排队候场' | '副歌一起唱' | '演出后聊音乐' | '安静听完整场' | '拍照记录现场'

export type ChatStyle = '热情外放' | '温和慢热' | '安静听歌'

export type SafetyPref =
  | '只在公开场合见面'
  | '不交换私人联系方式'
  | '希望同行者性别相同'
  | '结伴入场与离场'
  | '先在群里聊熟再见面'
  | '不接受临时改约'

export type GroupSize = 2 | 3 | 4

export type Gender = 'female' | 'male' | 'undisclosed'

export type MyGender = 'female' | 'male' | 'prefer-not-to-say'

export interface DemoBadgeMeta {
  isDemo: true
}

export interface Concert {
  id: string
  title: string
  subtitle: string
  artist: string
  artistNote: string
  date: string
  dateLabel: string
  city: string
  venue: string
  venueNote: string
  priceLabel: string
  durationLabel: string
  ticketStatus: string
  capacityNote: string
  intro: string
  hotSongs: string[]
  setlist: string[]
  poster: {
    from: string
    via: string
    to: string
    accent: string
    keywords: string[]
  }
  attendeeCount: number
  safetyTips: string[]
  meetingPoint: {
    name: string
    time: string
    note: string
  }
  memoryKeywords: string[]
  memoryLines: string[]
  isDemo: true
}

export interface DemoUser {
  id: string
  nickname: string
  gender: Gender
  genderLabel: string
  profileLabel: string
  city: string
  avatar: { from: string; to: string }
  headline: string
  likedSongs: string[]
  likedArtists: string[]
  expectedTracks: string[]
  story: string
  purposes: Purpose[]
  chatStyle: ChatStyle
  groupSize: GroupSize
  safety: SafetyPref[]
  concertIds: string[]
  showCount: number
  activeHint: string
  isDemo: true
}

export interface Preferences {
  ageBand?: string
  likedSongs: string[]
  likedArtists: string[]
  expectedTracks: string[]
  story: string
  purposes: Purpose[]
  chatStyle: ChatStyle
  groupSize: GroupSize
  safety: SafetyPref[]
  myGender: MyGender
}

export interface TagGroup {
  id: string
  title: string
  hint: string
  tags: string[]
}

export interface AiTags {
  groups: TagGroup[]
  storyKeywords: string[]
  summary: string
  confirmedAt: number
}

export type EvidenceKind =
  | 'song'
  | 'artist'
  | 'recent'
  | 'tag'
  | 'purpose'
  | 'expected'
  | 'intent_song'
  | 'safety'
  | 'event'

export interface MatchEvidence {
  kind: EvidenceKind
  label: string
  text: string
  /** 这条证据来自哪一类被授权的数据（收藏歌曲 / 常听歌手 / 近期播放 / 关注演出 / 歌单标签 / 你这次的原话） */
  source: string
  sourceLabel: string
  /** 证据里被引用到的具体条目，推荐理由只能引用这里出现过的内容 */
  items: string[]
}

export type MatchBand = 'high' | 'mid' | 'low'

export interface ScoreDimension {
  id: 'music' | 'expected' | 'social' | 'style_safety' | string
  label: string
  weight: number
  ratio: number
  points: number
  detail: string
}

export interface ScoreBreakdown {
  total: number
  band: MatchBand
  dimensions: ScoreDimension[]
  formula: string
}

export interface ScoredCandidate {
  userId: string
  candidate: CandidateFacts
  score: number
  band: MatchBand
  scoreBreakdown: ScoreBreakdown
  sharedSongs: string[]
  sharedArtists: string[]
  sharedRecent: string[]
  sharedTags: string[]
  sharedPurposes: string[]
  sharedExpectedTracks: string[]
  sharedSafety: string[]
  differences: string[]
  evidence: MatchEvidence[]
  matchReason: string
  blockedBySafety: boolean
}

/** 兼容旧命名 */
export type MatchResult = ScoredCandidate

export interface RoomMember {
  userId: string
  nickname: string
  avatar: { from: string; to: string }
  isMe: boolean
  role: 'me' | 'partner' | 'companion'
  confirmed: boolean
  note: string
  chatStyle: ChatStyle
}

export interface RoomTask {
  id: string
  label: string
  detail: string
  done: boolean
}

export interface RoomState {
  roomId: string
  concertId: string
  concertTitle: string
  meetingPoint: { name: string; time: string; note: string }
  members: RoomMember[]
  icebreakers: string[]
  tasks: RoomTask[]
  createdAt: number
  meetingConfirmed: boolean
}

export interface MemoryMember {
  userId: string
  nickname: string
  avatar: { from: string; to: string }
}

export interface MemoryCardData {
  id: string
  concertId: string
  concertTitle: string
  artist: string
  dateLabel: string
  venue: string
  sharedSongs: string[]
  keywords: string[]
  members: MemoryMember[]
  line: string
  lineOptions: string[]
  createdAt: number
}

export type InviteStatus = 'idle' | 'sending' | 'sent' | 'peer_viewed' | 'confirmed' | 'declined'

export interface InviteState {
  userId: string | null
  status: InviteStatus
  updatedAt: number
}

/** 网络与演示场景 */
export type DemoScenario = 'normal' | 'slow' | 'error'

/** 评委演示模式的三个案例 */
export type DemoCase = 'normal' | 'safety_no_match' | 'ai_fallback'

export type DataMode = 'mock' | 'backend'

export interface ToastMessage {
  id: string
  text: string
  tone: 'default' | 'success' | 'warn'
}


// ---------------------------------------------------------------------------
// TME 数据适配层（前端镜像，与 backend/app/integrations 同形）
// ---------------------------------------------------------------------------

export type AuthorizationScope =
  | 'favorite_songs'
  | 'top_artists'
  | 'recent_plays'
  | 'followed_events'
  | 'playlist_tags'

export interface ScopeMeta {
  id: AuthorizationScope
  label: string
  detail: string
  example: string
}

export interface MusicTrack {
  trackId: string
  title: string
  artist: string
  album: string
  tags: string[]
}

export interface RecentPlay {
  trackId: string
  title: string
  artist: string
  playCount: number
  lastPlayedAt: string
}

export interface MusicProfile {
  userId: string
  displayName: string
  ageBand: string
  city: string
  gender: Gender
  favoriteTracks: MusicTrack[]
  topArtists: string[]
  recentPlays: RecentPlay[]
  followedEventIds: string[]
  playlistTags: string[]
  authorizedScopes: AuthorizationScope[]
  source: 'mock_demo' | 'official_tme'
  isDemo: boolean
}

export interface ProviderInfo {
  provider: string
  source: 'mock_demo' | 'official_tme'
  isDemo: boolean
  disclaimer: string
  trackCount?: number
  userCount?: number
  notice?: string
  scopes?: AuthorizationScope[]
}

/** 合并后的候选人事实：音乐侧来自 TMEDataProvider，社交侧来自产品自身 */
export interface CandidateFacts {
  userId: string
  nickname: string
  gender: Gender
  ageBand: string
  city: string
  favoriteTitles: string[]
  topArtists: string[]
  recentTitles: string[]
  playlistTags: string[]
  followedEventIds: string[]
  purposes: Purpose[]
  expectedTracks: string[]
  chatStyle: ChatStyle
  groupSize: GroupSize
  safety: SafetyPref[]
  meetupWillingness: MeetupWillingness
  story: string
  headline: string
  profileLabel: string
  avatar: { from: string; to: string }
  showCount: number
  activeHint: string
  isDemo: boolean
}

export type MeetupWillingness = '愿意现场见面' | '仅在公开场合见面' | '先聊熟再见' | '暂不线下见面'

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export interface ParsedIntent {
  eventId: string
  mentionedSongs: string[]
  mentionedArtists: string[]
  purposes: Purpose[]
  chatStyle: ChatStyle
  groupSize: GroupSize
  sameGenderOnly: boolean
  meGender: MyGender
  meetInPerson: boolean
  ageBand: string
  strict: boolean
  safety: SafetyPref[]
  note: string
}

export type AgentStatus =
  | 'collecting_intent'
  | 'intent_parsed'
  | 'awaiting_user_confirm'
  | 'running'
  | 'pending_confirmation'
  | 'room_created'
  | 'no_match'
  | 'error'

export type ToolStatus = 'ok' | 'fallback' | 'error' | 'skipped'

export interface ToolTrace {
  name: string
  label: string
  phase: string
  status: ToolStatus
  inputSummary: string
  outputSummary: string
  durationMs: number
  usedFallback: boolean
  error: string
}

export interface AgentPhase {
  id: string
  label: string
  detail: string
  state: 'pending' | 'done' | 'failed'
  steps: ToolTrace[]
}

export interface ExcludedCandidate {
  userId: string
  nickname: string
  rule: string
  reason: string
}

export interface GroupMember {
  userId: string
  nickname: string
  role: 'me' | 'partner' | 'companion'
  score: number | null
}

export interface ProposedGroup {
  size?: number
  requestedSize?: number
  shrunk?: boolean
  members?: GroupMember[]
  qualifyMinScore?: number
  meetingPoint?: { name?: string; time?: string; note?: string }
  meetingNote?: string
  rationale?: string
}

export interface PendingConfirmation {
  required: boolean
  status: 'none' | 'awaiting_user' | 'awaiting_peer' | 'both_confirmed' | 'declined' | 'blocked' | 'confirmed'
  candidateId?: string | null
  proposerConfirmed?: boolean
  peerConfirmed?: boolean
  reason?: string
  nextAction?: 'invite' | 'wait_peer' | 'create_room' | 'back_to_matches' | 'relax' | string
}

export interface AgentState {
  sessionId: string
  userId: string
  eventId: string
  rawIntent: string
  parsedIntent: ParsedIntent | null
  musicProfile: MusicProfile | null
  candidateIds: string[]
  excludedCandidates: ExcludedCandidate[]
  rankedCandidates: ScoredCandidate[]
  proposedGroup: ProposedGroup
  evidence: Array<MatchEvidence & { userId?: string; nickname?: string }>
  pendingConfirmation: PendingConfirmation
  roomId: string | null
  /** 双方确认后由 create_room 生成的临时房间 */
  room?: Partial<RoomState> | null
  status: AgentStatus
  error: string
  authorizedScopes: AuthorizationScope[]
  scenario: string
  trace: ToolTrace[]
  phases: AgentPhase[]
  provider: ProviderInfo | null
  createdAt: number
  updatedAt: number
}