import { localDemoAudioByKey } from '../../data/localDemoAudioManifest'
import { cn } from '../../lib/cn'
import { MuteIcon, PauseIcon, PlayIcon, VolumeIcon } from '../icons'
import { useAudioPlayer, type AudioCue } from './DemoMusicPlayer'

/** 场景音乐的中文标签：徽标里说清现在放的是什么，而不是只有一串歌名。 */
const CUE_LABEL: Record<AudioCue, string> = {
  entry: '进入夜航现场',
  highlight: '同频高光',
  waiting: '等待对方确认',
}

/**
 * 全站右上角的音乐控制：明确的播放/暂停 + 静音。
 *
 * - 只有用户手势解锁过音频后才会出现，页面打开时绝不自动播放；
 * - 本地音源缺失时降级为「在QQ音乐试听」，不显示失效的播放键；
 * - 它挂在路由之上，路由切换时播放状态与这个控件都持续存在。
 */
export function MusicControl({ compact = false, className }: { compact?: boolean; className?: string }) {
  const player = useAudioPlayer()
  if (!player.armed) return null

  const track = localDemoAudioByKey(player.activeKey ?? player.selectedTrackId)
  const label = player.activeCue ? CUE_LABEL[player.activeCue] : track.title
  const buttonClass =
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/85 transition hover:bg-white/12 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-400'

  return (
    <div
      data-music-control
      data-music-playing={player.playing ? '1' : '0'}
      data-music-cue={player.activeCue ?? 'none'}
      className={cn(
        'pointer-events-auto flex items-center gap-0.5 rounded-full border border-white/12 bg-stage-950/85 py-0.5 pl-3 pr-0.5 text-white shadow-[0_10px_28px_-16px_rgba(0,0,0,0.95)] backdrop-blur-xl',
        className,
      )}
    >
      {compact ? null : (
        <span className='max-w-[104px] truncate text-[11px] leading-none text-white/60' aria-hidden='true'>
          {label}
        </span>
      )}
      {player.fallback ? (
        <a
          data-official-audio-fallback
          href={track.qqMusicUrl}
          target='_blank'
          rel='noopener noreferrer'
          className='flex h-9 items-center rounded-full px-2.5 text-[11.5px] font-semibold text-brand-300'
        >
          在QQ音乐试听
        </a>
      ) : (
        <button
          type='button'
          aria-label={player.playing ? '暂停音乐' : '播放音乐'}
          aria-pressed={player.playing}
          onClick={player.toggle}
          className={buttonClass}
        >
          {player.playing ? <PauseIcon className='h-4 w-4' /> : <PlayIcon className='h-4 w-4' />}
        </button>
      )}
      <button
        type='button'
        aria-label={player.muted ? '取消静音' : '静音'}
        aria-pressed={player.muted}
        onClick={player.toggleMute}
        className={cn(buttonClass, player.muted && 'text-white/40')}
      >
        {player.muted ? <MuteIcon className='h-4 w-4' /> : <VolumeIcon className='h-4 w-4' />}
      </button>
    </div>
  )
}
