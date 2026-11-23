import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { tree as treeApi, planner as plannerApi } from '../api'
import NodeCard from '../components/NodeCard'
import { GripVertical, SlidersHorizontal, X } from 'lucide-react'
import { localDay, overdueTasks } from '../utils/activeWork'
import { usePlanningRefresh } from '../utils/usePlanningRefresh'
import { filterAndRank, parseWorkView, workViewSearch } from '../utils/workControlPlane'

const STATUS_TABS = [
  { id: 'all',         label: 'Все' },
  { id: 'undefined',   label: 'Не определено' },
  { id: 'scheduled',   label: 'Запланировано' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'blocked',     label: 'Ждём' },
  { id: 'someday',     label: 'Когда-нибудь' },
]

const GROUP_OPTIONS = [
  { id: 'domain', label: 'По домену' },
  { id: 'status', label: 'По статусу' },
  { id: 'flat',   label: 'Плоский список' },
]

const STATUS_LABELS = {
  undefined:   '⚠ Не определено',
  scheduled:   '◷ Запланировано',
  in_progress: '◑ В работе',
  blocked:     '⏸ Ждём',
  someday:     '◌ Когда-нибудь',
}

const PLANNER_LANES = [
  { id: 'focus', label: 'Сегодня', description: 'самое важное на сегодня', accent: 'bg-violet-500' },
  { id: 'next', label: 'Следующая', description: 'важно, но можно заняться позже', accent: 'bg-sky-500' },
  { id: 'waiting', label: 'Позже', description: 'третий уровень приоритета', accent: 'bg-amber-500' },
]

const PICKER_SECTIONS = [
  { id: 'current', label: 'Актуальные' },
  { id: 'undated', label: 'Без даты' },
  { id: 'upcoming', label: 'Будущие' },
  { id: 'someday', label: 'Когда-нибудь' },
  { id: 'all', label: 'Все' },
]

function candidateSection(task, today) {
  if (task.status === 'someday') return 'someday'
  if (task.status === 'in_progress' || (task.due && task.due <= today)) return 'current'
  if (task.due && task.due > today) return 'upcoming'
  return 'undated'
}

function candidateSort(left, right) {
  return (left.due || '9999').localeCompare(right.due || '9999') || left.title.localeCompare(right.title, 'ru')
}

function ListGroup({ label, color, items, onUpdate }) {
  if (items.length === 0) return null
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
        <div className="section-title">{label} · {items.length}</div>
      </div>
      <div>
        {items.map(n => <NodeCard key={n.id} node={n} onUpdate={onUpdate} />)}
      </div>
    </div>
  )
}

function urgencyLabel(urgency) {
  if (urgency === 'urgent') return 'срочно'
  if (urgency === 'normal') return 'обычная срочность'
  return null
}

function plannerStatus(task) {
  if (task.is_blocked) return '⏸ Ждёт зависимость'
  return STATUS_LABELS[task.status || 'undefined'] || '⚠ Не определено'
}

// `pointerWithin` makes the whole lane a real destination: dropping into an
// empty part of a neighbouring column must not depend on hitting a card. The
// fallback keeps keyboard sorting working, where no pointer coordinates exist.
function plannerCollisionDetection(args) {
  const pointerCollisions = pointerWithin(args)
  return pointerCollisions.length ? pointerCollisions : closestCorners(args)
}

function PlannerCard({ task, overlay = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: overlay })
  const urgency = urgencyLabel(task.planner?.urgency)
  const style = overlay ? undefined : {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      style={style}
      className={`rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-slate-900 ${isDragging ? 'opacity-35' : ''} ${overlay ? 'w-72 shadow-lg ring-1 ring-gray-300 dark:ring-gray-600' : ''}`}
    >
      <div className="flex items-start gap-2">
        {!overlay && (
          <button
            type="button"
            className="shrink-0 rounded p-1 text-gray-400 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 active:cursor-grabbing dark:hover:text-gray-200"
            aria-label={`Перетащить задачу «${task.title}»`}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
        )}
        {overlay ? <span className="min-w-0 break-words text-sm font-medium text-gray-900 dark:text-gray-100">{task.title}</span> : <Link to={`/goals?task=${encodeURIComponent(task.id)}`} className="min-w-0 break-words text-sm font-medium text-gray-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:text-gray-100">{task.title}</Link>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
        {task.due && <span>Срок {task.due}</span>}
        <span className={task.is_blocked ? 'text-amber-700 dark:text-amber-300' : ''}>{plannerStatus(task)}</span>
        {task.available_from && <span>Доступно с {task.available_from}</span>}
        {task.root_title && <span>{task.root_title}</span>}
        {urgency && <span className={task.planner?.urgency === 'urgent' ? 'font-medium text-rose-600 dark:text-rose-400' : ''}>{urgency}</span>}
      </div>
    </article>
  )
}

