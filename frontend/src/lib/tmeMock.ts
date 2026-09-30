// 前端版 TME 数据适配层（与 backend/app/integrations/mock_qqmusic.py 同形）。
// 初赛没有 TME 官方 API，这里用脱敏 Demo 数据模拟；入围后把这一层换成真实接口即可，
// 上层的 Agent 与页面不需要改动。
import { demoConcerts, demoUsers } from '../data/demoData'
import type {
  AuthorizationScope,
  CandidateFacts,
  ChatStyle,
  Concert,
  DemoUser,
  Gender,
  GroupSize,
  MeetupWillingness,
  MusicProfile,
  MusicTrack,
  ProviderInfo,
  Purpose,
  RecentPlay,
  SafetyPref,
  ScopeMeta,
} from '../types'

export const MOCK_DISCLAIMER = '初赛暂未提供 TME 官方 API，当前使用脱敏 Demo 数据模拟；入围后可替换官方测试 API。'

export const AUTHORIZATION_SCOPES: ScopeMeta[] = [
  {
    id: 'favorite_songs',
    label: '收藏歌曲',
    detail: '只用于计算你我收藏里的重合曲目',
    example: '《夜航的信》《回声》《雨中电台》',
  },
  {
    id: 'top_artists',
    label: '常听歌手',
    detail: '用于判断长期口味是否接近，不做任何公开展示',
    example: '星野回声、短波电台、潮汐线',
  },
  {
    id: 'recent_plays',
    label: '近期播放',
    detail: '只看最近循环的歌，用来判断你最近在听什么',
    example: '最近 30 天播放次数最高的几首',
  },
  {
    id: 'followed_events',
    label: '关注演出',
    detail: '确认你和对方关注的是同一场演出',
    example: '夜航计划 · 上海站',
  },
  {
    id: 'playlist_tags',
    label: '歌单标签',
    detail: '用你给歌单起的名字判断听歌场景',
    example: '深夜通勤、考研自习室',
  },
]

export const ALL_SCOPES: AuthorizationScope[] = AUTHORIZATION_SCOPES.map((scope) => scope.id)

export const PROVIDER_INFO: ProviderInfo = {
  provider: 'mock_qqmusic',
  source: 'mock_demo',
  isDemo: true,
  disclaimer: MOCK_DISCLAIMER,
  scopes: ALL_SCOPES,
}

export const SCOPE_LABELS: Record<string, string> = Object.fromEntries(
  AUTHORIZATION_SCOPES.map((scope) => [scope.id, scope.label]),
)

const PLAYLIST_TAGS: Record<string, string[]> = {
  'u-01': ['深夜通勤', '副歌高音区', '毕业季循环'],
  'u-02': ['图书馆闭馆歌单', '考研自习室', '雨天单曲循环'],
  'u-03': ['一个人的高铁', '安静听歌', '睡前白噪音'],
  'u-04': ['现场速写', '快门与鼓点', '巡演打卡'],
  'u-05': ['加班回家路上', '末班地铁', '同事一起听'],
  'u-06': ['高中回忆杀', '大合唱歌单', '荧光色系'],
  'u-07': ['夜班后台', '调音台旁', '低音贝斯'],
  'u-08': ['城市散步', '路边摊夜宵', '老歌翻唱'],
  'u-09': ['深夜写作', '雨声采样', '孤独但不emo'],
  'u-10': ['周末看展', '慢速生活', '咖啡店背景音'],
  'u-11': ['跨城看演出', '高铁歌单', '第一次一个人'],
  'u-12': ['乐队排练室', '翻唱练习', '鼓点很重'],
  'u-13': ['海边旅行', '毕业旅行', '咸味的风'],
  'u-14': ['回南天', '潮湿天气', '窗边听歌'],
  'u-15': ['社恐友好', '耳机半只', '安静角落'],
  'u-16': ['现场速写本', '插画BGM', '合唱瞬间'],
  'u-viewer': ['考研那一年', '深夜通勤', '副歌一定要唱'],
}

const EXTRA_TRACKS: Array<[string, string, string]> = [
  ['别在夏天说再见', '星野回声', '夜航计划'],
  ['夏天最后一支歌', '潮汐线', '潮汐线'],
  ['凌晨四点的便利店', '沈亦舟', '潮湿的午夜'],
  ['回南天', '潮汐线', '潮汐线'],
]

