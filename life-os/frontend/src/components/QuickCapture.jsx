import { useState, useEffect, useRef } from 'react'
import { Zap, Paperclip } from 'lucide-react'
import { inbox, tree as treeApi, memories as memoriesApi, insights as insightsApi, lists as listsApi } from '../api'
import { useSpheres } from '../SpheresContext'

const KINDS = [
  { id: 'task',    label: 'Задача' },
  { id: 'inbox',   label: 'Inbox' },
  { id: 'memory',  label: 'Вспоминание' },
  { id: 'insight', label: 'Инсайт' },
  { id: 'list',    label: 'Список' },
]

const INSIGHT_TAGS = ['психология', 'здоровье', 'системы']

const PLACEHOLDERS = {
  task: 'Задача... (сфера ниже, без сферы — в Inbox)',
  inbox: 'Мысль, идея, всё подряд...',
  memory: 'Момент, который стоит сохранить...',
  insight: 'Паттерн, вывод, наблюдение...',
  list: 'Название пункта...',
}

const isMediaFile = (f) => f.type.startsWith('image/') || f.type.startsWith('video/')

export default function QuickCapture({ open, onClose }) {
  const { SPHERE_ORDER, SPHERE_LABELS } = useSpheres()
  const [kind, setKind] = useState('task')
  const [text, setText] = useState('')
  const [sphere, setSphere] = useState('')
  const [memDate, setMemDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [photos, setPhotos] = useState([])
  const [insightTitle, setInsightTitle] = useState('')
  const [insightTag, setInsightTag] = useState('')
  const [subtags, setSubtags] = useState('')
  const [collections, setCollections] = useState([])
  const [listType, setListType] = useState('films')
  const [saving, setSaving] = useState(false)
  const textRef = useRef()
  const fileRef = useRef()

  useEffect(() => {
    if (open) {
      setKind('task')
      setText('')
      setSphere('')
      setPhotos([])
      setInsightTitle('')
      setInsightTag('')
      setSubtags('')
      setMemDate(new Date().toISOString().slice(0, 10))
      setTimeout(() => textRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose()
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); onClose() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (kind === 'list' && collections.length === 0) {
      listsApi.index().then(d => setCollections(d.collections || [])).catch(() => {})
    }
  }, [kind, collections.length])

  const onPaste = (e) => {
    if (kind !== 'memory') return
    const files = [...(e.clipboardData?.files || [])].filter(isMediaFile)
    if (files.length > 0) {
      e.preventDefault()
      setPhotos(prev => [...prev, ...files])
    }
  }

  const pickFiles = (e) => {
    const files = [...(e.target.files || [])].filter(isMediaFile)
    setPhotos(prev => [...prev, ...files])
    e.target.value = ''
  }

  const canSave = kind === 'memory' ? (text.trim().length > 0 || photos.length > 0) : text.trim().length > 0

  const save = async () => {
    if (!canSave || saving) return
    const value = text.trim()
    setSaving(true)
    try {
      if (kind === 'task' && sphere) {
        await treeApi.add({
          title: value.length > 80 ? value.slice(0, 80) + '…' : value,
          notes: value.length > 80 ? value : null,
          parent_id: `root-${sphere}`,
          status: 'undefined',
        })
      } else if (kind === 'task' || kind === 'inbox') {
        await inbox.add(value)
      } else if (kind === 'memory') {
        const entry = await memoriesApi.add({ text: value, date: memDate })
        if (photos.length > 0) await memoriesApi.uploadPhotos(entry.id, photos)
      } else if (kind === 'insight') {
        await insightsApi.add({
          title: ((insightTitle || value).trim().slice(0, 80)) || 'Без названия',
          body: value,
          tags: insightTag ? [insightTag] : [],
          subtags: subtags.split(',').map(s => s.trim().replace(/\s+/g, '_')).filter(Boolean),
        })
      } else if (kind === 'list') {
        await listsApi.add(listType, { title: value })
      }
      onClose()
    } catch (e) {
      console.error('QuickCapture save failed:', e)
      setSaving(false)
    }
  }

  if (!open) return null

  const destination =
    kind === 'task'    ? (sphere ? `→ Задача · ${SPHERE_LABELS[sphere]}` : '→ Inbox') :
    kind === 'memory'  ? `→ Вспоминание · ${memDate}` :
    kind === 'insight' ? '→ Инсайт' :
    kind === 'list'    ? `→ ${collections.find(c => c.id === listType)?.label || 'Список'}` :
                         '→ Inbox'

  return (
    <div className="fixed inset-0 bg-black/30 dark:bg-black/60 z-50 flex items-start justify-center pt-32"
         onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-5"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 mb-3">
          <Zap size={12} /> Быстрый захват
        </div>

        {/* Type picker */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {KINDS.map(k => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                kind === k.id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >{k.label}</button>
          ))}
        </div>

        {kind !== 'list' ? (
          <textarea
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onPaste={onPaste}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
            placeholder={PLACEHOLDERS[kind]}
            className="w-full bg-transparent text-gray-900 dark:text-gray-100 text-sm resize-none outline-none
                       placeholder-gray-400 dark:placeholder-gray-600 min-h-[80px]"
          />
        ) : (
          <input
            ref={textRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save() }}
            placeholder={PLACEHOLDERS.list}
            className="w-full bg-transparent text-gray-900 dark:text-gray-100 text-sm outline-none
                       placeholder-gray-400 dark:placeholder-gray-600"
          />
        )}

        {/* kind: task — sphere selector */}
        {kind === 'task' && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setSphere('')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                !sphere ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >Inbox</button>
            {SPHERE_ORDER.map(id => (
              <button
                key={id}
                onClick={() => setSphere(sphere === id ? '' : id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  sphere === id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >{SPHERE_LABELS[id]}</button>
            ))}
          </div>
        )}

        {/* kind: memory — date + photos */}
        {kind === 'memory' && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={memDate}
                onChange={e => setMemDate(e.target.value)}
                className="bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-700 dark:text-gray-300 px-2 py-1"
              />
              <button onClick={() => fileRef.current?.click()} className="btn btn-ghost !px-2 !py-1 text-xs flex items-center gap-1">
                <Paperclip size={12} /> Фото
              </button>
              <input ref={fileRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={pickFiles} />
              <span className="text-[11px] text-gray-300 dark:text-gray-600">или вставь фото (⌘V)</span>
            </div>
            {photos.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {photos.map((f, i) => (
                  <div key={i} className="relative">
                    <img src={URL.createObjectURL(f)} alt="" className="w-14 h-14 object-cover rounded-lg" />
                    <button
                      onClick={() => setPhotos(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-900 text-white text-[10px] leading-none"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* kind: insight — title + tag + subtags */}
        {kind === 'insight' && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
            <input
              value={insightTitle}
              onChange={e => setInsightTitle(e.target.value)}
              placeholder="Название (если пусто — возьмётся из текста)"
              className="w-full bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-900 dark:text-gray-100 px-2 py-1.5
                         outline-none placeholder-gray-400 dark:placeholder-gray-500"
            />
            <div className="flex flex-wrap gap-1.5 items-center">
              {INSIGHT_TAGS.map(t => (
                <button
                  key={t}
                  onClick={() => setInsightTag(insightTag === t ? '' : t)}
                  className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                    insightTag === t ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >{t}</button>
              ))}
              <input
                value={subtags}
                onChange={e => setSubtags(e.target.value)}
                placeholder="субтеги через запятую"
                className="flex-1 min-w-[120px] bg-gray-100 dark:bg-gray-800 rounded-lg text-xs text-gray-900 dark:text-gray-100 px-2 py-1
                           outline-none placeholder-gray-400 dark:placeholder-gray-500"
              />
            </div>
          </div>
        )}

        {/* kind: list — collection picker */}
        {kind === 'list' && (
          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex flex-wrap gap-1.5">
              {(collections.length > 0 ? collections : [{ id: 'films', label: 'Фильмы' }, { id: 'series', label: 'Сериалы' }, { id: 'books', label: 'Книги' }, { id: 'games', label: 'Игры' }, { id: 'wishes', label: 'Желания' }]).map(c => (
                <button
                  key={c.id}
                  onClick={() => setListType(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    listType === c.id ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >{c.label}</button>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between items-center mt-3">
          <span className="text-xs text-gray-400">{destination} · ⌘Enter</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-ghost">Отмена</button>
            <button onClick={save} disabled={!canSave || saving} className="btn btn-primary">
              {saving ? '...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
