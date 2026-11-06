import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { habits } from '../api'
import { habitIsDone } from '../pages/Habits'
import { trackUiAction } from '../analytics'

const RecoveryModeContext = createContext()

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export function RecoveryModeProvider({ children }) {
  const [isRecoveryMode, setIsRecoveryMode] = useState(
    () => localStorage.getItem('life-os:recovery-mode') === '1'
  )
  const [suggestion, setSuggestion] = useState(null) // 'enter' | 'exit' | null

  const checkFoundation = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10)
      const defs = await habits.definitions()
      const foundationHabits = (defs.categories || [])
        .flatMap(c => c.habits)
        .filter(h => h.foundation && h.active !== false)
      if (!foundationHabits.length) return

      const days = Array.from({ length: 4 }, (_, i) => addDays(today, -(3 - i)))
      const results = await Promise.allSettled(days.map(d => habits.log(d)))
      const logs = {}
      days.forEach((d, i) => {
        logs[d] = results[i].status === 'fulfilled' ? results[i].value?.habits || {} : {}
      })

      const foundationScore = (date) =>
        foundationHabits.filter(h => habitIsDone(h, logs[date]?.[h.id])).length

      const threshold = Math.ceil(foundationHabits.length / 2)
      const inMode = localStorage.getItem('life-os:recovery-mode') === '1'

      if (!inMode) {
        const failDays = [addDays(today, -1), addDays(today, -2)]
          .filter(d => foundationScore(d) < threshold).length
        if (failDays >= 2) setSuggestion('enter')
      } else {
        const goodDays = [addDays(today, -1), addDays(today, -2), addDays(today, -3)]
          .filter(d => foundationScore(d) >= threshold + 1).length
        if (goodDays >= 3) setSuggestion('exit')
      }
    } catch {}
  }, [])

  useEffect(() => { checkFoundation() }, [checkFoundation])

  const toggleRecoveryMode = useCallback((value) => {
    const next = value !== undefined ? value : !isRecoveryMode
    localStorage.setItem('life-os:recovery-mode', next ? '1' : '0')
    trackUiAction('recovery_mode', next ? 'enable' : 'disable')
    setIsRecoveryMode(next)
    setSuggestion(null)
  }, [isRecoveryMode])

  return (
    <RecoveryModeContext.Provider value={{ isRecoveryMode, toggleRecoveryMode, suggestion, setSuggestion }}>
      {children}
    </RecoveryModeContext.Provider>
  )
}

export const useRecoveryMode = () => useContext(RecoveryModeContext)
