// Demo 双身份：仅开发 / 演示模式使用。
// 身份写在各自浏览器的 sessionStorage 里，多个窗口互不覆盖；
// 它只是人工演示替身，不代表任何真实线上用户。
import { useEffect, useState } from 'react'

export const DEMO_ROLE_KEY = 'sfl.demo.role'

export const DEMO_ROLES = {
  visitor: { userId: 'demo-visitor', name: 'Demo访客', avatar: { from: '#31f58a', to: '#0b1116' } },
  jiangli: { userId: 'jiangli', name: '写歌的江离', avatar: { from: '#4a7dff', to: '#171a22' } },
} as const

export type DemoRole = keyof typeof DEMO_ROLES

export function isDemoRole(value: string | null): value is DemoRole {
  return value === 'visitor' || value === 'jiangli'
}

/** 解析 ?demoRole=（HashRouter 下 location.search 已含 hash 内的查询串） */
export function demoRoleFromSearch(search: string): DemoRole | '' {
  const value = new URLSearchParams(search).get('demoRole')
  return isDemoRole(value) ? value : ''
}

/** 读当前身份：URL 参数优先并写回本 tab 的 sessionStorage，否则沿用本 tab 已选身份。 */
export function readDemoRole(search: string): DemoRole | '' {
  if (typeof window === 'undefined') return ''
  const fromUrl = demoRoleFromSearch(search)
  if (fromUrl) {
    try {
      window.sessionStorage.setItem(DEMO_ROLE_KEY, fromUrl)
    } catch {
      // 隐私模式写入失败不影响本次会话
    }
    return fromUrl
  }
  try {
    const stored = window.sessionStorage.getItem(DEMO_ROLE_KEY)
    return isDemoRole(stored) ? stored : ''
  } catch {
    return ''
  }
}

export function demoAvatarOf(userId: string): { from: string; to: string } | null {
  if (userId === DEMO_ROLES.visitor.userId) return DEMO_ROLES.visitor.avatar
  if (userId === DEMO_ROLES.jiangli.userId) return DEMO_ROLES.jiangli.avatar
  return null
}

/** Demo 身份入口只在开发 / 演示模式出现。 */
export function demoModeEnabled(): boolean {
  return Boolean(import.meta.env.DEV) || import.meta.env.VITE_DEMO_MODE === 'true'
}

/** 组件里跟随 location.search 读取当前 Demo 身份。 */
export function useDemoRole(search: string): DemoRole | '' {
  const [role, setRole] = useState<DemoRole | ''>(() => (demoModeEnabled() ? readDemoRole(search) : ''))
  useEffect(() => {
    if (!demoModeEnabled()) return
    setRole(readDemoRole(search))
  }, [search])
  return role
}