import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, ChevronRight, CircleAlert, Clock3, FileText, History, ShieldCheck, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { aiReviews } from '../api'
import { entityPath, routeSegments } from '../utils/entityLinks'

const STREAM_TONE = {
  healthy: { label: 'Готово', Icon: CheckCircle2 },
  degraded: { label: 'Неполно', Icon: CircleAlert },
  failed: { label: 'Не готово', Icon: CircleAlert },
  unknown: { label: 'Нет данных', Icon: Clock3 },
}

const WORK_STATUS = {
  done: 'Готово', in_progress: 'В работе', waiting_for_review: 'Ждёт проверки',
  needs_grooming: 'Нужно уточнить', backlog: 'В очереди', ready: 'Готово к старту',
  scheduled: 'Запланировано', not_started: 'Нет статуса',
}

const TECHNICAL_OPPORTUNITY = 'opportunity:candidate:'
const statusMeta = status => STREAM_TONE[status] || STREAM_TONE.unknown
const workStatusLabel = status => WORK_STATUS[status] || 'Нет статуса'

function periodLabel(period) {
  if (!period || ['Нет даты', 'Нет запуска', 'Нет агрегата'].includes(period)) return period || 'Нет данных'
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${period}T12:00:00`))
  return period.replace('weekly-design-review:', '')
}

function decisionActions(item) {
  const known = { select: 'Взять в работу', defer: 'Отложить', stop: 'Не продолжать' }
  const supplied = (item.action_options || [])
    .map(option => ({ action: option.action || option.id, label: option.label || option.title, description: option.description || option.detail }))
    .filter(option => known[option.action])
  return supplied.length ? supplied : Object.entries(known).map(([action, label]) => ({ action, label }))
}

function userDecision(item) {
  const lastAction = (item.actions || []).at(-1)?.action
  return !String(item.id || '').startsWith(TECHNICAL_OPPORTUNITY) && !['defer', 'stop'].includes(lastAction)
}

function humanCoverageTitle(candidate) {
  const labels = {
    capture_to_owner: 'Связь наблюдения с владельцем', declared_journey: 'Покрытие заявленного пути',
    daily_progress: 'Проверка ежедневного прогресса', review_to_decision: 'Путь от обзора к решению',
  }
  return labels[candidate.zone_id] || candidate.title || 'Неполное покрытие'
}

function DetailDialog({ detail, onClose, dialogRef }) {
  if (!detail) return null
  const { kind, item } = detail
  const isInitiative = kind === 'initiative'
  const work = item.work_summary || { total: 0, resolved: 0, done: 0, active: 0, blocked: 0, work_items: [] }
  return (
    <div className="ai-review-dialog-backdrop fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="ai-review-dialog ai-review-drawer flex h-full w-full max-w-xl flex-col overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="ai-review-detail-title">
        <header className="flex items-start gap-4 border-b pb-5">
          <div className="min-w-0 flex-1">
            <p className="ai-review-overview__eyebrow">{isInitiative ? 'Инициатива' : kind === 'decision' ? 'Решение' : item.title}</p>
            <h2 id="ai-review-detail-title" className="mt-1 text-xl font-semibold tracking-tight">{item.title}</h2>
            {kind === 'report' && <p className="mt-2 text-sm">Период: {periodLabel(item.period)}</p>}
          </div>
          <button type="button" className="ai-review-close" onClick={onClose} aria-label="Закрыть подробности"><X size={20} /></button>
        </header>

        {isInitiative ? <div className="mt-6 space-y-6">
          <div><h3 className="ai-review-detail-heading">Цель</h3><p className="mt-2 text-sm leading-6">{item.goal || item.scope || 'Цель инициативы пока не описана.'}</p></div>
          <div className="ai-review-work-summary"><div><strong>{work.done}</strong><span>готово</span></div><div><strong>{work.active}</strong><span>в работе или на проверке</span></div><div><strong>{work.blocked}</strong><span>с блокировками</span></div></div>
          <div><h3 className="ai-review-detail-heading">Работа по инициативе</h3>
            {work.work_items?.length ? <ul className="ai-review-work-list mt-3">{work.work_items.map(workItem => <li key={workItem.id}><span>{workItem.title}</span><span className="ai-review-work-list__meta">{workStatusLabel(workItem.status)}{workItem.blockers ? ` · блокировок: ${workItem.blockers}` : ''}</span></li>)}</ul> : <p className="mt-2 text-sm">Связанных задач пока нет.</p>}
            {work.total > work.resolved && <p className="mt-3 text-xs">Для {work.total - work.resolved} связанных задач пока нет актуального состояния.</p>}
          </div>
        </div> : <div className="mt-6 space-y-5">
          <div className="ai-review-detail-summary"><p>{item.summary || 'Краткий вывод для этого периода пока недоступен.'}</p></div>
          {item.sections?.length ? <div><h3 className="ai-review-detail-heading">Короткий результат</h3><dl className="ai-review-report-sections mt-3">{item.sections.map(section => <div key={section.heading}><dt>{section.heading}</dt><dd>{section.text}</dd></div>)}</dl></div> : <p className="text-sm">Подробный сжатый итог ещё не сформирован. Это не означает, что проверка прошла успешно.</p>}
        </div>}
      </section>
    </div>
  )
}

function StreamCard({ stream, onOpen }) {
  const { Icon, label } = statusMeta(stream.status)
  return <button type="button" className={`ai-review-stream ai-review-stream--${stream.status || 'unknown'}`} onClick={event => onOpen('report', stream, event)}>
    <span className="ai-review-stream__top"><span className="ai-review-stream__icon"><Icon size={18} /></span><span className="ai-review-stream__status">{stream.status_label || label}</span></span>
    <span className="ai-review-stream__title">{stream.title}</span><span className="ai-review-stream__period">{periodLabel(stream.period)}</span><span className="ai-review-stream__summary">{stream.summary}</span><span className="ai-review-stream__open">Открыть итог <ChevronRight size={16} /></span>
  </button>
}

function DecisionCard({ item, onAction, onOpen, compact = false }) {
  return <article className={`ai-review-decision-card ${compact ? 'ai-review-decision-card--compact' : ''}`}>
    <button type="button" className="ai-review-decision-card__open" onClick={event => onOpen('decision', item, event)}><span><span className="ai-review-overview__eyebrow">Решение</span><span className="mt-1 block text-base font-semibold">{item.title}</span></span><ChevronRight size={17} /></button>
    {!compact && <><p className="ai-review-decision-card__summary">{item.summary || item.goal || 'Причина решения пока не описана.'}</p>{item.analysis_rationale && <p className="ai-review-decision-card__rationale">Почему сейчас: {item.analysis_rationale}</p>}<div className="ai-review-decision-card__actions" role="group" aria-label={`Действия: ${item.title}`}>{decisionActions(item).map(option => <button key={option.action} type="button" className={option.action === 'select' ? 'btn btn-primary' : 'btn btn-ghost'} title={option.description} onClick={() => onAction(option.action, item.id)}>{option.label}</button>)}</div></>}
  </article>
}

export default function AiReviews() {
  const location = useLocation()
  const navigate = useNavigate()
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const reviewRoute = routeSegments(location.pathname, 'ai-reviews') || []
  const invalidReviewPath = reviewRoute.length !== 0 && reviewRoute.length !== 2
  const [reviewType, reviewId] = invalidReviewPath ? [] : reviewRoute

  const refresh = async () => {
    try { setModel(await aiReviews.all()); setError('') } catch (caught) { setError(caught.message) }
  }
  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    if (!model || !reviewId) return
    const source = reviewType === 'initiative' ? model.initiatives : reviewType === 'opportunity' ? model.opportunities : []
    const item = source?.find(candidate => candidate.id === reviewId)
    if (item) setDetail({ kind: reviewType === 'initiative' ? 'initiative' : 'decision', item })
  }, [model, reviewType, reviewId])

  const closeDetail = () => {
    setDetail(null)
    if (reviewId) navigate('/ai-reviews')
    window.setTimeout(() => previousFocusRef.current?.focus?.(), 0)
  }
  useEffect(() => {
    if (!detail) return undefined
    const handler = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeDetail(); return }
      if (event.key !== 'Tab') return
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])') || [])]
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', handler)
    window.setTimeout(() => dialogRef.current?.querySelector('button')?.focus(), 0)
    return () => window.removeEventListener('keydown', handler)
  }, [detail]) // The dialog owns its keyboard handling only while it is open.

  const openDetail = (kind, item, event) => {
    previousFocusRef.current = event?.currentTarget || document.activeElement
    setDetail({ kind, item })
    if (kind === 'initiative') navigate(entityPath.aiReview('initiative', item.id))
    if (kind === 'decision') navigate(entityPath.aiReview('opportunity', item.id))
  }
  const action = async (name, id) => {
    try { await aiReviews.action(name, id); await refresh() } catch (caught) { setError(caught.message) }
  }

  if (!model) return <main className="ai-reviews-page mx-auto max-w-6xl p-8"><p className="text-sm">{error ? `Не удалось загрузить обзор: ${error}` : 'Собираю актуальный обзор…'}</p>{error && <button type="button" className="btn btn-primary mt-4" onClick={refresh}>Повторить</button>}</main>

  const overview = model.overview || { streams: [], history: {} }
  const streams = overview.streams || []
  const decisions = (model.opportunities || []).filter(userDecision)
  const mainDecisions = decisions.slice(0, 3)
  const moreDecisions = decisions.slice(3)
  const history = Object.entries(overview.history || {}).filter(([, entries]) => entries?.length)
  const packet = model.priority_loop || { candidates: [] }

  return <main className="ai-reviews-page mx-auto max-w-6xl space-y-9 p-8">
    <header className="ai-review-overview-header"><div><p className="ai-review-overview__eyebrow">AI Reviews</p><h1>Что происходит с системой</h1><p>Короткие результаты локальных проверок за день и неделю. Исходные сессии и личные заметки здесь не показываются.</p></div></header>
    {error && <p className="ai-reviews-error rounded-lg p-3 text-sm" role="alert">{error}</p>}
    {invalidReviewPath && <p className="ai-reviews-error rounded-lg p-3 text-sm" role="alert">Эта ссылка на обзор некорректна.</p>}
    {reviewId && !detail && <p className="ai-reviews-error rounded-lg p-3 text-sm" role="alert">Такой элемент обзора больше не найден.</p>}

    <section className="ai-review-overview-section" aria-labelledby="review-state-heading"><div className="ai-review-section-heading"><div><p className="ai-review-overview__eyebrow">Сейчас</p><h2 id="review-state-heading">Результаты проверок</h2></div><p>Откройте карточку, чтобы увидеть, что подтвердилось, чего не хватает и какой следующий шаг.</p></div>{streams.length ? <div className="ai-review-overview-grid">{streams.map(stream => <StreamCard key={stream.kind} stream={stream} onOpen={openDetail} />)}</div> : <p className="ai-review-empty">Сводка ещё не сформирована. Это не подтверждает, что всё работает.</p>}</section>

    <section className="ai-review-overview-section" aria-labelledby="decisions-heading"><div className="ai-review-section-heading"><div><p className="ai-review-overview__eyebrow">Требует выбора</p><h2 id="decisions-heading">Решения, которым нужно внимание</h2></div><p>Только понятные варианты, а не технические сигналы покрытия.</p></div>{mainDecisions.length ? <div className="ai-review-decision-grid">{mainDecisions.map(item => <DecisionCard key={item.id} item={item} onAction={action} onOpen={openDetail} />)}</div> : <div className="ai-review-empty"><ShieldCheck size={19} /><p>Сейчас нет решения, которое можно безопасно предложить к выбору.</p></div>}{moreDecisions.length > 0 && <details className="ai-review-more-decisions"><summary>Ещё решений: {moreDecisions.length}</summary><div className="ai-review-decision-grid mt-4">{moreDecisions.map(item => <DecisionCard key={item.id} item={item} onAction={action} onOpen={openDetail} compact />)}</div></details>}</section>

    <section className="ai-review-overview-section" aria-labelledby="initiatives-heading"><div className="ai-review-section-heading"><div><p className="ai-review-overview__eyebrow">Работа</p><h2 id="initiatives-heading">Инициативы и прогресс</h2></div><p>Каждая карточка показывает реальное состояние связанных задач, а не создаёт новую работу.</p></div>{(model.initiatives || []).length ? <div className="ai-review-initiative-list">{model.initiatives.map(item => {
      const work = item.work_summary || { total: 0, done: 0, active: 0, blocked: 0 }
      const denominator = Math.max(work.total, 1)
      return <button type="button" key={item.id} className="ai-review-initiative-row" onClick={event => openDetail('initiative', item, event)}><span className="ai-review-initiative-row__main"><span className="ai-review-overview__eyebrow">{item.state === 'approved' ? 'Утверждена' : 'Черновик'}</span><strong>{item.title}</strong><span>{item.goal || item.scope || 'Цель ещё не описана.'}</span></span><span className="ai-review-initiative-row__progress"><span><b>{work.done}</b> из {work.total} готово</span><span className="ai-review-progressbar" aria-hidden="true"><i style={{ width: `${Math.min(100, Math.round(work.done / denominator * 100))}%` }} /></span><small>{work.active ? `В работе: ${work.active}` : 'Нет активных задач'}{work.blocked ? ` · блокировок: ${work.blocked}` : ''}</small></span><ChevronRight size={18} /></button>
    })}</div> : <p className="ai-review-empty">Утверждённых инициатив пока нет.</p>}</section>

    <section className="ai-review-overview-section" aria-labelledby="history-heading"><div className="ai-review-section-heading"><div><p className="ai-review-overview__eyebrow">История</p><h2 id="history-heading">Предыдущие результаты</h2></div><p>Короткие сжатые итоги, доступные без поиска по чатам.</p></div>{history.length ? <div className="ai-review-history-grid">{history.map(([kind, entries]) => <div key={kind} className="ai-review-history-column"><h3><History size={16} />{entries[0]?.title || kind}</h3><div>{entries.map(entry => <button type="button" key={entry.id} onClick={event => openDetail('report', entry, event)}><span>{periodLabel(entry.period)}</span><small>{entry.status_label || statusMeta(entry.status).label}</small><ChevronRight size={15} /></button>)}</div></div>)}</div> : <p className="ai-review-empty"><FileText size={19} />История появится после первого сформированного отчёта.</p>}</section>

    <details className="ai-review-technical-details"><summary>Технические детали</summary><div><p>Покрытие — это сигнал для обслуживания системы, а не пользовательское решение. Его не видно на первом экране.</p>{packet.candidates?.length ? <ul>{packet.candidates.map(candidate => <li key={candidate.zone_id || candidate.id}>{humanCoverageTitle(candidate)}: {candidate.reasons?.join(', ') || 'нужна проверка'}</li>)}</ul> : <p>Новых технических сигналов нет.</p>}<p>Граф скрыт: пока нет подтверждённых связей, которые сделали бы его полезнее списка.</p></div></details>
    <DetailDialog detail={detail} onClose={closeDetail} dialogRef={dialogRef} />
  </main>
}