function BacklogCard({ task, onActivate, overlay = false, draggedRef }) {
  const { attributes, listeners = {}, setNodeRef, transform, transition, isDragging } = useDraggable({ id: `backlog:${task.id}`, disabled: overlay })
  const { onPointerDown: onDragPointerDown, ...dragListeners } = listeners
  const style = overlay ? undefined : {
    transform: CSS.Translate.toString(transform),
    transition,
  }
  return <article ref={overlay ? undefined : setNodeRef} style={style} className={`rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm dark:border-gray-700 dark:bg-slate-900 ${isDragging ? 'opacity-35' : ''} ${overlay ? 'w-72 shadow-lg ring-1 ring-violet-300 dark:ring-violet-700' : ''}`}>
    <div className="flex items-start gap-1.5">
      {!overlay && <button type="button" className="shrink-0 rounded p-1 text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 active:cursor-grabbing" aria-label={`Перетащить задачу «${task.title}»`} {...attributes} {...dragListeners} onPointerDown={event => { if (draggedRef) draggedRef.current = false; onDragPointerDown?.(event) }}><GripVertical size={16} /></button>}
      <span className="min-w-0 flex-1 break-words font-medium leading-5 text-gray-900 dark:text-gray-100">{task.title}</span>
    </div>
    {!overlay && <p className="mt-1 break-words pl-7 text-[11px] leading-4 text-gray-500 dark:text-gray-400">
      {[task.root_title, task.path?.length > 1 ? task.path.at(-1) : null, task.due ? `Срок ${task.due}` : null, task.calendar_id ? 'Календарь' : null, plannerStatus(task)].filter(Boolean).join(' · ')}
    </p>}
    {!overlay && <select value="" aria-label={`Приоритет задачи «${task.title}»`} className="mt-2 w-full rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-xs font-medium text-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200" onChange={event => { if (event.target.value) onActivate?.(task, event.target.value) }}><option value="">Выбрать приоритет…</option><option value="focus">Сегодня</option><option value="next">Следующая</option><option value="waiting">Позже</option></select>}
  </article>
}

function PlannerLane({ lane, tasks }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane.id}` })
  return (
    <section
      ref={setNodeRef}
      aria-label={`${lane.label}: ${lane.description}`}
      className={`w-[calc(100vw-6.5rem)] min-w-[calc(100vw-6.5rem)] sm:w-[22rem] sm:min-w-[22rem] xl:w-auto xl:min-w-0 xl:flex-1 max-h-[calc(100vh-14rem)] overflow-y-auto rounded-2xl border p-3 transition-colors ${isOver ? 'border-gray-400 bg-gray-100/70 dark:border-gray-500 dark:bg-gray-800/80' : 'border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-900/40'}`}
    >
      <div className="mb-3 flex items-start gap-2 px-1">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${lane.accent}`} />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{lane.label} <span className="font-normal text-gray-400">{tasks.length}</span></h2>
          <p className="mt-0.5 text-[11px] leading-4 text-gray-400 dark:text-gray-500">{lane.description}</p>
        </div>
      </div>
      <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map(task => <PlannerCard key={task.id} task={task} />)}
          <div className={`min-h-12 rounded-xl border border-dashed px-3 py-3 text-center text-xs transition-colors ${isOver ? 'border-gray-400 bg-white text-gray-700 dark:border-gray-500 dark:bg-gray-900 dark:text-gray-200' : 'border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500'}`}>
            {isOver ? 'Отпустите — приоритет сохранится' : tasks.length ? 'Перетащите сюда' : 'Пусто — перетащите задачу сюда'}
          </div>
        </div>
      </SortableContext>
    </section>
  )
}

