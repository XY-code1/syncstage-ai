import type { MusicBasis } from '../types'
import {
  OFFICIAL_PLAYLIST,
  OFFICIAL_PLAYLIST_ACTION,
  OFFICIAL_PLAYLIST_BADGE,
  OFFICIAL_PLAYLIST_USE_NOTE,
} from '../data/officialHackathonPlaylist'
import { cn } from '../lib/cn'

/**
 * 「来自官方参考歌单」标识 + 打开官方歌单的安全跳转 + 来源与 Demo 用途说明。
 *
 * 合规要求（与 officialHackathonPlaylist.ts 一致）：
 * - 只做外链跳转，不自动播放任何音乐，也不嵌入任何音频；
 * - 外链一律 target=_blank + rel="noopener noreferrer"，避免被外部页面反向控制；
 * - 页面上必须同时说明「赛事Demo模拟数据」与「未接入官方 API」。
 */
export function OfficialPlaylistBadge({ className }: { className?: string }) {
  return (
    <span
      data-official-playlist-badge
      className={cn(
        'inline-flex min-h-[26px] items-center gap-1.5 rounded-pill border border-brand-500/45 bg-brand-500/12 px-2.5 text-[12px] font-semibold text-brand-200',
        className,
      )}
    >
      ♪ {OFFICIAL_PLAYLIST_BADGE}
    </span>
  )
}

export function OfficialPlaylistLink({ className }: { className?: string }) {
  return (
    <a
      data-official-playlist-link
      href={OFFICIAL_PLAYLIST.url}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={`${OFFICIAL_PLAYLIST_ACTION}（在新窗口打开官方歌单）`}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-brand-500/45 bg-brand-500/10 px-4 text-[15px] font-semibold text-brand-100 transition hover:bg-brand-500/16',
        className,
      )}
    >
      {OFFICIAL_PLAYLIST_ACTION} ↗
    </a>
  )
}

export function OfficialPlaylistSource({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div
      data-official-playlist-source
      className={cn('rounded-2xl border border-white/8 bg-white/[0.03] px-3.5 py-3', className)}
    >
      <div className='flex flex-wrap items-center gap-2'>
        <OfficialPlaylistBadge />
        <span className='text-[12px] text-white/45'>来源：{OFFICIAL_PLAYLIST.provider} · 本地模拟数据</span>
      </div>
      {compact ? null : (
        <p className='mt-2 text-[13px] leading-relaxed text-white/60'>{OFFICIAL_PLAYLIST_USE_NOTE}</p>
      )}
      <div className='mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2'>
        <OfficialPlaylistLink />
        <span className='text-[12px] leading-relaxed text-white/40'>
          不自动播放音乐 · 未接入官方 API · 不含音频与封面素材
        </span>
      </div>
    </div>
  )
}

/** 共同曲目的统一文案：没有可核验交集时直说，绝不回退到虚构歌曲 */
export function sharedSongLabel(songs: readonly string[], fallback = '暂无足够音乐依据'): string {
  return songs.length > 0 ? songs.map((song) => `《${song}》`).join('、') : fallback
}

/** 音乐依据不足时必须出现的提示 */
export function MusicBasisNote({
  basis,
  songs,
  className,
}: {
  basis?: MusicBasis
  songs: readonly string[]
  className?: string
}) {
  const sufficient = songs.length > 0 && basis !== 'insufficient'
  if (sufficient) return null
  return (
    <p
      data-music-basis={basis ?? 'insufficient'}
      className={cn(
        'rounded-2xl border border-warm-400/30 bg-warm-400/[0.07] px-3.5 py-2.5 text-[14px] leading-relaxed text-warm-400',
        className,
      )}
    >
      暂无足够音乐依据：双方没有可核验的共同收藏、共同最近循环、曲风情绪或听歌时段，本轮不计入音乐侧高分。
    </p>
  )
}
