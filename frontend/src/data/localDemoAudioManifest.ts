import { OFFICIAL_PLAYLIST_URL } from './officialHackathonPlaylist'

export type LocalDemoAudio = {
  trackKey: string
  title: string
  artist: string
  localSrc?: string
  officialUrl: string
  previewStartSeconds?: number
  previewDurationSeconds?: number
  authorizationNote: string
}

const note = '未配置本地授权音源；只保留赛事 Demo 元数据与官方歌单跳转。'

export const LOCAL_DEMO_AUDIO_MANIFEST: LocalDemoAudio[] = [
  '北京昨夜下了雪',
  '坏心情',
  '特别关系',
  '烟花',
  '发个定位',
].map((title, index) => ({
  trackKey: `official-demo-${index + 1}`,
  title,
  artist: '官方页面查看',
  officialUrl: OFFICIAL_PLAYLIST_URL,
  previewStartSeconds: 0,
  previewDurationSeconds: 30,
  authorizationNote: note,
}))

export const localDemoAudioByTitle = (title: string): LocalDemoAudio | undefined =>
  LOCAL_DEMO_AUDIO_MANIFEST.find((track) => track.title === title)

export const LOCAL_DEMO_AUDIO_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_DEMO_AUDIO === 'true'
