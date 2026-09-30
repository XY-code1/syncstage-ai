import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { PageShell } from '../components/PageShell'
import {
  AlertIcon,
  CheckIcon,
  ClockIcon,
  MapPinIcon,
  MusicIcon,
  RefreshIcon,
  ShieldIcon,
  UsersIcon,
} from '../components/icons'
import { Button, Card, DemoBadge, SectionTitle, Sheet, StateView } from '../components/ui'
import { useSession } from '../store/session'

const REPORT_REASONS = [
  '对方言行让我感到不适',
  '对方反复索要私人联系方式',
  '对方临时要求变更集合地点',
  '怀疑对方信息不真实',
  '对方取消同行但没有告知',
  '其他原因',
]

export function RoomPage() {
  const { concertId = '' } = useParams()
  const navigate = useNavigate()
  const { room, roomError, toggleTask, toggleMemberConfirm, confirmMeeting, leaveRoom, report, pushToast, agent } = useSession()
  const [questionOffset, setQuestionOffset] = useState(0)
  const [exitOpen, setExitOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [nudged, setNudged] = useState<string[]>([])
  const [locationSharing, setLocationSharing] = useState(false)
  const requested = useRef(false)

  useEffect(() => {
    if (room) requested.current = true
  }, [room])

  const icebreakers = room?.icebreakers ?? []
  const visibleQuestions =
    icebreakers.length > 0
      ? [0, 1, 2].map((index) => icebreakers[(questionOffset + index) % icebreakers.length])
      : []

  const tasks = room?.tasks ?? []
  const doneCount = tasks.filter((task) => task.done).length
  const progress = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0
  const pendingMembers = room?.members.filter((member) => !member.isMe && !member.confirmed) ?? []

  const nudge = (memberId: string) => {
    setNudged((prev) => (prev.includes(memberId) ? prev : [...prev, memberId]))
    pushToast('已提醒对方确认，回应会同步到这个房间', 'success')
    window.setTimeout(() => toggleMemberConfirm(memberId), 1400)
  }

  const nextQuestions = () => {
    if (icebreakers.length === 0) return
    setQuestionOffset((prev) => (prev + 3) % Math.max(icebreakers.length, 1))
  }

  if (!room) {
    const pending = agent?.pendingConfirmation
    return (
      <PageShell title='同频临时房间' step={5} onBack={() => navigate(`/concert/${concertId}/matches`)}>
        <div className='flex flex-col gap-4'>
          <Card>
            <p className='flex items-center gap-2 text-[13px] text-brand-200'>
              <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400' />
              还没有创建临时房间
            </p>
            <p className='mt-2 text-[12px] leading-relaxed text-white/50'>
              Agent 只会在双方都确认之后创建房间，并把公开集合点写进房间。当前状态：
              {pending?.status === 'awaiting_peer' ? '等待对方确认' : pending?.status === 'awaiting_user' ? '等待你发出邀请' : '尚未发起邀请'}
              。
            </p>
          </Card>
          {roomError ? (
            <StateView status='error' title='房间没有准备好' description={roomError} />
          ) : null}
          <StateView
            status='empty'
            title='回到匹配结果完成双向确认'
            description='选择一位同频搭子发起邀请，对方确认后这里就会出现房间、集合点和破冰问题。'
            actionLabel='回到匹配结果'
            onAction={() => navigate(`/concert/${concertId}/matches`)}
          />
        </div>
      </PageShell>
    )
  }

  const confirmedCount = room.members.filter((member) => member.confirmed).length

  return (
    <PageShell
      title='同频临时房间'
      subtitle={room.members.length + ' 人小组 · 活动结束 24 小时后自动归档'}
      step={5}
      onBack={() => navigate(`/concert/${concertId}/matches`)}
      right={<DemoBadge />}
      footer={
        <div className='flex flex-col gap-2'>
          <button
            type='button'
            onClick={() => setExitOpen(true)}
            className='pb-1 text-center text-[11px] text-white/40 transition hover:text-white/70'
          >
            退出房间与举报
          </button>
        </div>
      }
    >
      <div className='flex flex-col gap-5'>
        <Card className='border-brand-500/30 bg-brand-500/[0.07]' glow>
          <SectionTitle
            title='双向确认状态'
            hint={'已有 ' + confirmedCount + ' / ' + room.members.length + ' 人确认同行'}
            icon={<UsersIcon className='h-4 w-4 text-brand-300' />}
          />
          <div className='flex flex-col gap-2.5'>
            {room.members.map((member) => (
              <div key={member.userId} className='flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.02] px-3 py-2.5'>
                <Avatar name={member.nickname} from={member.avatar.from} to={member.avatar.to} size={38} />
                <div className='min-w-0 flex-1'>
                  <div className='flex items-center gap-1.5'>
                    <p className='truncate text-[13px] text-white/90'>{member.nickname}</p>
                    {member.isMe ? (
                      <span className='rounded-pill border border-brand-500/40 bg-brand-500/12 px-1.5 py-0.5 text-[10px] text-brand-200'>
                        我
                      </span>
                    ) : null}
                    <span className='rounded-pill border border-white/10 bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/45'>
                      {member.chatStyle}
                    </span>
                  </div>
                  <p className='mt-1 truncate text-[11px] text-white/45'>{member.note}</p>
                </div>
                {member.confirmed ? (
                  <span className='flex shrink-0 items-center gap-1 rounded-pill border border-brand-500/40 bg-brand-500/12 px-2 py-1 text-[10px] text-brand-200'>
                    <CheckIcon className='h-3 w-3' />
                    已确认
                  </span>
                ) : nudged.includes(member.userId) ? (
                  <span className='flex shrink-0 items-center gap-1 rounded-pill border border-white/12 bg-white/[0.04] px-2 py-1 text-[10px] text-white/50'>
                    <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400' />
                    等待回应
                  </span>
                ) : (
                  <Button size='sm' variant='secondary' onClick={() => nudge(member.userId)}>
                    提醒确认
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className='mt-3 text-[11px] leading-relaxed text-white/45'>
            只有双方都确认后，集合点才会正式生效。确认前你可以随时撤出，不需要说明理由。
          </p>
        </Card>

        <section>
          <SectionTitle
            title='公开集合点'
            hint='只推荐灯光明亮、有工作人员值守的公共区域'
            icon={<MapPinIcon className='h-4 w-4 text-brand-400' />}
          />
          <Card className='border-brand-500/25'>
            <p className='text-[13px] font-medium leading-relaxed text-white'>{room.meetingPoint.name}</p>
            <div className='mt-3 flex flex-col gap-2 text-[12px] text-white/60'>
              <span className='flex items-center gap-1.5'>
                <ClockIcon className='h-3.5 w-3.5 text-brand-400' />
                集合时间：{room.meetingPoint.time}
              </span>
              <span className='flex items-start gap-1.5'>
                <ShieldIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-400' />
                {room.meetingPoint.note}
              </span>
            </div>
            {room.meetingConfirmed ? (
              <span className='mt-3 inline-flex items-center gap-1 rounded-pill border border-brand-500/40 bg-brand-500/12 px-2.5 py-1 text-[11px] text-brand-200'>
                <CheckIcon className='h-3 w-3' />
                我已记下集合点
              </span>
            ) : (
              <Button size='sm' className='mt-3' variant='secondary' onClick={confirmMeeting}>
                我已记下集合点
              </Button>
            )}
          </Card>
          <button
            type='button'
            aria-pressed={locationSharing}
            onClick={() => setLocationSharing((value) => !value)}
            className='mt-3 flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.025] px-3 py-2.5 text-left'
          >
            <span>
              <span className='block text-[12px] text-white/80'>位置共享</span>
              <span className='mt-0.5 block text-[10.5px] text-white/40'>默认关闭，仅建议使用公开集合点</span>
            </span>
            <span className={'rounded-pill px-2.5 py-1 text-[10px] ' + (locationSharing ? 'bg-brand-500 text-stage-950' : 'bg-white/8 text-white/50')}>
              {locationSharing ? '已开启' : '已关闭'}
            </span>
          </button>
        </section>

        <section>
          <SectionTitle title='候场任务' hint={'已完成 ' + doneCount + ' / ' + tasks.length} />
          <Card className='p-0'>
            <div className='h-1 w-full overflow-hidden rounded-full bg-white/8'>
              <div className='h-full rounded-full bg-gradient-to-r from-brand-600 to-brand-400 transition-all' style={{ width: progress + '%' }} />
            </div>
            {tasks.map((task) => (
              <button
                key={task.id}
                type='button'
                onClick={() => toggleTask(task.id)}
                className='flex w-full items-start gap-3 border-b border-white/6 px-4 py-3.5 text-left transition last:border-b-0 hover:bg-white/[0.02]'
              >
                <span
                  className={
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ' +
                    (task.done ? 'border-brand-400 bg-brand-500 text-stage-950' : 'border-white/25 bg-white/[0.03] text-transparent')
                  }
                >
                  <CheckIcon className='h-3 w-3' />
                </span>
                <span className='min-w-0'>
                  <span className={'block text-[13px] ' + (task.done ? 'text-white/45 line-through' : 'text-white/90')}>
                    {task.label}
                  </span>
                  <span className='mt-0.5 block text-[11px] leading-relaxed text-white/45'>{task.detail}</span>
                </span>
              </button>
            ))}
          </Card>
        </section>

        <section>
          <SectionTitle
            title='AI 音乐破冰卡'
            hint='来自双方已授权的共同歌曲；只提供一次性话题，不代替用户持续聊天'
            icon={<MusicIcon className='h-4 w-4 text-brand-400' />}
            right={
              <Button
                variant='secondary'
                size='sm'
                icon={<RefreshIcon className='h-3.5 w-3.5' />}
                onClick={nextQuestions}
              >
                换一组
              </Button>
            }
          />
          <div className='flex flex-col gap-2.5'>

            {visibleQuestions.map((question, index) => (
              <Card key={question} className='animate-fade'>
                <div className='flex items-start gap-3'>
                  <span className='flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-[11px] font-semibold text-brand-300'>
                    {index + 1}
                  </span>
                  <p className='text-[13px] leading-relaxed text-white/80'>{question}</p>
                </div>
                <button
                  type='button'
                  onClick={() => pushToast('问题已复制，可以发到聊天里')}
                  className='mt-3 text-[11px] text-brand-300 transition hover:text-brand-200'
                >
                  复制这个问题
                </button>
              </Card>
            ))}
            {visibleQuestions.length === 0 ? (
              <StateView status='empty' title='暂时没有破冰问题' description='点击“换一组”重新生成。' />
            ) : null}
          </div>
        </section>

        <section>
          <SectionTitle title='安全与退出' hint='任何一方都可以随时结束这次同行' icon={<ShieldIcon className='h-4 w-4 text-brand-400' />} />
          <div className='flex flex-col gap-2'>
            <div className='rounded-2xl border border-brand-500/18 bg-brand-500/[0.06] px-3.5 py-3'>
              <p className='text-[12px] leading-relaxed text-white/65'>
                不共享精确位置，不涉及转账与代购。集合点只建议在公开区域，如果对方提出换到别的地方，可以直接退出并举报。
              </p>
            </div>
            <Button variant='secondary' onClick={() => setReportOpen(true)} icon={<AlertIcon className='h-4 w-4' />}>
              举报这位同行者
            </Button>
            <Button variant='secondary' onClick={() => pushToast('已拉黑该同行者，后续匹配将自动排除', 'success')}>
              拉黑这位同行者
            </Button>
            <Button variant='ghost' onClick={() => setExitOpen(true)}>
              退出这个房间
            </Button>
          </div>
        </section>

        {pendingMembers.length > 0 ? (
          <Card className='border-warm-400/25 bg-warm-400/[0.05]'>
            <p className='text-[12px] leading-relaxed text-warm-400'>
              还有 {pendingMembers.length} 位成员没有确认。等他们确认后，集合点会同时通知所有人。
            </p>
          </Card>
        ) : null}

        <p className='rounded-2xl border border-white/8 bg-white/[0.02] px-3.5 py-3 text-[11px] leading-relaxed text-white/45'>
          本房间仅服务演出前与候场同行，活动结束 24 小时后自动归档，不保留持续社交入口。
        </p>
      </div>

      <Sheet
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title='要退出这个房间吗？'
        description='退出后房间内的临时信息会清除，不再保留持续社交入口。'
      >
        <div className='flex flex-col gap-2'>
          <Button
            variant='danger'
            full
            onClick={() => {
              setExitOpen(false)
              leaveRoom()
              navigate('/')
            }}
          >
            确认退出
          </Button>
          <Button variant='secondary' full onClick={() => setExitOpen(false)}>
            继续留在房间
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title='举报这位同行者'
        description='举报会匿名提交，对方不会知道是谁发起的。'
      >
        <div className='flex flex-col gap-2'>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type='button'
              onClick={() => setReportReason(reason)}
              className={
                'rounded-2xl border px-3.5 py-3 text-left text-[13px] transition ' +
                (reportReason === reason
                  ? 'border-rose-400/50 bg-rose-400/12 text-rose-100'
                  : 'border-white/10 bg-white/[0.03] text-white/80 hover:border-white/20')
              }
            >
              {reason}
            </button>
          ))}
          <Button
            variant='danger'
            full
            className='mt-1'
            disabled={!reportReason}
            onClick={() => {
              void report(reportReason, room.members.find((member) => member.role === 'partner')?.userId ?? null)
              setReportReason('')
              setReportOpen(false)
            }}
          >
            提交举报
          </Button>
        </div>
      </Sheet>
    </PageShell>
  )
}
