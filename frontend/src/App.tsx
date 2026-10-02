import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppFrame, Toaster } from './components/AppFrame'
import { DemoConsole } from './components/DemoConsole'
import { JudgeBanner } from './components/JudgeBanner'
import { TabLayout } from './components/TabLayout'
import { AgentProgressPage } from './pages/AgentProgressPage'
import { AgentTracePage } from './pages/AgentTracePage'
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
    <SessionProvider>
      <ConcertFlowProvider>
        <ProfileProvider>
          <SocialHost>
          <AppFrame>
            <JudgeBanner />
            <Routes>
              {/* 一级导航：首页 / 同频 / 消息 / 我的 */}
              <Route element={<TabLayout />}>
                <Route path='/' element={<HomePage />} />
                <Route path='/sync' element={<SyncPage />} />
                <Route path='/messages' element={<MessagesPage />} />
                <Route path='/me' element={<ProfilePage />} />
              </Route>

              {/* 二级页面 */}
              <Route path='/messages/:threadId' element={<ChatRoomPage />} />
              <Route path='/me/edit' element={<EditProfilePage />} />
              <Route path='/me/:section' element={<ProfileSectionPage />} />
              <Route path='/concerts' element={<ConcertListPage />} />
              <Route path='/list' element={<Navigate to='/concerts' replace />} />
              <Route path='/concert/:concertId' element={<ConcertDetailPage />} />
              <Route path='/concert/:concertId/authorize' element={<MusicAuthPage />} />
              <Route path='/concert/:concertId/task' element={<IntentPage />} />
              <Route path='/concert/:concertId/running' element={<AgentProgressPage />} />
              <Route path='/concert/:concertId/reveal' element={<MatchRevealPage />} />
              <Route path='/concert/:concertId/trace' element={<AgentTracePage />} />
              <Route path='/concert/:concertId/agent' element={<Navigate to='running' replace />} />
              <Route path='/concert/:concertId/matches' element={<MatchResultsPage />} />
              <Route path='/concert/:concertId/matches/:candidateId' element={<CandidateDetailPage />} />
              <Route path='/concert/:concertId/handshake/:candidateId' element={<HandshakePage />} />
              <Route path='/concert/:concertId/room' element={<RoomPage />} />
              {/* 第二个浏览器上下文凭 roomId 直接进入同一房间（双人真人聊天验证用） */}
              <Route path='/room/:roomId' element={<RoomPage />} />
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
  )
}
