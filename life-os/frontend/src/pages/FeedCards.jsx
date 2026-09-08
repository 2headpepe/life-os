import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Newspaper, Image as ImageIcon, Lightbulb, Flame, AlertTriangle, Target, CheckCircle2, PartyPopper, HelpCircle, Sparkles, CalendarDays, Activity,
  Inbox, Clock, Users, MessageSquare, Pencil,
} from 'lucide-react'
import { inbox, news as newsApi, memories as memoriesApi, insights as insightsApi, lists as listsApi, tree as treeApi, feed as feedApi } from '../api'
import { openInConsole } from '../utils/openInConsole'

const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

function serializeCardContext(card) {
  switch (card.type) {
    case 'news':
      return `[Новость] "${card.item?.title}"${card.item?.source_name ? ` — ${card.item.source_name}` : ''}${card.item?.rating ? `, оценка ${card.item.rating}/10` : ''}`
    case 'memory':
      return `[Воспоминание] ${card.entry?.date || ''} — "${(card.entry?.text || '').slice(0, 120)}"`
    case 'insight':
      return `[Инсайт] "${card.insight?.title}"${card.insight?.body ? `: ${card.insight.body.slice(0, 80)}` : ''}`
    case 'list_pick':
      return `[Подборка · ${card.list_label || ''}] "${card.item?.title}"${card.item?.year ? ` (${card.item.year})` : ''}`
    case 'prompt':
      return `[Вопрос дня] "${card.question}" → ${card.target || ''}`
    case 'streak':
      return `[Стрик] ${card.habit?.label || ''} — ${card.broken ? `прервался на ${card.streak}` : `${card.streak} дней подряд`}`
    case 'overdue':
      return `[Просрочено · ${card.count}] ${(card.tasks || []).slice(0, 5).map(t => `${t.title} (${t.days} дн.)`).join(', ')}`
    case 'goal':
      return `[Цель] "${card.goal?.title}" — ${card.done}/${card.total} (${card.pct}%)`
    case 'done':
      return `[Готово] "${card.task?.title}" — ${card.days_ago === 0 ? 'сегодня' : `${card.days_ago} дн. назад`}`
    case 'upcoming':
      return `[Скоро] ${(card.tasks || []).slice(0, 5).map(t => t.title).join(', ')}`
    case 'habits_stale':
      return `[Привычки · тишина] с ${fmtFeedDate(card.last_log)} — ${card.stale_days} дн.`
    case 'inbox_pending':
      return `[Inbox] ${card.count} записей${card.oldest ? `, старейшая с ${fmtFeedDate(card.oldest)}` : ''}`
    case 'stale_inprogress':
      return `[В процессе · зависло] ${(card.tasks || []).slice(0, 5).map(t => `${t.title} (${t.days} дн.)`).join(', ')}`
    case 'people_stale':
      return `[Люди] ${(card.people || []).slice(0, 5).map(p => `${p.name} (${p.days} дн. назад)`).join(', ')}`
    case 'ai_note':
      return `[AI наблюдение] "${card.title}"${card.body ? `: ${card.body.slice(0, 80)}` : ''}`
    case 'nudge':
      return `[Наблюдение] ${card.message}${card.detail ? ` — ${card.detail}` : ''}`
    case 'reflection':
      return `[Рефлексия] "${card.question}"${card.context ? ` — ${card.context}` : ''}`
    case 'celebration':
      return `[Победа] "${card.title}"${card.body ? ` — ${card.body.slice(0, 80)}` : ''}`
    case 'challenge':
      return `[Вызов] "${card.title}"${card.description ? ` — ${card.description.slice(0, 80)}` : ''}`
    case 'pattern':
      return `[Паттерн] "${card.title}"${card.observation ? ` — ${card.observation.slice(0, 80)}` : ''}`
    default:
      return `[Карточка: ${card.type}] ref=${card.ref}`
  }
}

