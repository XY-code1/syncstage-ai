// 同频评分引擎（与 backend/app/agent/scoring.py 完全同一套权重与规则）。
// 前端 mock 模式与后端 Agent 走的是同一套公式，保证演示结果一致。
import type {
  CandidateFacts,
  ExcludedCandidate,
  MatchEvidence,
  MusicBasis,
  ParsedIntent,
  ScoreDimension,
  ScoredCandidate,
} from '../types'

export const AGE_BANDS = ['18-22', '23-26', '27-30', '31+'] as const

export const DIMENSION_WEIGHTS = {
  music: 40,
  expected: 25,
  social: 20,
  style_safety: 15,
} as const

export const DIMENSION_LABELS: Record<string, string> = {
  music: '音乐偏好',
  expected: '演出期待',
  social: '社交目的',
  style_safety: '交流与安全偏好',
}

export const EXCLUSION_LABELS: Record<string, string> = {
  different_event: '不是同一场演出',
  age_band: '年龄段不兼容',
  gender: '性别偏好不兼容',
  group_size: '组队人数不兼容',
  meetup: '见面意愿不兼容',
  blocked: '已被你拉黑或举报',
}

const STYLE_ORDER = ['热情外放', '温和慢热', '安静听歌']

export const QUALIFY_MIN_SCORE = 62

function intersect(first: readonly string[], second: readonly string[]): string[] {
  const pool = new Set(second)
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of first) {
    if (pool.has(item) && !seen.has(item)) {
      seen.add(item)
      result.push(item)
    }
  }
  return result
}

export function ageBandDistance(first: string, second: string): number {
  const a = AGE_BANDS.indexOf(first as (typeof AGE_BANDS)[number])
  const b = AGE_BANDS.indexOf(second as (typeof AGE_BANDS)[number])
  if (a < 0 || b < 0) return 0
  return Math.abs(a - b)
}

function styleDistance(first: string, second: string): number {
  const a = STYLE_ORDER.indexOf(first)
  const b = STYLE_ORDER.indexOf(second)
  if (a < 0 || b < 0) return 2
  return Math.abs(a - b)
}

export function bandOf(score: number): 'high' | 'mid' | 'low' {
  if (score >= 80) return 'high'
  if (score >= 62) return 'mid'
  return 'low'
}

export function checkHardConstraints(args: {
  viewer: CandidateFacts
  intent: ParsedIntent
  candidate: CandidateFacts
  eventId: string
  blockedUserIds: readonly string[]
  reportedUserIds: readonly string[]
}): ExcludedCandidate | null {
  const { intent, candidate, eventId, blockedUserIds, reportedUserIds } = args

  const excluded = (rule: keyof typeof EXCLUSION_LABELS, reason: string): ExcludedCandidate => ({
    userId: candidate.userId,
    nickname: candidate.nickname,
    rule: EXCLUSION_LABELS[rule],
    reason,
  })

  if (eventId && candidate.followedEventIds.length > 0 && !candidate.followedEventIds.includes(eventId)) {
    return excluded('different_event', 'ta 关注的演出里没有这一场')
  }

  const ageLimit = intent.strict ? 0 : 1
  if (intent.ageBand && ageBandDistance(intent.ageBand, candidate.ageBand) > ageLimit) {
    return excluded(
      'age_band',
      `ta 在 ${candidate.ageBand} 年龄段，与你要的 ${intent.ageBand}${intent.strict ? '（严格模式：必须同段）' : '（允许相邻段）'} 不符`,
    )
  }

  if (intent.sameGenderOnly && ['female', 'male'].includes(intent.meGender)) {
    if (['female', 'male'].includes(candidate.gender) && candidate.gender !== intent.meGender) {
      return excluded('gender', '你希望同行者性别相同，ta 的性别不一致')
    }
  }

  const sizeLimit = intent.strict ? 0 : 1
  if (Math.abs(candidate.groupSize - intent.groupSize) > sizeLimit) {
    return excluded(
      'group_size',
      `ta 想组 ${candidate.groupSize} 人，与你要的 ${intent.groupSize} 人${intent.strict ? '严格模式要求完全一致' : '差距过大'}`,
    )
  }

  if (intent.meetInPerson && candidate.meetupWillingness === '暂不线下见面') {
    return excluded('meetup', 'ta 目前只想在房间聊天，暂时不线下见面')
  }

  if (blockedUserIds.includes(candidate.userId) || reportedUserIds.includes(candidate.userId)) {
    return excluded('blocked', 'ta 在你拉黑或举报的名单里')
  }

  return null
}

