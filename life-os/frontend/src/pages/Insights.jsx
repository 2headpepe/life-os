import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'
import { insights as insightsApi } from '../api'
import { useSpheres } from '../SpheresContext'
import MarkdownContent from '../components/MarkdownContent'
import PageOnboarding from '../components/PageOnboarding'

const SUBTAG_PALETTES = [
  { bg: 'bg-blue-100 dark:bg-blue-900/40',     text: 'text-blue-700 dark:text-blue-300' },
  { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300' },
  { bg: 'bg-amber-100 dark:bg-amber-900/40',   text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-rose-100 dark:bg-rose-900/40',     text: 'text-rose-700 dark:text-rose-300' },
  { bg: 'bg-sky-100 dark:bg-sky-900/40',       text: 'text-sky-700 dark:text-sky-300' },
  { bg: 'bg-orange-100 dark:bg-orange-900/40', text: 'text-orange-700 dark:text-orange-300' },
  { bg: 'bg-teal-100 dark:bg-teal-900/40',     text: 'text-teal-700 dark:text-teal-300' },
]

const TOP_TAG_STYLES = {
  психология: { bg: 'bg-violet-500', text: 'text-white' },
  здоровье:   { bg: 'bg-emerald-500', text: 'text-white' },
  системы:    { bg: 'bg-sky-500', text: 'text-white' },
}

function subtagPalette(tag) {
  let h = 0
  for (const c of tag) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return SUBTAG_PALETTES[h % SUBTAG_PALETTES.length]
}

function fmtDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек']
  return `${parseInt(day)} ${months[parseInt(m) - 1]}`
}

const SORT_OPTIONS = [
  { value: 'date_added_desc', label: 'Новые сначала' },
  { value: 'date_added_asc',  label: 'Старые сначала' },
  { value: 'date_updated_desc', label: 'По обновлению' },
  { value: 'title_asc',       label: 'По названию' },
]

function sortItems(arr, sort) {
  return [...arr].sort((a, b) => {
    switch (sort) {
      case 'date_added_asc':    return (a.created || '').localeCompare(b.created || '')
      case 'date_added_desc':   return (b.created || '').localeCompare(a.created || '')
      case 'date_updated_desc': return (b.updated || '').localeCompare(a.updated || '')
      case 'title_asc':         return (a.title || '').localeCompare(b.title || '', 'ru')
      default: return 0
    }
  })
}

function InsightCard({ item, expanded, onToggle, activeSubtag, onSubtagClick, SPHERE_LABELS, SPHERE_COLORS }) {
  const accentColor = item.sphere ? (SPHERE_COLORS[item.sphere] || '#e5e7eb') : '#e5e7eb'
  const isExpanded = expanded === item.id
  const topTags = item.tags || []
  const subtags = item.subtags || []

  return (
    <div
      className="card overflow-hidden cursor-pointer hover:shadow-md transition-shadow border-l-[3px]"
      style={{ borderLeftColor: accentColor }}
      onClick={onToggle}
    >
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {topTags.map(tag => {
              const s = TOP_TAG_STYLES[tag] || { bg: 'bg-gray-400', text: 'text-white' }
              return (
                <span key={tag} className={`px-1.5 py-0.5 rounded text-xs font-semibold flex-shrink-0 ${s.bg} ${s.text}`}>
                  {tag}
                </span>
              )
            })}
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
              {item.title}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
            {item.created && (
              <span className="text-xs text-gray-400">{fmtDate(item.created)}</span>
            )}
            <span className="text-gray-300 dark:text-gray-600 text-xs select-none">
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </div>
        </div>

        {!isExpanded && item.body && (
          <p className="text-xs text-gray-400 mt-1 truncate">
            {item.body.split('\n')[0]}
          </p>
        )}

        {isExpanded && item.body && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 leading-relaxed whitespace-pre-wrap">
            {item.body}
          </p>
        )}

        {(subtags.length > 0 || item.sphere) && (
          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="flex flex-wrap gap-1">
              {subtags.map(tag => {
                const p = subtagPalette(tag)
                const isActive = activeSubtag === tag
                return (
                  <span
                    key={tag}
                    onClick={e => { e.stopPropagation(); onSubtagClick(tag) }}
                    className={`px-1.5 py-0.5 rounded text-xs cursor-pointer transition-all ${p.bg} ${p.text} ${isActive ? 'ring-2 ring-offset-1 ring-gray-700 dark:ring-gray-300' : 'hover:opacity-80'}`}
                  >
                    {tag}
                  </span>
                )
              })}
            </div>
            {item.sphere && SPHERE_COLORS[item.sphere] && (
              <span
                className="text-xs font-medium px-1.5 py-0.5 rounded flex-shrink-0"
                style={{ color: SPHERE_COLORS[item.sphere], backgroundColor: `${SPHERE_COLORS[item.sphere]}1a` }}
              >
                {SPHERE_LABELS[item.sphere] || item.sphere}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function NotesTab() {
  const [topics, setTopics] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { fetch('/api/topics').then(r => r.json()).then(setTopics) }, [])

  const select = async (topic) => {
    if (selected?.slug === topic.slug) { setSelected(null); setContent(null); return }
    setSelected(topic)
    setContent(null)
    setLoading(true)
    const data = await fetch(`/api/topics/${topic.slug}`).then(r => r.json())
    setContent(data.content)
    setLoading(false)
  }

  return (
    <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>
      <div className="w-52 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto py-2">
        {topics.map(t => (
          <button
            key={t.slug}
            onClick={() => select(t)}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
              selected?.slug === t.slug
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {!selected && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Выбери заметку слева</div>
        )}
        {selected && (
          <div className="max-w-2xl py-8 px-10">
            {loading && <div className="text-sm text-gray-400">Загрузка...</div>}
            {content && <MarkdownContent text={content} />}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Insights() {
  const { SPHERE_ORDER, SPHERE_LABELS, SPHERE_COLORS } = useSpheres()
  const [tab, setTab] = useState('insights')
  const [items, setItems] = useState([])
  const [search, setSearch] = useState('')
  const [activeTopTag, setActiveTopTag] = useState(null)
  const [activeSubtag, setActiveSubtag] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [sort, setSort] = useState('date_added_desc')
  const [groupBySphere, setGroupBySphere] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ title: '', body: '', tags: '', subtags: '', sphere: '' })
  const [saving, setSaving] = useState(false)
  const titleRef = useRef(null)

  const load = () => insightsApi.all().then(setItems)
  useEffect(() => { load() }, [])
  useEffect(() => { if (adding) titleRef.current?.focus() }, [adding])

  const allTopTags = [...new Set(items.flatMap(i => i.tags || []))]
    .sort((a, b) => {
      const order = ['психология', 'здоровье', 'системы']
      return order.indexOf(a) - order.indexOf(b)
    })

  const filtered = items.filter(item => {
    const q = search.toLowerCase()
    const matchSearch = !q ||
      item.title?.toLowerCase().includes(q) ||
      item.body?.toLowerCase().includes(q) ||
      (item.tags || []).some(t => t.toLowerCase().includes(q)) ||
      (item.subtags || []).some(t => t.toLowerCase().includes(q))
    const matchTopTag = !activeTopTag || (item.tags || []).includes(activeTopTag)
    const matchSubtag = !activeSubtag || (item.subtags || []).includes(activeSubtag)
    return matchSearch && matchTopTag && matchSubtag
  })

  const topFiltered = items.filter(item =>
    (!activeTopTag || (item.tags || []).includes(activeTopTag))
  )
  const availableSubtags = [...new Set(topFiltered.flatMap(i => i.subtags || []))].sort()
  const sorted = sortItems(filtered, sort)

  const sphereGroups = groupBySphere
    ? [...(SPHERE_ORDER || []), null]
        .map(sphere => ({
          sphere,
          label: sphere ? (SPHERE_LABELS[sphere] || sphere) : 'Без сферы',
          color: sphere ? SPHERE_COLORS[sphere] : '#9ca3af',
          items: sortItems(filtered.filter(i => i.sphere === sphere), sort),
        }))
        .filter(g => g.items.length > 0)
    : null

  const save = async () => {
    if (!draft.title.trim()) return
    setSaving(true)
    const tags = draft.tags.split(',').map(t => t.trim()).filter(Boolean)
    const subtags = draft.subtags.split(',').map(t => t.trim()).filter(Boolean)
    await insightsApi.add({
      title: draft.title.trim(),
      body: draft.body.trim(),
      tags,
      subtags,
      sphere: draft.sphere.trim() || null,
    })
    setDraft({ title: '', body: '', tags: '', subtags: '', sphere: '' })
    setAdding(false)
    setSaving(false)
    await load()
  }

  const cardProps = (item) => ({
    item,
    expanded,
    onToggle: () => setExpanded(expanded === item.id ? null : item.id),
    activeSubtag,
    onSubtagClick: tag => setActiveSubtag(activeSubtag === tag ? null : tag),
    SPHERE_LABELS,
    SPHERE_COLORS,
  })

  const TABS = [
    { id: 'insights', label: 'Инсайты' },
    { id: 'notes',    label: 'Заметки' },
  ]

  return (
    <div>
      <PageOnboarding pageId="insights" />
      {/* Tab switcher */
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

      {tab === 'notes' && <NotesTab />}

      {tab === 'insights' && (
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Инсайты</h1>
              <p className="text-sm text-gray-400 mt-0.5">Всё важное, что сохранено, но ещё не стало задачей</p>
            </div>
            <button
              onClick={() => setAdding(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90 transition-opacity"
            >
              <span>+</span> Добавить
            </button>
          </div>

          {adding && (
            <div className="card px-4 py-4 mb-5 space-y-3">
              <input
                ref={titleRef}
                value={draft.title}
                onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                placeholder="Заголовок"
                className="w-full text-sm font-medium bg-transparent border-0 outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
              <textarea
                value={draft.body}
                onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                placeholder="Содержание (опционально)"
                rows={3}
                className="w-full text-sm bg-transparent border-0 outline-none resize-none text-gray-700 dark:text-gray-300 placeholder-gray-400"
              />
              <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-800 flex-wrap">
                <select
                  value={draft.tags}
                  onChange={e => setDraft(d => ({ ...d, tags: e.target.value }))}
                  className="text-xs bg-transparent border-0 outline-none text-gray-500 dark:text-gray-400 cursor-pointer"
                >
                  <option value="">тема</option>
                  <option value="психология">психология</option>
                  <option value="здоровье">здоровье</option>
                  <option value="системы">системы</option>
                </select>
                <input
                  value={draft.subtags}
                  onChange={e => setDraft(d => ({ ...d, subtags: e.target.value }))}
                  placeholder="подтеги через запятую"
                  className="flex-1 text-xs bg-transparent border-0 outline-none text-gray-500 dark:text-gray-400 placeholder-gray-400"
                />
                <select
                  value={draft.sphere}
                  onChange={e => setDraft(d => ({ ...d, sphere: e.target.value }))}
                  className="text-xs bg-transparent border-0 outline-none text-gray-500 dark:text-gray-400 cursor-pointer"
                >
                  <option value="">сфера</option>
                  {Object.entries(SPHERE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button
                  disabled={saving || !draft.title.trim()}
                  onClick={save}
                  className="text-xs px-3 py-1 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 disabled:opacity-40"
                >
                  {saving ? '...' : 'Сохранить'}
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="text-xs px-2 py-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full pl-8 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:border-gray-400 dark:focus:border-gray-500 transition-colors"
            />
          </div>

          <div className="flex items-center justify-between gap-2 mb-4">
            <select
              value={sort}
              onChange={e => setSort(e.target.value)}
              className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 px-2.5 py-1.5 outline-none cursor-pointer transition-colors"
            >
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button
              onClick={() => setGroupBySphere(v => !v)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                groupBySphere
                  ? 'border-gray-900 bg-gray-900 text-white dark:border-gray-100 dark:bg-gray-100 dark:text-gray-900'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              По сферам
            </button>
          </div>

          {allTopTags.length > 0 && (
            <div className="flex gap-2 mb-2">
              {allTopTags.map(tag => {
                const s = TOP_TAG_STYLES[tag] || { bg: 'bg-gray-400', text: 'text-white' }
                const isActive = activeTopTag === tag
                const count = items.filter(i => (i.tags || []).includes(tag)).length
                return (
                  <button
                    key={tag}
                    onClick={() => { setActiveTopTag(isActive ? null : tag); setActiveSubtag(null) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isActive
                        ? `${s.bg} ${s.text}`
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {tag} <span className="opacity-60 font-normal">{count}</span>
                  </button>
                )
              })}
            </div>
          )}

          {availableSubtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">
              {availableSubtags.map(tag => {
                const p = subtagPalette(tag)
                const isActive = activeSubtag === tag
                return (
                  <button
                    key={tag}
                    onClick={() => setActiveSubtag(isActive ? null : tag)}
                    className={`px-2 py-0.5 rounded-full text-xs transition-all ${p.bg} ${p.text} ${isActive ? 'ring-2 ring-offset-1 ring-gray-700 dark:ring-gray-300' : 'opacity-70 hover:opacity-100'}`}
                  >
                    {tag}
                    <span className="ml-1 opacity-50">
                      {topFiltered.filter(i => (i.subtags || []).includes(tag)).length}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {groupBySphere && sphereGroups ? (
            <div className="space-y-6">
              {sphereGroups.map(group => (
                <div key={group.sphere ?? '_none'}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {group.label}
                    </span>
                    <span className="text-xs text-gray-400">({group.items.length})</span>
                  </div>
                  <div className="space-y-2">
                    {group.items.map(item => <InsightCard key={item.id} {...cardProps(item)} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {sorted.map(item => <InsightCard key={item.id} {...cardProps(item)} />)}
            </div>
          )}

          {sorted.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              {search || activeTopTag || activeSubtag ? 'Ничего не найдено' : 'Нет инсайтов'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
