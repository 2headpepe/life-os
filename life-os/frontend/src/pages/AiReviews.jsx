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
const COVERAGE_AXIS_LABELS = { design_review: 'Design review', analytics: 'Аналитика', tests: 'Тесты', delivery: 'Delivery' }
const COVERAGE_STATE_LABELS = {
  available: 'Доступно', covered: 'Подтверждено', partial: 'Частично', needs_verification: 'Нужна проверка', not_reviewed: 'Не проверено', no_data: 'Нет данных',
}
const TRAFFIC_LABELS = { ordinary_use: 'Обычное использование', observational_audit: 'Наблюдательная проверка', automated_test: 'Автотест', unknown: 'Неизвестно' }
const OUTCOME_LABELS = { task_progress: 'Прогресс задач', habit_progress: 'Прогресс привычек', goal_progress: 'Прогресс целей', capture_saved: 'Сохранён захват', feed_action: 'Действие в ленте', review_decision: 'Решение по обзору' }
const EVENT_TYPE_LABELS = { screen_view: 'Открыт экран', screen_exit: 'Закрыт экран', screen_rendered: 'Экран отрисован', api_write_succeeded: 'Изменение сохранено', api_write_failed: 'Ошибка сохранения', ui_action: 'Действие в интерфейсе' }
const HEALTH_LABELS = { observed: 'Есть наблюдение', not_observed: 'Не наблюдалось', source_missing: 'Нет полного источника', error_observed: 'Есть ошибка', not_instrumented: 'Не измеряется', needs_verification: 'Нужна проверка' }
const ANALYSIS_TITLES = { surface: 'Экран', function: 'Функция', flow: 'Сценарий' }
const statusMeta = status => STREAM_TONE[status] || STREAM_TONE.unknown
const workStatusLabel = status => WORK_STATUS[status] || 'Нет статуса'