const SLOT_MINUTES = 30
const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES
const WINDOW_PATTERN = /^(\d{1,2}):(\d{2})\s*[-~—至]\s*(\d{1,2}):(\d{2})$/

function slotLabel(slot: number): string {
  const minutes = ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY * SLOT_MINUTES
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
}

/** 解析 'HH:MM-HH:MM' 听歌时段，跨零点自动处理；无法解析返回 null（不猜测） */
function parseListeningWindow(value: string): { slots: number[] } | null {
  const matched = WINDOW_PATTERN.exec((value || '').trim())
  if (!matched) return null
  const start = Number(matched[1]) * 60 + Number(matched[2])
  const end = Number(matched[3]) * 60 + Number(matched[4])
  if (start >= 24 * 60 || end > 24 * 60) return null
  const span = ((end - start) + 24 * 60) % (24 * 60) || 24 * 60
  const slots: number[] = []
  for (let offset = 0; offset < span; offset += SLOT_MINUTES) {
    slots.push(Math.floor((start + offset) / SLOT_MINUTES) % SLOTS_PER_DAY)
  }
  return { slots }
}

/** 两段听歌时段的相近程度 0~1：按重叠的半小时格子占较短一段的比例计算 */
export function listeningWindowAffinity(first: string, second: string): number {
  const a = parseListeningWindow(first)
  const b = parseListeningWindow(second)
  if (!a || !b || a.slots.length === 0 || b.slots.length === 0) return 0
  const pool = new Set(b.slots)
  const overlap = a.slots.filter((slot) => pool.has(slot)).length
  return overlap / Math.min(a.slots.length, b.slots.length)
}

/** 两段听歌时段的重叠区间文案，例如 '22:30-00:30'；没有重叠时返回空串 */
export function listeningWindowOverlapLabel(first: string, second: string): string {
  const a = parseListeningWindow(first)
  const b = parseListeningWindow(second)
  if (!a || !b) return ''
  const pool = new Set(b.slots)
  const overlap = a.slots.filter((slot) => pool.has(slot))
  if (overlap.length === 0) return ''
  if (overlap.length === SLOTS_PER_DAY) return '全天'
  // 跨零点的重叠在格子编号上会首尾相接（…47, 0, 1…），必须按环形找最长连续段，
  // 否则会算出「00:00-00:00」这种错误区间。
  const slots = new Set(overlap)
  let bestStart = -1
  let bestLength = 0
  for (const slot of overlap) {
    const previous = (slot - 1 + SLOTS_PER_DAY) % SLOTS_PER_DAY
    if (slots.has(previous)) continue
    let length = 0
    let cursor = slot
    while (slots.has(cursor)) {
      length += 1
      cursor = (cursor + 1) % SLOTS_PER_DAY
    }
    if (length > bestLength) {
      bestLength = length
      bestStart = slot
    }
  }
  if (bestStart < 0) return ''
  return slotLabel(bestStart) + '-' + slotLabel(bestStart + bestLength)
}

interface SharedFacts {
  songs: string[]
  artists: string[]
  recent: string[]
  tags: string[]
  /** 曲风 / 情绪标签重合 */
  moods: string[]
  /** 听歌时段重叠区间（为空表示没有明显重叠） */
  listeningWindows: string[]
  /** 听歌时段相近程度 0~1 */
  windowAffinity: number
  expected: string[]
  expectedFromMyFavorite: string[]
  myExpectedInTheirFavorite: string[]
  purposes: string[]
  safety: string[]
  intentSongs: string[]
}

