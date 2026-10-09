import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppFrame, Toaster } from './components/AppFrame'
import { DemoConsole } from './components/DemoConsole'
import { JudgeBanner } from './components/JudgeBanner'
import { MainAppLayout } from './components/TabLayout'
import { ImmersiveSyncLayout } from './components/ImmersiveSyncLayout'
import { AgentIcebreakPage } from './pages/AgentIcebreakPage'
import { AgentProgressPage } from './pages/AgentProgressPage'
import { ChatRoomPage } from './pages/ChatRoomPage'
import { ConcertDetailPage } from './pages/ConcertDetailPage'
import { EditProfilePage } from './pages/EditProfilePage'
import { HomePage } from './pages/HomePage'
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
import { QQMusicAuthStateProvider } from './store/qqMusicAuth'
import { AudioReactiveProvider } from './components/music/AudioReactiveProvider'

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
    <AudioReactiveProvider>
    <AudioProvider>
    <SessionProvider>
      <ConcertFlowProvider>
        <QQMusicAuthStateProvider>
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
                <Route path='/concert/night-voyage/select-song' element={<SongSelectPage />} />
                <Route path='/concert/night-voyage/searching' element={<AgentProgressPage />} />
                <Route path='/concert/night-voyage/sync/reveal' element={<SyncPage />} />
                <Route path='/concert/night-voyage/icebreak/:candidateId' element={<AgentIcebreakPage />} />
                <Route path='/concert/night-voyage/room' element={<RoomPage />} />
              </Route>

              {/* 二级页面 */}
              <Route path='/messages/:threadId' element={<ChatRoomPage />} />
              <Route path='/me/edit' element={<EditProfilePage />} />
              <Route path='/me/:section' element={<ProfileSectionPage />} />
              <Route element={<ImmersiveSyncLayout />}>
                <Route path='/concert/night-voyage' element={<ConcertDetailPage />} />
                <Route path='/concert/night-voyage/authorize' element={<MusicAuthPage />} />
                <Route path='/room/:roomId' element={<RoomPage />} />
                {/* 旧链接仅兼容重定向，不再渲染旧页面。 */}
                <Route path='/concert/:concertId/*' element={<Navigate to='/home' replace />} />
              </Route>
              <Route path='/showcase' element={<ShowcasePage />} />
              <Route path='*' element={<Navigate to='/' replace />} />
            </Routes>
          </AppFrame>
            <Toaster />
            <DemoConsole />
          </SocialHost>
        </ProfileProvider>
        </QQMusicAuthStateProvider>
      </ConcertFlowProvider>
    </SessionProvider>
    </AudioProvider>
    </AudioReactiveProvider>
  )
}
