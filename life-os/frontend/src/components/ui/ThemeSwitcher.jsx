import { Moon, Palette, Sun } from 'lucide-react'
import { useTheme } from '../../context/ThemeContext'

export default function ThemeSwitcher() {
  const { theme, setTheme, colorScheme, setColorScheme } = useTheme()
  return <div className="theme-switcher" aria-label="Оформление">
    <div className="theme-switcher__group" role="group" aria-label="Вариант дизайна">
      <span className="theme-switcher__label"><Palette size={13} aria-hidden="true" />Дизайн</span>
      {['classic', 'glass'].map(value => <button key={value} type="button" className={theme === value ? 'is-selected' : ''} onClick={() => setTheme(value)} aria-pressed={theme === value}>{value === 'classic' ? 'Classic' : 'Glass'}</button>)}
    </div>
    <div className="theme-switcher__group" role="group" aria-label="Цветовая схема">
      <span className="theme-switcher__label"><Sun size={13} aria-hidden="true" />Тема</span>
      <button type="button" className={colorScheme === 'light' ? 'is-selected' : ''} onClick={() => setColorScheme('light')} aria-pressed={colorScheme === 'light'}>Светлая</button>
      <button type="button" className={colorScheme === 'dark' ? 'is-selected' : ''} onClick={() => setColorScheme('dark')} aria-pressed={colorScheme === 'dark'}><Moon size={13} aria-hidden="true" />Тёмная</button>
    </div>
  </div>
}
