import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PageShell } from '../components/PageShell'
import { CalendarIcon, HeartIcon, MapPinIcon, MusicIcon, ShareIcon, SparkleIcon, UsersIcon } from '../components/icons'
import { Button, Card, DemoBadge, SectionTitle, Skeleton, StateView } from '../components/ui'
import { useSession } from '../store/session'

export function MemoryCardPage() {
  const { concertId = '' } = useParams()
  const navigate = useNavigate()
  const { memory, memoryLoading, memoryError, createMemory, updateMemoryLine, pushToast, room } = useSession()
  const requested = useRef(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (memory || requested.current) return
    requested.current = true
    void createMemory()
  }, [createMemory, memory])

  const share = async () => {
    if (!memory) return
    const text =
      '我在「' +
      memory.artist +
      ' · ' +
      memory.concertTitle +
      '」的现场，和 ' +
      memory.members.length +
      ' 个人一起听完了这场演出。共同歌曲：' +
      memory.sharedSongs.map((song) => '《' + song + '》').join('、') +
      '。'
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: 'QQ音乐 · 共同回忆歌单', text })
        return
      }
      await navigator.clipboard.writeText(text)
      pushToast('回忆文案已复制，可以粘贴到聊天里', 'success')
    } catch {
      pushToast('分享已取消')
    }
  }

  return (
    <PageShell
      title='共同回忆歌单'
      subtitle={memory ? memory.dateLabel + ' · ' + memory.venue : '正在整理这次共同抵达的音乐记忆'}
      step={3}
      onBack={() => navigate('/concert/' + concertId + '/room')}
      right={<DemoBadge />}
      footer={
        memory ? (
          <div className='flex flex-col gap-2'>
            <Button size='lg' full icon={<ShareIcon className='h-4 w-4' />} onClick={() => void share()}>
              分享歌单回忆
            </Button>
            <Button
              variant='ghost'
              size='sm'
              full
              icon={<CalendarIcon className='h-3.5 w-3.5' />}
              onClick={() => {
                setSaved(true)
                pushToast('已模拟沉淀回 QQ 音乐歌单', 'success')
              }}
            >
              {saved ? '已沉淀到 QQ 音乐' : '沉淀回 QQ 音乐'}
            </Button>
          </div>
        ) : null
      }
    >
      {!memory && memoryError ? (
        <StateView
          status='error'
          title='共同回忆歌单没能生成'
          description={memoryError}
          actionLabel='重新生成'
          onAction={() => {
            requested.current = false
            void createMemory()
          }}
          secondaryLabel='回到同频房间'
          onSecondary={() => navigate('/concert/' + concertId + '/room')}
        />
      ) : null}

      {!memory && !memoryError ? (
        <div className='flex flex-col gap-4'>
          <Card className='border-brand-500/25'>
            <p className='flex items-center gap-2 text-[13px] text-brand-200'>
              <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400' />
              {memoryLoading ? '正在把共同歌曲整理成歌单' : '准备生成共同回忆歌单'}
            </p>
            <p className='mt-2 text-[11px] text-white/45'>共同歌曲、现场关键词和成员来自这次同频房间</p>
          </Card>
          <Skeleton className='h-80 w-full' />
          <Skeleton className='h-24 w-full' />
        </div>
      ) : null}

      {memory ? (
        <div className='flex flex-col gap-5'>
          <div
            className='relative overflow-hidden rounded-card border border-brand-500/25 p-5'
            style={{
              backgroundImage:
                'linear-gradient(160deg, rgba(49,194,124,0.22) 0%, rgba(13,20,28,0.96) 55%, rgba(5,7,10,1) 100%)',
            }}
          >
            <div className='poster-grain absolute inset-0 opacity-40' />
            <div className='relative'>
              <div className='flex items-center justify-between'>
                <span className='rounded-pill border border-brand-500/40 bg-brand-500/12 px-2.5 py-1 text-[10px] tracking-[0.16em] text-brand-100'>
                  共同回忆歌单
                </span>
                <span className='text-[11px] text-white/50'>{memory.dateLabel}</span>
              </div>

              <h2 className='mt-4 text-[22px] font-semibold leading-tight text-white'>{memory.concertTitle}</h2>
              <p className='mt-1 text-[13px] text-brand-200'>{memory.artist}</p>
              <p className='mt-1 flex items-center gap-1.5 text-[11px] text-white/50'>
                <MapPinIcon className='h-3.5 w-3.5' />
                {memory.venue}
              </p>

              <div className='mt-5'>
                <p className='text-[11px] tracking-wide text-white/45'>共同歌曲</p>
                <div className='mt-2 flex flex-col gap-1.5'>
                  {memory.sharedSongs.map((song) => (
                    <div key={song} className='flex items-center gap-2 text-[13px] text-white/85'>
                      <MusicIcon className='h-3.5 w-3.5 text-brand-400' />
                      《{song}》
                    </div>
                  ))}
                </div>
              </div>

              <div className='mt-5'>
                <p className='text-[11px] tracking-wide text-white/45'>现场关键词</p>
                <div className='mt-2 flex flex-wrap gap-1.5'>
                  {memory.keywords.map((keyword) => (
                    <span
                      key={keyword}
                      className='rounded-pill border border-white/14 bg-white/[0.06] px-2.5 py-1 text-[11px] text-white/80 backdrop-blur'
                    >
                      #{keyword}
                    </span>
                  ))}
                </div>
              </div>

              <div className='mt-5'>
                <p className='text-[11px] tracking-wide text-white/45'>同一场的成员</p>
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  {memory.members.map((member) => (
                    <span
                      key={member.userId}
                      className='flex items-center gap-2 rounded-pill border border-white/10 bg-white/[0.04] py-1 pl-1 pr-3'
                    >
                      <Avatar name={member.nickname} from={member.avatar.from} to={member.avatar.to} size={22} />
                      <span className='text-[11px] text-white/75'>{member.nickname}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className='mt-5 rounded-2xl border border-brand-500/25 bg-stage-950/45 p-3.5'>
                <p className='flex items-center gap-1.5 text-[11px] text-white/45'>
                  <HeartIcon className='h-3.5 w-3.5 text-rose-400' />
                  一句现场回忆
                </p>
                <p className='mt-2 text-[13px] leading-relaxed text-white/85'>{memory.line}</p>
              </div>
            </div>
          </div>

          <section>
            <SectionTitle
              title='换一句回忆'
              hint='挑一句更接近你当时感受的写法'
              icon={<SparkleIcon className='h-4 w-4 text-brand-400' />}
            />
            <div className='flex flex-col gap-2'>
              {memory.lineOptions.map((line) => (
                <button
                  key={line}
                  type='button'
                  onClick={() => updateMemoryLine(line)}
                  className={
                    'rounded-2xl border px-3.5 py-3 text-left text-[12px] leading-relaxed transition ' +
                    (memory.line === line
                      ? 'border-brand-500/50 bg-brand-500/12 text-brand-100'
                      : 'border-white/10 bg-white/[0.03] text-white/65 hover:border-white/20')
                  }
                >
                  {line}
                </button>
              ))}
            </div>
          </section>

          <Card>
            <SectionTitle
              title='这次同频的结果'
              hint='散场后限时房间自动解散，共同歌曲可沉淀回 QQ 音乐'
              icon={<UsersIcon className='h-4 w-4 text-brand-400' />}
            />
            <div className='flex flex-col gap-1.5 text-[12px] text-white/60'>
              <span>· 一起听完整场的人数：{memory.members.length} 人</span>
              <span>· 共同歌曲：{memory.sharedSongs.length} 首</span>
              <span>· 集合点：{room?.meetingPoint.name ?? '公开区域'}</span>
            </div>
          </Card>

          <div className='flex flex-col gap-2'>
            <Button variant='secondary' full onClick={() => navigate('/')}>
              回到演出列表
            </Button>
            <Button variant='ghost' full onClick={() => navigate('/concert/' + concertId + '/room')}>
              再看看同频房间
            </Button>
          </div>

          <p className='text-center text-[11px] leading-relaxed text-white/30'>
            初赛使用脱敏 Demo 数据模拟，未接入真实 QQ 音乐官方 API
          </p>
        </div>
      ) : null}
    </PageShell>
  )
}
