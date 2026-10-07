import { ALL_SCOPES, DEMO_VIEWER, getMusicProfile } from '../lib/tmeMock'
import type { MusicProfile } from '../types'

export type QQMusicUser = {
  loginMode: 'demo'
  authorized: boolean
  nickname: string
  avatar: string
  qqOpenId: null
  dataSource: 'mock'
}

export type AuthResult = { authorized: boolean; loginMode: 'demo' }
export type UserProfile = Pick<QQMusicUser, 'nickname' | 'avatar' | 'qqOpenId' | 'dataSource'>

export interface QQMusicAuthProvider {
  login(): Promise<AuthResult>
  getProfile(): Promise<UserProfile>
  getMusicProfile(): Promise<MusicProfile>
  revoke(): Promise<void>
}

export const DEFAULT_QQ_MUSIC_USER: QQMusicUser = {
  loginMode: 'demo',
  authorized: false,
  nickname: 'Demo访客',
  avatar: `${import.meta.env.BASE_URL}assets/demo-user-avatar.webp`,
  qqOpenId: null,
  dataSource: 'mock',
}

export class MockQQMusicAuthProvider implements QQMusicAuthProvider {
  async login(): Promise<AuthResult> {
    return { authorized: true, loginMode: 'demo' }
  }

  async getProfile(): Promise<UserProfile> {
    return { nickname: 'Demo访客', avatar: DEFAULT_QQ_MUSIC_USER.avatar, qqOpenId: null, dataSource: 'mock' }
  }

  async getMusicProfile(): Promise<MusicProfile> {
    const profile = getMusicProfile(DEMO_VIEWER.userId, ALL_SCOPES)
    if (!profile) throw new Error('Demo 音乐画像暂不可用')
    return profile
  }

  async revoke(): Promise<void> {}
}

/** 真实接入占位：只有获得 TME 官方测试接口后才实现，当前不会发起网络请求。 */
export class OfficialQQMusicAuthProvider implements QQMusicAuthProvider {
  private unavailable(): never {
    throw new Error('TME 官方授权接口尚未接入')
  }
  async login(): Promise<AuthResult> { return this.unavailable() }
  async getProfile(): Promise<UserProfile> { return this.unavailable() }
  async getMusicProfile(): Promise<MusicProfile> { return this.unavailable() }
  async revoke(): Promise<void> { return this.unavailable() }
}

export function createQQMusicAuthProvider(): QQMusicAuthProvider {
  // 当前比赛环境只允许 mock；即使误配 official 也不伪造登录成功或调用非官方接口。
  return import.meta.env.VITE_AUTH_MODE === 'official'
    ? new OfficialQQMusicAuthProvider()
    : new MockQQMusicAuthProvider()
}