function sharedFacts(viewer: CandidateFacts, candidate: CandidateFacts, intent: ParsedIntent): SharedFacts {
  const windowAffinity = listeningWindowAffinity(viewer.listeningWindow, candidate.listeningWindow)
  const windowOverlap = listeningWindowOverlapLabel(viewer.listeningWindow, candidate.listeningWindow)
  return {
    songs: intersect(viewer.favoriteTitles, candidate.favoriteTitles),
    artists: intersect(viewer.topArtists, candidate.topArtists),
    recent: intersect(viewer.recentTitles, candidate.recentTitles),
    tags: intersect(viewer.playlistTags, candidate.playlistTags),
    moods: intersect(viewer.moodTags, candidate.moodTags),
    listeningWindows: windowOverlap && windowAffinity >= 0.5 ? [windowOverlap] : [],
    windowAffinity,
    expected: intersect(viewer.expectedTracks, candidate.expectedTracks),
    expectedFromMyFavorite: intersect(candidate.expectedTracks, viewer.favoriteTitles),
    myExpectedInTheirFavorite: intersect(viewer.expectedTracks, candidate.favoriteTitles),
    purposes: intersect(intent.purposes.length ? intent.purposes : viewer.purposes, candidate.purposes),
    safety: intersect(viewer.safety, candidate.safety),
    intentSongs: intersect(intent.mentionedSongs, [...candidate.favoriteTitles, ...candidate.expectedTracks]),
  }
}

function weighted(signals: Array<[number, number]>): number {
  const active = signals.reduce((sum, [weight]) => sum + weight, 0) || 1
  return signals.reduce((sum, [weight, value]) => sum + weight * value, 0) / active
}

/**
 * 音乐依据的四个可核验子信号。
 * 需求：共同最近循环 / 共同收藏 / 曲风或情绪相似 / 听歌时段相近，必须都能单独查看。
 */
export function musicSignalsOf(shared: SharedFacts): ScoreDimension[] {
  const favorite: ScoreDimension = {
    id: 'favorite',
    label: '共同收藏',
    weight: 32,
    ratio: Math.min(shared.songs.length / 3, 1),
    points: 0,
    detail: shared.songs.length
      ? `共同收藏 ${shared.songs.length} 首：${shared.songs.slice(0, 3).map((title) => '《' + title + '》').join('、')}`
      : '收藏里没有重合的歌曲',
  }
  const recent: ScoreDimension = {
    id: 'recent',
    label: '共同最近循环',
    weight: 26,
    ratio: Math.min(shared.recent.length / 2, 1),
    points: 0,
    detail: shared.recent.length
      ? `最近都在循环：${shared.recent.slice(0, 3).map((title) => '《' + title + '》').join('、')}`
      : '最近循环没有重合',
  }
  const mood: ScoreDimension = {
    id: 'mood',
    label: '曲风或情绪相似',
    weight: 18,
    ratio: Math.min(shared.moods.length / 3, 1),
    points: 0,
    detail: shared.moods.length
      ? `曲风 / 情绪标签重合：${shared.moods.slice(0, 3).join('、')}`
      : '曲风与情绪标签没有重合',
  }
  const listening: ScoreDimension = {
    id: 'listening_time',
    label: '听歌时段相近',
    weight: 14,
    ratio: shared.windowAffinity,
    points: 0,
    detail: shared.listeningWindows.length
      ? `听歌时段重合在 ${shared.listeningWindows[0]}，相近度 ${Math.round(shared.windowAffinity * 100)}%`
      : '听歌时段没有明显重叠',
  }
  const artist: ScoreDimension = {
    id: 'artist',
    label: '共同常听歌手',
    weight: 10,
    ratio: Math.min(shared.artists.length / 2, 1),
    points: 0,
    detail: shared.artists.length ? `常听歌手都有 ${shared.artists.slice(0, 3).join('、')}` : '常听歌手没有重合',
  }
  return [favorite, recent, mood, listening, artist].map((item) => ({
    ...item,
    ratio: Math.round(item.ratio * 10000) / 10000,
  }))
}

