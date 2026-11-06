import { useTheme } from '../context/ThemeContext'

export default function ThemeSwitcher() {
  const { variant, setVariant, scheme, setScheme } = useTheme()
  return <div className="flex items-center gap-1 text-xs"><button className="rounded border px-2 py-1" aria-pressed={variant === 'classic'} onClick={() => setVariant(variant === 'classic' ? 'glass' : 'classic')}>{variant === 'classic' ? 'Classic' : 'Glass'}</button><button className="rounded border px-2 py-1" aria-pressed={scheme === 'dark'} onClick={() => setScheme(scheme === 'dark' ? 'light' : 'dark')}>{scheme === 'dark' ? '☀︎' : '☽'}</button></div>
}
