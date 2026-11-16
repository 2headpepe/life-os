import { Check, Moon, Palette, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../../context/ThemeContext'

function ThemeChoice({ name, value, current, onChange, children }) {
  const id = `appearance-${name}-${value}`
  return (
    <div className="theme-switcher__choice">
      <input
        id={id}
        className="theme-switcher__radio"
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={() => onChange(value)}
      />
      <label className="theme-switcher__option" htmlFor={id}>
        <span>{children}</span>
        {current === value && <Check size={13} aria-hidden="true" />}
      </label>
    </div>
  )
}

export default function ThemeSwitcher() {
  const { theme, setTheme, colorScheme, setColorScheme, palette, setPalette } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePointer = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const closeOnEscape = event => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const summary = `${theme === 'glass' ? 'Glass' : 'Classic'} · ${colorScheme === 'dark' ? 'тёмная' : 'светлая'}`

  return <div ref={rootRef} className="theme-menu">
    <button
      ref={triggerRef}
      className="theme-menu__trigger"
      type="button"
      aria-label={`Оформление: ${summary}`}
      aria-expanded={open}
      aria-controls="appearance-popover"
      aria-haspopup="dialog"
      title={`Оформление: ${summary}`}
      onClick={() => setOpen(value => !value)}
    >
      <Palette size={17} aria-hidden="true" />
      <span className="sr-only">Оформление</span>
    </button>

    {open && <section id="appearance-popover" className="theme-switcher" aria-label="Оформление" role="dialog">
      <div className="theme-switcher__heading">
        <span>Оформление</span>
        <span>{summary}</span>
      </div>
      <fieldset className="theme-switcher__group">
        <legend>Дизайн</legend>
        <div className="theme-switcher__choices">
          <ThemeChoice name="appearance-design" value="classic" current={theme} onChange={setTheme}>Classic</ThemeChoice>
          <ThemeChoice name="appearance-design" value="glass" current={theme} onChange={setTheme}>Glass</ThemeChoice>
        </div>
      </fieldset>
      <fieldset className="theme-switcher__group">
        <legend>Схема</legend>
        <div className="theme-switcher__choices">
          <ThemeChoice name="appearance-scheme" value="light" current={colorScheme} onChange={setColorScheme}><Sun size={13} aria-hidden="true" />Светлая</ThemeChoice>
          <ThemeChoice name="appearance-scheme" value="dark" current={colorScheme} onChange={setColorScheme}><Moon size={13} aria-hidden="true" />Тёмная</ThemeChoice>
        </div>
      </fieldset>
      <fieldset className="theme-switcher__group">
        <legend>Палитра</legend>
        <div className="theme-switcher__choices">
          <ThemeChoice name="appearance-palette" value="default" current={palette} onChange={setPalette}>Базовая</ThemeChoice>
          <ThemeChoice name="appearance-palette" value="tokyo-night" current={palette} onChange={setPalette}>Tokyo Night</ThemeChoice>
        </div>
      </fieldset>
    </section>}
  </div>
}