function placementFor(tasks, activeTask, overId) {
  const withoutActive = tasks.filter(task => task.id !== activeTask.id)
  const overIndex = withoutActive.findIndex(task => task.id === overId)
  const at = overIndex === -1 ? withoutActive.length : overIndex
  return [...withoutActive.slice(0, at), activeTask, ...withoutActive.slice(at)]
}

function PlannerBoard({ tasks, candidates, roots, overdue, today, onRefresh, onOpenList }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const [search, setSearch] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSection, setPickerSection] = useState('current')
  const [pickerRoot, setPickerRoot] = useState('')
  const pickerButtonRef = useRef(null)
  const searchRef = useRef(null)
  const backlogDragRef = useRef(false)
  useEffect(() => {
    if (pickerOpen) searchRef.current?.focus()
  }, [pickerOpen])
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const tasksByLane = useMemo(() => Object.fromEntries(PLANNER_LANES.map(lane => [lane.id, tasks.filter(task => task.planner_lane === lane.id)])), [tasks])
  const activeTask = tasks.find(task => task.id === activeId) || null
  const activeBacklogTask = candidates.find(task => `backlog:${task.id}` === activeId) || null
  const query = search.trim().toLocaleLowerCase('ru')
  const scopedCandidates = candidates.filter(task => !pickerRoot || task.root_id === pickerRoot)
  const sectionCounts = Object.fromEntries(PICKER_SECTIONS.map(section => [section.id, section.id === 'all'
    ? scopedCandidates.length : scopedCandidates.filter(task => candidateSection(task, today) === section.id).length]))
  const matchingCandidates = scopedCandidates.filter(task => {
    if (query) return [task.title, task.root_title, ...(task.path || []), task.due].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query)
    return pickerSection === 'all' || candidateSection(task, today) === pickerSection
  }).sort(candidateSort)

  const addBacklogTask = async (source, lane, overTaskId) => {
    if (saving || !PLANNER_LANES.some(item => item.id === lane)) return
    setSaving(true)
    setError(null)
    let createdPlacement = false
    try {
      const destination = tasksByLane[lane] || []
      const reordered = placementFor(destination, source, overTaskId)
      const orderedIds = reordered.map(task => task.id)
      const moved = await plannerApi.updateTask(source.id, { lane })
      if (moved.error) throw new Error(moved.error)
      createdPlacement = true
      const result = await plannerApi.reorder(lane, orderedIds)
      if (result.error) throw new Error(result.error)
      await onRefresh()
    } catch (requestError) {
      if (createdPlacement) {
        const cleared = await plannerApi.updateTask(source.id, null)
        if (cleared.error) requestError = new Error(`${requestError.message || 'Не удалось добавить задачу в очередь.'} Placement не удалось вернуть обратно.`)
      }
      await onRefresh()
      setError(requestError.message || 'Не удалось изменить порядок внимания.')
    } finally {
      setSaving(false)
    }
  }

  const handleDragEnd = async ({ active, over }) => {
    setActiveId(null)
    if (!over || saving || active.id === over.id) return
    const activeKey = String(active.id)
    const fromBacklog = activeKey.startsWith('backlog:')
    const sourceId = fromBacklog ? activeKey.slice('backlog:'.length) : activeKey
    const source = fromBacklog ? candidates.find(task => task.id === sourceId) : tasks.find(task => task.id === sourceId)
    if (!source) return
    const overTask = tasks.find(task => task.id === over.id)
    const lane = String(over.id).startsWith('lane:') ? String(over.id).slice(5) : overTask?.planner_lane
    if (!PLANNER_LANES.some(item => item.id === lane)) return
    if (fromBacklog) {
      backlogDragRef.current = true
      await addBacklogTask(source, lane, overTask?.id)
      return
    }

    const sourceLane = source.planner_lane
    setSaving(true)
    setError(null)
    try {
      const destination = tasksByLane[lane] || []
      const reordered = placementFor(destination, source, overTask?.id)
      const orderedIds = reordered.map(task => task.id)
      if (sourceLane === lane && orderedIds.every((id, index) => id === destination[index]?.id)) return
      if (sourceLane !== lane) {
        const moved = await plannerApi.updateTask(source.id, { lane })
        if (moved.error) throw new Error(moved.error)
      }
      const result = await plannerApi.reorder(lane, orderedIds)
      if (result.error) throw new Error(result.error)
      await onRefresh()
    } catch (requestError) {
      setError(requestError.message || 'Не удалось изменить порядок внимания.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      {error && <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-300">{error}</div>}
      <DndContext
        sensors={sensors}
        collisionDetection={plannerCollisionDetection}
        onDragStart={({ active }) => { backlogDragRef.current = String(active.id).startsWith('backlog:'); setActiveId(active.id) }}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
      <section id="start-backlog" className="mb-3 scroll-mt-6" aria-label="Выбор задач для приоритета">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Приоритеты задач</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">Положение задачи не меняет её статус.</p>
          </div>
          <button ref={pickerButtonRef} type="button" aria-expanded={pickerOpen} aria-controls="priority-picker"
            onClick={() => setPickerOpen(value => !value)}
            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-800 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
            {pickerOpen ? 'Скрыть задачи' : `Добавить задачу · ${candidates.length}`}
          </button>
        </div>
        {overdue.length > 0 && <button type="button" onClick={onOpenList} className="mt-2 text-xs font-medium text-amber-700 underline dark:text-amber-300">Просрочено: {overdue.length} · открыть список</button>}
      </section>
      <div className="relative flex min-w-0 gap-3">
        {pickerOpen && <div id="priority-picker" role="region" aria-label="Задачи без приоритета" onKeyDown={event => { if (event.key === 'Escape') { setPickerOpen(false); pickerButtonRef.current?.focus() } }} style={{ backgroundColor: 'var(--ds-page)' }} className="absolute inset-x-0 top-0 z-20 max-h-[calc(100vh-14rem)] overflow-y-auto rounded-xl border border-violet-200 p-3 shadow-xl dark:border-violet-900 sm:static sm:z-auto sm:w-64 sm:min-w-64 sm:self-start sm:shadow-none xl:w-72 xl:min-w-72">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-200">Найти задачу
            <input ref={searchRef} type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Название, сфера или дата"
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-500 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-100" />
          </label>
          <label className="mt-2 block text-xs font-medium text-gray-700 dark:text-gray-200">Сфера
            <select value={pickerRoot} onChange={event => setPickerRoot(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-slate-950">
              <option value="">Все сферы</option>
              {roots.filter(root => candidates.some(task => task.root_id === root.id)).map(root => <option key={root.id} value={root.id}>{root.title}</option>)}
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-1" aria-label="Группы задач">
            {PICKER_SECTIONS.map(section => <button key={section.id} type="button" aria-pressed={pickerSection === section.id} onClick={() => { setSearch(''); setPickerSection(section.id) }} className={`rounded-full px-2 py-1 text-[11px] font-medium ${pickerSection === section.id ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'}`}>{section.label} {sectionCounts[section.id]}</button>)}
          </div>
          <p role="status" className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">Найдено: {matchingCandidates.length}</p>
          <div className="mt-2 max-h-[calc(100vh-21rem)] space-y-1.5 overflow-y-auto">
            {matchingCandidates.map(task => <div id={`backlog-${task.id}`} key={task.id} className="scroll-mt-6">
              <BacklogCard task={task} draggedRef={backlogDragRef} onActivate={(item, lane) => addBacklogTask(item, lane)} />
            </div>)}
          </div>
          {matchingCandidates.length === 0 && <p className="mt-2 text-sm text-gray-500">{candidates.length ? 'В этой группе задач нет. Выберите «Все» или измените поиск.' : 'Все незавершённые личные задачи уже распределены.'}</p>}
        </div>}
        <div className="flex min-w-0 flex-1 gap-4 overflow-x-auto pb-4">
          {PLANNER_LANES.map(lane => <PlannerLane key={lane.id} lane={lane} tasks={tasksByLane[lane.id] || []} />)}
        </div>
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <PlannerCard task={activeTask} overlay /> : activeBacklogTask ? <BacklogCard task={activeBacklogTask} overlay /> : null}</DragOverlay>
      </DndContext>
      {saving && <p aria-live="polite" className="mt-4 text-xs text-gray-400">Сохраняю порядок внимания…</p>}
    </>
  )
}

function IconList() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="3" width="13" height="1.5" rx="0.75" fill="currentColor"/>
      <rect x="1" y="7" width="13" height="1.5" rx="0.75" fill="currentColor"/>
      <rect x="1" y="11" width="13" height="1.5" rx="0.75" fill="currentColor"/>
    </svg>
  )
}