export function fmtFeedDate(d) {
  if (!d) return ''
  const [, m, day] = d.split('-')
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]}`
}

function fmtCardTs(ts) {
  if (!ts) return ''
  const d = new Date(ts.includes('T') ? ts : ts + 'T12:00:00')
  const now = new Date()
  const sameDay = d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)
  if (sameDay) return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return fmtFeedDate(ts.slice(0, 10))
}

const TONE_STYLES = {
  casual:        { border: 'border-gray-200 dark:border-gray-700',  bg: 'bg-gray-50 dark:bg-gray-800/40',  accent: 'text-gray-500 dark:text-gray-400' },
  motivating:    { border: 'border-amber-200 dark:border-amber-800', bg: 'bg-amber-50 dark:bg-amber-900/20', accent: 'text-amber-600 dark:text-amber-400' },
  urgent:        { border: 'border-red-200 dark:border-red-800',     bg: 'bg-red-50 dark:bg-red-900/20',     accent: 'text-red-600 dark:text-red-400' },
  curious:       { border: 'border-violet-200 dark:border-violet-800', bg: 'bg-violet-50 dark:bg-violet-900/20', accent: 'text-violet-600 dark:text-violet-400' },
  nostalgic:     { border: 'border-blue-200 dark:border-blue-800',     bg: 'bg-blue-50 dark:bg-blue-900/20',   accent: 'text-blue-600 dark:text-blue-400' },
  celebratory:   { border: 'border-emerald-200 dark:border-emerald-800', bg: 'bg-emerald-50 dark:bg-emerald-900/20', accent: 'text-emerald-600 dark:text-emerald-400' },
}

function toneRing(tone) {
  switch (tone) {
    case 'urgent':        return 'ring-red-300 dark:ring-red-800'
    case 'motivating':    return 'ring-amber-300 dark:ring-amber-800'
    case 'celebratory':   return 'ring-emerald-300 dark:ring-emerald-800'
    case 'curious':       return 'ring-violet-300 dark:ring-violet-800'
    case 'nostalgic':     return 'ring-blue-300 dark:ring-blue-800'
    default:              return 'ring-violet-200 dark:ring-violet-900'
  }
}

function CardHeader({ icon: Icon, label, meta, iconClass, trace }) {
  const genTime = trace?.generated_at ? fmtCardTs(trace.generated_at) : null
  const displayMeta = meta || genTime
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} className={iconClass || 'text-gray-400'} />
      <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">{label}</span>
      {displayMeta && <span className="ml-auto text-xs text-gray-300 dark:text-gray-600">{displayMeta}</span>}
    </div>
  )
}

function MetaSubtitle({ meta }) {
  if (!meta?.subtitle) return null
  const tone = meta.tone
  const accentClass = tone ? (TONE_STYLES[tone] || TONE_STYLES.casual).accent : 'text-violet-500 dark:text-violet-400'
  return (
    <p className={`mb-2 flex items-center gap-1 text-[11px] ${accentClass}`}>
      <Sparkles size={10} className="flex-shrink-0" />{meta.subtitle}
    </p>
  )
}

function GenerationTrace({ trace, meta }) {
  const [open, setOpen] = useState(false)
  if (!trace && !meta?.tone) return null

  const tone = trace?.ai_tone || meta?.tone
  const style = tone ? TONE_STYLES[tone] || TONE_STYLES.casual : null
  const hasJob = trace?.note_job?.status

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="text-[10px] text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 flex items-center gap-1"
      >
        <span className={`inline-block transition-transform text-[8px] ${open ? 'rotate-90' : ''}`}>&#9654;</span>
        Как собрано{tone ? ` · ${tone}` : ''}
        {hasJob === 'running' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse ml-1" />}
        {hasJob === 'pending' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-400 ml-1" />}
      </button>
      {open && (
        <div className={`mt-1.5 rounded-lg border ${style ? style.border : 'border-gray-100 dark:border-gray-800'} ${style ? style.bg : 'bg-gray-50 dark:bg-gray-800/30'} p-2.5 space-y-1.5`}>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className={style?.accent || 'text-gray-400'}>{trace?.generated_by === 'ai' ? 'AI' : 'Правила'}</span>
            {trace?.generated_at && (
              <>
                <span className="text-gray-300 dark:text-gray-600">&middot;</span>
                <span className="text-gray-400 dark:text-gray-500">{trace.generated_at}</span>
              </>
            )}
          </div>
          {trace?.description && (
            <p className="text-[11px] text-gray-600 dark:text-gray-400">{trace.description}</p>
          )}
          {trace?.ai_reasoning && (
            <p className={`text-[11px] ${style?.accent || 'text-violet-500 dark:text-violet-400'}`}>{trace.ai_reasoning}</p>
          )}
          {trace?.ai_prompt_summary && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500">
              <span className="font-medium">Запрос:</span> {trace.ai_prompt_summary}
            </div>
          )}
          {trace?.ai_input_summary && (
            <div className="text-[10px] text-gray-400 dark:text-gray-500">
              <span className="font-medium">Данные:</span> {trace.ai_input_summary}
            </div>
          )}
          {trace?.data && Object.keys(trace.data).length > 0 && (
            <div className="space-y-0.5">
              {Object.entries(trace.data).map(([k, v]) => (
                <div key={k} className="text-[10px] flex gap-1">
                  <span className="text-gray-400 dark:text-gray-500 font-medium shrink-0">{k}:</span>
                  <span className="text-gray-500 dark:text-gray-400 break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
          {trace?.truncation && trace.truncation.total > trace.truncation.shown && (
            <p className="text-[10px] text-amber-500 dark:text-amber-400">
              Показано {trace.truncation.shown} из {trace.truncation.total}
            </p>
          )}
          {trace?.note_job && (
            <div className="text-[10px] space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className={trace.note_job.status === 'done' ? 'text-emerald-500' : trace.note_job.status === 'error' ? 'text-red-500' : 'text-amber-500'}>
                  {trace.note_job.status === 'done' ? 'AI обработано ✓' : trace.note_job.status === 'error' ? 'AI ошибка' : trace.note_job.status === 'running' ? 'AI думает...' : 'AI в очереди'}
                </span>
              </div>
              {trace.note_job.result_summary && (
                <p className="text-gray-500 dark:text-gray-400">{trace.note_job.result_summary}</p>
              )}
              {trace.note_job.error && (
                <p className="text-red-400">{trace.note_job.error}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CardActions({ liked, onLike, onDismiss, note, onNote, hideDismiss, onEdit, card }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [replyText, setReplyText] = useState('')

  useEffect(() => { if (!open && note) setText(note) }, [note, open])

  const openNote = () => {
    setText(note || '')
    setOpen(o => !o)
  }

  const save = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      await onNote?.(text.trim())
      setOpen(false)
      setText('')
    } finally {
      setSaving(false)
    }
  }

  const sendReply = () => {
    if (!replyText.trim()) return
    const ctx = serializeCardContext(card)
    openInConsole(`${ctx}\n\n${replyText.trim()}`)
    setReplyText('')
  }

  const isEditable = onEdit && card && ['memory', 'insight', 'news'].includes(card.type)

  return (
    <>
      {note && !open && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 px-2.5 py-1.5">
          <span className="text-xs text-gray-400 mt-0.5">✎</span>
          <p className="flex-1 text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{note}</p>
          <button onClick={() => onNote?.('')} title="Удалить заметку"
                  className="text-xs text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400">✕</button>
        </div>
      )}
      {open && (
        <div className="mt-2">
          <textarea
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
            placeholder="Аннотация к карточке - останется видимой здесь..."
            className="w-full bg-gray-50 dark:bg-gray-800/60 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none outline-none
                       placeholder-gray-400 dark:placeholder-gray-500 p-2.5 min-h-[60px]"
          />
          <div className="mt-1 flex items-center justify-between">
            <span className="text-[10px] text-gray-300 dark:text-gray-600">⌘Enter · сохранится на карточке + AI обработает</span>
            <div className="flex gap-2">
              <button onClick={save} disabled={!text.trim() || saving} className="btn btn-primary !px-2 !py-1 text-xs">{saving ? '...' : 'Сохранить'}</button>
              <button onClick={() => setOpen(false)} className="btn btn-ghost !px-2 !py-1 text-xs">Отмена</button>
            </div>
          </div>
        </div>
      )}
      {showEdit && isEditable && (
        <EditInput card={card} onEdit={onEdit} onClose={() => setShowEdit(false)} />
      )}
      <div className="mt-3 pt-2 border-t border-gray-50 dark:border-gray-800/50">
        <div className="flex items-center gap-1">
          {onLike && (
            <button
              onClick={onLike}
              title={liked ? 'Убрать лайк' : 'Нравится'}
              className={`text-sm px-1 transition-transform hover:scale-125 ${liked ? '' : 'grayscale opacity-40 hover:opacity-80'}`}
            >❤️</button>
          )}
          {onNote && (
            <button onClick={openNote} className="btn btn-ghost !px-2 !py-0.5 text-xs" title="Аннотация — остаётся на карточке">✎ Заметка</button>
          )}
          {isEditable && (
            <button onClick={() => setShowEdit(o => !o)} className="btn btn-ghost !px-2 !py-0.5 text-xs" title="Править содержимое карточки">
              <Pencil size={11} />
            </button>
          )}
          <span className="flex-1" />
          {onDismiss && !hideDismiss && (
            <button onClick={onDismiss} title="Скрыть на 3 дня" className="text-xs px-1.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400">
              Скрыть ✕
            </button>
          )}
        </div>
        {card && (
          <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800/30">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[10px] text-gray-300 dark:text-gray-600">💬 Набросок → открыть Claude</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() } }}
                placeholder="Короткая мысль, идея, реакция..."
                className="flex-1 bg-gray-50 dark:bg-gray-800/40 rounded-lg text-xs text-gray-900 dark:text-gray-100
                           outline-none placeholder-gray-300 dark:placeholder-gray-600 px-2.5 py-1.5"
              />
              {replyText.trim() && (
                <button onClick={sendReply} className="btn btn-primary !px-2 !py-1 text-xs" title="Отправить в AI">→</button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function EditInput({ card, onEdit, onClose }) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const ref = useRef()

  useEffect(() => {
    if (card.type === 'memory') setValue(card.entry?.text || '')
    else if (card.type === 'insight') setValue(card.insight?.title || '')
    else if (card.type === 'news') setValue(card.item?.note || '')
    setTimeout(() => ref.current?.focus(), 50)
  }, [card])

  const field = card.type === 'memory' ? 'text'
    : card.type === 'insight' ? 'title'
    : card.type === 'news' ? 'note'
    : null

  const save = async () => {
    if (!field || saving) return
    setSaving(true)
    try { await onEdit(card, field, value); onClose() }
    finally { setSaving(false) }
  }

  if (!field) return null
  const placeholder = card.type === 'memory' ? 'Текст воспоминания...'
    : card.type === 'insight' ? 'Название инсайта...'
    : 'Заметка к новости...'
  const multiLine = card.type === 'memory'

  return (
    <div className="mt-2 border-t border-gray-100 dark:border-gray-800 pt-2">
      {multiLine ? (
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
          placeholder={placeholder}
          className="w-full bg-gray-50 dark:bg-gray-800/60 rounded-lg text-sm text-gray-900 dark:text-gray-100
                     resize-none outline-none placeholder-gray-400 dark:placeholder-gray-500 p-2 min-h-[60px]"
        />
      ) : (
        <input
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save() }}
          placeholder={placeholder}
          className="w-full bg-gray-50 dark:bg-gray-800/60 rounded-lg text-sm text-gray-900 dark:text-gray-100
                     outline-none placeholder-gray-400 dark:placeholder-gray-500 px-2 py-1.5"
        />
      )}
      <div className="mt-1 flex gap-2">
        <button onClick={save} disabled={saving} className="btn btn-primary !px-2 !py-0.5 text-xs">
          {saving ? '...' : 'Сохранить'}
        </button>
        <button onClick={onClose} className="btn btn-ghost !px-2 !py-0.5 text-xs">Отмена</button>
      </div>
    </div>
  )
}

// ─── News ──────────────────────────────────────────────────────────

export function NewsCard({ card, liked, onLike, onDismiss, note, onNote, onSaved, onQuickReply, onEdit }) {
  const { item, stale_days, meta } = card
  const [rating, setRating] = useState(item.rating ?? 0)

  const rate = async (n) => {
    setRating(rating === n ? 0 : n)
    try {
      await newsApi.update(item.id, { rating: rating === n ? null : n, read: true })
      onSaved?.()
    } catch (e) {
      console.error('Rate failed:', e)
    }
  }

  return (
    <div className="card p-4">
      <CardHeader icon={Newspaper} label="Новости" meta={fmtFeedDate(item.published)} trace={card.trace} />
      <MetaSubtitle meta={meta} />
      <a href={item.url} target="_blank" rel="noreferrer"
         className="font-medium text-gray-900 dark:text-gray-100 hover:underline leading-snug">
        {item.title}
      </a>
      {item.summary && (
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 line-clamp-3">{item.summary}</p>
      )}
      <div className="mt-2.5 flex items-center gap-0.5">
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
          <button key={n} onClick={() => rate(n)} title={`Оценить ${n}/10`}
                  className={`h-6 min-w-6 px-0.5 rounded text-[11px] font-medium transition-colors
                    ${rating >= n ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            {n}
          </button>
        ))}
        {rating > 0 && <span className="ml-1.5 text-xs text-blue-500">{rating}/10</span>}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
        {item.source_name && <span>{item.source_name}</span>}
        {stale_days > 1 && <span className="text-amber-500">· обновлено {stale_days} дн. назад</span>}
        <span className="ml-auto">
          <Link to="/news" className="btn btn-ghost !px-2 !py-1 text-xs">Все новости →</Link>
        </span>
      </div>
      <GenerationTrace trace={card.trace} meta={meta} />
      <CardActions liked={liked} onLike={onLike} onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Prompt (capture) ──────────────────────────────────────────────

