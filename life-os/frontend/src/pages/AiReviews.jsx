import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { aiReviews } from '../api'
import ProductGraph from '../components/ProductGraph'
import { entityPath, routeSegments } from '../utils/entityLinks'

export default function AiReviews() {
  const location = useLocation()
  const navigate = useNavigate()
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const reviewRoute = routeSegments(location.pathname, 'ai-reviews') || []
  const invalidReviewPath = reviewRoute.length !== 0 && reviewRoute.length !== 2
  const [reviewType, reviewId] = invalidReviewPath ? [] : reviewRoute

  const refresh = () => aiReviews.all().then(setModel).catch(e => setError(e.message))
  useEffect(() => { refresh() }, [])

  const action = async (name, id) => {
    try { await aiReviews.action(name, id); await refresh() } catch (e) { setError(e.message) }
  }
  const priority = async name => {
    try { await aiReviews.reminder(name, model.priority_loop.candidate_set_checksum); await refresh() } catch (e) { setError(e.message) }
  }
  const addWork = async id => {
    const title = prompt('Название work item')
    const outcome = prompt('Проверяемый результат')
    if (!title || !outcome) return
    try { await aiReviews.createWorkItem(id, { title, outcome }); await refresh() } catch (e) { setError(e.message) }
  }
  const graph = useMemo(() => model ? [
    ...(model.opportunities || []).map(x => ({ ...x, type: 'decision', summary: x.summary || x.goal || '', sources: x.source_refs || [] })),
    ...(model.initiatives || []).map(x => ({ ...x, type: 'delivery', summary: x.goal || x.scope || '', sources: x.source_refs || [] })),
  ] : [], [model])

  if (!model) return <main className="p-8 text-sm text-gray-500">Загружаю review model…</main>
  const packet = model.priority_loop || { candidates: [], reminder: {} }
  const knownReview = reviewId && (
    (reviewType === 'opportunity' && model.opportunities?.some(item => item.id === reviewId)) ||
    (reviewType === 'initiative' && model.initiatives?.some(item => item.id === reviewId))
  )

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-semibold">AI Reviews</h1>
        <p className="mt-2 text-sm text-gray-600">Data-free control plane: no session text, local paths, or credentials.</p>
      </header>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {invalidReviewPath && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Этот URL review-сущности не найден.</p>}
      {reviewId && !knownReview && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Эта review-сущность не найдена.</p>}

      <section className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
        <h2 className="font-semibold text-violet-950">Priority review</h2>
        <p className="mt-1 text-sm text-violet-900">Это recommendation по coverage, а не автоматическое изменение приоритета.</p>
        <ol className="mt-3 space-y-1 text-sm">
          {packet.candidates.map(item => <li key={item.id}>{item.title} · {item.reasons.join(', ')}</li>)}
        </ol>
        {packet.reminder?.state !== 'dismissed' && <button className="btn btn-ghost mt-3 border" onClick={() => priority('dismiss')}>Скрыть до изменения набора</button>}
        <p className="mt-3 text-xs text-violet-700">Recheck drafts: {(model.priority_recheck?.drafts || []).length}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Возможности</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {(model.opportunities || []).map(item => (
            <article key={item.id} data-entity-id={item.id} className={`card p-5 ${reviewType === 'opportunity' && reviewId === item.id ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}>
              <button type="button" onClick={() => navigate(entityPath.aiReview('opportunity', item.id))} className="text-left font-semibold hover:text-blue-600 dark:hover:text-blue-400">{item.title}</button>
              <p className="mt-2 text-sm text-gray-600">{item.summary || item.goal}</p>
              <p className="mt-3 text-xs text-gray-500">Provenance: {(item.source_refs || []).join(', ') || 'нет'}</p>
              <div className="mt-4 flex gap-2">
                <button className="btn btn-primary" onClick={() => action('select', item.id)}>Выбрать</button>
                <button className="btn btn-ghost" onClick={() => action('defer', item.id)}>Отложить</button>
                <button className="btn btn-ghost" onClick={() => action('stop', item.id)}>Остановить</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold">Инициативы</h2>
        <div className="mt-3 space-y-3">
          {(model.initiatives || []).map(item => (
            <article key={item.id} data-entity-id={item.id} className={`card p-5 ${reviewType === 'initiative' && reviewId === item.id ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}`}>
              <button type="button" onClick={() => navigate(entityPath.aiReview('initiative', item.id))} className="text-left font-semibold hover:text-blue-600 dark:hover:text-blue-400">{item.title}</button>
              <p className="mt-1 text-sm text-gray-600">{item.state}</p>
              {item.state === 'draft' && <button className="btn btn-primary mt-3" onClick={() => action('approve_delivery_scope', item.id)}>Подтвердить границы</button>}
              {item.state === 'approved' && <button className="btn btn-primary mt-3" onClick={() => addWork(item.id)}>Создать work item</button>}
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Граф controlled workflow</h2>
        <ProductGraph records={graph} />
      </section>
    </main>
  )
}
