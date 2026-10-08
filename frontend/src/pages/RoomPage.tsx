import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Avatar } from '../components/Avatar'
import { UserAvatar } from '../components/UserAvatar'
import { MeetingMap } from '../components/musicVisuals'
import { Button, Sheet, StateView } from '../components/ui'
import {
  ArrowLeftIcon,
  BanIcon,
  CheckIcon,
  ChevronRightIcon,
  ClockIcon,
  FlagIcon,
  MapPinIcon,
  MoreIcon,
  MusicIcon,
  PlusIcon,
  ShieldIcon,
  SparkleIcon,
  UsersIcon,
  VolumeIcon,
} from '../components/icons'
import { cn } from '../lib/cn'
import {
  DEMO_ROLES,
  demoAvatarOf,
  demoModeEnabled,
  readDemoRole,
  type DemoRole,
} from '../lib/demoRole'
import { demoConcerts } from '../data/demoData'
import { useProfile } from '../store/profile'
import { useSession } from '../store/session'
import { useSocial } from '../store/social'
import {
  fetchRoom,
  fetchRoomMessages,
  sendRoomMessage,
  type RoomMessage,
} from '../lib/api'
import type { RoomState } from '../types'
import { DemoMusicPlayer, useMusicPlayer } from '../components/music/DemoMusicPlayer'
import { MusicControl } from '../components/music/MusicControl'
import { localDemoAudioByKey, localDemoAudioByTitle } from '../data/localDemoAudioManifest'
import { ImmersiveMusicStage } from '../components/music/ImmersiveMusicStage'

/**
 * 同行房间 = 消息模块里的一个群聊。
 *
 * 页面只有四个固定区域：顶部栏 / 一行集合状态卡 / 可滚动的消息区 / 底部输入区，
 * 整页 100dvh 不滚动，地图、成员确认、安全说明、候场任务都收进 bottom sheet。
 * 返回箭头只回到消息列表，不退出房间、不清除聊天与确认状态。
 */

type ChatMessage = {
  id: string
  userId: string
  nickname: string
  text: string
  time: string
  mine?: boolean
  system?: boolean
  avatarFrom?: string
  avatarTo?: string
}

const PRESET: ChatMessage[] = [
  { id: 'safety', userId: 'system', nickname: '系统安全提示', system: true, time: '18:31', text: '同行Agent已完成安全条件核对。请勿发送身份证、票务验证码、精确住址等敏感信息。' },
  { id: 'm1', userId: 'mock-muna', nickname: '木那啦啦', time: '18:33', text: '我大概18:40到，可以先在检票口附近等大家～' },
  { id: 'm2', userId: 'mock-jiangli', nickname: '写歌的江离', time: '18:34', text: '好呀，我穿蓝色外套，到时候在群里说一声。' },
]
const QUICK_REPLIES = ['我也差不多 18:40 到', '收到，到了群里说', '我们在公开集合点见']
const ARRIVAL_STATES = ['还没出发', '在路上', '已到检票口']
const REPORT_REASONS = ['包含敏感信息', '骚扰或不当言论', '诱导私下转账', '其他原因']
// 退出原因完全可选：不选也能退出，退出后立即停止双方继续联系。
const EXIT_REASONS = ['时间对不上', '临时有事', '不想说明']
const FALLBACK_SAFETY = [
  '集合点选在有工作人员、灯光明亮的公共区域',
  '不向陌生同行者转账、代购或垫付票款',
  '离场前把大致行程告诉一位朋友',
]

type SheetKind = 'none' | 'meeting' | 'settings' | 'tasks' | 'share' | 'agent' | 'plus' | 'actions' | 'report' | 'exit'

interface RoomMeta {
  blocked: string[]
  arrival: string
  muted: boolean
}

const EMPTY_META: RoomMeta = { blocked: [], arrival: ARRIVAL_STATES[0], muted: false }

function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 演示环境忽略写入失败
  }
}