function musicDimension(viewer: CandidateFacts, candidate: CandidateFacts, shared: SharedFacts): ScoreDimension {
  const signals: Array<[number, number]> = [[0.32, Math.min(shared.songs.length / 3, 1)]]
  if (viewer.topArtists.length && candidate.topArtists.length) signals.push([0.1, Math.min(shared.artists.length / 2, 1)])
  if (viewer.recentTitles.length || candidate.recentTitles.length) signals.push([0.26, Math.min(shared.recent.length / 2, 1)])
  if (viewer.moodTags.length || candidate.moodTags.length) signals.push([0.18, Math.min(shared.moods.length / 3, 1)])
  if (viewer.listeningWindow || candidate.listeningWindow) signals.push([0.14, shared.windowAffinity])

  const parts: string[] = [`共同收藏 ${shared.songs.length} 首`]
  if (shared.recent.length) parts.push(`最近都在循环《${shared.recent[0]}》`)
  if (shared.moods.length) parts.push(`曲风 / 情绪相近：${shared.moods[0]}`)
  if (shared.listeningWindows.length) parts.push(`听歌时段重合 ${shared.listeningWindows[0]}`)
  const detail = parts.join(' · ')

  return {
    id: 'music',
    label: DIMENSION_LABELS.music,
    weight: DIMENSION_WEIGHTS.music,
    ratio: Math.round(weighted(signals) * 10000) / 10000,
    points: 0,
    detail,
  }
}

/** 音乐依据强度：不足时页面必须显示「暂无足够音乐依据」，且不允许拿高分 */
export function musicBasisOf(shared: SharedFacts): MusicBasis {
  const hits = [
    shared.songs.length > 0,
    shared.recent.length > 0,
    shared.moods.length > 0,
    shared.listeningWindows.length > 0,
  ].filter(Boolean).length
  if (hits === 0) return 'insufficient'
  if (hits === 1) return 'limited'
  return 'rich'
}

/** 音乐依据不足时的分数上限：不能只靠一首共同歌曲拿到高分 */
export const MUSIC_CAP: Record<MusicBasis, number> = {
  rich: 99,
  limited: 58,
  insufficient: 45,
}

function expectedDimension(viewer: CandidateFacts, candidate: CandidateFacts, shared: SharedFacts): ScoreDimension {
  const signals: Array<[number, number]> = []
  if (viewer.expectedTracks.length || candidate.expectedTracks.length) signals.push([0.6, Math.min(shared.expected.length / 2, 1)])
  if (viewer.favoriteTitles.length) signals.push([0.25, Math.min(shared.expectedFromMyFavorite.length / 2, 1)])
  if (viewer.expectedTracks.length) signals.push([0.15, Math.min(shared.myExpectedInTheirFavorite.length / 2, 1)])

  const parts: string[] = []
  if (shared.expected.length) parts.push(`都在等《${shared.expected.slice(0, 2).join('》《')}》`)
  if (shared.expectedFromMyFavorite.length) parts.push('ta 想听的正好是你的收藏')
  if (shared.myExpectedInTheirFavorite.length) parts.push('你想听的也在 ta 的收藏里')
  return {
    id: 'expected',
    label: DIMENSION_LABELS.expected,
    weight: DIMENSION_WEIGHTS.expected,
    ratio: weighted(signals),
    points: 0,
    detail: parts.length ? parts.join(' · ') : '现场期待没有明显交集',
  }
}

function socialDimension(intent: ParsedIntent, candidate: CandidateFacts, shared: SharedFacts): ScoreDimension {
  const signals: Array<[number, number]> = []
  const wanted = intent.purposes.length ? intent.purposes : candidate.purposes
  if (wanted.length) signals.push([0.6, Math.min(shared.purposes.length / 2, 1)])

  const sizeGap = Math.abs(candidate.groupSize - intent.groupSize)
  signals.push([0.2, sizeGap === 0 ? 1 : sizeGap === 1 ? 0.5 : 0])

  const meetup = candidate.meetupWillingness === '愿意现场见面' ? 1 : candidate.meetupWillingness === '仅在公开场合见面' ? 0.8 : candidate.meetupWillingness === '先聊熟再见' ? 0.6 : 0
  signals.push([0.2, meetup])

  const parts: string[] = []
  if (shared.purposes.length) parts.push(`共同目的「${shared.purposes.slice(0, 2).join('」「')}」`)
  parts.push(`组队 ${candidate.groupSize} 人`)
  parts.push(candidate.meetupWillingness)
  return { id: 'social', label: DIMENSION_LABELS.social, weight: DIMENSION_WEIGHTS.social, ratio: weighted(signals), points: 0, detail: parts.join(' · ') }
}

