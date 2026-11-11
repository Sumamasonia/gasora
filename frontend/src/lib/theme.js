import { useEffect, useState } from 'react'

export const THEME_STORAGE_KEY = 'gasora-theme'

export function getStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'light'
  } catch {
    return 'light'
  }
}

export function getSystemTheme() {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light'
}

export function resolveEffectiveTheme(themeSetting) {
  if (themeSetting === 'system') {
    return getSystemTheme()
  }
  return themeSetting === 'dark' ? 'dark' : 'light'
}

export function applyTheme(themeSetting) {
  const effective = resolveEffectiveTheme(themeSetting)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', effective)
    document.documentElement.style.colorScheme = effective
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, themeSetting)
  } catch (e) {
    console.warn('Could not save theme:', e)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('gasora-theme-change', {
        detail: { theme: themeSetting, effectiveTheme: effective },
      })
    )
  }
  return effective
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme)
  const [effectiveTheme, setEffectiveTheme] = useState(() => resolveEffectiveTheme(getStoredTheme()))

  useEffect(() => {
    // Initial sync
    const current = getStoredTheme()
    const eff = applyTheme(current)
    setThemeState(current)
    setEffectiveTheme(eff)

    // Listen for custom theme change events within this window
    const handleThemeChange = (e) => {
      const { theme: nextTheme, effectiveTheme: nextEffective } = e.detail || {}
      if (nextTheme) setThemeState(nextTheme)
      if (nextEffective) setEffectiveTheme(nextEffective)
    }

    // Listen for cross-tab storage changes
    const handleStorageChange = (e) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue) {
        const nextEff = applyTheme(e.newValue)
        setThemeState(e.newValue)
        setEffectiveTheme(nextEff)
      }
    }

    // Listen for OS system theme changes if set to 'system'
    const mediaQuery =
      typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null
    const handleMediaChange = () => {
      if (getStoredTheme() === 'system') {
        const nextEff = applyTheme('system')
        setEffectiveTheme(nextEff)
      }
    }

    window.addEventListener('gasora-theme-change', handleThemeChange)
    window.addEventListener('storage', handleStorageChange)
    if (mediaQuery) {
      if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', handleMediaChange)
      else if (mediaQuery.addListener) mediaQuery.addListener(handleMediaChange)
    }

    return () => {
      window.removeEventListener('gasora-theme-change', handleThemeChange)
      window.removeEventListener('storage', handleStorageChange)
      if (mediaQuery) {
        if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', handleMediaChange)
        else if (mediaQuery.removeListener) mediaQuery.removeListener(handleMediaChange)
      }
    }
  }, [])

  const setTheme = (newTheme) => {
    setThemeState(newTheme)
    const eff = applyTheme(newTheme)
    setEffectiveTheme(eff)
  }

  const toggleTheme = () => {
    const next = effectiveTheme === 'light' ? 'dark' : 'light'
    setTheme(next)
  }

  return { theme, effectiveTheme, setTheme, toggleTheme }
}