/** 「声浪 Livehouse 静安店 · 1F 检票口右侧周边售卖台」→「1F 检票口右侧周边售卖台」 */
function shortPlace(name: string): string {
  const parts = name.split('·').map((part) => part.trim()).filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

/** 「18:50（开场前 40 分钟）」→「18:50」 */
function shortTime(time: string): string {
  return time.split('（')[0].trim()
}

/** 后端 ISO 时间 → 页面里的 HH:MM */
function clockTime(iso: string): string {
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime())
    ? nowTime()
    : parsed.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** 后端消息 → 页面既有结构；mine 由 senderId 判定，不依赖本地标记 */
function fromServer(message: RoomMessage, meId: string): ChatMessage {
  return {
    id: 'srv-' + String(message.id),
    userId: message.senderId,
    nickname: message.senderName,
    text: message.content,
    time: clockTime(message.createdAt),
    mine: message.senderId === meId,
  }
}

export function RoomPage() {
  const musicPlayer = useMusicPlayer()
  const selectedTrack = localDemoAudioByKey(musicPlayer.selectedTrackId)
  const { concertId: concertIdParam = '', roomId: roomIdParam = '' } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { room: sessionRoom, roomError, toggleTask, toggleMemberConfirm, confirmMeeting, leaveRoom, report, pushToast, agent, agentMode } = useSession()
  // 当前用户（我）的昵称与头像统一来自 profile store，禁止在页面里另存一份
  const { profile } = useProfile()
  const { publishRoomChat, markRead } = useSocial()

  // 第二个浏览器上下文用 ?as=<userId> 认领身份；主上下文默认用房间成员里的「我」
  const asUserId = useMemo(() => new URLSearchParams(location.search).get('as') ?? '', [location.search])
  // Demo 身份入口只在开发 / 演示模式出现；每个浏览器各存各的 sessionStorage，互不覆盖
  const demoMode = demoModeEnabled()
  const [demoRole, setDemoRole] = useState<DemoRole | ''>(() => (demoMode ? readDemoRole(location.search) : ''))

  useEffect(() => {
    if (!demoMode) return
    setDemoRole(readDemoRole(location.search))
  }, [demoMode, location.search])

  const [remoteRoom, setRemoteRoom] = useState<RoomState | null>(null)
  const [remoteError, setRemoteError] = useState('')

  // 房间路由约束：只有 accepted 状态才能进入 room。
  // - 演出流程内（无 roomIdParam）：本机必须已双向确认且真的创建出了房间；
  // - 直接输入 / 第二个浏览器（有 roomIdParam）：本机有会话时必须是 accepted 且 roomId 对得上，
  //   本机没有会话时必须带 ?demoRole=（Demo 双身份）或 ?as=（成员认领），否则一律拦截回同频；
  // - waiting / declined / expired / cancelled 状态永远进不去房间。
  useEffect(() => {
    const accepted = agent?.pendingConfirmation.status === 'accepted' || agent?.pendingConfirmation.status === 'confirmed'
    if (sessionRoom) return
    if (!roomIdParam) {
      if (!accepted || !agent?.roomId) navigate('/sync', { replace: true })
      return
    }
    if (agent) {
      if (!accepted || agent.roomId !== roomIdParam) navigate('/sync', { replace: true })
      return
    }
    if (!demoRole && !asUserId) navigate('/sync', { replace: true })
  }, [agent, asUserId, demoRole, navigate, roomIdParam, sessionRoom])

  // 本机没有这个房间时（无痕窗口直接打开 roomId 链接），从后端按 roomId 取回，不依赖本地存储
  useEffect(() => {
    if (sessionRoom || !roomIdParam) return
    let cancelled = false
    setRemoteError('')
    fetchRoom(roomIdParam)
      .then((snapshot) => {
        if (cancelled) return
        setRemoteRoom({
          ...(snapshot as unknown as RoomState),
          roomId: snapshot.roomId,
          concertId: snapshot.concertId,
          members: (snapshot.members ?? []) as RoomState['members'],
          tasks: (snapshot.tasks ?? []) as RoomState['tasks'],
          createdAt: Date.parse(snapshot.createdAt ?? '') || Date.now(),
        })
      })
      .catch((error: unknown) => {
        if (!cancelled) setRemoteError(error instanceof Error ? error.message : '这个临时房间不存在或已过期')
      })
    return () => {
      cancelled = true
    }
  }, [sessionRoom, roomIdParam])

  const room = sessionRoom ?? remoteRoom
  const concertId = concertIdParam || room?.concertId || ''
  const roomId = room?.roomId ?? ''
  const members = room?.members ?? []
  const memberById = useMemo(
    () => new Map(members.map((member) => [member.userId, member])),
    [members],
  )
  const meMember = asUserId ? memberById.get(asUserId) : members.find((member) => member.isMe)
  const demoIdentity = demoMode && demoRole ? DEMO_ROLES[demoRole] : null
  const meUserId = demoIdentity?.userId ?? meMember?.userId ?? (asUserId || 'u-viewer')
  // Demo 身份优先；否则主上下文用 profile 昵称，第二身份用房间成员昵称
  const meName = demoIdentity?.name ?? (asUserId ? (meMember?.nickname ?? 'Demo 测试成员') : (profile.nickname || meMember?.nickname || '我'))
  const threadId = `group-${roomId || concertId}`
  const chatKey = `syncstage.chat.${roomId || concertId}`
  const metaKey = `sfl.room.meta.${roomId || concertId}`
  const scrollKey = `sfl.room.scroll.${roomId || concertId}`

  const [sheet, setSheet] = useState<SheetKind>(() => new URLSearchParams(location.search).get('meeting') === '1' ? 'meeting' : 'none')
  useEffect(() => {
    if (new URLSearchParams(location.search).get('meeting') === '1' && roomId) setSheet('meeting')
  }, [location.search, roomId])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [meta, setMeta] = useState<RoomMeta>(EMPTY_META)
  const [input, setInput] = useState('')
  const [draft, setDraft] = useState('')
  const [draftCursor, setDraftCursor] = useState(0)
  const [actionTarget, setActionTarget] = useState<ChatMessage | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [exitReason, setExitReason] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const restoredRoom = useRef('')
  const serverCursor = useRef(0)

  const saveMeta = (next: Partial<RoomMeta>) => {
    setMeta((prev) => {
      const merged = { ...prev, ...next }
      writeJson(metaKey, merged)
      return merged
    })
  }

  // 读取这个房间自己的聊天记录与偏好（沿用原有 localStorage 键，不迁移数据）
  // 只依赖 roomId：成员确认 / 任务勾选等房间状态更新不能重置聊天，也不能关掉正在看的弹窗。
  useEffect(() => {
    if (!roomId) return
    // 本地只做首屏缓存；真正的聊天记录以服务端为准（只认 srv- 开头的后端消息）
    setMessages(readJson<ChatMessage[]>(chatKey, []).filter((item) => item.id.startsWith('srv-') || item.id.startsWith('local-')))
    serverCursor.current = 0
    const stored = readJson<RoomMeta>(metaKey, EMPTY_META)
    setMeta({
      blocked: Array.isArray(stored.blocked) ? stored.blocked : [],
      arrival: typeof stored.arrival === 'string' ? stored.arrival : EMPTY_META.arrival,
      muted: Boolean(stored.muted),
    })
    setInput('')
    setDraft('')
    setSheet('none')
  }, [roomId, chatKey, metaKey])

  useEffect(() => {
    if (room && messages.length) writeJson(chatKey, messages)
  }, [messages, room, chatKey])

  // 真人消息：进房间先拉全量历史，之后每 2 秒拉一次增量，刷新同样从服务端恢复。
  // 轮询只搬运真人消息，绝不触发模型，也不会自动生成对方的回复。
  useEffect(() => {
    if (!roomId || agentMode !== 'live') return
    let cancelled = false
    const pull = async () => {
      try {
        const fresh = await fetchRoomMessages(roomId, serverCursor.current || undefined)
        if (cancelled || fresh.length === 0) return
        serverCursor.current = Math.max(serverCursor.current, ...fresh.map((item) => item.id))
        const incoming = fresh.map((item) => fromServer(item, meUserId))
        setMessages((prev) => {
          const seen = new Set(prev.map((item) => item.id))
          const added = incoming.filter((item) => !seen.has(item.id))
          return added.length ? [...prev, ...added] : prev
        })
      } catch {
        // 单次轮询失败不打断页面，下一轮自动重试；不做任何 mock 兜底
      }
    }
    void pull()
    const timer = window.setInterval(() => void pull(), 2000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [agentMode, roomId, meUserId])

  const confirmedCount = room ? room.members.filter((member) => member.confirmed).length : 0
  const total = room?.members.length ?? 0
  const allConfirmed = total > 0 && confirmedCount === total
  const archived = room ? Date.now() >= room.createdAt + 24 * 60 * 60 * 1000 : false
  const locked = !allConfirmed || archived
  // PRESET 是固定的 Demo 种子消息（系统安全提示 + Demo 成员寒暄），
  // 真人消息一律来自后端；这里只负责合并展示，不做任何自动回复。
  // Demo 双身份模式下剔除种子里署名为「写歌的江离」的寒暄，避免看起来像 Agent/mock 冒充真人 B。
  const allMessages = useMemo(() => {
    const seeds = demoMode && demoRole ? PRESET.filter((item) => item.userId !== 'mock-jiangli') : PRESET
    return [...seeds, ...messages]
  }, [demoMode, demoRole, messages])
  const visibleMessages = useMemo(
    () => allMessages
      .filter((message) => !meta.blocked.includes(message.userId))
      .map((message) => ({
        ...message,
        mine: message.userId === meUserId,
        avatarFrom: message.avatarFrom ?? memberById.get(message.userId)?.avatar?.from ?? demoAvatarOf(message.userId)?.from,
        avatarTo: message.avatarTo ?? memberById.get(message.userId)?.avatar?.to ?? demoAvatarOf(message.userId)?.to,
      })),
    [allMessages, meta.blocked, meUserId, memberById],
  )
  const tasks = room?.tasks ?? []
  const doneCount = tasks.filter((task) => task.done).length
  const safetyTips = useMemo(
    () => demoConcerts.find((concert) => concert.id === (room?.concertId ?? concertId))?.safetyTips ?? FALLBACK_SAFETY,
    [concertId, room?.concertId],
  )
  const songs = useMemo(
    () => demoConcerts.find((concert) => concert.id === (room?.concertId ?? concertId))?.hotSongs ?? [],
    [concertId, room?.concertId],
  )
  const draftPool = room?.icebreakers?.length ? room.icebreakers : ['你最期待今晚现场的哪一首歌？']
  // 顶部栏的「人数·集合状态」：全部确认后进入候场集合阶段
  const meetingLabel = archived ? '已归档' : allConfirmed ? '集合中' : `${confirmedCount}/${total} 已确认`
  const lastMessage = visibleMessages[visibleMessages.length - 1]
  const preview = lastMessage ? `${lastMessage.mine ? '我' : lastMessage.nickname}：${lastMessage.text}` : '同行房间已建立'
  const timeLabel = lastMessage?.time ?? '进行中'

  // 把房间的最后一条消息 / 时间 / 未读 / 集合状态广播给消息列表；没有房间时不广播
  useEffect(() => {
    if (!room) return
    publishRoomChat(threadId, { preview, time: timeLabel, unread: 0, muted: meta.muted, meetingLabel })
  }, [room, threadId, preview, timeLabel, meta.muted, meetingLabel, publishRoomChat])

  // 进入房间即视为已读：底部「消息」红点与列表未读数都会归零
  useEffect(() => {
    if (room) markRead(threadId)
  }, [room, threadId, markRead])

  // 从消息列表再次进入时恢复上次的聊天位置（没有记录则停在最新一条）
  useEffect(() => {
    const element = scrollRef.current
    if (!roomId || !element || messages.length === 0) return
    if (restoredRoom.current === roomId) return
    restoredRoom.current = roomId
    const saved = Number(window.localStorage.getItem(scrollKey) ?? '')
    element.scrollTop = Number.isFinite(saved) && saved > 0 ? saved : element.scrollHeight
  }, [roomId, messages.length, scrollKey])

  const stickToBottom = () => {
    window.requestAnimationFrame(() => {
      const element = scrollRef.current
      if (element) element.scrollTop = element.scrollHeight
    })
  }

  if (!room) {
    const pending = agent?.pendingConfirmation
    return (
      <div className='ai-stage mx-auto flex h-[100dvh] w-full max-w-[390px] flex-col justify-center px-4'>
        <StateView
          status={roomError || remoteError ? 'error' : 'empty'}
          title={roomError || remoteError ? '房间没有准备好' : '等待全部成员确认'}
          description={
            (roomError || remoteError) ??
            (pending?.status === 'awaiting_peer'
              ? '对方还没有确认同行，确认完成后会开放临时群聊。'
              : '回到匹配结果完成双向确认后，临时群聊才会开放。')
          }
          actionLabel='回到匹配结果'
          onAction={() => navigate(concertId ? `/concert/${concertId}/matches` : '/messages')}
          secondaryLabel='返回消息列表'
          onSecondary={() => navigate('/messages')}
        />
      </div>
    )
  }

  const place = shortPlace(room.meetingPoint.name)
  const meetTime = shortTime(room.meetingPoint.time)

  const send = async () => {
    const text = input.trim()
    if (locked || !text || !roomId) return
    setInput('')
    if (agentMode !== 'live') {
      setMessages((prev) => [...prev, {
        id: `local-${Date.now()}`,
        userId: meUserId,
        nickname: meName,
        text,
        time: nowTime(),
        mine: true,
      }])
      inputRef.current?.focus()
      stickToBottom()
      return
    }
    try {
      // 先落库再显示：后端保存成功才进聊天，两个浏览器上下文看到的是同一份记录
      const saved = await sendRoomMessage(roomId, { senderId: meUserId, senderName: meName, content: text })
      serverCursor.current = Math.max(serverCursor.current, saved.id)
      const incoming = fromServer(saved, meUserId)
      setMessages((prev) => (prev.some((item) => item.id === incoming.id) ? prev : [...prev, incoming]))
    } catch (error) {
      setInput(text)
      pushToast(error instanceof Error ? error.message : '消息发送失败，请重试', 'warn')
    }
    inputRef.current?.focus()
    stickToBottom()
  }

  const generateDraft = () => {
    setDraft(draftPool[draftCursor % draftPool.length])
    setDraftCursor((prev) => prev + 1)
  }

  const useDraft = () => {
    const text = draft.trim()
    if (!text) return
    setInput(text)
    setDraft('')
    setSheet('none')
    pushToast('草稿已填入输入框，确认后再发送')
    inputRef.current?.focus()
  }

  const blockMember = (message: ChatMessage) => {
    saveMeta({ blocked: [...meta.blocked, message.userId] })
    setSheet('none')
    setActionTarget(null)
    pushToast(`已屏蔽 ${message.nickname} 的消息`)
  }

  const submitReport = () => {
    void report(reportReason, actionTarget?.userId ?? null)
    setReportReason('')
    setActionTarget(null)
    setSheet('none')
    pushToast('举报已提交，平台会尽快处理', 'success')
  }

  const exitRoom = () => {
    window.localStorage.removeItem(chatKey)
    window.localStorage.removeItem(metaKey)
    window.localStorage.removeItem(scrollKey)
    leaveRoom()
    pushToast('已退出同行，双方不会再互相联系', 'success')
    navigate('/messages')
  }

  return (
    <div className='ai-stage immersive-room mx-auto flex h-[100dvh] max-h-[100dvh] w-full max-w-[390px] flex-col overflow-hidden'>
      {/* 顶部栏：‹ 消息 / 房间名 / 人数·集合状态 / ··· */}
      <header className='safe-top z-30 shrink-0 border-b border-white/6 bg-stage-950/92 backdrop-blur-xl'>
        <div className='flex items-center gap-2 px-3 pb-2 pt-2.5'>
          <button
            type='button'
            onClick={() => navigate('/messages')}
            aria-label='返回消息列表'
            className='flex min-h-9 shrink-0 items-center gap-0.5 rounded-full border border-white/10 pl-1.5 pr-2.5 text-[12.5px] text-white/75 transition hover:border-white/25 hover:text-white'
          >
            <ArrowLeftIcon className='h-3.5 w-3.5' />
            消息
          </button>
          <div className='min-w-0 flex-1 text-center'>
            <p className='truncate text-[14px] font-semibold leading-tight text-white'>{room.concertTitle}同行组</p>
            <p className='truncate text-[10.5px] text-white/45'>{total}人·{meetingLabel} · 《{selectedTrack.title}》</p>
          </div>
          <MusicControl compact className='ml-0.5' />
          <button
            type='button'
            aria-label='房间设置'
            onClick={() => setSheet('settings')}
            className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 text-white/75 transition hover:border-white/25 hover:text-white'
          >
            <MoreIcon className='h-4 w-4' />
          </button>
        </div>
      </header>

      <div className='room-stage' aria-hidden='true'>
        <ImmersiveMusicStage artwork={`${import.meta.env.BASE_URL}visuals/summer-concert-home.webp`} title={`共同心动曲 · ${selectedTrack.title}`} compact />
        <span className='room-stage-person room-stage-person-a'><img src={`${import.meta.env.BASE_URL}avatars/candidate-orange.webp`} alt='' />木那啦啦</span>
        <span className='room-stage-person room-stage-person-b'><img src={`${import.meta.env.BASE_URL}portraits/demo-orange.webp`} alt='' />Demo 访客</span>
        <span className='room-stage-person room-stage-person-c'><img src={`${import.meta.env.BASE_URL}avatars/candidate-jiangli.webp`} alt='' />写歌的江离</span>
      </div>

      {/* 一行集合状态卡：点开才是地图、成员确认与安全说明 */}
      <button
        type='button'
        onClick={() => setSheet('meeting')}
        aria-label='查看集合详情'
        className='room-meeting mx-3 mt-2 flex shrink-0 items-center gap-2.5 rounded-2xl border border-brand-500/25 bg-brand-500/[.07] px-3 py-2.5 text-left'
      >
        <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-300'>
          <MapPinIcon className='h-4 w-4' />
        </span>
        <span className='min-w-0 flex-1'>
          <span className='block truncate text-[13px] font-medium text-white'>{place}</span>
          <span className='mt-0.5 block truncate text-[11px] text-white/50'>
            {meetTime} · {total}人同行 · {confirmedCount}/{total} 已确认
          </span>
        </span>
        <ChevronRightIcon className='h-4 w-4 shrink-0 text-white/30' />
      </button>

      {/* 消息区：整页唯一可滚动区域 */}
      <div
        ref={scrollRef}
        aria-label='同行房间消息'
        onScroll={(event) => writeJson(scrollKey, Math.round(event.currentTarget.scrollTop))}
        className='room-chat no-scrollbar mt-2 flex min-h-0 flex-1 flex-col space-y-3 overflow-y-auto px-3 pb-3'
      >
        {/* 消息少的时候把会话压到底部（像真实 IM）；消息变长后这个占位会自动收成 0 高度 */}
        <div className='min-h-0 flex-1' aria-hidden='true' />
        {!allConfirmed ? (
          <div className='rounded-2xl border border-warm-400/25 bg-warm-400/[.05] px-3 py-2.5'>
            <p className='text-[12.5px] leading-relaxed text-warm-400'>等待全部成员确认，确认完成后开放临时群聊。</p>
            <Button size='sm' variant='secondary' className='mt-2' onClick={() => setSheet('meeting')}>
              去确认同行成员（{confirmedCount}/{total}）
            </Button>
          </div>
        ) : null}

        {/* Agent 的集合通知：小型居中系统消息，不再占一张大卡片 */}
        <p className='px-4 pt-1 text-center text-[11px] leading-relaxed text-white/40'>
          Agent · 集合点已同步：{place} · {meetTime}
        </p>

        {visibleMessages.map((message) =>
          message.system ? (
            <p key={message.id} className='px-6 text-center text-[11px] leading-relaxed text-white/40'>
              {message.text}
            </p>
          ) : (
            <MessageBubble
              key={message.id}
              message={message}
              viewerName={profile.nickname}
              onActions={() => {
                setActionTarget(message)
                setSheet('actions')
              }}
            />
          ),
        )}
      </div>

      {/* 底部输入区 */}
      <footer className='room-footer safe-bottom z-30 shrink-0 border-t border-white/8 bg-stage-950/96 px-3 pt-2 backdrop-blur-xl'>
        {archived ? (
          <p className='py-3 text-center text-[12.5px] text-white/50'>房间已归档，只可查看历史消息</p>
        ) : !allConfirmed ? (
          <p className='py-3 text-center text-[12.5px] text-white/50'>等待全部成员确认，确认完成后开放临时群聊。</p>
        ) : (
          <>
            <div className='no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-2'>
              {QUICK_REPLIES.map((text) => (
                <button
                  key={text}
                  type='button'
                  onClick={() => {
                    setInput(text)
                    inputRef.current?.focus()
                  }}
                  className='inline-flex min-h-9 shrink-0 items-center rounded-full border border-white/10 bg-white/[.04] px-3 text-[12.5px] text-white/70'
                >
                  {text}
                </button>
              ))}
            </div>
            <div className='flex items-center gap-2 pb-2'>
              <button
                type='button'
                aria-label='更多操作'
                onClick={() => {
                  setDraft('')
                  setDraftCursor(0)
                  setSheet('plus')
                }}
                className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[.04] text-white/70 transition hover:border-white/25 hover:text-white'
              >
                <PlusIcon className='h-4 w-4' />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') send()
                }}
                placeholder='输入消息……'
                className='h-10 min-w-0 flex-1 rounded-2xl border border-white/12 bg-stage-800 px-3 text-[14px] text-white outline-none placeholder:text-white/30'
              />
              <button
                type='button'
                disabled={!input.trim()}
                onClick={send}
                className='h-10 shrink-0 rounded-xl bg-brand-500 px-3.5 text-[13.5px] font-semibold text-stage-950 disabled:opacity-40'
              >
                发送
              </button>
            </div>
          </>
        )}
      </footer>

      {/* ---------------- 集合详情：地图 / 时间 / 到达状态 / 成员确认 / 安全说明 ---------------- */}
      <Sheet
        open={sheet === 'meeting'}
        onClose={() => setSheet('none')}
        title='集合详情'
        description='只共享公开集合点，不共享精确位置；成员确认与到达状态只在这个房间内可见。'
      >
        <div className='max-h-[72dvh] space-y-3 overflow-y-auto'>
          <MeetingMap name={room.meetingPoint.name} time={room.meetingPoint.time} note={room.meetingPoint.note} />
          <div className='rounded-2xl border border-white/8 bg-white/[.02] p-3'>
            <p className='flex items-start gap-2 text-[13px] text-white'>
              <ClockIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300' />
              {room.meetingPoint.time}
            </p>
            <p className='mt-1 flex items-start gap-2 text-[12.5px] leading-relaxed text-white/55'>
              <ShieldIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300' />
              {room.meetingPoint.note}
            </p>
          </div>
          <div className='rounded-2xl border border-white/8 bg-white/[.02] p-3'>
            <p className='text-[12.5px] font-medium text-white'>我的到达状态</p>
            <div className='mt-2 flex flex-wrap gap-2'>
              {ARRIVAL_STATES.map((state) => (
                <button
                  key={state}
                  type='button'
                  onClick={() => saveMeta({ arrival: state })}
                  className={cn(
                    'min-h-9 rounded-pill border px-3 text-[12.5px]',
                    meta.arrival === state ? 'border-brand-500/45 bg-brand-500/12 text-brand-100' : 'border-white/12 bg-white/[.03] text-white/60',
                  )}
                >
                  {state}
                </button>
              ))}
            </div>
            <div className='mt-2.5'>
              {room.meetingConfirmed ? (
                <p className='flex items-center gap-1.5 text-[12.5px] text-brand-300'>
                  <CheckIcon className='h-3.5 w-3.5' />
                  我已记下集合点
                </p>
              ) : (
                <Button size='sm' variant='secondary' full onClick={confirmMeeting}>
                  我已记下集合点
                </Button>
              )}
            </div>
          </div>
          <div className='rounded-2xl border border-white/8 bg-white/[.02] p-3'>
            <p className='flex items-center gap-2 text-[12.5px] font-medium text-white'>
              <UsersIcon className='h-3.5 w-3.5 text-brand-300' />
              成员确认 · {confirmedCount}/{total} 已确认
            </p>
            <div className='mt-2 space-y-2'>
              {room.members.map((member) => (
                <div key={member.userId} className='flex items-center gap-2.5'>
                  {member.isMe ? (
                    <UserAvatar size={30} />
                  ) : (
                    <Avatar name={member.nickname} from={member.avatar.from} to={member.avatar.to} size={30} />
                  )}
                  <span className='min-w-0 flex-1 truncate text-[13px] text-white/85'>
                    {member.isMe ? profile.nickname : member.nickname}
                    {member.isMe ? '（我）' : ''}
                  </span>
                  {member.confirmed ? (
                    <span className='flex items-center gap-1 text-[12px] text-brand-300'>
                      <CheckIcon className='h-3.5 w-3.5' />
                      已确认
                    </span>
                  ) : (
                    <Button size='sm' variant='secondary' onClick={() => toggleMemberConfirm(member.userId)}>
                      确认
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className='rounded-2xl border border-white/8 bg-white/[.02] p-3'>
            <p className='text-[12.5px] font-medium text-white'>安全说明</p>
            <ul className='mt-1.5 space-y-1'>
              {safetyTips.map((tip) => (
                <li key={tip} className='flex items-start gap-2 text-[12px] leading-relaxed text-white/55'>
                  <ShieldIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300' />
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Sheet>

      {/* ---------------- 房间设置：成员 / 免打扰 / 安全 / 举报 / 退出 ---------------- */}
      <Sheet
        open={sheet === 'settings'}
        onClose={() => setSheet('none')}
        title='房间设置'
        description='返回消息列表不会退出房间；只有「退出同行」会停止双方联系。'
      >
        <div className='max-h-[72dvh] space-y-2 overflow-y-auto'>
          <button
            type='button'
            onClick={() => setSheet('meeting')}
            className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left'
          >
            <MapPinIcon className='h-4 w-4 shrink-0 text-brand-300' />
            <span className='min-w-0 flex-1'>
              <span className='block text-[13.5px] text-white'>集合详情</span>
              <span className='block truncate text-[11.5px] text-white/45'>{place} · {meetTime}</span>
            </span>
            <ChevronRightIcon className='h-4 w-4 shrink-0 text-white/30' />
          </button>

          <div className='rounded-xl border border-white/10 p-3.5'>
            <p className='flex items-center gap-2 text-[11.5px] text-white/45'>
              <UsersIcon className='h-3.5 w-3.5 shrink-0 text-brand-300' />
              成员列表 · {total} 人 · {confirmedCount}/{total} 已确认
            </p>
            <div className='mt-2 space-y-1.5'>
              {room.members.map((member) => (
                <p key={member.userId} className='flex items-center gap-2 text-[13px] text-white/85'>
                  <span className='min-w-0 flex-1 truncate'>
                    {member.isMe ? profile.nickname : member.nickname}
                    {member.isMe ? '（我）' : ''}
                  </span>
                  <span className={cn('text-[11.5px]', member.confirmed ? 'text-brand-300' : 'text-warm-400')}>
                    {member.confirmed ? '已确认' : '待确认'}
                  </span>
                </p>
              ))}
            </div>
          </div>

          <button
            type='button'
            aria-pressed={meta.muted}
            onClick={() => saveMeta({ muted: !meta.muted })}
            className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left'
          >
            <VolumeIcon className='h-4 w-4 shrink-0 text-white/60' />
            <span className='min-w-0 flex-1'>
              <span className='block text-[13.5px] text-white'>消息免打扰</span>
              <span className='block text-[11.5px] text-white/45'>开启后房间消息不计入底部「消息」红点</span>
            </span>
            <span className={cn('relative h-5.5 w-10 shrink-0 rounded-full transition', meta.muted ? 'bg-brand-500' : 'bg-white/15')}>
              <span className={cn('absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition', meta.muted ? 'left-[22px]' : 'left-0.5')} />
            </span>
          </button>

          <button
            type='button'
            onClick={() => {
              setActionTarget(null)
              setReportReason('')
              setSheet('report')
            }}
            className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left'
          >
            <FlagIcon className='h-4 w-4 shrink-0 text-rose-300' />
            <span>
              <span className='block text-[13.5px] text-white'>举报</span>
              <span className='block text-[11.5px] text-white/45'>举报这个房间，或长按某条消息单独举报</span>
            </span>
          </button>

          {meta.blocked.length ? (
            <button
              type='button'
              onClick={() => saveMeta({ blocked: [] })}
              className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left'
            >
              <UsersIcon className='h-4 w-4 shrink-0 text-white/60' />
              <span>
                <span className='block text-[13.5px] text-white'>恢复已屏蔽成员</span>
                <span className='block text-[11.5px] text-white/45'>当前已屏蔽 {meta.blocked.length} 人</span>
              </span>
            </button>
          ) : null}

          <div className='rounded-xl border border-white/10 p-3.5'>
            <p className='flex items-center gap-2 text-[11.5px] text-white/45'>
              <ShieldIcon className='h-3.5 w-3.5 shrink-0 text-brand-300' />
              安全说明
            </p>
            <ul className='mt-1.5 space-y-1'>
              {safetyTips.map((tip) => (
                <li key={tip} className='flex items-start gap-2 text-[12px] leading-relaxed text-white/55'>
                  <ShieldIcon className='mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-300' />
                  {tip}
                </li>
              ))}
            </ul>
          </div>

          <button
            type='button'
            onClick={() => setSheet('exit')}
            className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-rose-400/30 bg-rose-400/[.06] p-3.5 text-left'
          >
            <BanIcon className='h-4 w-4 shrink-0 text-rose-300' />
            <span>
              <span className='block text-[13.5px] text-rose-200'>退出同行</span>
              <span className='block text-[11.5px] text-white/45'>立即停止双方继续联系，需二次确认</span>
            </span>
          </button>

          <p className='px-1 pt-1 text-[11px] leading-relaxed text-white/35'>
            长按任意一条真人消息可举报或屏蔽成员。本 Demo 的房间与成员均为虚构数据。
          </p>
        </div>
      </Sheet>

      {/* ---------------- 输入栏「＋」：Agent帮写 / 查看任务 / 共享歌曲 / 查看集合点 ---------------- */}
      <Sheet open={sheet === 'plus'} onClose={() => setSheet('none')} title='更多操作' description='这些内容都不会自动发送，先填进输入框或打开面板确认。'>
        <div className='space-y-2'>
          {[
            { key: 'agent' as const, icon: <SparkleIcon className='h-4 w-4 text-brand-300' />, title: 'Agent帮写', note: '只生成草稿，确认后才会发送' },
            { key: 'tasks' as const, icon: <CheckIcon className='h-4 w-4 text-brand-300' />, title: '查看任务', note: `候场任务已完成 ${doneCount}/${tasks.length}` },
            { key: 'share' as const, icon: <MusicIcon className='h-4 w-4 text-brand-300' />, title: '共享歌曲', note: '从这场演出的热门曲目里挑一首' },
            { key: 'meeting' as const, icon: <MapPinIcon className='h-4 w-4 text-brand-300' />, title: '查看集合点', note: `${place} · ${meetTime}` },
          ].map((item) => (
            <button
              key={item.key}
              type='button'
              onClick={() => {
                if (item.key === 'agent') {
                  setDraft('')
                  setDraftCursor(0)
                }
                setSheet(item.key)
              }}
              className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left'
            >
              {item.icon}
              <span className='min-w-0 flex-1'>
                <span className='block text-[13.5px] text-white'>{item.title}</span>
                <span className='block truncate text-[11.5px] text-white/45'>{item.note}</span>
              </span>
              <ChevronRightIcon className='h-4 w-4 shrink-0 text-white/30' />
            </button>
          ))}
        </div>
      </Sheet>

      {/* ---------------- Agent帮写：只出草稿，发送仍由用户点 ---------------- */}
      <Sheet open={sheet === 'agent'} onClose={() => setSheet('none')} title='Agent帮写' description='Agent 只生成草稿，需要你确认后才会发送。'>
        <div className='space-y-3'>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={draftPool[0]}
            className='min-h-[96px] w-full rounded-2xl border border-white/12 bg-stage-800 p-3 text-[14px] leading-relaxed text-white outline-none placeholder:text-white/30'
          />
          <div className='flex gap-2'>
            <Button variant='secondary' size='sm' full onClick={generateDraft}>
              {draft ? '换一条' : '生成草稿'}
            </Button>
            <Button size='sm' full disabled={!draft.trim()} onClick={useDraft}>
              填入输入框
            </Button>
          </div>
          <p className='text-[11px] leading-relaxed text-white/40'>填入后仍需要你自己点「发送」，Agent 不会代替你说话。</p>
        </div>
      </Sheet>

      {/* ---------------- 候场任务 ---------------- */}
      <Sheet open={sheet === 'tasks'} onClose={() => setSheet('none')} title='候场任务' description={`已完成 ${doneCount}/${tasks.length}，只在演出前和候场期间有效。`}>
        <div className='space-y-2'>
          {tasks.map((task) => (
            <button
              key={task.id}
              type='button'
              onClick={() => toggleTask(task.id)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border p-3.5 text-left',
                task.done ? 'border-brand-500/35 bg-brand-500/[.08]' : 'border-white/10',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  task.done ? 'border-brand-400 bg-brand-500 text-stage-950' : 'border-white/20 text-transparent',
                )}
              >
                <CheckIcon className='h-3.5 w-3.5' />
              </span>
              <span className='min-w-0 flex-1'>
                <span className={cn('block text-[13.5px]', task.done ? 'text-white/60 line-through' : 'text-white')}>{task.label}</span>
                <span className='mt-0.5 block text-[11.5px] leading-relaxed text-white/45'>{task.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </Sheet>

      {/* ---------------- 共享歌曲：只填入输入框，不自动发送 ---------------- */}
      <Sheet open={sheet === 'share'} onClose={() => setSheet('none')} title='共享歌曲' description='选一首这场演出的歌，填入输入框后由你自己发送。'>
        <div className='space-y-2'>
          <DemoMusicPlayer tracks={songs.map(localDemoAudioByTitle).filter((track): track is NonNullable<typeof track> => Boolean(track))} reason='双方共同歌单' compact />
          {songs.map((song) => (
            <button
              key={song}
              type='button'
              onClick={() => {
                setInput(`分享歌曲《${song}》，散场一起听？`)
                setSheet('none')
                pushToast(`已把《${song}》填入输入框`)
                inputRef.current?.focus()
              }}
              className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left'
            >
              <MusicIcon className='h-4 w-4 shrink-0 text-brand-300' />
              <span className='min-w-0 flex-1 truncate text-[13.5px] text-white'>{song}</span>
              <ChevronRightIcon className='h-4 w-4 shrink-0 text-white/30' />
            </button>
          ))}
        </div>
      </Sheet>

      {/* ---------------- 长按消息后的操作菜单：平时不占位 ---------------- */}
      <Sheet
        open={sheet === 'actions'}
        onClose={() => setSheet('none')}
        title='消息操作'
        description={actionTarget ? `${actionTarget.nickname}：${actionTarget.text}` : undefined}
      >
        <div className='space-y-2'>
          <button
            type='button'
            onClick={() => {
              setReportReason('')
              setSheet('report')
            }}
            className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left'
          >
            <FlagIcon className='h-4 w-4 shrink-0 text-rose-300' />
            <span className='text-[13.5px] text-white'>举报消息</span>
          </button>
          <button
            type='button'
            disabled={!actionTarget}
            onClick={() => actionTarget && blockMember(actionTarget)}
            className='flex min-h-12 w-full items-center gap-3 rounded-xl border border-white/10 p-3.5 text-left disabled:opacity-45'
          >
            <BanIcon className='h-4 w-4 shrink-0 text-warm-400' />
            <span className='text-[13.5px] text-white'>屏蔽成员</span>
          </button>
        </div>
      </Sheet>

      {/* ---------------- 举报 ---------------- */}
      <Sheet
        open={sheet === 'report'}
        onClose={() => setSheet('none')}
        title={actionTarget ? '举报单条消息' : '举报这个房间'}
        description={actionTarget ? `来自 ${actionTarget.nickname}：${actionTarget.text}` : '举报内容只会提交给平台处理，不会通知对方。'}
      >
        <div className='space-y-2'>
          {REPORT_REASONS.map((reason) => (
            <button
              key={reason}
              type='button'
              onClick={() => setReportReason(reason)}
              className={cn(
                'min-h-12 w-full rounded-xl border p-3 text-left text-[14px]',
                reportReason === reason ? 'border-rose-400/50 bg-rose-400/10 text-white' : 'border-white/10 text-white/75',
              )}
            >
              {reason}
            </button>
          ))}
          <Button variant='danger' full disabled={!reportReason} onClick={submitReport}>
            提交举报
          </Button>
        </div>
      </Sheet>

      {/* ---------------- 退出同行：二次确认 ---------------- */}
      <Sheet
        open={sheet === 'exit'}
        onClose={() => setSheet('none')}
        title='再次确认：退出同行？'
        description='退出后立即停止双方继续联系，房间内的临时信息会被清除。返回消息列表不会退出房间。'
      >
        <div className='space-y-2'>
          <p className='text-[12px] text-white/45'>退出原因（可选，不填也能退出）</p>
          <div className='flex flex-wrap gap-2'>
            {EXIT_REASONS.map((reason) => (
              <button
                key={reason}
                type='button'
                onClick={() => setExitReason((prev) => (prev === reason ? '' : reason))}
                className={cn(
                  'min-h-11 rounded-pill border px-3.5 text-[13.5px]',
                  exitReason === reason ? 'border-warm-400/60 bg-warm-400/15 text-warm-400' : 'border-white/12 bg-white/[.03] text-white/65',
                )}
              >
                {reason}
              </button>
            ))}
          </div>
          <Button variant='danger' full icon={<BanIcon className='h-4 w-4' />} onClick={exitRoom}>
            确认退出并停止联系
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

/** 真人消息气泡：长按 / 右键才出现「举报消息、屏蔽成员」，平时不占位 */
function MessageBubble({
  message,
  viewerName,
  onActions,
}: {
  message: ChatMessage
  viewerName: string
  onActions: () => void
}) {
  const timer = useRef<number | null>(null)
  const cancel = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
  }
  useEffect(() => () => cancel(), [])

  const mine = Boolean(message.mine)
  const longPressProps = mine
    ? {}
    : {
        onPointerDown: () => {
          cancel()
          timer.current = window.setTimeout(() => {
            timer.current = null
            onActions()
          }, 450)
        },
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        onContextMenu: (event: React.MouseEvent) => {
          event.preventDefault()
          cancel()
          onActions()
        },
        onKeyDown: (event: React.KeyboardEvent) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onActions()
          }
        },
        tabIndex: 0,
        role: 'button' as const,
        'aria-label': `消息：来自 ${message.nickname}，长按打开操作菜单`,
      }

  return (
    <div className={cn('flex gap-2', mine && 'flex-row-reverse')}>
      {mine ? (
        <UserAvatar size={30} />
      ) : (
        <Avatar
          name={message.nickname}
          from={message.avatarFrom ?? (message.userId === 'mock-muna' ? '#31f58a' : '#4a7dff')}
          to={message.avatarTo ?? '#171a22'}
          size={30}
        />
      )}
      <div className={cn('max-w-[76%]', mine && 'text-right')}>
        <div className={cn('mb-1 flex gap-2 text-[11px] text-white/40', mine && 'justify-end')}>
          <span>{mine ? viewerName : message.nickname}</span>
          <span>{message.time}</span>
        </div>
        <div
          {...longPressProps}
          data-message-action={mine ? undefined : '1'}
          className={cn(
            'rounded-2xl px-3 py-2.5 text-left text-[14px] leading-relaxed',
            mine ? 'rounded-tr-sm bg-brand-500 text-stage-950' : 'rounded-tl-sm bg-white/[.07] text-white/85',
          )}
        >
          {message.text}
        </div>
      </div>
    </div>
  )
}
