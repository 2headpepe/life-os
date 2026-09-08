import { useState, useEffect } from 'react'
import { habits } from '../api'
import { computeHabitScore, habitIsDone, inTimeWindow } from './Habits'

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function calcStreak(habitId, habit, logs, dates) {
  let streak = 0
  for (const d of [...dates].reverse()) {
    if (habitIsDone(habit, logs[d]?.[habitId])) streak++
    else break
  }
  return streak
}

function calcMaxStreak(habitId, habit, logs, dates) {
  let max = 0, cur = 0
  for (const d of dates) {
    if (habitIsDone(habit, logs[d]?.[habitId])) { cur++; max = Math.max(max, cur) }
    else cur = 0
  }
  return max
}

function calcPct(habitId, habit, logs, dates) {
  const withData = dates.filter(d => logs[d] && Object.keys(logs[d]).length > 0)
  if (!withData.length) return null
  const done = withData.filter(d => habitIsDone(habit, logs[d]?.[habitId])).length
  return Math.round((done / withData.length) * 100)
}

export default function Stats() {
  const today = new Date().toISOString().slice(0, 10)
  const [defs, setDefs] = useState([])
  const [logs, setLogs] = useState({})
  const [scores, setScores] = useState([])
  const [maxTotal, setMaxTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  const dates = Array.from({ length: days }, (_, i) => addDays(today, -(days - 1 - i)))

  useEffect(() => {
    habits.definitions().then(h => {
      const active = (h.categories || []).flatMap(c => c.habits.filter(x => x.active))
      setDefs(active)
      setMaxTotal(active.reduce((s, x) => s + (x.max_score || 1), 0))
    })
  }, [])

  useEffect(() => {
    if (!defs.length) return
    Promise.allSettled(dates.map(d => habits.log(d))).then(results => {
      const logsMap = {}
      const scoresArr = []
      dates.forEach((d, i) => {
        const data = results[i].status === 'fulfilled' ? results[i].value?.habits || {} : {}
        logsMap[d] = data
        const hasAnyData = Object.keys(data).length > 0
        scoresArr.push({
          date: d,
          score: hasAnyData ? (results[i].value?.score ?? computeHabitScore(defs, data)) : null,
        })
      })
      setLogs(logsMap)
      setScores(scoresArr)
      setLoading(false)
    })
  }, [defs.length, days])

  const daysWithData = scores.filter(s => s.score !== null)
  const avgScore = daysWithData.length
    ? Math.round(daysWithData.reduce((s, d) => s + d.score, 0) / daysWithData.length)
    : 0
  const maxScore = Math.max(...daysWithData.map(d => d.score), 0)
  const goodDays = daysWithData.filter(d => maxTotal > 0 && d.score / maxTotal >= 0.8).length

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Статистика привычек</h1>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {[7, 14, 30].map(n => (
            <button key={n} onClick={() => setDays(n)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                days === n ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500'
              }`}>{n}д</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-12">Загрузка...</div>
      ) : (
        <>
          {/* Summary chips */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: 'Средний счёт', value: `${avgScore} / ${maxTotal}` },
              { label: 'Лучший день', value: `${maxScore} / ${maxTotal}` },
              { label: `Хороших дней (≥80%)`, value: `${goodDays} / ${daysWithData.length}` },
            ].map(({ label, value }) => (
              <div key={label} className="card px-4 py-3 text-center">
                <div className="text-xs text-gray-400 mb-1">{label}</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-gray-100">{value}</div>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="card px-4 pt-4 pb-3 mb-6">
            <div className="text-xs text-gray-400 mb-3">Счёт по дням</div>
            <div className="flex items-end gap-0.5" style={{ height: 80 }}>
              {scores.map(({ date, score }) => {
                const pct = score !== null && maxTotal > 0 ? score / maxTotal : 0
                const color = score === null ? 'bg-gray-100 dark:bg-gray-800'
                  : pct >= 0.8 ? 'bg-green-400' : pct >= 0.5 ? 'bg-amber-400' : 'bg-gray-300 dark:bg-gray-600'
                const isToday = date === today
                return (
                  <div key={date} className="flex-1 flex flex-col items-center gap-0.5 group relative" title={`${date}: ${score ?? '—'}`}>
                    <div className={`w-full rounded-sm ${color} transition-all`} style={{ height: `${Math.max(2, pct * 72)}px` }} />
                    {isToday && <div className="absolute -bottom-3 w-1 h-1 rounded-full bg-blue-400" />}
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-4 text-xs text-gray-300 dark:text-gray-600">
              <span>{scores[0]?.date.slice(5).replace('-', '.')}</span>
              <span>сегодня</span>
            </div>
            <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50 dark:border-gray-800">
              {[
                { color: 'bg-green-400', label: '≥80% — отличный день' },
                { color: 'bg-amber-400', label: '≥50% — средний' },
                { color: 'bg-gray-300 dark:bg-gray-600', label: '<50% — слабый' },
              ].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
                  <span className="text-[10px] text-gray-400">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Per-habit table */}
          <div className="card overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 grid gap-2 text-xs font-medium text-gray-400"
              style={{ gridTemplateColumns: '1fr 60px 60px 60px' }}>
              <span>Привычка</span>
              <span className="text-center">Выпол.</span>
              <span className="text-center">Стрик</span>
              <span className="text-center">Макс.</span>
            </div>
            {defs.map(h => {
              const pct = calcPct(h.id, h, logs, dates)
              const streak = calcStreak(h.id, h, logs, dates)
              const maxStreak = calcMaxStreak(h.id, h, logs, dates)
              const pctColor = pct === null ? 'text-gray-300' : pct >= 80 ? 'text-green-500' : pct >= 50 ? 'text-amber-500' : 'text-red-400'
              return (
                <div key={h.id} className="px-4 py-2.5 border-b border-gray-50 dark:border-gray-800/50 grid gap-2 items-center hover:bg-gray-50/30 dark:hover:bg-gray-900/10"
                  style={{ gridTemplateColumns: '1fr 60px 60px 60px' }}>
                  <div>
                    <div className="text-sm text-gray-700 dark:text-gray-300">{h.label}</div>
                  </div>
                  <div className={`text-xs font-semibold text-center ${pctColor}`}>
                    {pct !== null ? `${pct}%` : '—'}
                  </div>
                  <div className="text-xs text-center text-gray-500">
                    {streak > 0 ? `🔥${streak}` : '—'}
                  </div>
                  <div className="text-xs text-center text-gray-400">
                    {maxStreak > 0 ? maxStreak : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
