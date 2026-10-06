import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { SummerSignalDeck, type CaptureStage } from '../components/sync/SummerSignalDeck'
import { demoConcerts } from '../data/demoData'
import { useConcertFlow } from '../store/concertFlow'
import { useSession } from '../store/session'
import { matchCandidates, type RevealCandidate } from '../data/revealCandidates'

/** Phase 1.1：仅重构 /sync 表现层，业务状态与路由保持原样。 */
export function SyncPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const { agent, concertId, matchResumable, authorized } = useSession()
  const requestedCandidate = new URLSearchParams(location.search).get('candidate')
  const persistedCandidate = window.sessionStorage.getItem(`syncstage:reveal:${params.concertId ?? concertId}`)
  const initialCandidateId = requestedCandidate ?? persistedCandidate
  const [index, setIndex] = useState(() => Math.max(0, matchCandidates.findIndex((item) => item.candidateId === initialCandidateId)))
  const concert = demoConcerts.find((item) => item.id === (params.concertId ?? concertId)) ?? demoConcerts[0]
  const total = matchCandidates.length
  const safeIndex = Math.min(index, Math.max(0, total - 1))
  const { patchFlow } = useConcertFlow(concert.id)
  const capture = new URLSearchParams(location.search).get('capture')
  const captureStage: CaptureStage | undefined =
    capture === 'sealed' || capture === 'opening-40' || capture === 'opening-80' || capture === 'revealed'
      ? capture
      : undefined

  useEffect(() => {
    const candidate = matchCandidates[safeIndex]
    if (!candidate) return
    window.sessionStorage.setItem(`syncstage:reveal:${concert.id}`, candidate.candidateId)
  }, [concert.id, safeIndex])

  const changeCandidate = (nextIndex: number) => {
    const candidate = matchCandidates[nextIndex]
    if (!candidate) return
    setIndex(nextIndex)
    window.sessionStorage.setItem(`syncstage:reveal:${concert.id}`, candidate.candidateId)
  }

  const letAgentChat = (item: RevealCandidate) => {
    const presentationIndex = matchCandidates.findIndex((candidate) => candidate.candidateId === item.candidateId)
    const businessId = agent?.rankedCandidates[presentationIndex]?.userId ?? item.sourceUserId
    patchFlow({ selectedCandidateId: businessId })
    window.sessionStorage.setItem(`syncstage:reveal:${concert.id}`, item.candidateId)
    const inSession = Boolean(agent?.rankedCandidates.some((candidate) => candidate.userId === businessId))
    if (inSession && matchResumable) {
      navigate(`/concert/${concert.id}/icebreak/${item.candidateId}`)
      return
    }
    navigate(authorized ? `/concert/${concert.id}/task` : `/concert/${concert.id}/authorize`)
  }

  return (
    <div className='sync-immersive relative h-[100dvh] min-h-[100dvh] overflow-hidden text-white'>
      <img src={`${import.meta.env.BASE_URL}visuals/summer-concert-bg.webp`} alt='夏日晚霞中的户外音乐节舞台与观众' className='sync-concert-bg absolute inset-0 h-full w-full object-cover' />
      <div className='pointer-events-none absolute inset-0 bg-gradient-to-b from-[#284f79]/20 via-transparent to-[#57331f]/35' />

      <header className='safe-top relative z-40 px-5 pt-3'>
        <div className='flex items-center'>
          <div className='flex items-center gap-2 text-[13px] font-semibold drop-shadow'>
            <span className='flex h-6 w-6 items-center justify-center rounded-full bg-[#f7dc3c] text-[13px] text-[#04a963]'>♪</span>
            <span>QQ音乐</span><span className='text-white/55'>|</span>
            <span className='rounded-full bg-[#1aa960]/85 px-2 py-1 text-[11px]'>一起去现场</span>
          </div>
          <div data-deck-progress className='ml-auto text-right text-[13px] font-medium text-white/90 drop-shadow'>
            第 {safeIndex + 1} 张 / {Math.max(total, 3)}
            <div className='mt-1.5 flex justify-end gap-2' aria-hidden='true'>
              {[0, 1, 2].map((dot) => <i key={dot} className={`h-1.5 w-1.5 rounded-full border border-white/65 ${dot === safeIndex ? 'bg-white' : 'bg-transparent'}`} />)}
            </div>
          </div>
        </div>
        <div className='mt-4 text-center drop-shadow-[0_2px_12px_rgba(44,53,75,.45)]'>
          <h1 className='font-serif text-[36px] font-semibold tracking-[.08em]'>同频现场</h1>
          <p className='mt-0.5 text-[15px] tracking-[.18em] text-white/95'>先看人，再看演出</p>
        </div>
      </header>

      <main className='relative z-20 mx-auto mt-2 w-full px-3'>
        {total > 0 ? (
          <SummerSignalDeck candidates={matchCandidates} index={safeIndex} onIndexChange={changeCandidate} onPrimary={letAgentChat} captureStage={captureStage} />
        ) : (
          <div className='mx-auto mt-32 max-w-[310px] rounded-[28px] bg-[#fff4df]/95 p-7 text-center text-[#51361f] shadow-2xl'>
            <p className='font-semibold'>当前安全条件下没有推荐</p>
            <p className='mt-2 text-sm opacity-70'>Agent 不会为了凑人数放宽你的硬条件。</p>
          </div>
        )}
      </main>
    </div>
  )
}
