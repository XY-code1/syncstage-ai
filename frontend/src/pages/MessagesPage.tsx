import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { SegmentedTabs, TabHeader } from '../components/TabLayout'
import { BellIcon, ChatIcon, ChevronRightIcon, SparkleIcon, UsersIcon } from '../components/icons'
import { THREAD_KIND_LABEL, useSocial } from '../store/social'
import type { Thread, ThreadKind } from '../store/social'

type Filter = 'all' | ThreadKind

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'agent', label: 'Agent 通知' },
  { value: 'group', label: '群聊与临时房间' },
  { value: 'dm', label: '私聊' },
  { value: 'system', label: '系统通知' },
]

export function MessagesPage() {
  const navigate = useNavigate()
  const { threads } = useSocial()
  const [filter, setFilter] = useState<Filter>('all')

  const visible = threads.filter((thread) => filter === 'all' || thread.kind === filter)

  return (
    <div className='tab-page'>
      <TabHeader title='消息' subtitle='Agent 通知、临时房间与私聊' />

      <div className='px-4 pt-4'>
        <SegmentedTabs options={FILTERS} value={filter} onChange={setFilter} />

        <div className='mt-3.5 flex flex-col gap-2'>
          {visible.length === 0 ? (
            <div className='soft-card p-5 text-center'>
              <p className='text-[13px] text-white/70'>这一分类还没有消息</p>
              <p className='mt-1 text-[11px] text-white/40'>完成一次匹配或加入临时房间后，消息会出现在这里。</p>
            </div>
          ) : (
            visible.map((thread) => <ThreadRow key={thread.id} thread={thread} onOpen={() => navigate(`/messages/${thread.id}`)} />)
          )}
        </div>

        <p className='mt-4 text-center text-[10.5px] leading-relaxed text-white/30'>
          本 Demo 的消息均为虚构内容，未接入真实 QQ 音乐账号或真实聊天服务。
        </p>
      </div>
    </div>
  )
}

function ThreadRow({ thread, onOpen }: { thread: Thread; onOpen: () => void }) {
  const { messagesOf, unreadOf } = useSocial()
  const unread = unreadOf(thread)
  const last = messagesOf(thread.id).slice(-1)[0]

  return (
    <button type='button' onClick={onOpen} className='soft-card flex w-full items-center gap-3 p-3 text-left'>
      {thread.avatar ? (
        <Avatar name={thread.title} from={thread.avatar.from} to={thread.avatar.to} size={40} />
      ) : (
        <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/12 text-brand-300'>
          {thread.kind === 'agent' ? (
            <SparkleIcon className='h-5 w-5' />
          ) : thread.kind === 'group' ? (
            <UsersIcon className='h-5 w-5' />
          ) : thread.kind === 'system' ? (
            <BellIcon className='h-5 w-5' />
          ) : (
            <ChatIcon className='h-5 w-5' />
          )}
        </span>
      )}
      <span className='min-w-0 flex-1'>
        <span className='flex items-center gap-1.5'>
          <span className='truncate text-[13.5px] font-semibold text-white'>{thread.title}</span>
          <span className='shrink-0 rounded-pill border border-white/8 px-1.5 py-[1px] text-[9.5px] text-white/40'>
            {THREAD_KIND_LABEL[thread.kind]}
          </span>
        </span>
        <span className='mt-0.5 block truncate text-[11.5px] text-white/45'>{last?.text ?? thread.subtitle}</span>
      </span>
      <span className='flex shrink-0 flex-col items-end gap-1.5'>
        <span className='text-[10.5px] text-white/35'>{thread.time}</span>
        {unread > 0 ? (
          <span className='flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[9.5px] font-semibold text-stage-950'>
            {unread}
          </span>
        ) : (
          <ChevronRightIcon className='h-3.5 w-3.5 text-white/25' />
        )}
      </span>
    </button>
  )
}
