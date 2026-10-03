/**
 * 腾讯音乐高校 AI Hackathon「官方参考歌单」接入数据（初赛 Demo 专用）。
 *
 * 版权与合规边界（重要）：
 * - 本文件只保存「歌名 + 官方歌单链接 + 演示用主观标注」，不包含任何音频文件、歌词、专辑封面或受版权保护的素材。
 * - 不下载、不抓取、不转码任何歌曲音频；不破解任何播放限制；不做任何试听代理。
 * - 初赛没有官方 API：这些数据是本地演示数据，页面必须标注「赛事Demo模拟数据」。
 * - trackId 是本仓库自有的本地演示编号，**不是** QQ 音乐 songmid；我们没有从官方页面取得单曲 ID，
 *   因此也没有猜测、拼装任何单曲跳转地址，只保留官方歌单总链接。
 * - artist / album / duration / sourceUrl 等需要以官方页面为准的字段，无法可靠核实时一律为 null，
 *   绝不填入猜测值（宁可留空，也不虚构官方曲目信息）。
 *
 * 官方歌单（由赛事方提供，原样保留，未做任何改写）：
 * https://c6.y.qq.com/base/fcgi-bin/u?__=UFgdsoYo9Glo
 */

export interface OfficialDemoTrack {
  /** 本地演示编号，不是 QQ 音乐 songmid */
  trackId: string
  title: string
  /** 未从官方页面核实 → null（不猜测） */
  artist: string | null
  album: string | null
  duration: string | null
  /** 单曲详情链接：无法可靠取得时为 null，只保留歌单总链接 */
  sourceUrl: string | null
  /** 演示用主观标注，不代表官方曲目信息 */
  tags: string[]
  mood: string
  listeningScene: string
  isOfficialDemoTrack: true
}

/** 官方参考歌单元信息（链接由赛事方提供，原样保留） */
export const OFFICIAL_PLAYLIST = {
  title: '腾讯音乐高校 AI Hackathon · 官方参考歌单',
  shortTitle: '官方参考歌单',
  url: 'https://c6.y.qq.com/base/fcgi-bin/u?__=UFgdsoYo9Glo',
  provider: 'QQ音乐',
  /** 本次接入只做到了「歌名 + 歌单链接」；单曲页信息尚未核实 */
  metadataVerified: false as const,
  isDemo: true as const,
  notice: '赛事Demo模拟数据：只引用官方歌单的歌名与歌单链接，未接入官方 API，也不包含任何音频、歌词或封面素材。',
} as const

export const OFFICIAL_PLAYLIST_URL: string = OFFICIAL_PLAYLIST.url

/** 页面上的来源标识文案 */
export const OFFICIAL_PLAYLIST_BADGE = '来自官方参考歌单'

/** 「打开QQ音乐歌单」按钮文案 */
export const OFFICIAL_PLAYLIST_ACTION = '打开QQ音乐歌单'

/** 音乐来源与 Demo 用途说明 */
export const OFFICIAL_PLAYLIST_USE_NOTE =
  '本场匹配的音乐依据来自赛事官方参考歌单：只使用歌名参与「共同收藏 / 最近循环 / 情绪标签 / 听歌时段」的计算，不会播放音乐，也不读取你的真实账号数据。'

/**
 * 从官方参考歌单中选出用于演示的 5 首歌（歌名由赛事方歌单给出，未做改写）。
 * 顺序即演示中的展示顺序。
 */
export const OFFICIAL_DEMO_TRACKS: OfficialDemoTrack[] = [
  {
    trackId: 'sfl-demo-track-01',
    title: '北京昨夜下了雪',
    artist: null,
    album: null,
    duration: null,
    sourceUrl: null,
    tags: ['深夜', '城市民谣', '叙事'],
    mood: '冷冽 / 深夜独处',
    listeningScene: '深夜通勤与一个人走回家的路上',
    isOfficialDemoTrack: true,
  },
  {
    trackId: 'sfl-demo-track-02',
    title: '坏心情',
    artist: null,
    album: null,
    duration: null,
    sourceUrl: null,
    tags: ['情绪', '流行', '轻快'],
    mood: '有点丧但不沉底',
    listeningScene: '下班路上和加班后的地铁里',
    isOfficialDemoTrack: true,
  },
  {
    trackId: 'sfl-demo-track-03',
    title: '特别关系',
    artist: null,
    album: null,
    duration: null,
    sourceUrl: null,
    tags: ['情歌', '流行', '温柔'],
    mood: '暧昧 / 温柔',
    listeningScene: '睡前单曲循环',
    isOfficialDemoTrack: true,
  },
  {
    trackId: 'sfl-demo-track-04',
    title: '烟花',
    artist: null,
    album: null,
    duration: null,
    sourceUrl: null,
    tags: ['现场感', '副歌', '热烈'],
    mood: '热烈 / 短暂',
    listeningScene: '演唱会候场和全场大合唱',
    isOfficialDemoTrack: true,
  },
  {
    trackId: 'sfl-demo-track-05',
    title: '发个定位',
    artist: null,
    album: null,
    duration: null,
    sourceUrl: null,
    tags: ['都市', '夜生活', '轻快'],
    mood: '都市 / 松弛',
    listeningScene: '朋友聚会与散场后的夜宵摊',
    isOfficialDemoTrack: true,
  },
]

export const OFFICIAL_DEMO_TRACK_TITLES: string[] = OFFICIAL_DEMO_TRACKS.map((track) => track.title)

const TRACK_INDEX: Map<string, OfficialDemoTrack> = new Map(
  OFFICIAL_DEMO_TRACKS.map((track) => [track.title, track]),
)

export function officialTrackByTitle(title: string): OfficialDemoTrack | undefined {
  return TRACK_INDEX.get(title)
}

export function isOfficialDemoTitle(title: string): boolean {
  return TRACK_INDEX.has(title)
}

/** 演示用情绪 / 曲风标签集合（去重，供歌单标签匹配使用） */
export const OFFICIAL_DEMO_MOOD_TAGS: string[] = Array.from(
  new Set(OFFICIAL_DEMO_TRACKS.flatMap((track) => [...track.tags, track.mood])),
)

/** 只保留歌名，供匹配与对话引用；避免把演示标注当成官方曲目信息传播 */
export function officialTitlesOf(titles: readonly string[]): string[] {
  return titles.filter((title) => TRACK_INDEX.has(title))
}