export function PromptCard({ card, onSaved, onDismiss, note, onNote, onQuickReply, onEdit }) {
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const ref = useRef()

  const save = async () => {
    if (!text.trim() || saving) return
    setSaving(true)
    try {
      const today = new Date().toISOString().slice(0, 10)
      if (card.target === 'memory') {
        await memoriesApi.add({ text: text.trim(), date: today })
      } else if (card.target === 'insight') {
        await insightsApi.add({ title: text.trim().slice(0, 80), body: text.trim() })
      } else {
        await inbox.add(text.trim())
      }
      await feedApi.react(card.ref, 'done')
      setSaved(true)
      onSaved?.()
    } catch (e) {
      console.error('Prompt save failed:', e)
    } finally {
      setSaving(false)
    }
  }

  if (saved) {
    const links = { memory: ['/memories', 'Воспоминания'], insight: ['/insights', 'Инсайты'], inbox: ['/inbox', 'Inbox'] }
    const [to, label] = links[card.target] || ['/inbox', 'Inbox']
    return (
      <div className="card p-4 ring-1 ring-emerald-200 dark:ring-emerald-900">
        <CardHeader icon={CheckCircle2} label="Сохранено" iconClass="text-emerald-500" trace={card.trace} />
        <p className="text-sm text-gray-500 dark:text-gray-400">«{text.trim()}»</p>
        <div className="mt-3 flex justify-end">
          <Link to={to} className="btn btn-ghost text-xs">{label} →</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-4 ring-1 ring-gray-900/10 dark:ring-white/10">
      <CardHeader icon={HelpCircle} label="Вопрос дня" iconClass="text-gray-900 dark:text-white" trace={card.trace} />
      <p className="text-base font-medium text-gray-900 dark:text-gray-100">{card.question}</p>
      <textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save() }}
        placeholder="Ответь парой слов или предложения..."
        className="mt-3 w-full bg-gray-50 dark:bg-gray-800/60 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none outline-none
                   placeholder-gray-400 dark:placeholder-gray-500 p-3 min-h-[70px] focus:ring-1 focus:ring-gray-300 dark:focus:ring-gray-600"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-gray-300 dark:text-gray-600">⌘Enter · сохранится как {card.target === 'memory' ? 'воспоминание' : card.target === 'insight' ? 'инсайт' : 'inbox'}</span>
        <div className="flex gap-2">
          <button onClick={onDismiss} className="btn btn-ghost text-xs">Позже</button>
          <button onClick={save} disabled={!text.trim() || saving} className="btn btn-primary text-xs">
            {saving ? '...' : 'Сохранить'}
          </button>
        </div>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Memory ────────────────────────────────────────────────────────

export function MemoryCard({ card, liked, onLike, onDismiss, onSaved, note, onNote, onQuickReply, onEdit }) {
  const { entry, resurfaced, meta } = card
  const [adding, setAdding] = useState(false)
  const [addText, setAddText] = useState('')
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [saving, setSaving] = useState(false)

  const append = async () => {
    if (!addText.trim() || saving) return
    setSaving(true)
    try {
      await memoriesApi.update(entry.id, { text: (entry.text ? entry.text + '\n\n' : '') + addText.trim() })
      setAdding(false)
      setAddText('')
      onSaved?.()
    } catch (e) {
      console.error('Append failed:', e)
    } finally {
      setSaving(false)
    }
  }

  const startEdit = () => {
    setEditText(entry.text || '')
    setEditing(true)
  }

  const saveEdit = async () => {
    if (saving) return
    setSaving(true)
    try {
      await memoriesApi.update(entry.id, { text: editText.trim() })
      setEditing(false)
      onSaved?.()
    } catch (e) {
      console.error('Memory edit failed:', e)
      setSaving(false)
    }
  }

  return (
    <div className="card p-4">
      <CardHeader
        icon={entry.auto ? Sparkles : ImageIcon}
        label={resurfaced ? `«${resurfaced}»` : `${entry.auto ? 'Авто-воспоминание' : 'Воспоминание'} · ${fmtFeedDate(entry.date)}`}
        iconClass={entry.auto ? 'text-violet-500' : resurfaced ? 'text-amber-500' : undefined}
        trace={card.trace}
      />
      <MetaSubtitle meta={meta} />
      {editing ? (
        <div>
          <textarea
            autoFocus
            value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveEdit() }}
            className="w-full bg-gray-50 dark:bg-gray-800/60 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none outline-none
                       placeholder-gray-400 dark:placeholder-gray-500 p-3 min-h-[80px] whitespace-pre-wrap"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={saveEdit} disabled={saving} className="btn btn-primary text-xs">{saving ? '...' : 'Сохранить'}</button>
            <button onClick={() => setEditing(false)} className="btn btn-ghost text-xs">Отмена</button>
          </div>
        </div>
      ) : entry.text ? (
        <p
          onDoubleClick={startEdit}
          title="Двойной клик — редактировать"
          className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap"
        >{entry.text}</p>
      ) : (
        <p
          onClick={startEdit}
          title="Кликни, чтобы добавить текст"
          className="text-sm text-gray-400 italic cursor-pointer hover:text-gray-500 dark:hover:text-gray-400"
        >Нажми, чтобы добавить текст...</p>
      )}
      {entry.photos?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {entry.photos.map(p => (
            <img key={p.id} src={memoriesApi.mediaUrl(p.filename)} alt={p.original_name || ''}
                 className="w-20 h-20 object-cover rounded-lg" />
          ))}
        </div>
      )}
      {adding ? (
        <div className="mt-3">
          <textarea
            autoFocus
            value={addText}
            onChange={e => setAddText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) append() }}
            placeholder="Добавить к этому дню..."
            className="w-full bg-gray-50 dark:bg-gray-800/60 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none outline-none
                       placeholder-gray-400 dark:placeholder-gray-500 p-3 min-h-[60px]"
          />
          <div className="mt-2 flex gap-2">
            <button onClick={append} disabled={!addText.trim() || saving} className="btn btn-primary text-xs">{saving ? '...' : 'Добавить'}</button>
            <button onClick={() => setAdding(false)} className="btn btn-ghost text-xs">Отмена</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={() => setAdding(true)} className="btn btn-ghost !px-2 !py-1 text-xs">✍️ Добавить к этому дню</button>
          <Link to="/memories" className="btn btn-ghost !px-2 !py-1 text-xs">Открыть →</Link>
        </div>
      )}
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions liked={liked} onLike={onLike} onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Insight ───────────────────────────────────────────────────────

