import { useCallback, useState } from 'react'
import { ApiError } from './api'

// Runs an async action with a busy flag and an error message. A 401 (expired login) calls onExpired.
export function useGuard(onExpired) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = useCallback(async (fn) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) onExpired()
      else if (e instanceof ApiError && e.status === 403) setError('This page is for owner accounts only.')
      else setError(e.message)
    } finally {
      setBusy(false)
    }
  }, [onExpired])
  return { busy, error, run }
}
