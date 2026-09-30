import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Trash2, ImageIcon, CalendarDays } from 'lucide-react'
import { memories as memoriesApi } from '../api'
import PageOnboarding from '../components/PageOnboarding'

const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                'июля','августа','сентября','октября','ноября','декабря']
const WEEKDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота']

function fmtDateHeader(dateStr) {
  const [y, m, d] = dateStr.split('-')
  const dt = new Date(dateStr + 'T12:00:00')
  const wd = WEEKDAYS[dt.getDay()]
  return { short: `${parseInt(d)} ${MONTHS[parseInt(m) - 1]}`, full: `${wd}, ${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`, day: parseInt(d) }
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().slice(0, 10)
}

/* ─── Media thumbnail with lightbox ──────────────────────────────── */

function isVideo(filename) {
  return /\.(mp4|mov|webm|avi)$/i.test(filename)
}

function MediaThumbnail({ filename }) {
  const [open, setOpen] = useState(false)
  const url = memoriesApi.mediaUrl(filename)
  const video = isVideo(filename)

  return (
    <>
      {video ? (
        <video
          src={url}
          onClick={() => setOpen(true)}
          className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
          preload="metadata"
          muted
        />
      ) : (
        <img
          src={url}
          alt=""
          onClick={() => setOpen(true)}
          className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
          loading="lazy"
        />
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setOpen(false)}
        >
          {video ? (
            <video src={url} controls autoPlay className="max-w-[90vw] max-h-[90vh] rounded-lg" />
          ) : (
            <img src={url} alt="" className="max-w-[90vw] max-h-[90vh] rounded-lg object-contain" />
          )}
        </div>
      )}
    </>
  )
}

/* ─── Memory entry card ──────────────────────────────────────────── */

function MemoryEntry({ entry, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(entry.text)

  const handleSave = async () => {
    if (text !== entry.text) {
      await memoriesApi.update(entry.id, { text })
    }
    setEditing(false)
    onUpdate()
  }

  const handleCancel = () => {
    setText(entry.text)
    setEditing(false)
  }

  const handleDelete = () => {
    if (window.confirm('Удалить воспоминание?')) {
      memoriesApi.delete(entry.id).then(onDelete)
    }
  }

  return (
    <div className="card px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {editing ? (
            <textarea
              autoFocus
              value={text}
              onChange={e => setText(e.target.value)}
              onBlur={handleSave}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSave(); if (e.key === 'Escape') handleCancel() }}
              className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400"
              rows={3}
              placeholder="Что произошло..."
            />
          ) : entry.text ? (
            <p
              className="text-sm text-gray-900 dark:text-gray-100 whitespace-pre-wrap cursor-text leading-relaxed"
              onDoubleClick={() => setEditing(true)}
            >
              {entry.text}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setEditing(true)}
            className="p-1 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400 rounded transition-colors"
            title="Редактировать"
          >
            <span className="text-xs">ред.</span>
          </button>
          <button
            onClick={handleDelete}
            className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors"
            title="Удалить"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {entry.photos && entry.photos.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {entry.photos.map(p => <MediaThumbnail key={p.id} filename={p.filename} />)}
        </div>
      )}
    </div>
  )
}

/* ─── Add form with drag/drop + paste ──────────────────────────────── */

