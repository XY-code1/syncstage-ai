import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

/** Agent 流程统一出口：任何返回都落到一级「同频」，不回放流程历史。 */
export function useExitToFrequency(beforeExit?: () => void) {
  const navigate = useNavigate()
  const exit = useCallback(() => {
    beforeExit?.()
    navigate('/sync', { replace: true })
  }, [beforeExit, navigate])

  useEffect(() => {
    const onPopState = () => exit()
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [exit])

  return exit
}
