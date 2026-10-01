import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { RoomState } from '../types'
import { ApiError, sendAgentChat } from '../lib/api'
import { useProfile } from './profile'

/**
 * 消息中心的本地演示数据源。
 * 二级页面（消息列表 / 聊天房间）只消费这里的结构化会话，
 * Agent 仍然只负责产出结构化建议，不参与自由聊天。
 */

export type ThreadKind = 'agent' | 'group' | 'dm' | 'system'

export interface MeetingCard {
  title: string
  place: string
  time: string
  note: string
  accepted?: boolean
}

export interface ChatMessage {
  id: string
  threadId: string
  authorId: string
  authorName: string
  text: string
  time: string
  mine?: boolean
  system?: boolean
  card?: MeetingCard
  /** 由「同频 Agent ✨」生成 */
  agent?: boolean
  /** 已乐观展示、等待模型回复 */
  pending?: boolean
  /** 发送失败，可重试 */
  failed?: boolean
  /** 真实模型元信息（来源 / 模型名 / 耗时 / 请求 ID） */
  meta?: MessageMeta
}

export interface MessageMeta {
  source: 'model' | 'demo-fallback'
  model: string
  elapsedMs: number
  requestId: string
  parseWarning?: string | null
}

export type AgentStatus = 'idle' | 'sending' | 'thinking' | 'failed'

export interface AgentThreadState {
  status: AgentStatus
  error?: string
  errorCode?: string
  errorHint?: string
  at?: number
}

export interface Thread {
  id: string
  kind: ThreadKind
  title: string
  subtitle: string
  avatar: { from: string; to: string } | null
  unread: number
  time: string
  members?: number
  pinned?: boolean
}

export const THREAD_KIND_LABEL: Record<ThreadKind, string> = {
  agent: 'Agent 通知',
  group: '群聊与临时房间',
  dm: '私聊',
  system: '系统通知',
}

const STATIC_THREADS: Thread[] = [
  {
    id: 'agent-notify',
    kind: 'agent',
    title: '一起去现场 Agent',
    subtitle: '真实大模型驱动的同行协调，可讨论集合与现场安排',
    avatar: null,
    unread: 2,
    time: '刚刚',
    pinned: true,
  },
  {
    id: 'dm-jiangli',
    kind: 'dm',
    title: '写歌的江离',
    subtitle: '那我们入场前在周边售卖台见？',
    avatar: { from: '#9b8cff', to: '#1b2330' },
    unread: 1,
    time: '18:42',
  },
  {
    id: 'dm-ache',
    kind: 'dm',
    title: '带着相机的阿澈',
    subtitle: '合照的时候我站左边就行，光线更好',
    avatar: { from: '#61c8ff', to: '#1b2330' },
    unread: 0,
    time: '昨天',
  },
  {
    id: 'system',
    kind: 'system',
    title: '系统通知',
    subtitle: '临时房间在活动结束 24 小时后自动归档',
    avatar: null,
    unread: 0,
    time: '昨天',
  },
]

const GROUP_MESSAGES: ChatMessage[] = [
  {
    id: 'g-safety',
    threadId: 'group',
    authorId: 'system',
    authorName: '系统安全提示',
    text: '同行 Agent 已完成安全条件核对。请勿发送身份证、票务验证码、精确住址等敏感信息。',
    time: '18:31',
    system: true,
  },
  {
    id: 'g-agent-card',
    threadId: 'group',
    authorId: 'agent',
    authorName: '一起去现场 Agent',
    text: '根据双方确认的到场时间，建议集合安排如下：',
    time: '18:32',
    card: {
      title: '集合时间与地点建议',
      place: '声浪 Livehouse 静安店 · 1F 检票口右侧周边售卖台',
      time: '18:50（开场前 40 分钟）',
      note: '公共区域、灯光明亮、有工作人员值守，不进入封闭空间',
    },
  },
  {
    id: 'g-1',
    threadId: 'group',
    authorId: 'u-08',
    authorName: '写歌的江离',
    text: '我大概 18:40 到，可以先在检票口附近等大家。',
    time: '18:33',
  },
  {
    id: 'g-2',
    threadId: 'group',
    authorId: 'u-01',
    authorName: '靠近舞台的橘子',
    text: '好呀，我穿亮绿色外套，到时候在群里说一声。',
    time: '18:34',
  },
]

