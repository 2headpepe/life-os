import { createContext, useContext, useEffect, useState } from 'react'

const THEME_STORAGE_KEY = 'life-os:theme-variant'
const COLOR_STORAGE_KEY = 'life-os:color-scheme'
const PALETTE_STORAGE_KEY = 'life-os:color-palette'
const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem(THEME_STORAGE_KEY) || 'classic' } catch { return 'classic' }
  })
  const [colorScheme, setColorScheme] = useState(() => {
    try { return localStorage.getItem(COLOR_STORAGE_KEY) || 'light' } catch { return 'light' }
  })
  const [palette, setPalette] = useState(() => {
    try { return localStorage.getItem(PALETTE_STORAGE_KEY) || 'default' } catch { return 'default' }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_STORAGE_KEY, theme) } catch {}
  }, [theme])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', colorScheme === 'dark')
    try { localStorage.setItem(COLOR_STORAGE_KEY, colorScheme) } catch {}
  }, [colorScheme])

  useEffect(() => {
    document.documentElement.dataset.palette = palette
    try { localStorage.setItem(PALETTE_STORAGE_KEY, palette) } catch {}
  }, [palette])

  return <ThemeContext.Provider value={{ theme, setTheme, colorScheme, setColorScheme, palette, setPalette }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used inside ThemeProvider')
  return value
}