/** 演示访客：初赛不接入真实 QQ 音乐账号，用一份脱敏画像代替 */
export const DEMO_VIEWER = {
  userId: 'u-viewer',
  nickname: '你',
  gender: 'female' as Gender,
  profileLabel: '23 岁 · Demo 访客',
  age: 23,
  city: '上海',
  headline: '第一次用一起去现场，想找个人一起把副歌唱完',
  likedSongs: ['夜航的信', '回声', '雨中电台', '别在夏天说再见'],
  likedArtists: ['星野回声', '短波电台', '潮汐线'],
  expectedTracks: ['夜航的信', '回声'],
  story: '考研那年在图书馆闭馆后一直听《雨中电台》，这次想站到前面把副歌唱完。',
  purposes: ['副歌一起唱', '演出后聊音乐'] as Purpose[],
  chatStyle: '温和慢热' as ChatStyle,
  groupSize: 3 as GroupSize,
  safety: ['只在公开场合见面', '不交换私人联系方式', '结伴入场与离场'] as SafetyPref[],
  concertIds: ['night-flight', 'wet-midnight', 'tide-line'],
  blockedUserIds: [] as string[],
  reportedUserIds: [] as string[],
}

function trackId(title: string): string {
  let hash = 0
  for (let index = 0; index < title.length; index += 1) {
    hash = (hash * 31 + title.charCodeAt(index)) % 1000000007
  }
  return 'trk-' + hash.toString(16).padStart(8, '0')
}

function buildCatalog(): Map<string, MusicTrack> {
  const catalog = new Map<string, MusicTrack>()
  for (const concert of demoConcerts) {
    for (const song of concert.setlist) {
      if (!catalog.has(song)) {
        catalog.set(song, {
          trackId: trackId(song),
          title: song,
          artist: concert.artist,
          album: concert.title,
          tags: concert.poster.keywords,
        })
      }
    }
  }
  for (const [title, artist, album] of EXTRA_TRACKS) {
    if (!catalog.has(title)) {
      catalog.set(title, { trackId: trackId(title), title, artist, album, tags: ['单曲'] })
    }
  }
  return catalog
}

export const TRACK_CATALOG = buildCatalog()

export function ageBandOf(profileLabel: string, explicit?: number): string {
  const matched = /(\d+)\s*岁/.exec(profileLabel || '')
  const age = explicit ?? (matched ? Number(matched[1]) : 24)
  if (age <= 22) return '18-22'
  if (age <= 26) return '23-26'
  if (age <= 30) return '27-30'
  return '31+'
}

export function meetupWillingnessOf(safety: readonly string[], chatStyle: string): MeetupWillingness {
  if (chatStyle === '安静听歌' && safety.includes('不交换私人联系方式')) return '暂不线下见面'
  if (safety.includes('先在群里聊熟再见面')) return '先聊熟再见'
  if (safety.includes('只在公开场合见面') || safety.includes('不交换私人联系方式')) return '仅在公开场合见面'
  return '愿意现场见面'
}

function tracksFor(titles: readonly string[], fallbackArtist: string): MusicTrack[] {
  return titles.map((title) => {
    const track = TRACK_CATALOG.get(title)
    if (track) return track
    return { trackId: trackId(title), title, artist: fallbackArtist, album: '', tags: [] }
  })
}

function recentPlaysOf(userId: string, expected: readonly string[], liked: readonly string[]): RecentPlay[] {
  const seed = userId.length
  const pool = Array.from(new Set([...expected, ...liked])).slice(0, 4)
  return pool
    .map((title, index) => {
      const track = TRACK_CATALOG.get(title)
      return {
        trackId: trackId(title),
        title,
        artist: track?.artist ?? '星野回声',
        playCount: 48 - index * 9 - (seed % 5),
        lastPlayedAt: `2026-09-${String(18 + ((seed + index) % 10)).padStart(2, '0')}`,
      }
    })
    .sort((a, b) => b.playCount - a.playCount)
}

/**
 * 前端版 get_user_music_profile：只返回用户授权过的数据类型。
 * scopes 为空数组时按"什么都没授权"处理，Agent 必须显式处理这种情况。
 */