const DEFAULT_MESSAGES: Record<string, ChatMessage[]> = {
  'agent-notify': [
    {
      id: 'a-1',
      threadId: 'agent-notify',
      authorId: 'agent',
      authorName: '一起去现场 Agent',
      text: '已完成 4 个阶段的匹配：理解需求 → 寻找同场用户 → 计算同频度 → 生成组队方案。',
      time: '18:20',
    },
    {
      id: 'a-2',
      threadId: 'agent-notify',
      authorId: 'agent',
      authorName: '一起去现场 Agent',
      text: '在「夜航计划 · 上海站」的同场观众里找到 3 位符合硬条件的候选人，Top Match 与你共同收藏 3 首歌。',
      time: '18:21',
      card: {
        title: '集合时间与地点建议',
        place: '声浪 Livehouse 静安店 · 1F 检票口右侧周边售卖台',
        time: '18:50（开场前 40 分钟）',
        note: '需要你和对方都确认后，才会创建临时房间',
      },
    },
    {
      id: 'a-3',
      threadId: 'agent-notify',
      authorId: 'agent',
      authorName: '一起去现场 Agent',
      text: '工具调用记录已收进「查看 Agent 工作过程」二级页面，按需展开即可。',
      time: '18:21',
    },
  ],
  'dm-jiangli': [
    {
      id: 'd-1',
      threadId: 'dm-jiangli',
      authorId: 'u-08',
      authorName: '写歌的江离',
      text: '看到我们共同收藏了《夜航的信》，你也是从这张专辑开始听他们的吗？',
      time: '18:38',
    },
    {
      id: 'd-2',
      threadId: 'dm-jiangli',
      authorId: 'me',
      authorName: '你',
      text: '是，考研那年一直在循环《雨中电台》，这次想站前面把副歌唱完。',
      time: '18:40',
      mine: true,
    },
    {
      id: 'd-3',
      threadId: 'dm-jiangli',
      authorId: 'u-08',
      authorName: '写歌的江离',
      text: '那我们入场前在周边售卖台见？',
      time: '18:42',
    },
  ],
  'dm-ache': [
    {
      id: 'e-1',
      threadId: 'dm-ache',
      authorId: 'u-04',
      authorName: '带着相机的阿澈',
      text: '我可以带相机，进场前帮你们拍一张合照，散场就不占用时间了。',
      time: '昨天 21:10',
    },
  ],
  system: [
    {
      id: 's-1',
      threadId: 'system',
      authorId: 'system',
      authorName: '系统通知',
      text: '临时同频房间仅在演出前与候场期间开放，活动结束 24 小时后自动归档。',
      time: '昨天 20:00',
      system: true,
    },
    {
      id: 's-2',
      threadId: 'system',
      authorId: 'system',
      authorName: '系统通知',
      text: '本次 Demo 全部为虚构数据，未接入真实 QQ 音乐账号。',
      time: '昨天 20:00',
      system: true,
    },
  ],
}

interface Persisted {
  read: Record<string, boolean>
  extra: Record<string, ChatMessage[]>
  accepted: Record<string, boolean>
}

const EMPTY: Persisted = { read: {}, extra: {}, accepted: {} }
const KEY = 'sfl.social.v1'

function read(): Persisted {
  if (typeof window === 'undefined') return EMPTY
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Persisted) } : EMPTY
  } catch {
    return EMPTY
  }
}

function groupThread(room: RoomState): Thread {
  const confirmed = room.members.filter((member) => member.confirmed).length
  return {
    id: `group-${room.roomId}`,
    kind: 'group',
    title: `${room.concertTitle} · 临时房间`,
    subtitle: `${room.members.length} 位成员 · ${confirmed}/${room.members.length} 已确认`,
    avatar: null,
    unread: 1,
    time: '进行中',
    members: room.members.length,
    pinned: true,
  }
}

