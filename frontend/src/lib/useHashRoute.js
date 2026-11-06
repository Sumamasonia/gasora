import { useEffect, useState } from 'react'

// Tiny hash-based routing hook without external router libraries
export function useHashRoute(defaultRoute = 'dispatch') {
  const getCleanRoute = () => {
    const raw = window.location.hash.replace(/^#\/?/, '')
    return raw.split('?')[0] || defaultRoute
  }

  const [route, setRoute] = useState(getCleanRoute)

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getCleanRoute())
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [defaultRoute])

  const navigate = (to) => {
    const clean = to.replace(/^#\/?/, '')
    window.location.hash = `#/${clean}`
  }

  return [route, navigate]
}
