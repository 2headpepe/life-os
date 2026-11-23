import { useRef, useState } from 'react'
import { events } from '../api'

export default function WorkBlockForm({ task, block, date, time, calendars, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => ({
    title: block?.title || task.title,
    date: block?.date || date,
    time: block?.time || time || '',
    duration_min: block?.duration_min ?? task.remaining_min ?? task.estimate_min ?? '',
    calendar_id: block?.calendar_id || '',
  }))
  const requestId = useRef(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  function field(key) {
    return { value: draft[key], onChange: event => setDraft({ ...draft, [key]: event.target.value }) }
  }
  async function save(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const values = { ...draft, duration_min: Number(draft.duration_min), calendar_id: draft.calendar_id || null }
      requestId.current ||= 'block-' + crypto.randomUUID()
      const result = block ? await events.update(block.id, values) : await events.add({
        id: requestId.current, ...values, task_id: task.id, type: 'work_block',
        time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      if (result?.error) throw new Error(result.error)
      await onSaved(result)
    } catch (failure) { setError(failure.message || 'Не удалось сохранить интервал.') }
    finally { setSaving(false) }
  }
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-3">
    <form role="dialog" aria-modal="true" aria-label="Рабочий интервал" className="card space-y-3 p-5" onSubmit={save}>
      <h2 className="font-semibold">Рабочий интервал</h2>
      <fieldset disabled={saving} className="grid gap-3 text-sm">
        <label>Название <input required autoFocus {...field('title')} /></label>
        <label>День <input required type="date" {...field('date')} /></label>
        <label>Начало <input required type="time" {...field('time')} /></label>
        <label>Длительность, минут <input type="number" required min="1" max="1440" {...field('duration_min')} /></label>
        <label>Календарь <select {...field('calendar_id')}>
          <option value="">Только Life OS</option>
          {calendars.map(cal => <option key={cal.id} value={cal.id}>{cal.title}{cal.sync_to_gcal ? ' · Google Calendar' : ''}</option>)}
        </select></label>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button type="submit" className="btn btn-primary">Сохранить интервал</button>
        </div>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  </div>
}
