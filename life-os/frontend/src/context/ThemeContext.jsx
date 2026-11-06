import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)
const read = (key, fallback) => { try { return localStorage.getItem(key) || fallback } catch { return fallback } }

export function ThemeProvider({ children }) {
  const [variant, setVariant] = useState(() => read('life-os:theme-variant', 'classic'))
  const [scheme, setScheme] = useState(() => read('life-os:color-scheme', 'light'))
  useEffect(() => { document.documentElement.dataset.theme = variant; localStorage.setItem('life-os:theme-variant', variant) }, [variant])
  useEffect(() => { document.documentElement.classList.toggle('dark', scheme === 'dark'); localStorage.setItem('life-os:color-scheme', scheme) }, [scheme])
  return <ThemeContext.Provider value={{ variant, setVariant, scheme, setScheme }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
