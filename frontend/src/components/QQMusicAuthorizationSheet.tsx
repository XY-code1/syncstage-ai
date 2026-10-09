import { Button, Sheet } from './ui'
import { MusicIcon, ShieldIcon, SparkleIcon } from './icons'
import { useQQMusicAuth } from '../store/qqMusicAuth'

const items = [
  'QQ音乐昵称与头像',
  '已收藏歌曲',
  '最近常听歌手',
  '《夜航计划》演出预约信息',
]

export function QQMusicAuthorizationSheet({ open, onClose, onAuthorized }: { open: boolean; onClose: () => void; onAuthorized: () => void }) {
  const { authorize, authorizing, error } = useQQMusicAuth()
  return <Sheet open={open} onClose={onClose} title='授权用于本次同频匹配' description='由你决定本次匹配可以使用哪些 Demo 画像。'>
    <div className='space-y-3'>
      <div className='overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]'>
        {items.map((item) => <div key={item} className='flex min-h-12 items-center gap-3 border-b border-white/8 px-4 last:border-0'>
          <span className='flex h-7 w-7 items-center justify-center rounded-full bg-brand-500/15'><MusicIcon className='h-4 w-4 text-brand-300' /></span>
          <span className='text-[14px] text-white/90'>{item}</span>
          <span className='ml-auto text-brand-300'>✓</span>
        </div>)}
      </div>
      <div className='flex gap-2 rounded-2xl bg-brand-500/[0.07] p-3 text-[13px] leading-relaxed text-white/70'>
        <ShieldIcon className='mt-0.5 h-4 w-4 shrink-0 text-brand-300' />
        <p>仅用于本次同场匹配，不公开完整听歌记录，可随时撤回。</p>
      </div>
      <p className='rounded-xl border border-warm-400/25 bg-warm-400/[0.06] px-3 py-2 text-[12px] leading-relaxed text-warm-200'>当前使用本地模拟授权数据，正式接入将采用 TME 官方测试接口。</p>
      {error ? <p role='alert' className='text-[13px] text-rose-300'>{error}</p> : null}
      <Button full size='lg' disabled={authorizing} icon={<SparkleIcon className='h-4 w-4' />} onClick={async () => { if (await authorize()) onAuthorized() }}>
        {authorizing ? '正在载入音乐画像…' : '同意并开启同频'}
      </Button>
      <Button full variant='ghost' onClick={onClose}>暂不授权</Button>
      <p className='text-center text-[11px] text-white/40'>音乐画像授权 · 非官方接口</p>
    </div>
  </Sheet>
}
