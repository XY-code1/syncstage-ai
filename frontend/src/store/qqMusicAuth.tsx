import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ALL_SCOPES } from '../lib/tmeMock'
import { createQQMusicAuthProvider, DEFAULT_QQ_MUSIC_USER, type QQMusicUser } from '../services/qqMusicAuth'
import { useConcertFlow } from './concertFlow'
import { useSession } from './session'

const KEY = 'syncstage.qqMusicUser.v1'

function readUser(): QQMusicUser {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<QQMusicUser> | null
    return saved ? { ...DEFAULT_QQ_MUSIC_USER, ...saved, qqOpenId: null, dataSource: 'mock', loginMode: 'demo' } : DEFAULT_QQ_MUSIC_USER
  } catch {
    return DEFAULT_QQ_MUSIC_USER
  }
}

type QQMusicAuthContextValue = {
  qqMusicUser: QQMusicUser
  authorizing: boolean
  error: string
  authorize: () => Promise<boolean>
  revoke: () => Promise<void>
}

const Context = createContext<QQMusicAuthContextValue | null>(null)

export function QQMusicAuthStateProvider({ children }: { children: ReactNode }) {
  const [qqMusicUser, setQQMusicUser] = useState<QQMusicUser>(readUser)
  const [authorizing, setAuthorizing] = useState(false)
  const [error, setError] = useState('')
  const { concertId, completeAuthorization, setScopes, destroyEventAgent } = useSession()
  const { patchFlow, resetFlow } = useConcertFlow(concertId)
  const provider = useMemo(() => createQQMusicAuthProvider(), [])

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(qqMusicUser))
  }, [qqMusicUser])

  const authorize = useCallback(async () => {
    setAuthorizing(true)
    setError('')
    try {
      const result = await provider.login()
      const [profile] = await Promise.all([provider.getProfile(), provider.getMusicProfile()])
      const next: QQMusicUser = { ...DEFAULT_QQ_MUSIC_USER, ...profile, authorized: result.authorized }
      setQQMusicUser(next)
      setScopes([...ALL_SCOPES])
      completeAuthorization()
      patchFlow({ consentStatus: 'granted', consentScopes: [...ALL_SCOPES] })
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '授权失败，请稍后重试')
      return false
    } finally {
      setAuthorizing(false)
    }
  }, [completeAuthorization, patchFlow, provider, setScopes])

  const revoke = useCallback(async () => {
    try { await provider.revoke() } catch { /* 官方模式未接入时仍清除本机 Demo 状态 */ }
    localStorage.removeItem(KEY)
    setQQMusicUser(DEFAULT_QQ_MUSIC_USER)
    destroyEventAgent()
    resetFlow()
  }, [destroyEventAgent, provider, resetFlow])

  return <Context.Provider value={{ qqMusicUser, authorizing, error, authorize, revoke }}>{children}</Context.Provider>
}

export function useQQMusicAuth() {
  const value = useContext(Context)
  if (!value) throw new Error('QQMusicAuthStateProvider missing')
  return value
}