interface SocialValue {
  threads: Thread[]
  unreadCount: number
  unreadOf: (thread: Thread) => number
  threadOf: (threadId: string) => Thread | undefined
  messagesOf: (threadId: string) => ChatMessage[]
  agentStateOf: (threadId: string) => AgentThreadState
  send: (threadId: string, text: string) => Promise<void>
  retry: (threadId: string) => Promise<void>
  markRead: (threadId: string) => void
  acceptCard: (threadId: string, messageId: string) => void
}

const SocialContext = createContext<SocialValue | null>(null)

const AGENT_KINDS = new Set<ThreadKind>(['agent', 'group'])
const IDLE_AGENT_STATE: AgentThreadState = { status: 'idle' }

function nowTime(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
}

export function SocialProvider({
  children,
  room,
  concertId = 'night-flight',
}: {
  children: ReactNode
  room: RoomState | null
  /** 当前演出，用于给 Agent 提供上下文 */
  concertId?: string
}) {
  const [state, setState] = useState<Persisted>(read)
  const [agentStates, setAgentStates] = useState<Record<string, AgentThreadState>>({})
  const { profile } = useProfile()
  const roomRef = useRef(room)
  roomRef.current = room

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      // 演示环境忽略存储失败
    }
  }, [state])

  const threads = useMemo<Thread[]>(() => {
    const dynamic = room ? [groupThread(room)] : []
    return [...dynamic, ...STATIC_THREADS]
  }, [room])

  const messagesOf = useCallback(
    (threadId: string) => {
      const base = DEFAULT_MESSAGES[threadId] ?? (threadId.startsWith('group-') ? GROUP_MESSAGES : [])
      const rewritten = base.map((message) =>
        message.threadId === threadId ? message : { ...message, threadId },
      )
      const extra = state.extra[threadId] ?? []
      const accepted = state.accepted[threadId]
      if (!accepted) return [...rewritten, ...extra]
      return [...rewritten, ...extra].map((message) =>
        message.card ? { ...message, card: { ...message.card, accepted: true } } : message,
      )
    },
    [state.extra, state.accepted],
  )

  const threadOf = useCallback((threadId: string) => threads.find((thread) => thread.id === threadId), [threads])

  const appendMessage = useCallback((threadId: string, message: ChatMessage) => {
    setState((prev) => ({
      ...prev,
      extra: { ...prev.extra, [threadId]: [...(prev.extra[threadId] ?? []), message] },
    }))
  }, [])

  const patchMessage = useCallback((threadId: string, messageId: string, patch: Partial<ChatMessage>) => {
    setState((prev) => ({
      ...prev,
      extra: {
        ...prev.extra,
        [threadId]: (prev.extra[threadId] ?? []).map((item) => (item.id === messageId ? { ...item, ...patch } : item)),
      },
    }))
  }, [])

  const setAgentState = useCallback((threadId: string, next: AgentThreadState) => {
    setAgentStates((prev) => ({ ...prev, [threadId]: next }))
  }, [])

  /** 只把"我"和 Agent 的消息送进模型；其他成员的消息带上昵称作为上下文 */
  const historyFor = useCallback(
    (threadId: string) =>
      messagesOf(threadId)
        .filter((message) => !message.system)
        .slice(-12)
        .map((message) => ({
          role: (message.mine ? 'user' : message.agent ? 'assistant' : 'user') as 'user' | 'assistant',
          content: message.mine || message.agent ? message.text : `${message.authorName}：${message.text}`,
        })),
    [messagesOf],
  )

  const runAgentReply = useCallback(
    async (thread: Thread, messageId: string, text: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) => {
      setAgentState(thread.id, { status: 'sending', at: Date.now() })
      try {
        // 让"发送中"这一帧真实可见，再切到"思考中"
        await new Promise((resolve) => setTimeout(resolve, 350))
        setAgentState(thread.id, { status: 'thinking', at: Date.now() })
        const activeRoom = roomRef.current
        const payload = await sendAgentChat({
          threadId: thread.id,
          threadKind: thread.kind,
          concertId: activeRoom?.concertId || concertId,
          roomId: thread.kind === 'group' ? activeRoom?.roomId ?? null : null,
          messages: [...history, { role: 'user', content: text }],
        })
        patchMessage(thread.id, messageId, { pending: false, failed: false })
        appendMessage(thread.id, {
          id: `agent-${Date.now()}`,
          threadId: thread.id,
          authorId: 'agent',
          authorName: payload.agentName || '同频 Agent ✨',
          text: payload.reply,
          time: nowTime(),
          agent: true,
          meta: {
            source: payload.source,
            model: payload.model,
            elapsedMs: payload.elapsedMs,
            requestId: payload.requestId,
            parseWarning: payload.parseWarning,
          },
          card: payload.suggestion
            ? {
                title: payload.suggestion.title || '集合时间与地点建议',
                place: payload.suggestion.place,
                time: payload.suggestion.time,
                note: payload.suggestion.note,
              }
            : undefined,
        })
        setAgentState(thread.id, IDLE_AGENT_STATE)
      } catch (error) {
        patchMessage(thread.id, messageId, { pending: false, failed: true })
        const apiError = error instanceof ApiError ? error : null
        setAgentState(thread.id, {
          status: 'failed',
          error: apiError?.message ?? (error instanceof Error ? error.message : 'Agent 回复失败'),
          errorCode: apiError?.code ?? 'UNKNOWN',
          errorHint: apiError?.hint ?? '',
          at: Date.now(),
        })
      }
    },
    [appendMessage, concertId, patchMessage, setAgentState],
  )

  const send = useCallback(
    async (threadId: string, text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      const thread = threads.find((item) => item.id === threadId)
      // 先取历史，再插入乐观展示的这条消息，避免重复
      const history = thread ? historyFor(threadId) : []
      const messageId = `local-${Date.now()}`
      appendMessage(threadId, {
        id: messageId,
        threadId,
        authorId: 'me',
        authorName: profile.nickname || '你',
        text: trimmed,
        time: nowTime(),
        mine: true,
        pending: true,
      })
      if (!thread || !AGENT_KINDS.has(thread.kind)) return
      await runAgentReply(thread, messageId, trimmed, history)
    },
    [appendMessage, historyFor, profile.nickname, runAgentReply, threads],
  )

  const retry = useCallback(
    async (threadId: string) => {
      const thread = threads.find((item) => item.id === threadId)
      if (!thread || !AGENT_KINDS.has(thread.kind)) return
      const failedMessage = [...messagesOf(threadId)].reverse().find((message) => message.mine && message.failed)
      if (!failedMessage) return
      patchMessage(threadId, failedMessage.id, { failed: false, pending: true })
      const priorHistory = historyFor(threadId).slice(0, -1)
      await runAgentReply(thread, failedMessage.id, failedMessage.text, priorHistory)
    },
    [historyFor, messagesOf, patchMessage, runAgentReply, threads],
  )

  const markRead = useCallback((threadId: string) => {
    setState((prev) => (prev.read[threadId] ? prev : { ...prev, read: { ...prev.read, [threadId]: true } }))
  }, [])

  const acceptCard = useCallback((threadId: string, messageId: string) => {
    void messageId
    setState((prev) => ({ ...prev, accepted: { ...prev.accepted, [threadId]: true } }))
  }, [])

  const value = useMemo<SocialValue>(() => {
    const unreadOf = (thread: Thread) => (state.read[thread.id] ? 0 : thread.unread)
    const unreadCount = threads.reduce((total, thread) => total + unreadOf(thread), 0)
    const agentStateOf = (threadId: string) => agentStates[threadId] ?? IDLE_AGENT_STATE
    return { threads, unreadCount, unreadOf, threadOf, messagesOf, agentStateOf, send, retry, markRead, acceptCard }
  }, [threads, state.read, agentStates, threadOf, messagesOf, send, retry, markRead, acceptCard])

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>
}

export function useSocial(): SocialValue {
  const ctx = useContext(SocialContext)
  if (!ctx) throw new Error('SocialProvider missing')
  return ctx
}
