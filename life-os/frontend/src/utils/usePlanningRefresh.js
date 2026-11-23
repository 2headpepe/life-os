import { useEffect } from 'react'

export function usePlanningRefresh(nextChangeAt, setNow, reload) {
  useEffect(() => {
    const timer = setTimeout(() => setNow(new Date()), Math.max(0, nextChangeAt - Date.now()))
    return () => clearTimeout(timer)
  }, [nextChangeAt, setNow])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      setNow(new Date())
      reload()
    }
    window.addEventListener('life-os:planning-changed', refresh)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('life-os:planning-changed', refresh)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [setNow, reload])
}
