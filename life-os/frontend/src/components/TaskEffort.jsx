import { useState } from 'react'
import { Link } from 'react-router-dom'
import { tree } from '../api'

const inputClass = 'mt-1 block w-full rounded border border-gray-200 bg-white px-2 py-1 dark:border-gray-700 dark:bg-gray-900'

export default function TaskEffort({ node, onUpdate }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const step = node.first_step
  async function save(event) {
    event.preventDefault()
    if (saving) return
    const form = new FormData(event.currentTarget)
    const minutes = name => form.get(name) ? Number(form.get(name)) : null
    const title = form.get('step_title').trim()
    const stepMinutes = minutes('step_minutes')
    if (stepMinutes && !title) {
      setError('Укажи, что сделать первым шагом.')
      return
    }
    const patch = {}
    for (const key of ['estimate_min', 'remaining_min']) {
      if (minutes(key) !== (node[key] ?? null)) patch[key] = minutes(key)
    }
    if (title !== (step?.title || '') || stepMinutes !== (step?.estimate_min ?? null)) {
      patch.first_step = title ? { title, estimate_min: stepMinutes } : null
    }
    setError('')
    if (!Object.keys(patch).length) return
    setSaving(true)
    try {
      const result = await tree.update(node.id, patch)
      if (result?.error) throw new Error(result.error)
      await onUpdate?.()
    } catch {
      setError('Не удалось сохранить оценку. Попробуй ещё раз.')
    } finally {
      setSaving(false)
    }
  }
  const revision = JSON.stringify([node.id, node.estimate_min, node.remaining_min, step])
  return <div onClick={event => event.stopPropagation()} className="space-y-2 text-xs">
    <details>
      <summary className="cursor-pointer font-medium">Оценка и первый шаг</summary>
      <form key={revision} onSubmit={save}>
        <fieldset disabled={saving} className="mt-2 flex flex-wrap items-end gap-2">
          <label>Оценка, мин<input type="number" min="1" step="1" name="estimate_min" defaultValue={node.estimate_min ?? ''} className={inputClass} /></label>
          <label>Осталось, мин<input type="number" min="1" step="1" name="remaining_min" defaultValue={node.remaining_min ?? ''} className={inputClass} /></label>
          <label>Первый шаг<input name="step_title" maxLength="240" defaultValue={step?.title || ''} className={inputClass} /></label>
          <label>На шаг, мин<input type="number" min="1" step="1" name="step_minutes" defaultValue={step?.estimate_min ?? ''} className={inputClass} /></label>
          <button type="submit" className="btn btn-ghost text-xs">Сохранить оценку</button>
        </fieldset>
        {error && <p role="alert" className="text-red-600">{error}</p>}
      </form>
    </details>
    <Link to={'/calendar?task=' + encodeURIComponent(node.id)} className="text-blue-600 hover:underline">Рабочие интервалы в календаре</Link>
  </div>
}
