import { useCallback, useRef, useState } from 'react'
import { tree } from '../api'
import TaskEffort from './TaskEffort'

const fieldClass = 'block mt-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900'

export default function TaskDates({ node, onUpdate }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const initialValues = useRef(null)
  const rememberFields = useCallback(form => {
    if (!form) return
    initialValues.current = new Map(Array.from(form.elements)
      .filter(field => field.name)
      .map(field => [field.name, field.value]))
  }, [])

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const patch = {}
    for (const [key, value] of form.entries()) {
      if (value !== initialValues.current.get(key)) patch[key] = value || null
    }
    if (!form.get('due') && (patch.date_kind || patch.time)) {
      setError('Укажите дату для выбранного значения или времени.')
      return
    }
    if (patch.due === null) {
      patch.date_kind = null
      patch.time = null
    }
    setError('')
    if (!Object.keys(patch).length || saving) return
    const scheduledHere = form.get('due') && form.get('date_kind') === 'scheduled' && (patch.due || patch.date_kind)
    if (scheduledHere && (!node.status || node.status === 'undefined')) patch.status = 'scheduled'
    setSaving(true)
    try {
      const result = await tree.update(node.id, patch)
      if (result?.error) throw new Error(result.error)
      await onUpdate?.()
    } catch {
      setError('Не удалось сохранить даты. Попробуйте ещё раз.')
    } finally {
      setSaving(false)
    }
  }
  const revision = [node.id, node.due, node.time, node.date_kind, node.available_from].join('|')
  return <>
    <form key={revision} ref={rememberFields} onSubmit={save} onClick={event => event.stopPropagation()} className="space-y-1">
      <fieldset disabled={saving} className="flex flex-wrap items-end gap-2 text-xs">
        <label>Дата<input name="due" type="date" defaultValue={node.due || ''} className={fieldClass} /></label>
        <label>Значение даты<select name="date_kind" defaultValue={node.date_kind || ''} className={fieldClass}>
          <option value="">Не уточнено</option>
          <option value="scheduled">Назначено на</option>
          <option value="deadline">Срок до</option>
        </select></label>
        <label>Время<input name="time" type="time" defaultValue={node.time || ''} className={fieldClass} /></label>
        <label>Можно с<input name="available_from" type="date" defaultValue={node.available_from || ''} className={fieldClass} /></label>
        <button type="submit" className="btn btn-ghost text-xs">Сохранить даты</button>
      </fieldset>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </form>
    <TaskEffort node={node} onUpdate={onUpdate} />
  </>
}