export function InsightCard({ card, onDismiss, onSaved, note, onNote, onQuickReply, onEdit }) {
  const { insight, when, meta } = card
  const [done, setDone] = useState(null)

  const answer = async (val) => {
    try {
      if (val === 'yes') {
        await insightsApi.update(insight.id, {})
      } else {
        const d = new Date()
        d.setDate(d.getDate() + 30)
        await insightsApi.update(insight.id, { snoozed_until: d.toISOString().slice(0, 10) })
      }
      await feedApi.react(card.ref, 'done')
      setDone(val)
      onSaved?.()
    } catch (e) {
      console.error('Insight answer failed:', e)
    }
  }

  return (
    <div className="card p-4">
      <CardHeader icon={Lightbulb} label={`Инсайт · ${when}`} iconClass="text-amber-500" trace={card.trace} />
      <MetaSubtitle meta={meta} />
      <p className="font-medium text-gray-900 dark:text-gray-100">{insight.title}</p>
      {insight.body && (
        <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400 line-clamp-4 whitespace-pre-line">{insight.body}</p>
      )}
      {done === 'yes' ? (
        <p className="mt-3 text-xs text-emerald-500">Актуально — зафиксировано ✓</p>
      ) : done === 'no' ? (
        <p className="mt-3 text-xs text-gray-400">Скрыт на 30 дней</p>
      ) : (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-gray-400">Всё ещё актуально?</span>
          <button onClick={() => answer('yes')} className="btn btn-ghost !px-2 !py-1 text-xs">Да</button>
          <button onClick={() => answer('no')} className="btn btn-ghost !px-2 !py-1 text-xs">Не сейчас</button>
          <Link to="/insights" className="btn btn-ghost !px-2 !py-1 text-xs ml-auto">Инсайты →</Link>
        </div>
      )}
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── List pick ─────────────────────────────────────────────────────

const LIST_QUESTIONS = {
  films: 'Хочешь что-то посмотреть сегодня вечером?',
  series: 'Хочешь включить что-то сериальное?',
  books: 'Хочешь что-то почитать?',
  games: 'Хочешь в что-то поиграть?',
  wishes: 'Хочется чего-то попробовать?',
  restaurants: 'Куда сходить поесть?',
  travel: 'Куда отправиться?',
}
const LIST_DONE_VERB = {
  films: 'Смотрел',
  series: 'Смотрел',
  books: 'Прочитал',
  games: 'Сыграл',
  wishes: 'Сделал',
  restaurants: 'Был',
  travel: 'Был',
}

export function ListPickCard({ card, onDismiss, onLater, onSaved, note, onNote, onQuickReply, onEdit }) {
  const { list, list_label, meta } = card
  const [pick, setPick] = useState(card.item)
  const [busy, setBusy] = useState(false)

  const shuffle = async () => {
    setBusy(true)
    try {
      const data = await listsApi.get(list)
      const want = (data.items || []).filter(i => i.status === 'want' && i.id !== pick.id)
      if (want.length > 0) setPick(want[Math.floor(Math.random() * want.length)])
    } finally {
      setBusy(false)
    }
  }

  const markDone = async () => {
    if (busy) return
    setBusy(true)
    try {
      await listsApi.update(list, pick.id, { status: 'done' })
      await feedApi.react(card.ref, 'done')
      onSaved?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4">
      <CardHeader icon={PartyPopper} label={`Подборка · ${list_label}`} trace={card.trace} />
      <MetaSubtitle meta={meta} />
      <p className="text-sm text-gray-500 dark:text-gray-400">{LIST_QUESTIONS[list] || `Хочешь что-то из «${list_label}»?`}</p>
      <p className="mt-2 font-medium text-gray-900 dark:text-gray-100">
        {pick.title}{pick.year ? <span className="text-gray-400 font-normal"> · {pick.year}</span> : null}
      </p>
      {pick.tags?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {pick.tags.slice(0, 4).map(t => (
            <span key={t} className="text-[11px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t}</span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button onClick={shuffle} disabled={busy} className="btn btn-ghost !px-2 !py-1 text-xs">🔀 Другое</button>
        <button onClick={markDone} disabled={busy} className="btn btn-primary !px-2 !py-1 text-xs"
                title="Пометить как завершённое — больше не будет предлагаться">✔ {LIST_DONE_VERB[list] || 'Готово'}</button>
        <button onClick={onLater} className="btn btn-ghost !px-2 !py-1 text-xs ml-auto"
                title="Спрячем, вернёмся к этому через неделю">🕓 Позже</button>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} hideDismiss note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Habit streak ──────────────────────────────────────────────────

export function StreakCard({ card, onDismiss, note, onNote, onQuickReply, onEdit }) {
  const { habit, streak, broken } = card
  const milestone = streak > 0 && streak % 7 === 0
  return (
    <div className={`card p-4 ${broken ? '' : 'ring-1 ring-amber-200 dark:ring-amber-900'}`}>
      <CardHeader icon={Flame} label={broken ? 'Стрик прервался' : 'Стрик'} iconClass={broken ? 'text-gray-400' : 'text-amber-500'} trace={card.trace} />
      <div className="flex items-center gap-3">
        <span className="text-3xl">{broken ? '💔' : '🔥'}</span>
        <div>
          <p className="font-medium text-gray-900 dark:text-gray-100">{habit.label}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {broken ? `Стрик ${streak} дней прервался` : `${streak} дней подряд${milestone ? ' · веха! 🎉' : ''}`}
          </p>
        </div>
      </div>
      <p className="mt-2 text-xs text-gray-400">
        {broken ? 'Не страшно. Завтра — заново, без драмы.' : 'Продолжай — не прерывай.'}
      </p>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Overdue nudge ─────────────────────────────────────────────────

export function OverdueCard({ card, onDismiss, onSaved, note, onNote, onQuickReply, onEdit }) {
  const navigate = useNavigate()

  const start = async (id) => {
    try {
      await treeApi.update(id, { status: 'in_progress' })
      onSaved?.()
    } finally {
      navigate('/pool')
    }
  }

  return (
    <div className="card p-4 ring-1 ring-red-200 dark:ring-red-900">
      <CardHeader icon={AlertTriangle} label={`Просрочено · ${card.count}`} iconClass="text-red-400" trace={card.trace} />
      <div className="space-y-2">
        {card.tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2 text-sm">
            <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{t.title}</span>
            <span className="text-xs text-red-400 flex-shrink-0">{t.days} дн.</span>
            <button onClick={() => start(t.id)} className="btn btn-ghost !px-2 !py-0.5 text-xs flex-shrink-0">Сделать</button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Link to="/pool" className="btn btn-primary text-xs">Все задачи →</Link>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Goal progress ─────────────────────────────────────────────────

export function GoalCard({ card, onDismiss, note, onNote, onQuickReply, onEdit }) {
  const { goal, done, total, pct, this_week } = card
  return (
    <div className="card p-4">
      <CardHeader icon={Target} label="Прогресс цели" trace={card.trace} />
      <p className="font-medium text-gray-900 dark:text-gray-100">{goal.title}</p>
      <div className="mt-2 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: goal.color || '#6B7280' }} />
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-gray-400">
        <span>{done}/{total} · {pct}%</span>
        {this_week > 0 && <span className="text-emerald-500">+{this_week} за неделю</span>}
      </div>
      <div className="mt-3 flex justify-end">
        <Link to="/goals" className="btn btn-ghost text-xs">Открыть →</Link>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Completed (dopamine) ──────────────────────────────────────────

const BURST_EMOJIS = ['🎉', '✨', '🔥', '💫', '⭐']

export function DoneCard({ card, onDismiss, note, onNote, onQuickReply, onEdit }) {
  const [burst, setBurst] = useState(false)

  const celebrate = () => {
    setBurst(true)
    setTimeout(() => setBurst(false), 1200)
  }

  const label = card.days_ago === 0 ? 'сегодня' : card.days_ago === 1 ? 'вчера' : `${card.days_ago} дн. назад`

  return (
    <div className="card p-4 relative overflow-hidden">
      {burst && (
        <div className="absolute inset-x-0 top-6 flex justify-around pointer-events-none">
          {BURST_EMOJIS.map((e, i) => (
            <span key={i} className="burst-emoji text-2xl" style={{ animationDelay: `${i * 60}ms` }}>{e}</span>
          ))}
        </div>
      )}
      <CardHeader icon={CheckCircle2} label={`Готово · ${label}`} iconClass="text-emerald-500" trace={card.trace} />
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{card.task.title}</p>
      <p className="mt-1 text-xs text-gray-400">Ты это сделал. Это считается.</p>
      <div className="mt-3 flex justify-end">
        <button onClick={celebrate} className="btn btn-ghost text-xs">🎉 Отпраздновать</button>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Upcoming (next 3 days) ────────────────────────────────────────

function dueLabel(due) {
  const today = new Date().toISOString().slice(0, 10)
  const diff = Math.round((new Date(due + 'T00:00:00Z') - new Date(today + 'T00:00:00Z')) / 86400000)
  if (diff <= 0) return 'сегодня'
  if (diff === 1) return 'завтра'
  return fmtFeedDate(due)
}

export function UpcomingCard({ card, onDismiss, note, onNote, onQuickReply, onEdit }) {
  return (
    <div className="card p-4">
      <CardHeader icon={CalendarDays} label="Скоро · ближайшие 3 дня" trace={card.trace} />
      <div className="space-y-1.5">
        {card.tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2 text-sm">
            <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{t.title}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{dueLabel(t.due)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Link to="/calendar" className="btn btn-ghost text-xs">Календарь →</Link>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Habits stale ──────────────────────────────────────────────────

function daysWord(n) {
  const d = n % 100
  if (d >= 11 && d <= 14) return 'дней'
  const l = d % 10
  if (l === 1) return 'день'
  if (l >= 2 && l <= 4) return 'дня'
  return 'дней'
}

export function HabitsStaleCard({ card, onDismiss, note, onNote, onQuickReply, onEdit }) {
  return (
    <div className="card p-4">
      <CardHeader icon={Activity} label="Привычки · тишина" trace={card.trace} />
      <p className="text-sm text-gray-700 dark:text-gray-300">
        Трекинг молчит с {fmtFeedDate(card.last_log)} — {card.stale_days} {daysWord(card.stale_days)}.
      </p>
      <p className="mt-1 text-xs text-gray-400">Не обязательно каждый день — но отметь сегодняшние, чтобы стрики жили.</p>
      <div className="mt-3 flex justify-end">
        <Link to="/habits" className="btn btn-primary text-xs">Отметить привычки →</Link>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Inbox pending ─────────────────────────────────────────────────

export function InboxPendingCard({ card, onDismiss, note, onNote, onQuickReply, onEdit }) {
  return (
    <div className="card p-4 ring-1 ring-blue-200 dark:ring-blue-900">
      <CardHeader icon={Inbox} label={`Inbox · ${card.count} ${card.count === 1 ? 'запись' : card.count < 5 ? 'записи' : 'записей'}`} iconClass="text-blue-500" trace={card.trace} />
      <p className="text-sm text-gray-700 dark:text-gray-300">
        {card.count === 1 ? 'Есть необработанная запись' : `${card.count} записей ждут разбора`}
        {card.oldest && <span className="text-gray-400"> · старейшая с {fmtFeedDate(card.oldest)}</span>}
      </p>
      <p className="mt-1 text-xs text-gray-400">Разбери inbox — роутни каждую запись или удали.</p>
      <div className="mt-3 flex justify-end">
        <Link to="/inbox" className="btn btn-primary text-xs">Разобрать →</Link>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Stale in-progress ─────────────────────────────────────────────

export function StaleInProgressCard({ card, onDismiss, onSaved, note, onNote, onQuickReply, onEdit }) {
  const navigate = useNavigate()

  const resume = async (id) => {
    try { await treeApi.update(id, { updated: new Date().toISOString().slice(0, 10) }) } catch {}
    navigate('/pool')
    onSaved?.()
  }

  return (
    <div className="card p-4 ring-1 ring-amber-200 dark:ring-amber-900">
      <CardHeader icon={Clock} label={`В процессе · зависло ${card.count > 1 ? `${card.count} задачи` : 'задача'}`} iconClass="text-amber-500" trace={card.trace} />
      <div className="space-y-2">
        {card.tasks.map(t => (
          <div key={t.id} className="flex items-center gap-2 text-sm">
            <span className="text-gray-700 dark:text-gray-300 flex-1 truncate">{t.title}</span>
            <span className="text-xs text-amber-500 flex-shrink-0">{t.days} дн.</span>
            <button onClick={() => resume(t.id)} className="btn btn-ghost !px-2 !py-0.5 text-xs flex-shrink-0">Продолжить</button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Link to="/pool" className="btn btn-ghost text-xs">Все задачи →</Link>
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── People stale ──────────────────────────────────────────────────

function daysAgoLabel(days) {
  if (days >= 365) return `${Math.round(days / 365)} г.`
  if (days >= 30) return `${Math.round(days / 30)} мес.`
  return `${days} дн.`
}

export function PeopleStalCard({ card, onDismiss, note, onNote, onQuickReply, onEdit }) {
  return (
    <div className="card p-4">
      <CardHeader icon={Users} label="Люди · давно без записей" iconClass="text-gray-500" trace={card.trace} />
      <div className="space-y-2">
        {card.people.map(p => (
          <div key={p.id} className="flex items-center gap-2 text-sm">
            <span className="text-gray-700 dark:text-gray-300 flex-1">{p.name}</span>
            <span className="text-xs text-gray-400">{daysAgoLabel(p.days)} назад</span>
            <Link to={`/people/${p.id}`} className="btn btn-ghost !px-2 !py-0.5 text-xs flex-shrink-0">Открыть</Link>
          </div>
        ))}
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── AI Note ───────────────────────────────────────────────────────

export function AiNoteCard({ card, onDismiss, onSaved, note, onNote, onQuickReply, onEdit }) {
  const [capturing, setCapturing] = useState(false)
  const [captureText, setCaptureText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleAction = async (action) => {
    if (action.id === 'dismiss') { onDismiss?.(); return }
    if (action.id === 'capture') { setCapturing(true); return }
  }

  const saveCapture = async () => {
    if (!captureText.trim() || saving) return
    setSaving(true)
    try {
      await inbox.add(captureText.trim())
      setSaved(true)
      setCapturing(false)
    } catch (e) {
      console.error('Capture failed:', e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={`card p-4 ring-1 ${toneRing(card.meta?.tone)}`}>
      <CardHeader icon={Sparkles} label="Клод · наблюдение" iconClass="text-violet-500" trace={card.trace} />
      <MetaSubtitle meta={card.meta} />
      <p className="font-medium text-gray-900 dark:text-gray-100">{card.title}</p>
      {card.body && <p className="mt-1.5 text-sm text-gray-500 dark:text-gray-400">{card.body}</p>}
      {saved && <p className="mt-2 text-xs text-emerald-500">Сохранено в inbox ✓</p>}
      {capturing && !saved && (
        <div className="mt-3">
          <textarea
            autoFocus
            value={captureText}
            onChange={e => setCaptureText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveCapture() }}
            placeholder="Твоя мысль..."
            className="w-full bg-gray-50 dark:bg-gray-800/60 rounded-lg text-sm text-gray-900 dark:text-gray-100 resize-none outline-none
                       placeholder-gray-400 dark:placeholder-gray-500 p-2.5 min-h-[60px]"
          />
          <div className="mt-1.5 flex gap-2">
            <button onClick={saveCapture} disabled={!captureText.trim() || saving} className="btn btn-primary !px-2 !py-1 text-xs">{saving ? '...' : 'Сохранить'}</button>
            <button onClick={() => setCapturing(false)} className="btn btn-ghost !px-2 !py-1 text-xs">Отмена</button>
          </div>
        </div>
      )}
      {!capturing && !saved && (
        <div className="mt-3 flex items-center gap-2">
          {(card.actions || []).map(a => (
            <button
              key={a.id}
              onClick={() => handleAction(a)}
              className={a.primary ? 'btn btn-primary !px-2 !py-1 text-xs' : 'btn btn-ghost !px-2 !py-1 text-xs'}
            >{a.label}</button>
          ))}
        </div>
      )}
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} onEdit={onEdit} card={card} />
    </div>
  )
}

// ─── Reflection ───────────────────────────────────────────────────

export function ReflectionCard({ card, onDismiss, note, onNote, onQuickReply }) {
  return (
    <div className={`card p-4 ring-1 ${toneRing('curious')}`}>
      <CardHeader icon={HelpCircle} label="Вопрос к себе" iconClass="text-violet-400" trace={card.trace} />
      <MetaSubtitle meta={card.meta} />
      <p className="font-medium text-gray-900 dark:text-gray-100 leading-snug">{card.question}</p>
      {card.context && <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">{card.context}</p>}
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} card={card} />
    </div>
  )
}

// ─── Celebration ──────────────────────────────────────────────────

export function CelebrationCard({ card, onDismiss, note, onNote, onQuickReply }) {
  return (
    <div className="card p-4 ring-1 ring-emerald-300 dark:ring-emerald-800">
      <CardHeader icon={PartyPopper} label="Победа" iconClass="text-emerald-500" trace={card.trace} />
      <MetaSubtitle meta={card.meta} />
      <p className="font-semibold text-gray-900 dark:text-gray-100">{card.title}</p>
      {card.body && <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{card.body}</p>}
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} card={card} />
    </div>
  )
}

// ─── Challenge ────────────────────────────────────────────────────

export function ChallengeCard({ card, onDismiss, note, onNote, onQuickReply }) {
  const [accepted, setAccepted] = useState(false)
  return (
    <div className={`card p-4 ring-1 ${toneRing('motivating')}`}>
      <CardHeader icon={Target} label="Вызов недели" iconClass="text-amber-500" trace={card.trace} />
      <MetaSubtitle meta={card.meta} />
      <p className="font-semibold text-gray-900 dark:text-gray-100">{card.title}</p>
      {card.description && <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{card.description}</p>}
      <div className="mt-3 flex items-center gap-2">
        {!accepted ? (
          <button onClick={() => setAccepted(true)} className="btn btn-primary !px-2 !py-1 text-xs">
            {card.acceptance_label || 'Принять вызов'}
          </button>
        ) : (
          <span className="text-xs text-emerald-500">Принято ✓</span>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs px-1.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 ml-auto">
            Скрыть ✕
          </button>
        )}
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions note={note} onNote={onNote} onQuickReply={onQuickReply} card={card} hideDismiss />
    </div>
  )
}

// ─── Pattern ──────────────────────────────────────────────────────

export function PatternCard({ card, onDismiss, note, onNote, onQuickReply }) {
  return (
    <div className={`card p-4 ring-1 ${toneRing('curious')}`}>
      <CardHeader icon={Activity} label="Паттерн" iconClass="text-blue-400" trace={card.trace} />
      <MetaSubtitle meta={card.meta} />
      <p className="font-semibold text-gray-900 dark:text-gray-100">{card.title}</p>
      {card.observation && <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{card.observation}</p>}
      {card.implication && (
        <p className="mt-2 text-sm text-violet-600 dark:text-violet-400 font-medium">→ {card.implication}</p>
      )}
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions onDismiss={onDismiss} note={note} onNote={onNote} onQuickReply={onQuickReply} card={card} />
    </div>
  )
}

// ─── Nudge (initiation) ───────────────────────────────────────────

export function NudgeCard({ card, onDismiss, note, onNote, onQuickReply }) {
  const { message, action_label, action_target, action_link, detail, meta } = card

  const handleAction = () => {
    if (action_target) {
      window.dispatchEvent(new CustomEvent('life-os:capture'))
    } else if (action_link) {
      // navigation handled by Link below
    }
  }

  return (
    <div className={`card p-4 ring-1 ${card.nudge_type === 'ai_generated' ? toneRing(card.meta?.tone) : 'ring-blue-100 dark:ring-blue-900/50'}`}>
      <CardHeader icon={MessageSquare} label="Наблюдение" iconClass="text-blue-400" trace={card.trace} />
      <MetaSubtitle meta={meta} />
      <p className="text-sm text-gray-700 dark:text-gray-300">{message}</p>
      {detail && <p className="mt-1 text-xs text-gray-400">{detail}</p>}
      <div className="mt-3 flex items-center gap-2">
        {action_label && action_target && (
          <button onClick={handleAction} className="btn btn-primary !px-2 !py-1 text-xs">{action_label}</button>
        )}
        {action_link && (
          <Link to={action_link} className="btn btn-ghost !px-2 !py-1 text-xs">
            {action_label || 'Открыть'} →
          </Link>
        )}
        {onDismiss && (
          <button onClick={onDismiss} className="text-xs px-1.5 text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 ml-auto">
            Скрыть ✕
          </button>
        )}
      </div>
      <GenerationTrace trace={card.trace} meta={card.meta} />
      <CardActions note={note} onNote={onNote} onQuickReply={onQuickReply} card={card} hideDismiss />
    </div>
  )
}

// ─── End of feed ───────────────────────────────────────────────────

export function EndCard({ onExtend, extending }) {
  return (
    <div className="py-10 text-center">
      <div className="text-2xl mb-2 text-gray-300 dark:text-gray-700">✦</div>
      <p className="text-sm text-gray-400 dark:text-gray-500">Всё на сегодня. Есть что добавить?</p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('life-os:capture'))}
          className="btn btn-primary"
        >
          Быстрый захват
        </button>
        {onExtend && (
          <button
            onClick={onExtend}
            disabled={extending}
            className="btn btn-ghost flex items-center gap-1.5"
          >
            {extending
              ? <><Sparkles size={14} className="animate-pulse text-violet-500" /> Думаю...</>
              : <><Sparkles size={14} /> Догрузить</>
            }
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-300 dark:text-gray-600">или нажми ⌘K / кнопку +</p>
    </div>
  )
}