function periodLabel(period) {
  if (!period || ['Нет даты', 'Нет запуска', 'Нет агрегата'].includes(period)) return period || 'Нет данных'
  if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${period}T12:00:00`))
  return period.replace('weekly-design-review:', '')
}

function analyticsPeriodLabel(window) {
  if (!window?.from || !window?.to) return 'Нет агрегата'
  return window.from === window.to ? periodLabel(window.from) : `${periodLabel(window.from)} — ${periodLabel(window.to)}`
}

function eventTimeLabel(occurredAt) {
  if (!occurredAt) return 'Нет времени'
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(occurredAt))
}

function coverageTone(state) {
  if (state === 'available' || state === 'covered') return 'healthy'
  if (state === 'partial' || state === 'needs_verification') return 'caution'
  return 'neutral'
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
  const repeatedSummary = item.summary && item.sections?.some(section => section.text.startsWith(item.summary.replace(/…$/, '')))
  return (
    <div className="ai-review-dialog-backdrop fixed inset-0 z-50 flex justify-end bg-slate-950/35" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="ai-review-dialog ai-review-drawer flex h-full w-full max-w-3xl flex-col overflow-y-auto p-6" role="dialog" aria-modal="true" aria-labelledby="ai-review-detail-title">
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
          {!repeatedSummary && <div className="ai-review-detail-summary"><p>{item.summary || 'Краткий вывод для этого периода пока недоступен.'}</p></div>}
          {item.sections?.length ? <div><h3 className="ai-review-detail-heading">Текст обзора</h3><dl className="ai-review-report-sections mt-3">{item.sections.map((section, index) => <div key={`${section.heading}:${index}`}><dt>{section.heading}</dt><dd>{section.text}</dd></div>)}</dl></div> : <p className="text-sm">Текст обзора ещё не сформирован. Это не означает, что проверка прошла успешно.</p>}
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

function CoveragePill({ state, label, reason = null }) {
  return <span className={`ai-review-coverage-pill ai-review-coverage-pill--${coverageTone(state)}`} title={reason || undefined}>{label || COVERAGE_STATE_LABELS[state] || 'Нет данных'}</span>
}

function AnalyticsWindowSelect({ analytics, selectedWindowId, onChange }) {
  const windows = analytics?.available_windows || []
  if (!windows.length) return null
  return <label className="ai-review-window-select">Период
    <select value={selectedWindowId || analytics?.selected?.id || ''} onChange={event => onChange(event.target.value || null)}>
      {windows.map(window => <option key={window.id} value={window.id}>{analyticsPeriodLabel(window.window)} · {window.source_event_count} событий</option>)}
    </select>
  </label>
}

function CoverageView({ coverage }) {
  if (!coverage) return <p className="ai-review-empty">Покрытие пока не удалось загрузить.</p>
  const design = coverage.axes?.design_review || { confirmed: 0, registered: 0, reviewed_in_registry: 0, states: {} }
  const incomplete = (design.states?.partial || 0) + (design.states?.needs_verification || 0)
  return <div className="ai-review-observability-view">
    <div className="ai-review-coverage-intro"><div><p className="ai-review-overview__eyebrow">Состояние источника</p><h3>Покрытие дизайн-ревью</h3><p>Покрытие — это наличие проверяемого evidence, а не оценка качества интерфейса.</p></div><CoveragePill state={coverage.state} /></div>
    {coverage.reason && <p className="ai-review-coverage-warning" role="status">{coverage.reason}</p>}
    <div className="ai-review-observability-metrics">
      <div><strong>{design.confirmed}</strong><span>подтверждено из {design.registered}</span></div>
      <div><strong>{design.reviewed_in_registry}</strong><span>проверено в снимке</span></div>
      <div><strong>{design.states?.not_reviewed || 0}</strong><span>без review</span></div>
      <div><strong>{incomplete}</strong><span>частично или требует проверки</span></div>
    </div>
    <p className="ai-review-provenance">Manifest v{coverage.manifest?.revision ?? '—'} · registry v{coverage.registry?.manifest_revision ?? '—'} · снимок {coverage.registry?.generated_at ? eventTimeLabel(coverage.registry.generated_at) : 'недоступен'}</p>
    <div className="ai-review-coverage-table" role="list" aria-label="Матрица покрытия Life OS">
      {coverage.zones?.map(zone => <article key={zone.id} className="ai-review-coverage-zone" role="listitem"><div className="ai-review-coverage-zone__title"><strong>{zone.label}</strong><span>{zone.kind === 'surface' ? 'Поверхность' : zone.kind === 'block' ? 'Блок' : 'Путь'}</span>{zone.purpose && <small>{zone.purpose}</small>}</div><div className="ai-review-coverage-axis-list">{Object.entries(zone.axes || {}).map(([axis, value]) => <div key={axis}><span>{COVERAGE_AXIS_LABELS[axis] || axis}</span><CoveragePill state={value.state} reason={value.reason} /></div>)}</div></article>)}
    </div>
  </div>
}

function UsageFilters({ analytics, usage, filters, onChange, selectedWindowId, onWindowChange }) {
  const surfaces = usage?.surfaces || []
  const functions = usage?.functions || []
  const flows = usage?.flows || []
  return <div className="ai-review-analysis-filters">
    <AnalyticsWindowSelect analytics={analytics} selectedWindowId={selectedWindowId} onChange={onWindowChange} />
    <label>Трафик<select value={filters.traffic} onChange={event => onChange({ ...filters, traffic: event.target.value })}><option value="all">Все классы</option>{Object.entries(TRAFFIC_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Экран<select value={filters.surface} onChange={event => onChange({ ...filters, surface: event.target.value })}><option value="all">Все экраны</option>{surfaces.map(item => <option key={item.id} value={item.id}>{item.route}</option>)}</select></label>
    <label>Функция<select value={filters.function} onChange={event => onChange({ ...filters, function: event.target.value })}><option value="all">Все функции</option>{functions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label>Сценарий<select value={filters.flow} onChange={event => onChange({ ...filters, flow: event.target.value })}><option value="all">Все сценарии</option>{flows.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label>Состояние<select value={filters.health} onChange={event => onChange({ ...filters, health: event.target.value })}><option value="all">Все состояния</option>{Object.entries(HEALTH_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
  </div>
}

function filteredAnalysis(items, kind, filters) {
  return (items || []).filter(item => {
    if (filters.health !== 'all' && item.health !== filters.health) return false
    const normalizedId = String(item.id || '').replace(/^(surface|function|flow):/, '')
    if (kind === 'surface' && filters.surface !== 'all' && normalizedId !== filters.surface) return false
    if (kind !== 'surface' && filters.surface !== 'all' && !item.surface_ids?.includes('*') && !item.surface_ids?.includes(filters.surface)) return false
    if (kind === 'function' && filters.function !== 'all' && normalizedId !== filters.function) return false
    if (kind === 'flow' && filters.flow !== 'all' && normalizedId !== filters.flow) return false
    return true
  })
}

function AnalysisCards({ items, kind }) {
  if (!items.length) return <p className="ai-review-empty">Нет сигналов в выбранном срезе. Это не доказывает отсутствие использования.</p>
  return <div className="ai-review-analysis-list">{items.map(item => <article key={`${kind}:${item.id}`} className={`ai-review-analysis-card ai-review-analysis-card--${item.health}`}><div className="ai-review-analysis-card__heading"><div><p className="ai-review-overview__eyebrow">{ANALYSIS_TITLES[kind]}</p><h3>{item.label || item.route}</h3></div><CoveragePill state={item.health} label={HEALTH_LABELS[item.health]} /></div><dl><div><dt>Факт</dt><dd>{item.fact}</dd></div><div><dt>Вывод</dt><dd>{item.interpretation}</dd></div><div><dt>Ограничение</dt><dd>{item.limitation}</dd></div><div><dt>Проверить дальше</dt><dd>{item.next_check}</dd></div></dl><p className="ai-review-analysis-card__metrics">Сигналов: {item.metrics?.observed || 0} · outcomes: {item.metrics?.outcomes || 0} · ошибок: {item.metrics?.errors || 0}</p></article>)}</div>
}

function ConclusionsView({ usage, filters }) {
  const items = [
    ...filteredAnalysis(usage?.surfaces, 'surface', filters).map(item => ({ ...item, kind: 'surface' })),
    ...filteredAnalysis(usage?.functions, 'function', filters).map(item => ({ ...item, kind: 'function' })),
    ...filteredAnalysis(usage?.flows, 'flow', filters).map(item => ({ ...item, kind: 'flow' })),
  ].sort((left, right) => (right.health === 'error_observed') - (left.health === 'error_observed') || (right.metrics?.observed || 0) - (left.metrics?.observed || 0)).slice(0, 12)
  if (!items.length) return <p className="ai-review-empty">Нет выводов в выбранном срезе. Это не доказывает отсутствие использования.</p>
  return <div className="ai-review-analysis-list">{items.map(item => <AnalysisCards key={`${item.kind}:${item.id}`} items={[item]} kind={item.kind} />)}</div>
}

function GroupedSignalsView({ usage, filters }) {
  const groups = (usage?.groups || []).filter(group => {
    if (filters.traffic !== 'all' && group.traffic_class !== filters.traffic) return false
    if (filters.surface !== 'all' && group.surface_id !== filters.surface) return false
    if (filters.function !== 'all' && !group.function_ids?.includes(filters.function)) return false
    if (filters.flow !== 'all' && !group.flow_ids?.includes(filters.flow)) return false
    return true
  })
  return <div className="ai-review-grouped-signals"><p className="ai-review-provenance">Каждая строка объединяет одинаковые события по экрану, функции, действию, операции, outcome и классу трафика. Идентификаторы, текст и payload исключены.</p>{groups.length ? <div className="ai-review-events-table-wrap"><table className="ai-review-events-table"><thead><tr><th scope="col">Сигнал</th><th scope="col">Экран</th><th scope="col">Контекст</th><th scope="col">Исход</th><th scope="col">Количество</th><th scope="col">Наблюдение</th></tr></thead><tbody>{groups.map((group, index) => <tr key={`${group.type}-${group.route}-${group.feature || ''}-${group.action || ''}-${index}`}><td>{EVENT_TYPE_LABELS[group.type] || group.type}</td><td>{group.route}</td><td>{[group.feature, group.action, group.operation].filter(Boolean).join(' · ') || '—'}</td><td>{group.outcome_category ? `${OUTCOME_LABELS[group.outcome_category] || group.outcome_category}${group.outcome_state === 'attempted' ? ' · попытка' : ''}` : '—'}</td><td><strong>{group.count}</strong></td><td>{eventTimeLabel(group.first_observed_at)} — {eventTimeLabel(group.last_observed_at)}</td></tr>)}</tbody></table></div> : <p className="ai-review-empty">Нет сгруппированных сигналов для выбранного фильтра.</p>}</div>
}

function SignalHealthView({ usage, filters }) {
  const items = [
    ...filteredAnalysis(usage?.signal_health?.filter(item => item.kind === 'surface'), 'surface', filters),
    ...filteredAnalysis(usage?.signal_health?.filter(item => item.kind === 'function'), 'function', filters),
    ...filteredAnalysis(usage?.signal_health?.filter(item => item.kind === 'flow'), 'flow', filters),
  ]
  return <div className="ai-review-signal-health">{items.length ? items.map(item => <div key={item.id}><span>{item.kind === 'surface' ? 'Экран' : item.kind === 'function' ? 'Функция' : 'Сценарий'} · {item.label}</span><CoveragePill state={item.health} label={HEALTH_LABELS[item.health]} /><small>сигналов: {item.metrics?.observed || 0}; ошибок: {item.metrics?.errors || 0}</small></div>) : <p className="ai-review-empty">Состояния сигналов не совпали с выбранным фильтром.</p>}</div>
}

function UsageView({ tab, observability, filters }) {
  const usage = filters.traffic === 'all' ? observability?.usage : observability?.usage?.by_traffic?.[filters.traffic]
  const selected = observability?.analytics?.selected
  const source = selected?.source_coverage || {}
  if (!usage) return <div className="ai-review-observability-view"><p className="ai-review-empty">Анализ использования пока недоступен.</p></div>
  const content = tab === 'conclusions' ? <ConclusionsView usage={usage} filters={filters} />
    : tab === 'surfaces' ? <AnalysisCards items={filteredAnalysis(usage.surfaces, 'surface', filters)} kind="surface" />
      : tab === 'functions' ? <AnalysisCards items={filteredAnalysis(usage.functions, 'function', filters)} kind="function" />
        : tab === 'flows' ? <AnalysisCards items={filteredAnalysis(usage.flows, 'flow', filters)} kind="flow" />
          : tab === 'health' ? <SignalHealthView usage={usage} filters={filters} />
            : <GroupedSignalsView usage={observability?.usage} filters={filters} />
  return <div className="ai-review-observability-view"><div className="ai-review-coverage-intro"><div><p className="ai-review-overview__eyebrow">Локальная аналитика</p><h3>{selected ? analyticsPeriodLabel(selected.window) : 'Нет агрегата'}</h3><p>Выводы показывают факт, ограниченную интерпретацию и следующий способ проверки. Они не являются выводом о продуктовой ценности.</p></div><CoveragePill state={usage.state} /></div>{usage.reason && <p className="ai-review-coverage-warning" role="status">{usage.reason}</p>}{selected && <p className="ai-review-provenance">Источники: {source.available || 0} из {source.expected || 0}; отсутствуют: {source.missing || 0}. Правило агрегации v{selected.aggregation_rule_version || '—'}.</p>}{content}</div>
}

function ObservabilityPanel({ observability, selectedWindowId, onWindowChange }) {
  const [tab, setTab] = useState('conclusions')
  const [filters, setFilters] = useState({ traffic: 'ordinary_use', surface: 'all', function: 'all', flow: 'all', health: 'all' })
  const tabs = [{ id: 'conclusions', label: 'Выводы' }, { id: 'surfaces', label: 'Экраны' }, { id: 'functions', label: 'Функции' }, { id: 'flows', label: 'Сценарии' }, { id: 'health', label: 'Здоровье сигналов' }, { id: 'groups', label: 'Группы событий' }, { id: 'coverage', label: 'Покрытие' }]
  const selected = tab === 'coverage' ? <CoverageView coverage={observability?.coverage} /> : <UsageView tab={tab} observability={observability} filters={filters} />
  return <section className="ai-review-overview-section ai-review-observability" aria-labelledby="observability-heading"><div className="ai-review-section-heading"><div><p className="ai-review-overview__eyebrow">Наблюдаемость</p><h2 id="observability-heading">Покрытие и использование</h2></div><p>Сигналы помогают проверять работу интерфейса; они не принимают продуктовые решения сами.</p></div>{tab !== 'coverage' && <UsageFilters analytics={observability?.analytics} usage={observability?.usage} filters={filters} onChange={setFilters} selectedWindowId={selectedWindowId} onWindowChange={onWindowChange} />}<div className="ai-review-observability-tabs" role="tablist" aria-label="Покрытие и использование">{tabs.map(item => <button key={item.id} id={`observability-tab-${item.id}`} type="button" role="tab" aria-selected={tab === item.id} aria-controls={`observability-panel-${item.id}`} className={tab === item.id ? 'is-active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</div><div id={`observability-panel-${tab}`} role="tabpanel" aria-labelledby={`observability-tab-${tab}`} tabIndex="0">{selected}</div></section>
}

export default function AiReviews() {
  const location = useLocation()
  const navigate = useNavigate()
  const dialogRef = useRef(null)
  const previousFocusRef = useRef(null)
  const [model, setModel] = useState(null)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState(null)
  const [analyticsWindowId, setAnalyticsWindowId] = useState(null)
  const reviewRoute = routeSegments(location.pathname, 'ai-reviews') || []
  const invalidReviewPath = reviewRoute.length !== 0 && reviewRoute.length !== 2
  const [reviewType, reviewId] = invalidReviewPath ? [] : reviewRoute

  const refresh = async () => {
    try { setModel(await aiReviews.all(analyticsWindowId)); setError('') } catch (caught) { setError(caught.message) }
  }
  useEffect(() => { void refresh() }, [analyticsWindowId])
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
    try {
      const result = await aiReviews.action(name, id, 'review_decision')
      if (result?.error) throw new Error(result.error)
      await refresh()
    } catch (caught) {
      setError(caught.message)
    }
  }

  if (!model) return <main className="ai-reviews-page mx-auto max-w-6xl p-8"><p className="text-sm">{error ? `Не удалось загрузить обзор: ${error}` : 'Собираю актуальный обзор…'}</p>{error && <button type="button" className="btn btn-primary mt-4" onClick={refresh}>Повторить</button>}</main>

  const overview = model.overview || { streams: [], history: {} }
  const streams = overview.streams || []
  const decisions = (model.opportunities || []).filter(userDecision)
  const mainDecisions = decisions.slice(0, 3)
  const moreDecisions = decisions.slice(3)
  const history = Object.entries(overview.history || {}).filter(([, entries]) => entries?.length)
  const packet = model.priority_loop || { candidates: [] }
  const observability = model.observability || null

  return <main className="ai-reviews-page mx-auto max-w-6xl space-y-9 p-8">
    <header className="ai-review-overview-header"><div><p className="ai-review-overview__eyebrow">AI Reviews</p><h1>Что происходит с системой</h1><p>Короткие результаты локальных проверок за день и неделю. Исходные сессии и личные заметки здесь не показываются.</p></div></header>
    {error && <p className="ai-reviews-error rounded-lg p-3 text-sm" role="alert">{error}</p>}
    {invalidReviewPath && <p className="ai-reviews-error rounded-lg p-3 text-sm" role="alert">Эта ссылка на обзор некорректна.</p>}
    {reviewId && !detail && <p className="ai-reviews-error rounded-lg p-3 text-sm" role="alert">Такой элемент обзора больше не найден.</p>}

    <section className="ai-review-overview-section" aria-labelledby="review-state-heading"><div className="ai-review-section-heading"><div><p className="ai-review-overview__eyebrow">Сейчас</p><h2 id="review-state-heading">Результаты проверок</h2></div><p>Откройте карточку, чтобы увидеть, что подтвердилось, чего не хватает и какой следующий шаг.</p></div>{streams.length ? <div className="ai-review-overview-grid">{streams.map(stream => <StreamCard key={stream.kind} stream={stream} onOpen={openDetail} />)}</div> : <p className="ai-review-empty">Сводка ещё не сформирована. Это не подтверждает, что всё работает.</p>}</section>

    <ObservabilityPanel observability={observability} selectedWindowId={analyticsWindowId} onWindowChange={setAnalyticsWindowId} />

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