function styleSafetyDimension(viewer: CandidateFacts, candidate: CandidateFacts, shared: SharedFacts): ScoreDimension {
  const gap = styleDistance(viewer.chatStyle, candidate.chatStyle)
  const signals: Array<[number, number]> = [[0.55, gap === 0 ? 1 : gap === 1 ? 0.5 : 0]]
  if (viewer.safety.length || candidate.safety.length) signals.push([0.45, Math.min(shared.safety.length / 3, 1)])

  const parts = [gap === 0 ? '交流节奏一致' : gap === 1 ? '交流节奏接近' : '交流节奏差异较大']
  if (shared.safety.length) parts.push(`安全边界一致 ${shared.safety.length} 条`)
  return {
    id: 'style_safety',
    label: DIMENSION_LABELS.style_safety,
    weight: DIMENSION_WEIGHTS.style_safety,
    ratio: weighted(signals),
    points: 0,
    detail: parts.join(' · '),
  }
}

export function buildEvidence(shared: SharedFacts, intent: ParsedIntent): MatchEvidence[] {
  const evidence: MatchEvidence[] = []
  const add = (
    kind: MatchEvidence['kind'],
    label: string,
    text: string,
    source: string,
    sourceLabel: string,
    items: string[],
  ) => evidence.push({ kind, label, text, source, sourceLabel, items })

  if (shared.songs.length) {
    add('song', '共同收藏歌曲', `你们的收藏里都有《${shared.songs.slice(0, 3).join('》《')}》`, 'favorite_songs', '收藏歌曲', shared.songs.slice(0, 3))
  }
  if (shared.expected.length) {
    add('expected', '共同现场期待', `你们两个都想在现场听到《${shared.expected.slice(0, 2).join('》《')}》`, 'expected_tracks', '期待曲目', shared.expected.slice(0, 2))
  }
  if (shared.artists.length) {
    add('artist', '共同常听歌手', `常听歌手都有 ${shared.artists.slice(0, 3).join('、')}`, 'top_artists', '常听歌手', shared.artists.slice(0, 3))
  }
  if (shared.recent.length) {
    add('recent', '近期播放重合', `最近都在循环《${shared.recent.slice(0, 2).join('》《')}》`, 'recent_plays', '近期播放', shared.recent.slice(0, 2))
  }
  if (shared.tags.length) {
    add('tag', '歌单标签重合', `你们的歌单都打了「${shared.tags.slice(0, 2).join('」「')}」这样的标签`, 'playlist_tags', '歌单标签', shared.tags.slice(0, 2))
  }
  if (shared.moods.length) {
    add('mood', '曲风或情绪相似', `曲风与情绪标签重合：${shared.moods.slice(0, 3).join('、')}`, 'playlist_tags', '歌单标签', shared.moods.slice(0, 3))
  }
  if (shared.listeningWindows.length) {
    add('listening_time', '听歌时段相近', `你们最近的听歌时段重合在 ${shared.listeningWindows[0]} 前后`, 'recent_plays', '听歌时段', shared.listeningWindows)
  }
  if (shared.purposes.length) {
    add('purpose', '共同同行目的', `都想「${shared.purposes.slice(0, 2).join('」「')}」`, 'intent', '你这次的原话', shared.purposes.slice(0, 2))
  }
  if (shared.intentSongs.length) {
    add('intent_song', '你点名的歌 ta 也有', `你提到想听《${shared.intentSongs.slice(0, 2).join('》《')}》，ta 的歌单里正好有`, 'intent', '你这次的原话', shared.intentSongs.slice(0, 2))
  }
  if (shared.safety.length) {
    add('safety', '安全边界一致', `都选择了「${shared.safety.slice(0, 2).join('」「')}」`, 'intent', '你这次的原话', shared.safety.slice(0, 2))
  }
  if (shared.artists.length || shared.songs.length) {
    add('event', '同一场演出', '你们都关注了这场演出，属于同场观众', 'followed_events', '关注演出', [])
  }
  void intent
  return evidence
}