function AddForm({ date, onAdded, onClose }) {
  const [text, setText] = useState('')
  const [entryDate, setEntryDate] = useState(date)
  const [pendingPhotos, setPendingPhotos] = useState([])
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef(null)

  const addImageFiles = useCallback((files) => {
    const media = [...files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (media.length > 0) setPendingPhotos(prev => [...prev, ...media])
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    addImageFiles(e.dataTransfer.files)
  }, [addImageFiles])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => setDragOver(false), [])

  const handlePaste = useCallback((e) => {
    const files = [...e.clipboardData.files].filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
    if (files.length > 0) {
      e.preventDefault()
      addImageFiles(files)
    }
  }, [addImageFiles])

  const removePending = useCallback((index) => {
    setPendingPhotos(prev => prev.filter((_, i) => i !== index))
  }, [])

  const handleSubmit = async () => {
    if (!text.trim() && pendingPhotos.length === 0) return
    setSaving(true)
    try {
      const entry = await memoriesApi.add({ text: text.trim(), date: entryDate })
      if (pendingPhotos.length > 0) {
        await memoriesApi.uploadPhotos(entry.id, pendingPhotos)
      }
      setText('')
      setPendingPhotos([])
      onAdded()
    } catch (e) {
      console.error('Failed to save memory:', e)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => { textareaRef.current?.focus() }, [])

  return (
    <div
      className={`card p-3 mb-4 transition-colors ${dragOver ? 'ring-2 ring-blue-400 dark:ring-blue-500 bg-blue-50/50 dark:bg-blue-950/30' : ''}`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit(); if (e.key === 'Escape') onClose() }}
        placeholder="Что произошло сегодня..."
        className="w-full bg-transparent text-sm text-gray-900 dark:text-gray-100 outline-none resize-none placeholder-gray-400"
        rows={3}
      />
      <div className="flex items-center gap-2 mt-1.5">
        <input
          type="date"
          value={entryDate}
          onChange={e => setEntryDate(e.target.value)}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1 bg-white dark:bg-gray-900 outline-none text-gray-600 dark:text-gray-400"
        />
        {isToday(entryDate) && <span className="text-xs text-gray-400">сегодня</span>}
      </div>
      {pendingPhotos.length > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {pendingPhotos.map((file, i) => (
            <div key={i} className="relative group/thumb">
              {file.type.startsWith('video/') ? (
                <video src={URL.createObjectURL(file)} className="w-20 h-20 object-cover rounded-lg" muted />
              ) : (
                <img src={URL.createObjectURL(file)} alt="" className="w-20 h-20 object-cover rounded-lg" />
              )}
              <button
                onClick={() => removePending(i)}
                className="absolute -top-1 -right-1 w-5 h-5 bg-gray-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={handleSubmit}
          disabled={saving || (!text.trim() && pendingPhotos.length === 0)}
          className="btn btn-primary text-xs flex items-center gap-1 disabled:opacity-40"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Сохранить
        </button>
        <button onClick={onClose} className="btn btn-ghost text-xs">Отмена</button>
        <span className="text-xs text-gray-300 dark:text-gray-600 ml-auto flex items-center gap-1">
          <ImageIcon size={12} />
          перетащи фото/видео или вставь из буфера
        </span>
      </div>
    </div>
  )
}

/* ─── Main page ───────────────────────────────────────────────────── */

export default function Memories() {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('all') // 'all' | 'day'
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const data = view === 'day' ? await memoriesApi.all(date) : await memoriesApi.all()
    setEntries(data)
    setLoading(false)
  }, [view, date])

  useEffect(() => { load() }, [load])

  const handleAdded = () => {
    setAdding(false)
    load()
  }

  // Group entries by date for 'all' view
  const grouped = view === 'all'
    ? entries.reduce((acc, entry) => {
        const key = entry.date
        if (!acc[key]) acc[key] = []
        acc[key].push(entry)
        return acc
      }, {})
    : null

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <PageOnboarding pageId="memories" />
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Воспоминания</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn btn-primary text-xs flex items-center gap-1">
            <Plus size={14} /> Добавить
          </button>
        )}
      </div>

      {/* View toggle + date nav */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setView('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${view === 'all' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500'}`}
          >
            Все
          </button>
          <button
            onClick={() => setView('day')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${view === 'day' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500'}`}
          >
            По дням
          </button>
        </div>

        {view === 'day' && (
          <div className="flex items-center gap-2">
            <button onClick={() => setDate(d => addDays(d, -1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <ChevronLeft size={16} className="text-gray-500" />
            </button>
            <button
              onClick={() => setDate(() => new Date().toISOString().slice(0, 10))}
              className={`text-sm font-medium px-2 py-0.5 rounded-lg transition-colors ${isToday(date) ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'}`}
            >
              {fmtDateHeader(date).short}
            </button>
            <button onClick={() => setDate(d => addDays(d, 1))} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
              <ChevronRight size={16} className="text-gray-500" />
            </button>
            {isToday(date) && (
              <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">сегодня</span>
            )}
          </div>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <AddForm
          date={view === 'day' ? date : new Date().toISOString().slice(0, 10)}
          onAdded={handleAdded}
          onClose={() => setAdding(false)}
        />
      )}

      {/* Content */}
      {loading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <CalendarDays size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-3" />
          <p className="text-gray-400 text-sm">
            {view === 'all' ? 'Пока нет воспоминаний. Нажми «Добавить» чтобы начать.' : 'В этот день пока нет воспоминаний.'}
          </p>
        </div>
      ) : view === 'all' ? (
        <div className="space-y-6">
          {Object.entries(grouped)
            .sort(([a], [b]) => b.localeCompare(a))
            .map(([day, dayEntries]) => (
              <div key={day}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {fmtDateHeader(day).full}
                  </span>
                  {isToday(day) && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">сегодня</span>
                  )}
                  <div className="flex-1 border-b border-gray-100 dark:border-gray-800" />
                </div>
                <div className="space-y-2">
                  {dayEntries.map(entry => (
                    <MemoryEntry key={entry.id} entry={entry} onUpdate={load} onDelete={load} />
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(entry => (
            <MemoryEntry key={entry.id} entry={entry} onUpdate={load} onDelete={load} />
          ))}
        </div>
      )}
    </div>
  )
}
