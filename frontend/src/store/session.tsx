import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ApiError,
  cancelInviteAgent,
  createRoomAgent,
  feedbackAgent,
  fetchAgentSession,
  fetchMemoryCard,
  inviteAgent,
  peerConfirmAgent,
  resolveDataMode,
  respondInvitation as requestRespondInvitation,
  setDemoScenario,
  submitReport,
} from '../lib/api'
import { newAgentRunId, runAgentTask } from '../services/agent/agentRun'
import {
  AGENT_MODE_LABEL,
  describeAgentUnavailable,
  getAgentProvider,
  readAgentMode,
  writeAgentMode,
} from '../services/agent/agentProvider'
import { AgentNotConfiguredError, AgentRunAbortedError, type AgentMode } from '../services/agent/agentTypes'
import { probeLiveAvailability } from '../services/agent/liveAgentProvider'
import { ALL_SCOPES, DEMO_VIEWER } from '../lib/tmeMock'
import { createRoomState } from '../lib/agentMock'
import type {
  AgentState,
  AuthorizationScope,
  DemoCase,
  DemoScenario,
  MemoryCardData,
  ParsedIntent,
  Preferences,
  RoomState,
  ToastMessage,
} from '../types'

const STORAGE_KEY = 'sfl.session.v2'
const SCENARIO_KEY = 'sfl.scenario.v2'
const CASE_KEY = 'sfl.case.v2'
const JUDGE_KEY = 'sfl.judge.v2'

export const JUDGE_CASES: Array<{ value: DemoCase; label: string; note: string }> = [
  { value: 'normal', label: '正常匹配成功', note: '完整跑完八个工具，产出带证据的匹配结果' },
  { value: 'safety_no_match', label: '安全条件过滤后无匹配', note: '严格安全条件把同场候选人全部排除，返回 no_match' },
  { value: 'ai_fallback', label: '大模型不可用走本地 fallback', note: '跳过模型调用，用规则解析与文案模板完成匹配' },
]

function readSession<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeSession(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 演示环境忽略存储失败
  }
}

/** 刷新 / 重新进入时，不允许把上次中断的 running 任务当成"仍在跑"，更不允许自动重跑。 */
function sanitizePersisted(raw: Partial<PersistedState>): Partial<PersistedState> {
  const agent = raw.agent
  if (agent && agent.status === 'running') {
    return {
      ...raw,
      agent: {
        ...agent,
        status: 'error',
        error: '上次匹配被中断（刷新或离开页面），不会自动重跑，请点击「重新运行」',
      },
    }
  }
  return raw
}

interface PersistedState {
  concertId: string
  authorized: boolean
  scopes: AuthorizationScope[]
  rawIntent: string
  parsedIntent: ParsedIntent | null
  prefs: Preferences | null
  agent: AgentState | null
  peerViewed: boolean
  room: RoomState | null
  memory: MemoryCardData | null
}

const emptyState: PersistedState = {
  concertId: 'night-flight',
  authorized: false,
  scopes: [...ALL_SCOPES],
  rawIntent: '',
  parsedIntent: null,
  prefs: null,
  agent: null,
  peerViewed: false,
  room: null,
  memory: null,
}

export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return '出了点问题，请稍后再试'
}

interface SessionContextValue {
  scenario: DemoScenario
  changeScenario: (next: DemoScenario) => void
  judgeMode: boolean
  toggleJudgeMode: (next?: boolean) => void
  demoCase: DemoCase
  changeDemoCase: (next: DemoCase) => void
  dataMode: 'mock' | 'backend' | 'probing'

  concertId: string
  selectConcert: (concertId: string) => void

  authorized: boolean
  scopes: AuthorizationScope[]
  toggleScope: (scope: AuthorizationScope) => void
  setScopes: (scopes: AuthorizationScope[]) => void
  completeAuthorization: () => void
  destroyEventAgent: () => void

  rawIntent: string
  setRawIntent: (text: string) => void
  parsedIntent: ParsedIntent | null
  saveParsedIntent: (intent: ParsedIntent) => void

  prefs: Preferences | null
  savePrefs: (prefs: Preferences) => void