function buildDifferences(viewer: CandidateFacts, candidate: CandidateFacts, intent: ParsedIntent, shared: SharedFacts): string[] {
  const differences: string[] = []
  if (viewer.chatStyle !== candidate.chatStyle) {
    differences.push(`对方的交流节奏是「${candidate.chatStyle}」，你是「${viewer.chatStyle}」`)
  }
  if (candidate.groupSize !== intent.groupSize) {
    differences.push(`对方想组 ${candidate.groupSize} 人，你这次要的是 ${intent.groupSize} 人`)
  }
  if (viewer.ageBand && candidate.ageBand && viewer.ageBand !== candidate.ageBand) {
    differences.push(`ta 在 ${candidate.ageBand} 年龄段，你在 ${viewer.ageBand}`)
  }
  if (candidate.meetupWillingness !== '愿意现场见面') {
    differences.push(`对方的见面意愿是「${candidate.meetupWillingness}」`)
  }
  const wanted = intent.purposes.length ? intent.purposes : viewer.purposes
  const missing = wanted.filter((item) => !shared.purposes.includes(item))
  if (missing.length) differences.push(`你想「${missing[0]}」，对方的目的里没有这一条`)
  if (!shared.songs.length) differences.push('你们的收藏里没有重合的歌，交集更多在同行方式上')
  if (!differences.length) differences.push('目前看不出明显差异，建议先聊一首歌确认彼此的节奏')
  return differences.slice(0, 3)
}

export function scoreCandidate(viewer: CandidateFacts, intent: ParsedIntent, candidate: CandidateFacts): ScoredCandidate {
  const shared = sharedFacts(viewer, candidate, intent)
  const musicBasis = musicBasisOf(shared)
  const musicSignals = musicSignalsOf(shared).map((signal) => ({
    ...signal,
    points: Math.round(signal.weight * signal.ratio * 10) / 10,
  }))
  const dimensions: ScoreDimension[] = [
    musicDimension(viewer, candidate, shared),
    expectedDimension(viewer, candidate, shared),
    socialDimension(intent, candidate, shared),
    styleSafetyDimension(viewer, candidate, shared),
  ].map((dimension) => ({ ...dimension, ratio: Math.round(dimension.ratio * 10000) / 10000, points: 0 }))

  let total = 0
  for (const dimension of dimensions) {
    dimension.points = Math.round(dimension.weight * dimension.ratio * 10) / 10
    total += dimension.weight * dimension.ratio
  }
  // 音乐依据不足时封顶，避免「只靠一首共同歌曲」拿到高分
  const score = Math.max(0, Math.min(MUSIC_CAP[musicBasis], Math.min(99, Math.round(total))))

  return {
    userId: candidate.userId,
    candidate,
    score,
    band: bandOf(score),
    scoreBreakdown: {
      total: score,
      band: bandOf(score),
      dimensions,
      formula: '音乐偏好 40% + 演出期待 25% + 社交目的 20% + 交流与安全偏好 15%',
      musicSignals,
      musicBasis,
    },
    musicBasis,
    sharedSongs: shared.songs,
    sharedArtists: shared.artists,
    sharedRecent: shared.recent,
    sharedTags: shared.tags,
    sharedMoods: shared.moods,
    sharedListeningWindows: shared.listeningWindows,
    sharedPurposes: shared.purposes,
    sharedExpectedTracks: shared.expected,
    sharedSafety: shared.safety,
    differences: buildDifferences(viewer, candidate, intent, shared),
    evidence: buildEvidence(shared, intent),
    matchReason: '',
    blockedBySafety: false,
  }
}

export function rankCandidates(viewer: CandidateFacts, intent: ParsedIntent, candidates: CandidateFacts[]): ScoredCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(viewer, intent, candidate))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.sharedSongs.length !== a.sharedSongs.length) return b.sharedSongs.length - a.sharedSongs.length
      return b.sharedPurposes.length - a.sharedPurposes.length
    })
}