import { FEATURED_TRACKS, trackById, trackByTitle, type Track } from './tracks'

/** 兼容既有页面；统一数据源已迁移至 Track。 */
export type LocalDemoAudio = Track
export const LOCAL_DEMO_AUDIO_MANIFEST = FEATURED_TRACKS
export const localDemoAudioByTitle = trackByTitle
export const localDemoAudioByKey = trackById

/**
 * Public builds use the committed original demo cue. Set this to `false` only
 * when a deployment intentionally wants links-only behaviour.
 */
export const LOCAL_DEMO_AUDIO_ENABLED = import.meta.env.VITE_ENABLE_LOCAL_AUDIO !== 'false'
