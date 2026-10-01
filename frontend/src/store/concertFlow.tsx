import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthorizationScope, ParsedIntent } from '../types'

export interface ConcertFlowState {
  consentStatus: 'unknown' | 'granted' | 'declined'
  consentScopes: AuthorizationScope[]
  intent: ParsedIntent | null
  agentRunId: string | null
  selectedCandidateId: string | null
  handshakeStatus: 'idle' | 'reviewed' | 'confirmed'
  roomId: string | null
}
const EMPTY: ConcertFlowState = { consentStatus: 'unknown', consentScopes: [], intent: null, agentRunId: null, selectedCandidateId: null, handshakeStatus: 'idle', roomId: null }
const KEY = 'syncstage.concertFlow.v1'
type Store = Record<string, ConcertFlowState>
const Context = createContext<{ get: (id: string) => ConcertFlowState; patch: (id: string, value: Partial<ConcertFlowState>) => void } | null>(null)

export function ConcertFlowProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } })
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(store)) }, [store])
  const value = useMemo(() => ({ get: (id: string) => store[id] ?? EMPTY, patch: (id: string, next: Partial<ConcertFlowState>) => setStore((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), ...next } })) }), [store])
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useConcertFlow(concertId: string) { const ctx = useContext(Context); if (!ctx) throw new Error('ConcertFlowProvider missing'); return { flow: ctx.get(concertId), patchFlow: (next: Partial<ConcertFlowState>) => ctx.patch(concertId, next) } }
