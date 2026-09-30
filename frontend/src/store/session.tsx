import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ApiError,
  createRoomAgent,
  feedbackAgent,
  fetchMemoryCard,
  inviteAgent,
  peerConfirmAgent,
  resolveDataMode,
  setDemoScenario,
  startAgent,
  submitReport,
} from '../lib/api'
import { ALL_SCOPES, DEMO_VIEWER } from '../lib/tmeMock'
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
  agentError: string
  runAgent: (options?: { text?: string; intent?: ParsedIntent | null }) => Promise<AgentState | null>

  peerViewed: boolean
  invite: (candidateId: string) => Promise<void>
  peerConfirm: (accept: boolean) => Promise<void>
  createRoom: () => Promise<boolean>
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
  const [state, setState] = useState<PersistedState>(() => ({ ...emptyState, ...readSession<Partial<PersistedState>>(STORAGE_KEY, {}) }))
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
  const [agentRunning, setAgentRunning] = useState(false)
  const [agentError, setAgentError] = useState('')
  const [roomError, setRoomError] = useState('')
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [memoryError, setMemoryError] = useState('')
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const timers = useRef<number[]>([])

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
      const text = options?.text ?? state.rawIntent
      const intent = options?.intent ?? state.parsedIntent
      setAgentRunning(true)
      setAgentError('')
      update(() => ({ agent: null, room: null, memory: null, peerViewed: false }))

      const placeholder: AgentState = {
        sessionId: 'running',
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
        const next = await startAgent({
          text,
          eventId: state.concertId,
          userId: DEMO_VIEWER.userId,
          scopes: state.scopes,
          demoCase,
          parsedIntent: intent,
          onStep: (step) => {
            update((prev) =>
              prev.agent
                ? { agent: { ...prev.agent, trace: [...prev.agent.trace, step], status: 'running' } }
                : {},
            )
          },
        })
        update(() => ({ agent: next }))
        if (next.status === 'no_match') {
          pushToast('这一轮没有找到符合安全条件的同频搭子', 'warn')
        } else if (next.status === 'error') {
          setAgentError(next.error || 'Agent 执行失败，请稍后重试')
        } else {
          pushToast('Agent 已跑完，为你找到同频方案', 'success')
        }
        return next
      } catch (error) {
        const message = messageOf(error)
        setAgentError(message)
        update((prev) => (prev.agent ? { agent: { ...prev.agent, status: 'error', error: message } } : {}))
        return null
      } finally {
        setAgentRunning(false)
      }
    },
    [demoCase, pushToast, state.concertId, state.parsedIntent, state.rawIntent, state.scopes, update],
  )

  // ------------------------------------------------------------ 双向确认
  const invite = useCallback(
    async (candidateId: string) => {
      const current = state.agent
      if (!current) return
      const next = await inviteAgent(current, candidateId)
      update(() => ({ agent: next, peerViewed: false }))
      pushToast('已发出同频邀请，等待对方确认')
      schedule(() => update(() => ({ peerViewed: true })), 1400)
      schedule(() => {
        void (async () => {
          const latest = await peerConfirmAgent({ ...next, pendingConfirmation: { ...next.pendingConfirmation } }, true)
          update(() => ({ agent: latest }))
          pushToast('对方已确认，可以进入临时房间了', 'success')
        })()
      }, 3600)
    },
    [pushToast, schedule, state.agent, update],
  )

  const peerConfirm = useCallback(
    async (accept: boolean) => {
      const current = state.agent
      if (!current) return
      const next = await peerConfirmAgent(current, accept)
      update(() => ({ agent: next }))
    },
    [state.agent, update],
  )

  const createRoom = useCallback(async () => {
    const current = state.agent
    if (!current) return false
    setRoomError('')
    try {
      const { state: next, room } = await createRoomAgent(current)
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
  }, [pushToast, state.agent, update])

  const feedback = useCallback(
    async (rating: string, tags: string[], comment: string) => {
      const current = state.agent
      if (!current) return
      try {
        const next = await feedbackAgent(current, rating, tags, comment)
        update(() => ({ agent: next }))
        pushToast('反馈已记录，会用于后续调整匹配权重', 'success')
      } catch (error) {
        pushToast(messageOf(error), 'warn')
      }
    },
    [pushToast, state.agent, update],
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
    setState(emptyState)
    setAgentError('')
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
      agentError,
      runAgent,
      peerViewed: state.peerViewed,
      invite,
      peerConfirm,
      createRoom,
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
      changeDemoCase,
      changeScenario,
      completeAuthorization,
      destroyEventAgent,
      confirmMeeting,
      createMemory,
      createRoom,
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
      pushToast,
      report,
      resetAll,
      roomError,
      runAgent,
      saveParsedIntent,
      savePrefs,
      scenario,
      selectConcert,
      setRawIntent,
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
