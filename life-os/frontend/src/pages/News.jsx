import { useState, useEffect, useRef } from 'react'
import { Newspaper, ExternalLink, ChevronDown, ChevronRight, Search, Bookmark, Plus, Trash2, Zap, FlaskConical, Crosshair, Eye, StickyNote } from 'lucide-react'
import { news as newsApi } from '../api'

function fmtDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
  return `${parseInt(day)} ${months[parseInt(m) - 1]}`
}

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Сначала новые' },
  { value: 'detail_desc', label: 'Сначала важные' },
]

const KIND_CONFIG = {
  radar: { icon: Crosshair, color: 'text-blue-500 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/30', label: 'Радар' },
  fun: { icon: Zap, color: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', label: 'По приколу' },
  calibration: { icon: FlaskConical, color: 'text-purple-500 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-900/30', label: 'Калибровка' },
}

function sortItems(arr, sort) {
  return [...arr].sort((a, b) => {
    if (sort === 'detail_desc') return (b.detail || 5) - (a.detail || 5)
    return (b.published || b.created || '').localeCompare(a.published || a.created || '')
  })
}

// ─── NewsCard ──────────────────────────────────────────────────────

function NewsCard({ item, expanded, onToggle, onSave, onDetail, onNote, onRate }) {
  const isExpanded = expanded === item.id
  const detail = item.detail || 5
  const kind = item.kind
  const kindCfg = KIND_CONFIG[kind]
  const activeValue = item.rating != null ? item.rating : detail

  // Visual weight from detail scale
  const isCompact = detail <= 2
  const isProminent = detail >= 9
  const showSummaryAlways = detail >= 3
  const showFullText = detail >= 6 && item.full_text

  return (
    <div
      className={`card overflow-hidden cursor-pointer transition-all ${
        isCompact ? 'opacity-60 hover:opacity-80 py-1' : 'hover:shadow-md'
      } ${
        isProminent ? 'ring-1 ring-blue-200 dark:ring-blue-800 shadow-sm' : ''
      }`}
      onClick={onToggle}
    >
      <div className={`${isCompact ? 'px-4 py-1.5' : 'px-4 py-3'}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Kind dot */}
            {kindCfg && (
              <span className={`flex-shrink-0 w-2 h-2 rounded-full ${kindCfg.color.replace('text-', 'bg-').replace('dark:text-', 'dark:bg-')}`} title={kindCfg.label} />
            )}
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 flex-shrink-0">
              {item.source_name}
            </span>
            {item.saved && (
              <Bookmark size={12} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />
            )}
            {item.note && (
              <StickyNote size={12} className="text-green-500 dark:text-green-400 flex-shrink-0" />
            )}
            <span className={`leading-snug truncate ${
              isCompact ? 'text-xs text-gray-500 dark:text-gray-400' :
              isProminent ? 'text-sm font-semibold text-gray-900 dark:text-gray-100' :
              'text-sm font-medium text-gray-900 dark:text-gray-100'
            }`}>
              {item.title}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            {item.published && (
              <span className="text-xs text-gray-400">{fmtDate(item.published)}</span>
            )}
            <span className="text-gray-300 dark:text-gray-600 text-xs select-none">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </div>
        </div>

        {/* Summary (always visible when detail >= 3, or truncated when collapsed) */}
        {!isExpanded && showSummaryAlways && (
          <p className={`mt-1 truncate ${isCompact ? 'text-[11px] text-gray-400' : 'text-xs text-gray-400'}`}>{item.summary}</p>
        )}
        {!isExpanded && !showSummaryAlways && !isCompact && (
          <p className="text-xs text-gray-400 mt-1 truncate">{item.summary}</p>
        )}
        {/* Compact mode: no summary at all */}

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 space-y-3">
            {/* Kind badge (expanded) */}
            {kindCfg && (
              <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs ${kindCfg.bg} ${kindCfg.color}`}>
                <kindCfg.icon size={12} /> {kindCfg.label}
              </div>
            )}

            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{item.summary}</p>

            {/* Personal relevance callout */}
            {item.relevance && (
              <div className="text-sm leading-relaxed bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg px-3 py-2">
                <span className="text-[10px] uppercase tracking-wider text-blue-400 dark:text-blue-500 font-medium">Почему это важно тебе</span>
                <p className="text-gray-700 dark:text-gray-300 mt-0.5">{item.relevance}</p>
              </div>
            )}

            {showFullText && (
              <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                {item.full_text}
              </div>
            )}

            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 hover:underline"
              >
                <ExternalLink size={12} /> Источник
              </a>
            )}

            {/* Topics */}
            {item.topics && item.topics.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.topics.map(t => (
                  <span key={t} className="px-1.5 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Detail/Rating slider (1-10) — click sets rating, shows rating if set else detail */}
            <div className="flex items-center gap-1.5 pt-1" onClick={e => e.stopPropagation()}>
              <span className="text-[10px] text-gray-400 uppercase tracking-wider w-8">Детал.</span>
              {Array.from({length: 10}, (_, i) => i + 1).map(n => (
                <button
                  key={n}
                  onClick={() => onRate(item.id, n)}
                  className={`w-5 h-5 rounded-full text-[10px] font-medium transition-all ${
                    n === activeValue
                      ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 scale-110'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                  title={`Оценка ${n}/10`}
                >
                  {n}
                </button>
              ))}
              <span className="text-[10px] text-gray-400 ml-1">
                {activeValue}/10
                {item.rating != null && item.rating !== detail && (
                  <span className={`ml-0.5 ${
                    item.rating > detail ? 'text-blue-500' : 'text-red-400'
                  }`}>
                    {item.rating > detail ? '↑' : '↓'}
                  </span>
                )}
              </span>
            </div>

            {/* Bookmark + note row */}
            <div className="flex items-center gap-2 pt-1" onClick={e => e.stopPropagation()}>
              <div className="flex-1" />
              <NoteInput item={item} onNote={onNote} />
              <button
                onClick={e => { e.stopPropagation(); onSave(item.id, !item.saved) }}
                className={`p-1.5 rounded-lg transition-all ${
                  item.saved
                    ? 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30'
                    : 'text-gray-300 dark:text-gray-600 hover:text-amber-500 dark:hover:text-amber-400'
                }`}
                title={item.saved ? 'Убрать из сохранённого' : 'Сохранить'}
              >
                <Bookmark size={14} fill={item.saved ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NoteInput ──────────────────────────────────────────────────────

function NoteInput({ item, onNote }) {
  const [draft, setDraft] = useState(item.note || '')
  const inputRef = useRef(null)

  useEffect(() => { setDraft(item.note || '') }, [item.note])

  const save = async () => {
    const text = draft.trim()
    await onNote(item.id, text || null)
  }

  return (
    <div className="flex-1 flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      <StickyNote size={13} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Escape') { setDraft(item.note || '') } }}
        placeholder="Пометка..."
        className="flex-1 text-xs bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700 rounded px-2 py-1 outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:border-green-300 dark:focus:border-green-700 transition-colors"
      />
    </div>
  )
}

// ─── SourcesTab ────────────────────────────────────────────────────

function SourcesTab({ sources, onUpdate }) {
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState({ name: '', url: '', topic: '', enabled: true })
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)

  const selectSource = (s) => {
    setSelected(s)
    setAdding(false)
    setDraft({ name: s.name, url: s.url, topic: s.topic || '', enabled: s.enabled })
  }

  const startAdd = () => {
    setSelected(null)
    setAdding(true)
    setDraft({ name: '', url: '', topic: '', enabled: true })
  }

  const save = async () => {
    if (!draft.name.trim() || !draft.url.trim()) return
    setSaving(true)
    if (adding) {
      await newsApi.sources.add(draft)
    } else if (selected) {
      await newsApi.sources.update(selected.id, draft)
    }
    setSaving(false)
    setAdding(false)
    setSelected(null)
    onUpdate()
  }

  const remove = async (id) => {
    if (!confirm('Удалить источник?')) return
    await newsApi.sources.delete(id)
    setSelected(null)
    onUpdate()
  }

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Source list */}
      <div className="w-52 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto py-2">
        {sources.map(s => (
          <button
            key={s.id}
            onClick={() => selectSource(s)}
            className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${
              selected?.id === s.id
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
            }`}
          >
            <span className="truncate">{s.name}</span>
            {!s.enabled && <span className="text-[10px] text-gray-400 ml-1">○</span>}
          </button>
        ))}
        <button
          onClick={startAdd}
          className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-1.5 ${
            adding
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900'
          }`}
        >
          <Plus size={14} /> Добавить
        </button>
      </div>

      {/* Edit panel */}
      <div className="flex-1 overflow-y-auto">
        {(selected || adding) ? (
          <div className="max-w-lg py-8 px-10 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Название</label>
              <input
                value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                placeholder="Habr"
                className="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-gray-400 dark:focus:border-gray-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">RSS URL</label>
              <input
                value={draft.url}
                onChange={e => setDraft(d => ({ ...d, url: e.target.value }))}
                placeholder="https://habr.com/ru/rss/articles/"
                className="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-gray-400 dark:focus:border-gray-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Тема</label>
              <input
                value={draft.topic}
                onChange={e => setDraft(d => ({ ...d, topic: e.target.value }))}
                placeholder="технологии"
                className="w-full text-sm bg-transparent border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-gray-400 dark:focus:border-gray-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={e => setDraft(d => ({ ...d, enabled: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 focus:ring-gray-400"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">Включён</span>
              </label>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button onClick={save} disabled={saving || !draft.name.trim() || !draft.url.trim()} className="btn btn-primary">
                {saving ? '...' : adding ? 'Добавить' : 'Сохранить'}
              </button>
              {!adding && (
                <button onClick={() => remove(selected.id)} className="btn btn-ghost text-red-500 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-1">
                  <Trash2 size={14} /> Удалить
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Выбери источник слева или добавь новый
          </div>
        )}
      </div>
    </div>
  )
}

// ─── News Page ─────────────────────────────────────────────────────

export default function News() {
  const [tab, setTab] = useState('feed')
  const [items, setItems] = useState([])
  const [sources, setSources] = useState([])
  const [search, setSearch] = useState('')
  const [filterSaved, setFilterSaved] = useState(false)
  const [filterKind, setFilterKind] = useState(null)
  const [showRead, setShowRead] = useState(false)
  const [sort, setSort] = useState('date_desc')
  const [expanded, setExpanded] = useState(null)

  const load = () => newsApi.all().then(data => {
    setItems(data.items || [])
    setSources(data.sources || [])
  })
  useEffect(() => { load() }, [])

  // Derived: kind counts for pills
  const kindCounts = {
    radar: items.filter(i => i.kind === 'radar').length,
    fun: items.filter(i => i.kind === 'fun').length,
    calibration: items.filter(i => i.kind === 'calibration').length,
  }

  // Apply filters
  const filtered = items.filter(item => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      item.title?.toLowerCase().includes(q) ||
      item.summary?.toLowerCase().includes(q) ||
      (item.full_text || '').toLowerCase().includes(q) ||
      (item.note || '').toLowerCase().includes(q) ||
      (item.source_name || '').toLowerCase().includes(q) ||
      (item.topics || []).some(t => t.toLowerCase().includes(q))

    const matchSaved = !filterSaved || item.saved
    const matchKind = !filterKind || item.kind === filterKind
    const matchRead = showRead || !item.read

    return matchSearch && matchSaved && matchKind && matchRead
  })

  const sorted = sortItems(filtered, sort)

  const handleSave = async (id, saved) => {
    await newsApi.update(id, { saved })
    await load()
  }

  const handleDetail = async (id, detail) => {
    await newsApi.update(id, { detail, read: true })
    await load()
  }

  const handleNote = async (id, note) => {
    await newsApi.update(id, { note })
    await load()
  }

  const handleRate = async (id, rating) => {
    await newsApi.update(id, { rating, read: true })
    await load()
  }

  const TABS = [
    { id: 'feed', label: 'Лента' },
    { id: 'sources', label: 'Источники' },
  ]

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-1 px-6 pt-6 pb-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 text-sm rounded-t-lg border-b-2 transition-colors ${
              tab === t.id
                ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100 font-medium'
                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800" />

      {tab === 'sources' && <SourcesTab sources={sources} onUpdate={load} />}

      {tab === 'feed' && (
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Новости</h1>
              <p className="text-sm text-gray-400 mt-0.5">Собрано Claude, отфильтровано тобой</p>
            </div>
            {items.length > 0 && (
              <span className="text-xs text-gray-400">{items.length} новостей</span>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-8 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
            />
          </div>

          {/* Kind pills — primary navigation */}
          <div className="flex items-center gap-2 mb-3">
            {Object.entries(KIND_CONFIG).map(([key, cfg]) => {
              const count = kindCounts[key] || 0
              if (count === 0) return null
              const isActive = filterKind === key
              const Icon = cfg.icon
              return (
                <button key={key} onClick={() => setFilterKind(isActive ? null : key)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
                    isActive
                      ? `${cfg.bg} ${cfg.color} border-current font-medium`
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
                  }`}
                >
                  <Icon size={14} /> {cfg.label} <span className="opacity-50 text-xs">{count}</span>
                </button>
              )
            })}
          </div>

          {/* Utility row — sort + toggles, subdued */}
          <div className="flex items-center gap-2 mb-4 text-xs text-gray-400">
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 px-2.5 py-1 outline-none cursor-pointer"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={() => setFilterSaved(v => !v)}
              className={`px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
                filterSaved
                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              <Bookmark size={12} /> Только сохранённое
            </button>
            <button onClick={() => setShowRead(v => !v)}
              className={`px-2.5 py-1 rounded-lg border transition-colors flex items-center gap-1 ${
                showRead
                  ? 'border-gray-400 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              <Eye size={12} /> Показывать прочитанное
            </button>
          </div>

          {/* News cards */}
          <div className="space-y-2">
            {sorted.map(item => (
              <NewsCard
                key={item.id}
                item={item}
                expanded={expanded}
                onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
                onSave={handleSave}
                onDetail={handleDetail}
                onNote={handleNote}
                onRate={handleRate}
              />
            ))}
          </div>

          {sorted.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm space-y-2">
              <Newspaper size={32} className="mx-auto opacity-30" />
              {items.length === 0 ? (
                <>
                  <p>Нет новостей</p>
                  <p className="text-xs text-gray-300 dark:text-gray-600">
                    Запусти Claude и скажи «собери новости», чтобы наполнить ленту
                  </p>
                </>
              ) : (
                <p>Ничего не найдено по фильтрам</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
