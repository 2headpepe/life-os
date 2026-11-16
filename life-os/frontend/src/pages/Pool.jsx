import { useState, useEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { tree as treeApi, planner as plannerApi } from '../api'
import NodeCard from '../components/NodeCard'
import { Clock3, GripVertical, Link2, SlidersHorizontal, X } from 'lucide-react'
import { overdueTasks, starterBacklog } from '../utils/activeWork'
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
  { id: 'focus', label: 'Сейчас', description: 'то, над чем работаешь прямо сейчас', accent: 'bg-violet-500' },
  { id: 'next', label: 'Следующая', description: 'следом, когда закончишь текущую работу', accent: 'bg-sky-500' },
  { id: 'waiting', label: 'Ожидание', description: 'вернёмся после ответа, события или решения', accent: 'bg-amber-500' },
]

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

function PlannerCard({ task, onUpdate, overlay = false }) {
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
      className={`relative ${isDragging ? 'opacity-35' : ''} ${overlay ? 'w-72 shadow-lg ring-1 ring-gray-300 dark:ring-gray-600' : ''}`}
    >
      {!overlay && (
        <div className="mb-1 flex items-center px-1">
          <button
            type="button"
            className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 active:cursor-grabbing dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
            aria-label={`Перетащить задачу «${task.title}»`}
            onClick={event => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={15} />
            Перетащить
          </button>
        </div>
      )}
      <NodeCard node={task} onUpdate={onUpdate} allowTitleWrap />
      <div className="-mt-1 mb-2 flex flex-wrap items-center gap-1.5 px-3 text-[11px] text-gray-500 dark:text-gray-400">
        <span className={`rounded-full px-2 py-0.5 ${task.is_blocked ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' : 'bg-gray-100 dark:bg-gray-800'}`}>{plannerStatus(task)}</span>
        {task.root_title && <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-800">{task.root_title}</span>}
        {urgency && <span className={task.planner?.urgency === 'urgent' ? 'font-medium text-rose-600 dark:text-rose-400' : ''}>{urgency}</span>}
        {task.is_blocked && <span className="flex items-center gap-1"><Link2 size={12} />зависимость</span>}
        {task.planner?.follow_up_on && <span className="flex items-center gap-1"><Clock3 size={12} />{task.planner.follow_up_on}</span>}
      </div>
    </article>
  )
}

function BacklogCard({ task, onActivate, onUpdate, overlay = false, draggedRef }) {
  const { attributes, listeners = {}, setNodeRef, transform, transition, isDragging } = useDraggable({ id: `backlog:${task.id}`, disabled: overlay })
  const { onPointerDown: onDragPointerDown, ...dragListeners } = listeners
  const style = overlay ? undefined : {
    transform: CSS.Translate.toString(transform),
    transition,
  }
  return <article ref={overlay ? undefined : setNodeRef} style={style} className={`${isDragging ? 'opacity-35' : ''} ${overlay ? 'w-72 shadow-lg ring-1 ring-violet-300 dark:ring-violet-700' : ''}`}>
    {!overlay && <div className="mb-1 flex items-center px-1"><button type="button" className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 active:cursor-grabbing dark:text-violet-200 dark:hover:bg-violet-950/50" aria-label={`Перетащить задачу «${task.title}» в активную очередь`} {...attributes} {...dragListeners} onPointerDown={event => { if (draggedRef) draggedRef.current = false; onDragPointerDown?.(event) }} onClick={event => { event.stopPropagation(); if (draggedRef?.current) { draggedRef.current = false; return } onActivate?.(task) }}><GripVertical size={15} />В «Сейчас»</button></div>}
    <NodeCard node={task} onUpdate={onUpdate} allowTitleWrap />
  </article>
}

function PlannerLane({ lane, tasks, onUpdate }) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane:${lane.id}` })
  return (
    <section
      ref={setNodeRef}
      aria-label={`${lane.label}: ${lane.description}`}
      className={`w-[22rem] min-w-[22rem] max-h-[calc(100vh-14rem)] overflow-y-auto rounded-2xl border p-3 transition-colors ${isOver ? 'border-gray-400 bg-gray-100/70 dark:border-gray-500 dark:bg-gray-800/80' : 'border-gray-200 bg-gray-50/70 dark:border-gray-800 dark:bg-gray-900/40'}`}
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
          {tasks.map(task => <PlannerCard key={task.id} task={task} onUpdate={onUpdate} />)}
          <div className={`min-h-12 rounded-xl border border-dashed px-3 py-3 text-center text-xs transition-colors ${isOver ? 'border-gray-400 bg-white text-gray-700 dark:border-gray-500 dark:bg-gray-900 dark:text-gray-200' : 'border-gray-200 text-gray-400 dark:border-gray-700 dark:text-gray-500'}`}>
            {isOver ? 'Отпустите — задача окажется в этой очереди' : tasks.length ? 'Перетащите сюда' : 'Пусто — перетащите задачу сюда'}
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

function overdueDateLabel(due) {
  return new Date(`${due}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function PlannerBoard({ tasks, candidates, inProgressCount, overdue, onRefresh, onOpenList }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [activeId, setActiveId] = useState(null)
  const backlogDragRef = useRef(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const tasksByLane = useMemo(() => Object.fromEntries(PLANNER_LANES.map(lane => [lane.id, tasks.filter(task => task.planner_lane === lane.id)])), [tasks])
  const activeQueueCount = PLANNER_LANES.reduce((count, lane) => count + tasksByLane[lane.id].length, 0)
  const activeTask = tasks.find(task => task.id === activeId) || null
  const activeBacklogTask = candidates.find(task => `backlog:${task.id}` === activeId) || null
  const stateDescription = tasksByLane.focus.length
    ? `Сейчас выбрано: ${tasksByLane.focus.length}. «Следующая» и «Ожидание» помогают не потерять продолжение и возвращения.`
    : activeQueueCount
      ? 'В очереди есть задачи, но ни одна не назначена на сейчас. Перетащи подходящую задачу в «Сейчас», когда начнёшь её.'
      : inProgressCount
        ? 'Задачи уже имеют статус «В работе», но не попали в ручной порядок. Ниже можно открыть их и добавить в очередь.'
        : 'В очереди пока ничего нет. Бэклог ниже поможет выбрать следующий шаг.'
  const hasCurrentWork = tasksByLane.focus.length > 0
  const hasStateSummary = !hasCurrentWork || activeQueueCount > 0 || inProgressCount > 0 || overdue.length > 0

  const addBacklogTask = async (source, lane, overTaskId) => {
    if (saving || !PLANNER_LANES.some(item => item.id === lane)) return
    setSaving(true)
    setError(null)
    let changedStatus = false
    let createdPlacement = false
    try {
      const destination = tasksByLane[lane] || []
      const reordered = placementFor(destination, source, overTaskId)
      const orderedIds = reordered.map(task => task.id)
      if (source.status !== 'in_progress') {
        const started = await treeApi.update(source.id, { status: 'in_progress' })
        if (started.error) throw new Error(started.error)
        changedStatus = true
      }
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
      if (changedStatus) {
        const rollback = await treeApi.update(source.id, { status: source.status || 'undefined' })
        if (rollback.error) requestError = new Error(`${requestError.message || 'Не удалось добавить задачу в очередь.'} Статус «В работе» не удалось вернуть обратно.`)
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
      <section id="start-backlog" className="mb-5 scroll-mt-6 w-[68rem] max-w-full rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 px-5 py-5 dark:border-violet-900/60 dark:bg-violet-950/20" aria-live="polite" aria-labelledby="active-work-state-heading">
        {hasStateSummary && <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl"><p className="text-sm font-semibold text-violet-950 dark:text-violet-100">{!hasCurrentWork ? 'Активная работа ещё не выбрана' : 'Активная работа'}</p><p className="mt-1 text-sm text-violet-800/80 dark:text-violet-200/80">{stateDescription}{overdue.length ? ' Просроченные задачи отмечены отдельно: они не становятся «Сейчас» автоматически.' : ''}</p></div>
          <div className="flex flex-wrap gap-2 text-xs font-medium">
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-violet-900 dark:bg-slate-900/70 dark:text-violet-100">В очереди: {activeQueueCount}</span>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-violet-900 dark:bg-slate-900/70 dark:text-violet-100">В работе: {inProgressCount}</span>
            <span className={`rounded-full px-2.5 py-1 ${overdue.length ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' : 'bg-white/70 text-violet-900 dark:bg-slate-900/70 dark:text-violet-100'}`}>Просрочено: {overdue.length}</span>
          </div>
        </div>}
        {overdue.length > 0 && <aside className="mt-4 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-3 text-sm dark:border-amber-900/60 dark:bg-amber-950/20" aria-label="Просроченные задачи">
          <p className="font-medium text-amber-950 dark:text-amber-100">Просрочены</p>
          <div className="mt-2 flex flex-wrap gap-2">{overdue.slice(0, 3).map(task => <span key={task.id} className="rounded-lg bg-white/80 px-2 py-1 text-xs text-amber-950 dark:bg-slate-900/70 dark:text-amber-100">{task.title} · до {overdueDateLabel(task.due)}</span>)}{overdue.length > 3 && <button type="button" onClick={onOpenList} className="px-1 text-xs font-medium text-amber-900 underline-offset-2 hover:underline dark:text-amber-100">Ещё {overdue.length - 3} в списке</button>}</div>
        </aside>}
        <div className={`${hasStateSummary || overdue.length ? 'mt-5 border-t border-violet-200/80 pt-4 dark:border-violet-900/60' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 id="active-work-state-heading" className="text-sm font-semibold text-violet-950 dark:text-violet-100">Бэклог для старта</h2><p className="mt-0.5 text-xs text-violet-800/80 dark:text-violet-200/80">Нажми «В Сейчас» или перетащи задачу в «Сейчас», «Следующая» либо «Ожидание» — она автоматически станет «В работе» и попадёт в выбранную очередь. Это варианты по статусу и сроку, а не автоматический приоритет.</p></div>
            <button type="button" onClick={onOpenList} className="text-xs font-medium text-violet-800 underline-offset-2 hover:underline dark:text-violet-200">Открыть весь список</button>
          </div>
          {candidates.length > 0 ? <div className="mt-3 grid gap-3 lg:grid-cols-3">{candidates.map(task => <div id={`backlog-${task.id}`} key={task.id} className="scroll-mt-6 rounded-xl bg-white/60 p-1 dark:bg-slate-950/30"><BacklogCard task={task} draggedRef={backlogDragRef} onActivate={item => addBacklogTask(item, 'focus')} onUpdate={onRefresh} /></div>)}</div> : <p className="mt-3 text-sm text-violet-800/80 dark:text-violet-200/80">В личном списке нет незавершённых задач, которые можно поставить в работу.</p>}
        </div>
      </section>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PLANNER_LANES.map(lane => <PlannerLane key={lane.id} lane={lane} tasks={tasksByLane[lane.id] || []} onUpdate={onRefresh} />)}
      </div>
      <DragOverlay dropAnimation={null}>{activeTask ? <PlannerCard task={activeTask} onUpdate={() => {}} overlay /> : activeBacklogTask ? <BacklogCard task={activeBacklogTask} onUpdate={() => {}} overlay /> : null}</DragOverlay>
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

  const load = async () => {
    const [leaves, nodes, plannerQueue] = await Promise.all([treeApi.leaves(), treeApi.all(), plannerApi.queue()])
    setAllLeaves(leaves.filter(n => n.status !== 'done' && n.status !== 'dropped' && !n.calendar_id))
    setRoots(nodes.filter(n => !n.parent_id && (n.work_context || 'personal') === viewState.context))
    if (!plannerQueue.error) setPlannerTasks(plannerQueue.tasks || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [viewState.context])
  useEffect(() => {
    const next = parseWorkView(location.search)
    setViewState(next)
    setView(next.view === 'queue' ? 'kanban' : 'list')
  }, [location.search])
  useEffect(() => {
    const search = workViewSearch(viewState)
    if (search !== location.search.slice(1)) navigate({ pathname: '/pool', search: search ? `?${search}` : '' }, { replace: true })
  }, [viewState, location.search, navigate])
  useEffect(() => { if (rootFilter) setViewState(current => ({ ...current, roots: [rootFilter] })) }, [rootFilter])

  const contextLeaves = allLeaves.filter(n => (n.work_context || 'personal') === viewState.context)
  const active = filterAndRank(contextLeaves, viewState)
  const byDomain = active
  const statusTab = viewState.statuses[0] || 'all'
  const filterRoot = viewState.roots[0] || null
  const updateView = patch => setViewState(current => ({ ...current, ...patch }))
  const visiblePlannerTasks = useMemo(
    () => plannerTasks.filter(task => PLANNER_LANES.some(lane => lane.id === task.planner_lane) && (!viewState.roots.length || viewState.roots.includes(task.root_id))),
    [plannerTasks, viewState.roots],
  )
  const visibleInventoryTasks = useMemo(
    () => contextLeaves.filter(task => !viewState.roots.length || viewState.roots.includes(task.root_id)),
    [contextLeaves, viewState.roots],
  )
  const visibleBacklogCandidates = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return starterBacklog(visibleInventoryTasks, today, { excludeIds: new Set(visiblePlannerTasks.map(task => task.id)) })
  }, [visibleInventoryTasks, visiblePlannerTasks])
  const visibleOverdueTasks = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return overdueTasks(visibleInventoryTasks, today)
  }, [visibleInventoryTasks])
  const inProgressCount = useMemo(
    () => visibleInventoryTasks.filter(task => task.status === 'in_progress').length,
    [visibleInventoryTasks],
  )
  const visibleTaskCount = view === 'kanban'
    ? visibleInventoryTasks.length
    : contextLeaves.length
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
          <p className="pool-kicker">Life OS · {view === 'kanban' ? 'активная работа' : 'рабочий поток'}</p>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Задачи</h1>
          {view === 'kanban' && <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Активная работа: что делаешь сейчас, что пойдёт следующей и к чему нужно вернуться. Для полос прокручивай доску по горизонтали.</p>}
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
              title="Ручная очередь"
            >
              <IconKanban />
            </button>
          </div>
          {view === 'list' && <button onClick={() => setFiltersOpen(v => !v)} aria-expanded={filtersOpen} className={`pool-filter-button ${filtersOpen ? 'is-open' : ''}`}><SlidersHorizontal size={14} />Фильтры{statusTab !== 'all' && <span>•</span>}</button>}
        </div>
      </div>

      {/* Domain filter pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => updateView({ roots: [] })}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
            !filterRoot ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200'
          }`}
        >
          Все ({view === 'kanban' ? totalTaskCount : visibleTaskCount})
        </button>
        {roots.map(root => {
          const count = contextLeaves.filter(n => n.root_id === root.id).length
          if (count === 0) return null
          const isActive = filterRoot === root.id
          return (
            <button
              key={root.id}
              onClick={() => updateView({ roots: isActive ? [] : [root.id] })}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
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

      {filtersOpen && <div className="pool-filter-panel space-y-2">{view === 'list' && <label>Группировка<select value={group} onChange={e => setGroup(e.target.value)}>{GROUP_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>}<label className="block text-xs text-gray-500">Контекст<select value={viewState.context} onChange={e => updateView({ context: e.target.value, roots: [], statuses: [], task: '' })}><option value="personal">Личное</option><option value="delivery">Delivery</option></select></label><label className="block text-xs text-gray-500">Поиск<input value={viewState.q} onChange={e => updateView({ q: e.target.value })} className="ml-2 rounded border px-1" /></label>{viewState.context === 'delivery' && <><label className="block text-xs text-gray-500">Исполнитель<input value={viewState.owner} onChange={e => updateView({ owner: e.target.value })} className="ml-2 rounded border px-1" /></label><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={viewState.ready} onChange={e => updateView({ ready: e.target.checked })} />Только готовые</label><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={viewState.sort === 'suggested'} onChange={e => updateView({ sort: e.target.checked ? 'suggested' : 'default' })} />Рекомендованный порядок</label></>}<button onClick={() => updateView({ ...parseWorkView(''), context: viewState.context })}><X size={13} />Сбросить</button></div>}
      {/* Status filter tabs are secondary controls, revealed with Filters. */}
      {view === 'list' && filtersOpen && (
        <div className="flex gap-1 mb-6 border-b border-gray-100 dark:border-gray-800">
          {STATUS_TABS.map(tab => {
            const count = tab.id === 'all'
              ? byDomain.length
              : tab.id === 'blocked' ? byDomain.filter(n => n.is_blocked).length : byDomain.filter(n => (n.status || 'undefined') === tab.id).length
            if (tab.id !== 'all' && count === 0) return null
            return (
              <button
                key={tab.id}
                onClick={() => updateView({ statuses: tab.id === 'all' ? [] : [tab.id], blocked: tab.id === 'blocked' ? true : null })}
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

      {loading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : view === 'kanban' ? (
        <PlannerBoard tasks={visiblePlannerTasks} candidates={visibleBacklogCandidates} inProgressCount={inProgressCount} overdue={visibleOverdueTasks} onRefresh={load} onOpenList={() => { setView('list'); updateView({ view: 'list' }) }} />
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
