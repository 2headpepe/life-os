import { Minus, Plus, RotateCcw, Search, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

const STAGES = [
  { id: 'session', label: 'Сессии', types: ['session'], color: '#377fbe' },
  { id: 'signal', label: 'Сигналы и гипотезы', types: ['observation', 'evidence_group', 'hypothesis', 'problem'], color: '#7450bc' },
  { id: 'verification', label: 'Проверки', types: ['verification'], color: '#df8d08' },
  { id: 'decision', label: 'Решения', types: ['decision'], color: '#0b8296' },
  { id: 'delivery', label: 'Поставки', types: ['design', 'delivery'], color: '#718394' },
  { id: 'effect', label: 'Эффекты', types: ['effect'], color: '#189b73' },
]

const stageFor = type => STAGES.findIndex(stage => stage.types.includes(type))
const needsCheck = record => /провер|needs_verification|not_verifiable/i.test(`${record.status || ''} ${record.next || ''}`)

export default function ProductGraph({ records }) {
  const [selectedId, setSelectedId] = useState(null)
  const [query, setQuery] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [tooltip, setTooltip] = useState(null)
  const drag = useRef(null)
  const board = useRef(null)

  const graph = useMemo(() => {
    const visibleRecords = records.filter(record => record.visibility !== 'collapsed')
    const byId = Object.fromEntries(visibleRecords.map(record => [record.id, record]))
    const edges = []
    const seen = new Set()
    const addEdge = (from, to) => {
      if (!byId[from] || !byId[to] || from === to) return
      const key = `${from}|${to}`
      if (seen.has(key)) return
      seen.add(key); edges.push({ from, to })
    }
    visibleRecords.forEach(record => {
      ;(record.links || []).forEach(id => addEdge(record.id, id))
      ;(record.sources || []).filter(source => byId[source]).forEach(source => addEdge(source, record.id))
    })
    const buckets = STAGES.map(() => [])
    visibleRecords.forEach(record => buckets[Math.max(0, stageFor(record.type))].push(record))
    const height = Math.max(720, Math.max(...buckets.map(bucket => Math.ceil(bucket.length / 4) * 56 + 160)))
    const positions = {}
    buckets.forEach((bucket, stageIndex) => {
      const columns = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(bucket.length || 1))))
      bucket.forEach((record, index) => {
        const column = index % columns
        const row = Math.floor(index / columns)
        positions[record.id] = { x: stageIndex * 230 + 78 + column * 42, y: 144 + row * 56 }
      })
    })
    return { byId, edges, positions, width: STAGES.length * 230, height, records: visibleRecords }
  }, [records])

  const selected = graph.byId[selectedId]
  const related = selected ? graph.edges.filter(edge => edge.from === selected.id || edge.to === selected.id).map(edge => graph.byId[edge.from === selected.id ? edge.to : edge.from]) : []
  const active = selected ? new Set([selected.id, ...related.map(record => record.id)]) : null
  const search = query.trim().toLocaleLowerCase('ru')
  const matches = search ? new Set(graph.records.filter(record => `${record.title} ${record.summary}`.toLocaleLowerCase('ru').includes(search)).map(record => record.id)) : null
  const viewWidth = graph.width / zoom
  const viewHeight = graph.height / zoom
  const viewBox = `${(graph.width - viewWidth) / 2 + pan.x} ${(graph.height - viewHeight) / 2 + pan.y} ${viewWidth} ${viewHeight}`

  const showTooltip = (record, event) => {
    const rect = board.current.getBoundingClientRect()
    setTooltip({ record, x: Math.min(rect.width - 248, event.clientX - rect.left + 14), y: Math.max(12, event.clientY - rect.top - 76) })
  }
  const moveBy = event => {
    if (!drag.current) return
    const rect = board.current.getBoundingClientRect()
    setPan({ x: drag.current.pan.x - (event.clientX - drag.current.x) * graph.width / rect.width / zoom, y: drag.current.pan.y - (event.clientY - drag.current.y) * graph.height / rect.height / zoom })
  }
  const focus = record => {
    const position = graph.positions[record.id]
    if (position) setPan({ x: position.x - graph.width / 2, y: position.y - graph.height / 2 })
    setSelectedId(record.id)
  }

  return <section className="rounded-3xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
    <header className="flex flex-wrap items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800 md:px-6">
      <div className="mr-auto"><p className="text-xs font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Полный граф</p><p className="mt-1 text-sm text-gray-500">{graph.records.length} на полотне · {records.length - graph.records.length} свёрнуто как доказательства · {graph.edges.length} связей</p></div>
      <label className="relative order-3 w-full sm:order-none sm:w-64"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти сущность" className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-gray-700 dark:bg-gray-950" /></label>
      <div className="flex items-center gap-1"><button onClick={() => setZoom(value => Math.max(.55, value - .15))} className="rounded-lg border border-gray-200 p-2 hover:bg-cyan-50 dark:border-gray-700 dark:hover:bg-cyan-950/40" aria-label="Отдалить"><Minus size={16} /></button><span className="min-w-12 text-center text-xs text-gray-500">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(value => Math.min(2.1, value + .15))} className="rounded-lg border border-gray-200 p-2 hover:bg-cyan-50 dark:border-gray-700 dark:hover:bg-cyan-950/40" aria-label="Приблизить"><Plus size={16} /></button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} className="ml-1 rounded-lg border border-gray-200 p-2 hover:bg-cyan-50 dark:border-gray-700 dark:hover:bg-cyan-950/40" aria-label="Сбросить масштаб"><RotateCcw size={15} /></button></div>
    </header>
    <div className="flex min-h-[620px]">
      <div ref={board} className={`relative min-w-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,_rgb(226_232_240)_1px,_transparent_1.2px)] bg-[length:18px_18px] ${drag.current ? 'cursor-grabbing' : 'cursor-grab'}`} onWheel={event => { event.preventDefault(); setZoom(value => Math.max(.55, Math.min(2.1, value + (event.deltaY < 0 ? .1 : -.1)))) }} onPointerDown={event => { if (event.target.closest('[data-graph-node]')) return; drag.current = { x: event.clientX, y: event.clientY, pan }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={moveBy} onPointerUp={() => { drag.current = null }}>
        <svg viewBox={viewBox} className="h-[620px] w-full touch-none" role="img" aria-label="Граф сессий, гипотез, проверок, решений, поставок и эффектов">
          {STAGES.map((stage, index) => <g key={stage.id}><rect x={index * 230 + 6} y="34" width="218" height={graph.height - 68} rx="16" fill={stage.color} opacity="0.035" stroke="#dbe5ea" /><text x={index * 230 + 22} y="76" fill="#6b7f8d" fontSize="12" fontWeight="700" letterSpacing=".8">{stage.label.toUpperCase()}</text></g>)}
          {graph.edges.map(edge => { const from = graph.positions[edge.from]; const to = graph.positions[edge.to]; const isActive = active?.has(edge.from) && active?.has(edge.to); return <line key={`${edge.from}-${edge.to}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={isActive ? '#0b8296' : '#b8c9d3'} strokeWidth={isActive ? 2.6 : 1.5} opacity={active && !isActive ? .16 : .78} /> })}
          {graph.records.map(record => { const position = graph.positions[record.id]; const stage = STAGES[Math.max(0, stageFor(record.type))]; const highlighted = !active || active.has(record.id); const found = !matches || matches.has(record.id); const isSelected = selected?.id === record.id; const pending = needsCheck(record); return <g key={record.id} data-graph-node className="cursor-pointer" transform={`translate(${position.x} ${position.y})`} opacity={highlighted && found ? 1 : .13} onMouseEnter={event => showTooltip(record, event)} onMouseLeave={() => setTooltip(null)} onClick={() => setSelectedId(record.id)} onKeyDown={event => event.key === 'Enter' && setSelectedId(record.id)} tabIndex="0" role="button" aria-label={record.title}>
            {pending && <circle r="12" fill="none" stroke="#df8d08" strokeWidth="2.5" strokeDasharray="2 3" />}
            <circle r={isSelected ? 10 : 7} fill={stage.color} stroke={isSelected ? '#102a43' : '#fff'} strokeWidth={isSelected ? 3 : 2} />
            {isSelected && <text x="17" y="-13" fill="#102a43" fontSize="12" fontWeight="650" stroke="#fff" strokeWidth="5" paintOrder="stroke">{record.title}</text>}
          </g> })}
        </svg>
        {tooltip && <div className="pointer-events-none absolute z-10 w-60 rounded-xl bg-slate-950 p-3 text-white shadow-xl" style={{ left: tooltip.x, top: tooltip.y }}><p className="text-xs font-semibold leading-5">{tooltip.record.title}</p><p className="mt-1 text-[11px] leading-4 text-slate-300">{tooltip.record.summary}</p><p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">{STAGES[Math.max(0, stageFor(tooltip.record.type))].label} · связей: {graph.edges.filter(edge => edge.from === tooltip.record.id || edge.to === tooltip.record.id).length}{needsCheck(tooltip.record) ? ' · проверить' : ''}</p></div>}
      </div>
      {selected && <aside className="w-[336px] shrink-0 overflow-y-auto border-l border-gray-100 p-5 dark:border-gray-800"><div className="flex items-start justify-between gap-3"><p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Карточка сущности</p><button onClick={() => setSelectedId(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800" aria-label="Закрыть карточку"><X size={17} /></button></div><p className="mt-4 text-xs font-semibold uppercase tracking-wider text-gray-500">{STAGES[Math.max(0, stageFor(selected.type))].label}</p><h3 className="mt-2 text-lg font-semibold leading-6">{selected.title}</h3><p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{selected.summary}</p><section className={`mt-5 rounded-xl border p-3 text-xs leading-5 ${needsCheck(selected) ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}><p className="font-semibold">{needsCheck(selected) ? 'Нужно проверить человеку' : 'Статус подтверждён'}</p><p className="mt-1">{selected.next || selected.status}</p></section><section className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 p-3 text-xs leading-5 text-cyan-900"><p className="font-semibold">Граница данных</p><p className="mt-1">Граф показывает только статусы и безопасные provenance IDs; источники сессий не доступны.</p></section><section className="mt-5"><p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Связи · {related.length}</p><div className="mt-2 space-y-1.5">{related.length ? related.map(record => <button key={record.id} onClick={() => focus(record)} className="flex w-full items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-cyan-50"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STAGES[Math.max(0, stageFor(record.type))].color }} />{record.title}</button>) : <p className="text-sm leading-5 text-gray-500">Связи ещё не подтверждены.</p>}</div></section></aside>}
    </div>
  </section>
}
