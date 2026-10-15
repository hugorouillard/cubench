import { useEffect, useState } from 'react'
import { localDateKey } from './localCalendar'

/** Refresh at local midnight and after sleep/background throttling. */
export function useToday(): string {
  const [today, setToday] = useState(() => localDateKey(new Date()))

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    function refresh() {
      clearTimeout(timeout)
      const now = new Date()
      setToday(localDateKey(now))
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      timeout = setTimeout(refresh, midnight.getTime() - now.getTime())
    }
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') refresh()
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  return today
}
