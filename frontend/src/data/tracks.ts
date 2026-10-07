import { OFFICIAL_PLAYLIST_BADGE, officialTrackByTitle } from './officialHackathonPlaylist'

export type ParticlePreset = 'snow-drift' | 'firework-burst' | 'city-scan'

export type Track = {
  id: string
  title: string
  artist: string
  /** Demo 展示时长（秒），不是未经核实的官方曲长。 */
  duration: number
  mood: string[]
  accentColor: string
  particlePreset: ParticlePreset
  qqMusicUrl: string
  localPreviewSrc?: string
  sourceLabel: string
}

const publicDemoPreview = () => `${import.meta.env.BASE_URL}audio/demo-preview.mp3`

export const qqMusicSearchUrl = (title: string, artist: string) =>
  `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(`${title} ${artist}`)}`

const makeTrack = (
  title: string,
  artist: string,
  accentColor: string,
  particlePreset: ParticlePreset,
): Track => {
  const official = officialTrackByTitle(title)
  return {
    id: official?.trackId ?? `demo-${title}`,
    title,
    artist,
    duration: 30,
    mood: official ? [official.mood, ...official.tags] : [],
    accentColor,
    particlePreset,
    // Use a durable search URL rather than guessing a song-specific QQ Music URL.
    qqMusicUrl: qqMusicSearchUrl(title, artist),
    // A self-made public cue enables online playback. It is never presented as
    // the official song, and each UI surface labels the limitation.
    localPreviewSrc: publicDemoPreview(),
    sourceLabel: OFFICIAL_PLAYLIST_BADGE,
  }
}

/** 由官方参考歌单元数据派生；本文件只补充本地 Demo 播放与视觉字段。 */
export const FEATURED_TRACKS: Track[] = [
  makeTrack('北京昨夜下了雪', 'Lambert凌杰', '#67e8f9', 'snow-drift'),
  makeTrack('烟花', '永彬Ryan.B', '#31f58a', 'firework-burst'),
  makeTrack('发个定位', '永彬Ryan.B', '#a78bfa', 'city-scan'),
]

export const trackById = (id: string): Track => FEATURED_TRACKS.find((track) => track.id === id) ?? FEATURED_TRACKS[0]
export const trackByTitle = (title: string): Track | undefined => FEATURED_TRACKS.find((track) => track.title === title)


/** 场景音乐：入口 / 匹配成功高光 / 等待对方确认，都指向同一批本地授权 Demo 音源。 */
export type AudioCue = 'entry' | 'highlight' | 'waiting'

export const CUE_TRACK_TITLE: Record<AudioCue, string> = {
  entry: '发个定位',
  highlight: '烟花',
  waiting: '北京昨夜下了雪',
}

/** 每个场景的默认增益：等待确认时更轻，高光提示略高一点，其余沿用用户音量。 */
export const CUE_GAIN: Record<AudioCue, number> = { entry: 1, highlight: 1.25, waiting: 0.8 }

export function cueTrack(cue: AudioCue): Track {
  return trackByTitle(CUE_TRACK_TITLE[cue]) ?? FEATURED_TRACKS[0]
}