  agent: AgentState | null
  agentRunning: boolean
  /** 已登记 runId、正在做前置检查（例如探测后端模型配置）；页面按"运行中"处理，避免闪回未开始态。 */
  agentStarting: boolean
  agentError: string
  /** 当前 Agent 运行模式：mock（Demo 模拟）/ live（真实模型）。 */
  agentMode: AgentMode
  agentModeLabel: string
  /** 切换运行模式（live 未配置时用于一键切回 Demo）。 */
  setAgentMode: (mode: AgentMode) => void
  /** 本次任务的唯一 runId；同一个 runId 不会被启动两次。 */
  agentRunId: string | null
  /** 非空表示 live 模式但后端没有可用大模型配置，页面据此展示「尚未配置大模型服务」。 */
  agentNotConfigured: string
  runAgent: (options?: { text?: string; intent?: ParsedIntent | null }) => Promise<AgentState | null>
  /** 用户主动取消当前匹配：中止任务并回到可恢复的「还没有开始匹配」状态。 */
  cancelAgent: () => void
  peerViewed: boolean
  /** 返回是否真的邀请成功；失败时会给出 toast，调用方不要假装成功 */
  invite: (candidateId: string) => Promise<boolean>
  peerConfirm: (accept: boolean) => Promise<boolean>
  /** 对方视角：凭 inviteId 接受 / 拒绝；接受成功返回唯一房间，失败或拒绝返回 null。 */
  respondInvitation: (inviteId: string, accept: boolean) => Promise<RoomState | null>
  cancelInvite: (expired?: boolean) => Promise<boolean>
  createRoom: () => Promise<boolean>
  confirmAndCreateRoom: (candidateId: string) => Promise<boolean>
  roomError: string
  feedback: (rating: string, tags: string[], comment: string) => Promise<void>

  room: RoomState | null
  toggleTask: (taskId: string) => void
  toggleMemberConfirm: (memberId: string) => void
  confirmMeeting: () => void
  leaveRoom: () => void
  report: (reason: string, userId: string | null) => Promise<void>

  memory: MemoryCardData | null
  memoryLoading: boolean
  memoryError: string
  createMemory: () => Promise<void>
  updateMemoryLine: (line: string) => void