function IconKanban() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="3.5" height="13" rx="1" fill="currentColor"/>
      <rect x="5.75" y="1" width="3.5" height="9" rx="1" fill="currentColor"/>
      <rect x="10.5" y="1" width="3.5" height="11" rx="1" fill="currentColor"/>
    </svg>
  )
}

export default function Pool({ sphere: rootFilter }) {
  const location = useLocation()
  const navigate = useNavigate()
  const initialView = parseWorkView(location.search)
  const [allLeaves, setAllLeaves] = useState([])
  const [plannerTasks, setPlannerTasks] = useState([])
  const [roots, setRoots]         = useState([])
  const [group, setGroup]         = useState(initialView.sort === 'suggested' ? 'flat' : 'domain')
  const [viewState, setViewState] = useState(initialView)
  const [view, setView]             = useState(initialView.view === 'queue' ? 'kanban' : 'list')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading]       = useState(true)

  const [now, setNow] = useState(() => new Date())
  const [loadError, setLoadError] = useState(null)
  const [queueUnavailable, setQueueUnavailable] = useState(false)
  const revision = useRef(0)
  const load = useCallback(async () => {
    const request = ++revision.current
    const [leavesResult, treeResult, queueResult] = await Promise.allSettled([treeApi.leaves(), treeApi.all(), plannerApi.queue()])
    if (request !== revision.current) return
    setLoading(false)
    if (!Array.isArray(treeResult.value) || !Array.isArray(leavesResult.value)) {
      setLoadError('Не удалось загрузить задачи.')
      return
    }
    setLoadError(null)
    setAllLeaves(leavesResult.value.filter(n => n.status !== 'done' && n.status !== 'dropped'))
    setRoots(treeResult.value.filter(n => !n.parent_id && (n.work_context || 'personal') === viewState.context))
    const tasks = queueResult.value?.tasks
    setQueueUnavailable(!Array.isArray(tasks))
    setPlannerTasks(Array.isArray(tasks) ? tasks : [])
  }, [viewState.context])

  useEffect(() => { load(); return () => { revision.current++ } }, [load])
  useEffect(() => {
    const next = parseWorkView(location.search)
    setViewState(next)
    setView(next.view === 'queue' ? 'kanban' : 'list')
  }, [location.search])
  useEffect(() => {
    if (!rootFilter) return
    const next = { ...parseWorkView(location.search), roots: [rootFilter] }
    const search = workViewSearch(next)
    if (search !== location.search.slice(1)) navigate({ pathname: '/pool', search: `?${search}` })
  }, [rootFilter, location.search, navigate])

  const contextLeaves = allLeaves.filter(n => (n.work_context || 'personal') === viewState.context && (view === 'kanban' || !n.calendar_id))
  const active = filterAndRank(contextLeaves, viewState)
  const withoutStatus = filterAndRank(contextLeaves, { ...viewState, statuses: [], blocked: null })
  const allSpheresCount = filterAndRank(contextLeaves, { ...viewState, roots: [] }).length
  const statusTab = viewState.blocked === true ? 'blocked' : viewState.statuses[0] || 'all'
  const filterRoot = viewState.roots[0] || null
  const updateView = patch => {
    const next = { ...viewState, ...patch }
    setViewState(next)
    const search = workViewSearch(next)
    navigate({ pathname: '/pool', search: search ? `?${search}` : '' })
  }
  const visiblePlannerTasks = useMemo(
    () => plannerTasks.filter(task => PLANNER_LANES.some(lane => lane.id === task.planner_lane) && (!viewState.roots.length || viewState.roots.includes(task.root_id))),
    [plannerTasks, viewState.roots],
  )
  const visibleInventoryTasks = useMemo(
    () => contextLeaves.filter(task => !viewState.roots.length || viewState.roots.includes(task.root_id)),
    [contextLeaves, viewState.roots],
  )
  usePlanningRefresh(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime(), setNow, load)
  const visibleBacklogCandidates = useMemo(() => visibleInventoryTasks.filter(task =>
    !task.planner && ['undefined', 'scheduled', 'in_progress', 'someday'].includes(task.status || 'undefined')
  ).sort((left, right) => left.title.localeCompare(right.title, 'ru')), [visibleInventoryTasks])
  const visibleOverdueTasks = overdueTasks(visibleInventoryTasks, localDay(now))
  const totalTaskCount = contextLeaves.length
  useEffect(() => {
    if (view !== 'kanban' || loading || !location.hash) return
    const target = document.getElementById(location.hash.slice(1))
    target?.scrollIntoView({ block: 'start' })
  }, [view, loading, location.hash, visibleBacklogCandidates])

  const renderGroups = () => {
    if (group === 'domain') {
      return roots.map(root => (
        <ListGroup
          key={root.id}
          label={root.title}
          color={root.color}
          items={active.filter(n => n.root_id === root.id)}
          onUpdate={load}
        />
      ))
    }
    if (group === 'status') {
      return Object.entries(STATUS_LABELS).map(([s, label]) => (
        <ListGroup
          key={s}
          label={label}
          items={active.filter(n => (n.status || 'undefined') === s)}
          onUpdate={load}
        />
      ))
    }
    return (
      <div>
        {active.map(n => <NodeCard key={n.id} node={n} onUpdate={load} />)}
      </div>
    )
  }

  return (
    <div className={`pool-page ${view === 'kanban' ? 'py-8 px-6' : 'max-w-3xl mx-auto py-8 px-6'}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="pool-kicker">Life OS · {view === 'kanban' ? 'приоритеты' : 'задачи'}</p>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Задачи</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button
              onClick={() => { setView('list'); updateView({ view: 'list' }) }}
              className={`px-2.5 py-1.5 transition-colors ${
                view === 'list'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-900 text-gray-400 hover:text-gray-600'
              }`}
              title="Список"
            >
              <IconList />
            </button>
            <button
            onClick={() => {
              setView('kanban')
              setFiltersOpen(false)
              updateView({
                context: 'personal',
                view: 'queue',
                roots: viewState.context === 'personal' ? viewState.roots : [],
                statuses: [],
                blocked: null,
                ready: false,
                owner: '',
                task: '',
              })
            }}
              className={`px-2.5 py-1.5 transition-colors border-l border-gray-200 dark:border-gray-700 ${
                view === 'kanban'
                  ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900'
                  : 'bg-white dark:bg-gray-900 text-gray-400 hover:text-gray-600'
              }`}
              title="Приоритеты"
            >
              <IconKanban />
            </button>
          </div>
          {view === 'list' && <button onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} className={`pool-filter-button ${filtersOpen ? 'is-open' : ''}`}><SlidersHorizontal size={14} />Фильтры{statusTab !== 'all' && <span>•</span>}</button>}
        </div>
      </div>

      {/* Domain filter pills */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto whitespace-nowrap sm:flex-wrap sm:overflow-visible">
        <button
          onClick={() => updateView({ roots: [] })}
          className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !filterRoot ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Все сферы ({view === 'kanban' ? totalTaskCount : allSpheresCount})
        </button>
        {roots.map(root => {
          const count = view === 'kanban'
            ? contextLeaves.filter(n => n.root_id === root.id).length
            : filterAndRank(contextLeaves, { ...viewState, roots: [root.id] }).length
          if (count === 0) return null
          const isActive = filterRoot === root.id
          return (
            <button
              key={root.id}
              onClick={() => updateView({ roots: isActive ? [] : [root.id] })}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isActive ? 'text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
              }`}
              style={isActive ? { backgroundColor: root.color } : {}}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isActive ? 'var(--ds-on-accent)' : root.color }} />
              {root.title} {count}
            </button>
          )
        })}
      </div>

      {view === 'list' && statusTab !== 'all' && <div className="mb-3 flex flex-wrap items-center gap-3 text-sm" role="status"><span className="font-medium">{STATUS_TABS.find(tab => tab.id === statusTab)?.label || statusTab} · {active.length}</span><button type="button" className="text-blue-600 underline dark:text-blue-400" onClick={() => updateView({ statuses: [], blocked: null })}>Снять фильтр статуса</button></div>}

      {filtersOpen && <div className="pool-filter-panel space-y-2">{view === 'list' && <label>Группировка<select value={group} onChange={e => setGroup(e.target.value)}>{GROUP_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}<label className="block text-xs text-gray-500">Контекст<select value={viewState.context} onChange={e => updateView({ context: e.target.value, roots: [], statuses: [], task: '' })}><option value="personal">Личное</option><option value="delivery">Delivery</option></select></label><label className="block text-xs text-gray-500">Поиск<input value={viewState.q} onChange={e => updateView({ q: e.target.value })} className="ml-2 rounded border px-1" /></label>{viewState.context === 'delivery' && <><label className="block text-xs text-gray-500">Исполнитель<input value={viewState.owner} onChange={e => updateView({ owner: e.target.value })} className="ml-2 rounded border px-1" /></label><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={viewState.ready} onChange={e => updateView({ ready: e.target.checked })} />Только готовые</label><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={viewState.sort === 'suggested'} onChange={e => updateView({ sort: e.target.checked ? 'suggested' : 'default' })} />Рекомендованный порядок</label></>}<button onClick={() => updateView({ ...parseWorkView(''), context: viewState.context })}><X size={13} />Сбросить</button></div>}
      {/* Status filter tabs are secondary controls, revealed with Filters. */}
      {view === 'list' && filtersOpen && (
        <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-gray-800">
          {STATUS_TABS.map(tab => {
            const count = tab.id === 'all'
              ? withoutStatus.length
              : tab.id === 'blocked' ? withoutStatus.filter(n => n.is_blocked).length : withoutStatus.filter(n => (n.status || 'undefined') === tab.id).length
            if (tab.id !== 'all' && count === 0 && statusTab !== tab.id) return null
            return (
              <button
                key={tab.id}
                onClick={() => updateView({ statuses: tab.id === 'all' || tab.id === 'blocked' ? [] : [tab.id], blocked: tab.id === 'blocked' ? true : null })}
                className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  statusTab === tab.id
                    ? 'border-gray-900 dark:border-white text-gray-900 dark:text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tab.label}
                {count > 0 && <span className="ml-1.5 text-[10px] opacity-60">{count}</span>}
              </button>
            )
          })}
        </div>
      )}

      {loadError ? <p role="alert">{loadError} <button className="underline" onClick={load}>Повторить</button></p> : loading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : view === 'kanban' && queueUnavailable ? (
        <p role="alert">Не удалось загрузить ручную очередь. <button className="underline" onClick={load}>Повторить</button></p>
      ) : view === 'kanban' ? (
        <PlannerBoard tasks={visiblePlannerTasks} candidates={visibleBacklogCandidates} roots={roots} overdue={visibleOverdueTasks} today={localDay(now)} onRefresh={load} onOpenList={() => { setView('list'); updateView({ view: 'list' }) }} />
      ) : active.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 px-5 py-8 text-center dark:border-gray-700">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Задач пока нет</p>
          <p className="mt-1 text-xs text-gray-400">Создай первый шаг в «Целях» или через быстрый захват ⌘K.</p>
        </div>
      ) : (
        <>{viewState.context === 'delivery' && viewState.sort === 'suggested' && <div className="mb-4 rounded-xl border border-cyan-100 bg-cyan-50 px-4 py-3 text-xs text-cyan-900 dark:border-cyan-900 dark:bg-cyan-950/30 dark:text-cyan-100"><b>Рекомендованный порядок</b><p className="mt-1">Это read-only подсказка: порядок объясняется готовностью, handoff и совпадением с запросом. Она не выбирает и не изменяет задачи.</p></div>}{viewState.task && <div className="mb-4 text-xs text-gray-500">Текущая задача сессии: {active.find(node => node.id === viewState.task)?.title || 'не входит в эту выборку'}. В URL может быть только одна такая задача.</div>}{renderGroups()}</>
      )}
    </div>
  )
}
