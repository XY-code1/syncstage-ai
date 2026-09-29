import { Navigate, Route, Routes } from 'react-router-dom'
import { AppFrame, Toaster } from './components/AppFrame'
import { DemoConsole } from './components/DemoConsole'
import { JudgeBanner } from './components/JudgeBanner'
import { AgentProgressPage } from './pages/AgentProgressPage'
import { ConcertDetailPage } from './pages/ConcertDetailPage'
import { ConcertListPage } from './pages/ConcertListPage'
import { IntentConfirmPage } from './pages/IntentConfirmPage'
import { IntentPage } from './pages/IntentPage'
import { MatchResultsPage } from './pages/MatchResultsPage'
import { MemoryCardPage } from './pages/MemoryCardPage'
import { MusicAuthPage } from './pages/MusicAuthPage'
import { PreferencesPage } from './pages/PreferencesPage'
import { RoomPage } from './pages/RoomPage'
import { TagConfirmPage } from './pages/TagConfirmPage'
import { SessionProvider } from './store/session'

export default function App() {
  return (
    <SessionProvider>
      <AppFrame>
        <JudgeBanner />
        <Routes>
          {/* 默认入口就是模拟 QQ 音乐演出详情页 */}
          <Route path='/' element={<ConcertDetailPage />} />
          <Route path='/list' element={<ConcertListPage />} />
          <Route path='/concert/:concertId' element={<ConcertDetailPage />} />
          <Route path='/concert/:concertId/authorize' element={<MusicAuthPage />} />
          <Route path='/concert/:concertId/intent' element={<IntentPage />} />
          <Route path='/concert/:concertId/intent/confirm' element={<IntentConfirmPage />} />
          <Route path='/concert/:concertId/agent' element={<AgentProgressPage />} />
          <Route path='/concert/:concertId/matches' element={<MatchResultsPage />} />
          {/* 保留的补充页面 */}
          <Route path='/concert/:concertId/preferences' element={<PreferencesPage />} />
          <Route path='/concert/:concertId/tags' element={<TagConfirmPage />} />
          <Route path='/concert/:concertId/room' element={<RoomPage />} />
          <Route path='/concert/:concertId/memory' element={<MemoryCardPage />} />
          <Route path='*' element={<Navigate to='/' replace />} />
        </Routes>
      </AppFrame>
      <Toaster />
      <DemoConsole />
    </SessionProvider>
  )
}