  resetAll: () => void
  toasts: ToastMessage[]
  pushToast: (text: string, tone?: ToastMessage['tone']) => void
  dismissToast: (id: string) => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => ({
    ...emptyState,
    ...sanitizePersisted(readSession<Partial<PersistedState>>(STORAGE_KEY, {})),
  }))
  const [scenario, setScenario] = useState<DemoScenario>(() => {
    const raw = typeof window === 'undefined' ? null : window.sessionStorage.getItem(SCENARIO_KEY)
    return raw === 'slow' || raw === 'error' ? raw : 'normal'
  })
  const [judgeMode, setJudgeMode] = useState<boolean>(() => readSession<boolean>(JUDGE_KEY, false))
  const [demoCase, setDemoCase] = useState<DemoCase>(() => {
    const raw = readSession<DemoCase>(CASE_KEY, 'normal')
    return raw === 'safety_no_match' || raw === 'ai_fallback' ? raw : 'normal'
  })
  const [dataMode, setDataMode] = useState<'mock' | 'backend' | 'probing'>('probing')
  const [agentMode, setAgentModeState] = useState<AgentMode>(() => readAgentMode())
  const [agentRunId, setAgentRunId] = useState<string | null>(null)
  const [agentNotConfigured, setAgentNotConfigured] = useState('')
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentStarting, setAgentStarting] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [roomError, setRoomError] = useState('')
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryError, setMemoryError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef<number[]>([])
  /** 正在执行的 runId；非空表示有任务在跑，任何重复调用都会被忽略。 */
  const activeRunId = useRef<string | null>(null)
  const runController = useRef<AbortController | null>(null)

  /** Agent 运行时跟随运行模式：mock 全本地，live 才走后端。 */
  const agentTransport = agentMode === 'live' ? 'backend' as const : 'mock' as const

  const setAgentMode = useCallback((mode: AgentMode) => {
    // 切换模式时中止旧任务，避免旧模式的定时器继续写入状态
    runController.current?.abort()
    runController.current = null
    activeRunId.current = null
    setAgentRunning(false)
    setAgentError('')
    setAgentNotConfigured('')
    writeAgentMode(mode)
    setAgentModeState(mode)
  }, [])

  // live 模式一旦选中就探测一次后端模型配置；未配置时立刻给出提示，不进入加载态。
  useEffect(() => {
    if (agentMode !== 'live') {
      setAgentNotConfigured('')
      return undefined
    }
    let alive = true
    void probeLiveAvailability().then((result) => {
      if (alive) setAgentNotConfigured(result.ok ? '' : describeAgentUnavailable(result.reason))
    })
    return () => {
      alive = false
    }
  }, [agentMode])

  useEffect(() => {
    setDemoScenario(scenario)
    try {
      window.sessionStorage.setItem(SCENARIO_KEY, scenario)
    } catch {
      // 忽略
    }
  }, [scenario])

  useEffect(() => {
    writeSession(STORAGE_KEY, state)
  }, [state])

  useEffect(() => {
    writeSession(JUDGE_KEY, judgeMode)
  }, [judgeMode])

  useEffect(() => {
    writeSession(CASE_KEY, demoCase)
  }, [demoCase])

  useEffect(() => {
    void resolveDataMode().then(setDataMode)
  }, [])


  useEffect(
    () => () => {
      runController.current?.abort()
      runController.current = null
      activeRunId.current = null
      timers.current.forEach((id) => window.clearTimeout(id))
    },
    [],
  )

  const schedule = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms)
    timers.current.push(id)
  }, [])

  const update = useCallback((updater: (prev: PersistedState) => Partial<PersistedState>) => {
    setState((prev) => ({ ...prev, ...updater(prev) }))
  }, [])

  // 发起方等待对方确认时，轮询后端会话：对方接受 / 拒绝 / 超时后本机才更新。
  // 绝不本地臆造对方已确认，也绝不提前建房。
  useEffect(() => {
    const sessionId = state.agent?.sessionId
    if (agentTransport !== 'backend' || !sessionId || state.agent?.pendingConfirmation.status !== 'awaiting_peer') return undefined
    let cancelled = false
    const timer = window.setInterval(() => {
      void fetchAgentSession(sessionId)
        .then((next) => {
          if (cancelled) return
          update((prev) => {
            const current = prev.agent
            if (!current || current.sessionId !== sessionId) return {}
            if (next.pendingConfirmation.status === current.pendingConfirmation.status && (next.roomId ?? null) === (current.roomId ?? null)) return {}
            return { agent: next, room: (next.room ?? null) as RoomState | null }
          })
        })
        .catch(() => {
          // 轮询失败不打扰用户，下一次再试
        })
    }, 2500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [state.agent?.pendingConfirmation.status, state.agent?.sessionId, agentTransport, update])

  const pushToast = useCallback(
    (text: string, tone: ToastMessage['tone'] = 'default') => {
      const id = `toast-${Date.now()}-${Math.round(Math.random() * 1000)}`
      setToasts((prev) => [...prev, { id, text, tone }])
      schedule(() => setToasts((prev) => prev.filter((item) => item.id !== id)), 3600)
    },
    [schedule],
  )

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id))
  }, [])

  // ------------------------------------------------------------ 演出与授权
  const selectConcert = useCallback(
    (concertId: string) => {
      update((prev) => (prev.concertId === concertId ? {} : { ...emptyState, concertId }))
    },
    [update],
  )

  const toggleScope = useCallback(
    (scope: AuthorizationScope) => {
      update((prev) => ({
        scopes: prev.scopes.includes(scope) ? prev.scopes.filter((item) => item !== scope) : [...prev.scopes, scope],
      }))
    },
    [update],
  )

  const setScopes = useCallback((scopes: AuthorizationScope[]) => update(() => ({ scopes })), [update])

  const completeAuthorization = useCallback(() => update(() => ({ authorized: true })), [update])
  const destroyEventAgent = useCallback(() => {
    update((prev) => ({ ...emptyState, concertId: prev.concertId, scopes: [] }))
    pushToast('本场同行 Agent 已销毁，授权与临时数据已撤回', 'success')
  }, [pushToast, update])

  const setRawIntent = useCallback((text: string) => update(() => ({ rawIntent: text })), [update])

  const saveParsedIntent = useCallback((intent: ParsedIntent) => update(() => ({ parsedIntent: intent })), [update])

  const savePrefs = useCallback((prefs: Preferences) => update(() => ({ prefs })), [update])

  // ------------------------------------------------------------ Agent
  const runAgent = useCallback(
    async (options?: { text?: string; intent?: ParsedIntent | null }) => {
      // 同一时间只允许一个任务：重复点击 / React StrictMode 双调用 / 路由重入都会被这里挡住。
      if (activeRunId.current) return null
      const text = options?.text ?? state.rawIntent
      const intent = options?.intent ?? state.parsedIntent
      const mode = readAgentMode()
      const provider = getAgentProvider(mode)
      const runId = newAgentRunId()
      activeRunId.current = runId
      setAgentRunId(runId)
      setAgentStarting(true)

      // live 但后端没有可用模型配置：不进入加载动画、不发第二次请求、不静默回退。
      if (mode === 'live') {
        const availability = await probeLiveAvailability()
        if (!availability.ok) {
          if (activeRunId.current === runId) {
            activeRunId.current = null
            setAgentStarting(false)
            setAgentRunning(false)
          }
          setAgentError('')
          setAgentNotConfigured(describeAgentUnavailable(availability.reason))
          update(() => ({ agent: null }))
          return null
        }
      }

      // 前置检查期间可能被取消 / 重置，这里再确认一次，避免旧任务继续写状态
      if (activeRunId.current !== runId) return null

      const controller = new AbortController()
      runController.current = controller
      setAgentStarting(false)
      setAgentRunning(true)
      setAgentError('')
      update(() => ({ agent: null, room: null, memory: null, peerViewed: false }))

      const placeholder: AgentState = {
        sessionId: runId,
        userId: DEMO_VIEWER.userId,
        eventId: state.concertId,
        rawIntent: text,
        parsedIntent: intent,
        musicProfile: null,
        candidateIds: [],
        excludedCandidates: [],
        rankedCandidates: [],
        proposedGroup: {},
        evidence: [],
        pendingConfirmation: { required: false, status: 'none' },
        roomId: null,
        status: 'running',
        error: '',
        authorizedScopes: state.scopes,
        scenario: demoCase,
        trace: [],
        phases: [],
        provider: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      update(() => ({ agent: placeholder }))

      try {
        const next = await runAgentTask({
          runId,
          provider,
          eventId: state.concertId,
          userId: DEMO_VIEWER.userId,
          text,
          scopes: state.scopes,
          demoCase,
          scenario,
          intent,
          signal: controller.signal,
          onStep: (step) => {
            update((prev) =>
              prev.agent
                ? { agent: { ...prev.agent, trace: [...prev.agent.trace, step], status: 'running' } }
                : {},
            )
          },
        })
        update(() => ({ agent: next }))
        // live 模式下如果有步骤回退到本地规则，必须显式说出来，不能让它看起来像模型输出
        const liveFallback = mode === 'live'
          ? next.trace.find((step) => step.usedFallback || step.status === 'fallback')
          : undefined
        if (liveFallback) {
          pushToast('大模型调用失败，本次已明确回退到本地规则（详见工作过程）', 'warn')
        }
        if (next.status === 'no_match') {
          pushToast('这一轮没有找到符合安全条件的同频搭子', 'warn')
        } else if (next.status === 'error') {
          setAgentError(next.error || 'Agent 执行失败，请稍后重试')
        } else if (!liveFallback) {
          pushToast('Agent 已跑完，为你找到同频方案', 'success')
        }
        return next
      } catch (error) {
        if (error instanceof AgentRunAbortedError) {
          // 用户取消 / 切换模式：静默结束，不写 error 状态（否则会把新一轮任务盖掉）
          return null
        }
        if (error instanceof AgentNotConfiguredError) {
          setAgentNotConfigured(describeAgentUnavailable(error.reason))
        }
        const message = messageOf(error)
        setAgentError(message)
        update((prev) => ({
          agent: prev.agent
            ? { ...prev.agent, status: 'error', error: message }
            : { ...placeholder, status: 'error', error: message },
        }))
        // 失败后只停在这里，不自动重试、不轮询；由用户点「重新运行」
        return null
      } finally {
        // 只有当这个 runId 仍然是"当前任务"时才收尾；
        // 否则说明它已被取消/重置，收尾会误伤随后启动的新任务。
        if (activeRunId.current === runId) {
          activeRunId.current = null
          runController.current = null
          setAgentStarting(false)
          setAgentRunning(false)
        }
      }
    },
    [demoCase, pushToast, scenario, state.concertId, state.parsedIntent, state.rawIntent, state.scopes, update],
  )

  /** 用户主动取消当前匹配：中止任务并回到可恢复的「还没有开始匹配」状态。 */
  const cancelAgent = useCallback(() => {
    runController.current?.abort()
    runController.current = null
    activeRunId.current = null
    setAgentStarting(false)
    setAgentRunning(false)
    setAgentError('')
    setAgentRunId(null)
    update(() => ({ agent: null }))
  }, [update])

  // ------------------------------------------------------------ 双向确认
  const invite = useCallback(
    async (candidateId: string): Promise<boolean> => {
      const current = state.agent
      if (!current) return false
      try {
        const next = await inviteAgent(current, candidateId, agentTransport)
        update(() => ({ agent: next, peerViewed: false }))
        pushToast('已发出同频邀请，等待对方确认')
        schedule(() => update(() => ({ peerViewed: true })), 1400)
        return true
      } catch (error) {
        pushToast(messageOf(error), 'warn')
        return false
      }
    },
    [agentTransport, pushToast, schedule, state.agent, update],
  )

  const peerConfirm = useCallback(
    async (accept: boolean): Promise<boolean> => {
      const current = state.agent
      if (!current) return false
      try {
        const next = await peerConfirmAgent(current, accept, agentTransport)
        if (!accept) {
          update(() => ({ agent: next, room: null }))
          return true
        }
        const created = await createRoomAgent(next, agentTransport)
        if (!created.room) return false
        update(() => ({ agent: created.state, room: created.room, peerViewed: true }))
        return true
      } catch (error) {
        pushToast(messageOf(error), 'warn')
        return false
      }
    },
    [agentTransport, pushToast, state.agent, update],
  )

  const respondInvitation = useCallback(
    async (inviteId: string, accept: boolean): Promise<RoomState | null> => {
      try {
        const next = await requestRespondInvitation(inviteId, accept, agentTransport)
        if (!accept) {
          pushToast('已婉拒这次邀请，不会创建同行房间')
          return null
        }
        const created = (next.room ?? null) as RoomState | null
        if (!next.roomId || !created) {
          pushToast('对方已撤回或邀请已过期，本次没有创建房间', 'warn')
          return null
        }
        update(() => ({ agent: next, room: created, peerViewed: true }))
        pushToast('已接受同行邀请，房间已开启', 'success')
        return created
      } catch (error) {
        pushToast(messageOf(error), 'warn')
        return null
      }
    },
    [agentTransport, pushToast, update],
  )
  const cancelInvite = useCallback(async (expired = false): Promise<boolean> => {
    const current = state.agent
    if (!current || current.pendingConfirmation.status !== 'awaiting_peer') return false
    try {
      const next = await cancelInviteAgent(current, expired, agentTransport)
      update(() => ({ agent: next, room: null }))
      return true
    } catch (error) {
      pushToast(messageOf(error), 'warn')
      return false
    }
  }, [agentTransport, pushToast, state.agent, update])

  const createRoom = useCallback(async () => {
    const current = state.agent
    if (!current) return false
    setRoomError('')
    try {
      const { state: next, room } = await createRoomAgent(current, agentTransport)
      if (!room) {
        setRoomError('双方尚未都确认，不能创建临时房间')
        pushToast('双方尚未都确认，暂时不能进入房间', 'warn')
        return false
      }
      update(() => ({ agent: next, room }))
      return true
    } catch (error) {
      const message = messageOf(error)
      setRoomError(message)
      pushToast(message, 'warn')
      return false
    }
  }, [agentTransport, pushToast, state.agent, update])

  const confirmAndCreateRoom = useCallback(async (candidateId: string) => {
    if (!state.agent) return false
    setRoomError('')
    try {
      let next = state.agent
      if (next.pendingConfirmation.candidateId !== candidateId) next = await inviteAgent(next, candidateId, agentTransport)
      next = { ...next, pendingConfirmation: { ...next.pendingConfirmation, required: true, candidateId, proposerConfirmed: true, peerConfirmed: true, status: 'both_confirmed' } }
      // 真实模式必须由后端建房：只有后端持久化的房间，消息接口和第二个浏览器上下文才看得到。
      // 这里曾经只用 createRoomState 在本地造房间，导致房间页发消息 404、刷新后消息丢失。
      if (agentTransport === 'backend') {
        const { state: serverState, room } = await createRoomAgent(next, 'backend')
        if (!room) {
          setRoomError('双方尚未都确认，不能创建临时房间')
          pushToast('双方尚未都确认，暂时不能进入房间', 'warn')
          return false
        }
        update(() => ({ agent: serverState, room, peerViewed: true }))
        return true
      }
      const created = createRoomState(next)
      if (!created.room) return false
      update(() => ({ agent: created.state, room: created.room, peerViewed: true }))
      return true
    } catch (error) {
      const message = messageOf(error)
      setRoomError(message)
      pushToast(message, 'warn')
      return false
    }
  }, [agentTransport, pushToast, state.agent, update])

  const feedback = useCallback(
    async (rating: string, tags: string[], comment: string) => {
      const current = state.agent
      if (!current) return
      try {
        const next = await feedbackAgent(current, rating, tags, comment, agentTransport)
        update(() => ({ agent: next }))
        pushToast('反馈已记录，会用于后续调整匹配权重', 'success')
      } catch (error) {
        pushToast(messageOf(error), 'warn')
      }
    },
    [agentTransport, pushToast, state.agent, update],
  )

  // ------------------------------------------------------------ 房间
  const toggleTask = useCallback(
    (taskId: string) => {
      update((prev) =>
        prev.room
          ? { room: { ...prev.room, tasks: prev.room.tasks.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)) } }
          : {},
      )
    },
    [update],
  )

  const toggleMemberConfirm = useCallback(
    (memberId: string) => {
      update((prev) =>
        prev.room
          ? {
              room: {
                ...prev.room,
                members: prev.room.members.map((member) =>
                  member.userId === memberId && !member.isMe ? { ...member, confirmed: !member.confirmed } : member,
                ),
              },
            }
          : {},
      )
    },
    [update],
  )

  const confirmMeeting = useCallback(() => {
    update((prev) => (prev.room ? { room: { ...prev.room, meetingConfirmed: true } } : {}))
    pushToast('已确认集合点，记得把行程告诉一位朋友', 'success')
  }, [pushToast, update])

  const leaveRoom = useCallback(() => {
    update((prev) => ({
      room: null,
      peerViewed: false,
      agent: prev.agent
        ? { ...prev.agent, pendingConfirmation: { required: false, status: 'none' }, roomId: null, room: {} }
        : null,
    }))
    pushToast('已退出同频房间，房间内的临时信息已清除')
  }, [pushToast, update])

  const report = useCallback(
    async (reason: string, userId: string | null) => {
      try {
        await submitReport(reason, userId)
        pushToast('举报已提交，我们会尽快处理', 'success')
      } catch (error) {
        pushToast(messageOf(error), 'warn')
      }
    },
    [pushToast],
  )

  // ------------------------------------------------------------ 回忆卡
  const createMemory = useCallback(async () => {
    const agent = state.agent
    const partnerId = agent?.pendingConfirmation.candidateId ?? null
    const companions = (agent?.proposedGroup.members ?? [])
      .filter((member) => member.role === 'companion')
      .map((member) => member.userId)
    const partnerItem = agent?.rankedCandidates.find((item) => item.userId === partnerId) ?? null

    setMemoryLoading(true)
    setMemoryError('')
    try {
      const memory = await fetchMemoryCard({
        concertId: state.concertId,
        partnerId,
        companionIds: companions,
        sharedSongs: partnerItem?.sharedSongs ?? [],
      })
      update(() => ({ memory }))
    } catch (error) {
      setMemoryError(messageOf(error))
    } finally {
      setMemoryLoading(false)
    }
  }, [state.agent, state.concertId, update])

  const updateMemoryLine = useCallback(
    (line: string) => update((prev) => (prev.memory ? { memory: { ...prev.memory, line } } : {})),
    [update],
  )

  const changeScenario = useCallback((next: DemoScenario) => setScenario(next), [])

  const toggleJudgeMode = useCallback((next?: boolean) => {
    setJudgeMode((prev) => next ?? !prev)
  }, [])

  const changeDemoCase = useCallback((next: DemoCase) => setDemoCase(next), [])

  const resetAll = useCallback(() => {
    runController.current?.abort()
    runController.current = null
    activeRunId.current = null
    setAgentStarting(false)
    setAgentRunning(false)
    setState(emptyState)
    setAgentError('')
    setAgentRunId(null)
    setAgentNotConfigured('')
    setRoomError('')
    setMemoryError('')
    setToasts([])
    setDemoCase('normal')
    setScenario('normal')
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
      window.sessionStorage.removeItem(SCENARIO_KEY)
      window.sessionStorage.removeItem(CASE_KEY)
    } catch {
      // 忽略
    }
    pushToast('演示数据已重置', 'success')
  }, [pushToast])

  const value = useMemo<SessionContextValue>(
    () => ({
      scenario,
      changeScenario,
      judgeMode,
      toggleJudgeMode,
      demoCase,
      changeDemoCase,
      dataMode,
      concertId: state.concertId,
      selectConcert,
      authorized: state.authorized,
      scopes: state.scopes,
      toggleScope,
      setScopes,
      completeAuthorization,
      destroyEventAgent,
      rawIntent: state.rawIntent,
      setRawIntent,
      parsedIntent: state.parsedIntent,
      saveParsedIntent,
      prefs: state.prefs,
      savePrefs,
      agent: state.agent,
      agentRunning,
      agentStarting,
      agentError,
      agentMode,
      agentModeLabel: AGENT_MODE_LABEL[agentMode],
      setAgentMode,
      agentRunId,
      agentNotConfigured,
      runAgent,
      cancelAgent,
      peerViewed: state.peerViewed,
      invite,
      peerConfirm,
      respondInvitation,
      cancelInvite,
      createRoom,
      confirmAndCreateRoom,
      roomError,
      feedback,
      room: state.room,
      toggleTask,
      toggleMemberConfirm,
      confirmMeeting,
      leaveRoom,
      report,
      memory: state.memory,
      memoryLoading,
      memoryError,
      createMemory,
      updateMemoryLine,
      resetAll,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      agentError,
      agentRunning,
      agentStarting,
      agentMode,
      agentNotConfigured,
      agentRunId,
      changeDemoCase,
      changeScenario,
      completeAuthorization,
      destroyEventAgent,
      confirmMeeting,
      createMemory,
      createRoom,
      confirmAndCreateRoom,
      dataMode,
      demoCase,
      dismissToast,
      feedback,
      invite,
      judgeMode,
      leaveRoom,
      memoryError,
      memoryLoading,
      peerConfirm,
      respondInvitation,
      cancelInvite,
      pushToast,
      report,
      resetAll,
      roomError,
      runAgent,
      cancelAgent,
      saveParsedIntent,
      savePrefs,
      scenario,
      selectConcert,
      setRawIntent,
      setAgentMode,
      setScopes,
      state,
      toasts,
      toggleJudgeMode,
      toggleMemberConfirm,
      toggleScope,
      toggleTask,
      updateMemoryLine,
    ],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext)
  if (!context) {
    throw new Error('useSession 必须在 SessionProvider 内使用')
  }
  return context
}