export function getMusicProfile(userId: string, scopes: readonly AuthorizationScope[] = ALL_SCOPES): MusicProfile | null {
  const granted = new Set(scopes)
  const raw = userId === DEMO_VIEWER.userId ? DEMO_VIEWER : demoUsers.find((user) => user.id === userId)
  if (!raw) return null

  const liked = raw.likedSongs
  const artists = raw.likedArtists
  const expected = raw.expectedTracks

  return {
    userId: userId === DEMO_VIEWER.userId ? DEMO_VIEWER.userId : (raw as DemoUser).id,
    displayName: raw.nickname,
    ageBand: ageBandOf(raw.profileLabel),
    city: raw.city,
    gender: raw.gender,
    favoriteTracks: granted.has('favorite_songs') ? tracksFor(liked, artists[0] ?? '星野回声') : [],
    topArtists: granted.has('top_artists') ? [...artists] : [],
    recentPlays: granted.has('recent_plays') ? recentPlaysOf(userId, expected, liked) : [],
    followedEventIds: granted.has('followed_events') ? [...raw.concertIds] : [],
    playlistTags: granted.has('playlist_tags') ? (PLAYLIST_TAGS[userId] ?? []).slice(0, 4) : [],
    authorizedScopes: ALL_SCOPES.filter((scope) => granted.has(scope)),
    source: 'mock_demo',
    isDemo: true,
  }
}

export function getEventContext(eventId: string): Concert | null {
  return demoConcerts.find((concert) => concert.id === eventId) ?? null
}

export function attendeesOf(eventId: string): DemoUser[] {
  return demoUsers.filter((user) => user.concertIds.includes(eventId))
}

/** 把某位用户拼成完整事实集合（音乐侧 + 社交侧） */
export function candidateFacts(userId: string, scopes: readonly AuthorizationScope[] = ALL_SCOPES): CandidateFacts | null {
  const music = getMusicProfile(userId, scopes)
  if (!music) return null
  const raw = userId === DEMO_VIEWER.userId ? DEMO_VIEWER : demoUsers.find((user) => user.id === userId)
  if (!raw) return null

  const avatar = 'avatar' in raw ? raw.avatar : { from: '#31c27c', to: '#0b1116' }
  return {
    userId: music.userId,
    nickname: raw.nickname,
    gender: music.gender,
    ageBand: music.ageBand,
    city: music.city,
    favoriteTitles: music.favoriteTracks.map((track) => track.title),
    topArtists: music.topArtists,
    recentTitles: music.recentPlays.map((play) => play.title),
    playlistTags: music.playlistTags,
    followedEventIds: music.followedEventIds,
    purposes: [...raw.purposes],
    expectedTracks: [...raw.expectedTracks],
    chatStyle: raw.chatStyle,
    groupSize: raw.groupSize,
    safety: [...raw.safety],
    meetupWillingness: meetupWillingnessOf(raw.safety, raw.chatStyle),
    story: raw.story,
    headline: raw.headline,
    profileLabel: raw.profileLabel,
    avatar,
    showCount: 'showCount' in raw ? raw.showCount : 0,
    activeHint: 'activeHint' in raw ? raw.activeHint : '演示中',
    isDemo: true,
  }
}

export function viewerFacts(scopes: readonly AuthorizationScope[] = ALL_SCOPES): CandidateFacts {
  return candidateFacts(DEMO_VIEWER.userId, scopes) as CandidateFacts
}

export function viewerSocial() {
  return {
    userId: DEMO_VIEWER.userId,
    displayName: DEMO_VIEWER.nickname,
    gender: DEMO_VIEWER.gender,
    blockedUserIds: DEMO_VIEWER.blockedUserIds,
    reportedUserIds: DEMO_VIEWER.reportedUserIds,
  }
}

/** 把自然语言里提到的歌名解析成曲目（对应 provider.search_tracks） */
export function searchTracks(text: string): MusicTrack[] {
  const body = text || ''
  const hits: MusicTrack[] = []
  for (const track of TRACK_CATALOG.values()) {
    if (body.includes(track.title)) hits.push(track)
  }
  return hits.slice(0, 8)
}
