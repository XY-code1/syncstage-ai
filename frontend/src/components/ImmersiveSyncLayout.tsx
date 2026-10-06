import { Outlet, useLocation, useNavigate } from 'react-router-dom'

/** 独立流程布局：不挂载主应用导航，也不创建新的业务 Provider。 */
export function ImmersiveSyncLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const hasOwnReturn = location.pathname.endsWith('/select-song') || location.pathname.endsWith('/song') || location.pathname.endsWith('/searching') || location.pathname.includes('/icebreak/')
  return <div data-layout='immersive-sync' className='relative min-h-[100dvh]'>
    <Outlet />
    {hasOwnReturn ? null : <button type='button' aria-label='返回首页' onClick={() => navigate('/home')} className='fixed left-[max(12px,calc(50%-183px))] top-[48px] z-50 flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-[#263857]/50 text-2xl text-white backdrop-blur-md'>‹</button>}
  </div>
}
