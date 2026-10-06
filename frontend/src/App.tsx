import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppFrame, Toaster } from './components/AppFrame'
import { DemoConsole } from './components/DemoConsole'
import { JudgeBanner } from './components/JudgeBanner'
import { MainAppLayout } from './components/TabLayout'
import { ImmersiveSyncLayout } from './components/ImmersiveSyncLayout'
import { AgentIcebreakPage } from './pages/AgentIcebreakPage'
import { AgentProgressPage } from './pages/AgentProgressPage'
import { AgentTracePage } from './pages/AgentTracePage'
import { AllCandidatesPage } from './pages/AllCandidatesPage'
import { CandidateDetailPage } from './pages/CandidateDetailPage'
import { ChatRoomPage } from './pages/ChatRoomPage'
import { ConcertDetailPage } from './pages/ConcertDetailPage'
import { ConcertListPage } from './pages/ConcertListPage'
import { EditProfilePage } from './pages/EditProfilePage'
import { HandshakePage } from './pages/HandshakePage'
import { HomePage } from './pages/HomePage'
import { IntentPage } from './pages/IntentPage'
import { MatchRevealPage } from './pages/MatchRevealPage'
import { MatchResultsPage } from './pages/MatchResultsPage'
import { MessagesPage } from './pages/MessagesPage'
import { MusicAuthPage } from './pages/MusicAuthPage'
import { ProfilePage } from './pages/ProfilePage'
import { ProfileSectionPage } from './pages/ProfileSectionPage'
import { RoomPage } from './pages/RoomPage'
import { ShowcasePage } from './pages/ShowcasePage'
import { SyncPage } from './pages/SyncPage'
import { SessionProvider, useSession } from './store/session'
import { SocialProvider } from './store/social'
import { ConcertFlowProvider } from './store/concertFlow'
import { ProfileProvider } from './store/profile'
import { AudioProvider } from './components/music/DemoMusicPlayer'
import { SongSelectPage } from './pages/SongSelectPage'

/** 消息中心需要知道当前房间状态，因此放在 SessionProvider 内部 */
function SocialHost({ children }: { children: ReactNode }) {
  const { room, concertId } = useSession()
  return (
    <SocialProvider room={room} concertId={concertId}>
      {children}
    </SocialProvider>
  )
}

export default function App() {
  return (
    <AudioProvider>
    <SessionProvider>
      <ConcertFlowProvider>
        <ProfileProvider>
          <SocialHost>
          <AppFrame>
            <JudgeBanner />
            <Routes>
              {/* 一级导航：首页 / 同频 / 消息 / 我的 */}
              <Route element={<MainAppLayout />}>
                <Route path='/' element={<Navigate to='/home' replace />} />
                <Route path='/home' element={<HomePage />} />
                <Route path='/messages' element={<MessagesPage />} />
                <Route path='/me' element={<ProfilePage />} />
                <Route path='/profile' element={<ProfilePage />} />
              </Route>
              <Route element={<ImmersiveSyncLayout />}>
                <Route path='/sync' element={<SyncPage />} />
                <Route path='/concert/:concertId/select-song' element={<SongSelectPage />} />
                <Route path='/concert/:concertId/searching' element={<AgentProgressPage />} />
                <Route path='/concert/night-voyage/reveal' element={<SyncPage />} />
                <Route path='/concert/:concertId/sync/select-song' element={<SongSelectPage />} />
                <Route path='/concert/:concertId/sync/searching' element={<AgentProgressPage />} />
                <Route path='/concert/:concertId/sync/reveal' element={<MatchRevealPage />} />
                <Route path='/concert/:concertId/sync/agent' element={<IntentPage />} />
                <Route path='/concert/:concertId/sync/waiting' element={<MatchRevealPage />} />
                <Route path='/concert/:concertId/sync/room' element={<RoomPage />} />
              </Route>

              {/* 二级页面 */}
              <Route path='/messages/:threadId' element={<ChatRoomPage />} />
              <Route path='/me/edit' element={<EditProfilePage />} />
              <Route path='/me/:section' element={<ProfileSectionPage />} />
              <Route element={<ImmersiveSyncLayout />}>
              <Route path='/concerts' element={<ConcertListPage />} />
              <Route path='/list' element={<Navigate to='/concerts' replace />} />
              <Route path='/concert/:concertId' element={<ConcertDetailPage />} />
              <Route path='/concert/:concertId/song' element={<SongSelectPage />} />
              <Route path='/concert/:concertId/authorize' element={<MusicAuthPage />} />
              <Route path='/concert/:concertId/task' element={<IntentPage />} />
              <Route path='/concert/:concertId/running' element={<AgentProgressPage />} />
              <Route path='/concert/:concertId/reveal' element={<MatchRevealPage />} />
              <Route path='/concert/:concertId/trace' element={<AgentTracePage />} />
              <Route path='/concert/:concertId/agent' element={<Navigate to='running' replace />} />
              <Route path='/concert/:concertId/matches' element={<MatchResultsPage />} />
              <Route path='/concert/:concertId/candidates' element={<AllCandidatesPage />} />
              <Route path='/concert/:concertId/matches/:candidateId' element={<CandidateDetailPage />} />
              <Route path='/concert/:concertId/handshake/:candidateId' element={<HandshakePage />} />
              <Route path='/concert/:concertId/icebreak/:candidateId' element={<AgentIcebreakPage />} />
              <Route path='/concert/:concertId/room' element={<RoomPage />} />
              {/* 第二个浏览器上下文凭 roomId 直接进入同一房间（双人真人聊天验证用） */}
              <Route path='/room/:roomId' element={<RoomPage />} />
              </Route>
              <Route path='/showcase' element={<ShowcasePage />} />
              <Route path='*' element={<Navigate to='/' replace />} />
            </Routes>
          </AppFrame>
            <Toaster />
            <DemoConsole />
          </SocialHost>
        </ProfileProvider>
      </ConcertFlowProvider>
    </SessionProvider>
    </AudioProvider>
  )
}
