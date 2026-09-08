import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Target, LayoutGrid, Lightbulb, X } from 'lucide-react'
import { pulse as pulseApi, inbox as inboxApi } from '../api'

const TYPE_META = {
  node:      { Icon: Target,     label: 'Узел' },
  list_item: { Icon: LayoutGrid, label: 'Список' },
  insight:   { Icon: Lightbulb,  label: 'Инсайт' },
}

const REASON_LABEL = {
  undefined:      'не определено',
  floating:       'висит без даты',
  someday_review: 'пора пересмотреть',
  someday_stale:  'давно в «когда-нибудь»',
  want_stale:     'давно в «хочу»',
  not_reviewed:   'не просматривался',
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ inbox: [], alerts: [], total: 0 })
  const [acking, setAcking] = useState(null)
  const [snoozeFor, setSnoozeFor] = useState(null)
  const ref = useRef(null)
  const navigate = useNavigate()

  const load = () => pulseApi.get().then(setData).catch(() => {})

  useEffect(() => {
    load()
    const iv = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const ack = async (alert, snooze_days = null) => {
    setAcking(alert.id)
    setSnoozeFor(null)
    await pulseApi.ack(alert.type, alert.sphere, alert.id, snooze_days)
    await load()
    setAcking(null)
  }

  const deleteInbox = async (id) => {
    await inboxApi.delete(id)
    await load()
  }

  const discuss = (alert) => {
    fetch('/api/open-claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Хочу обсудить: ${alert.title} (${TYPE_META[alert.type]?.label})` }),
    })
    setOpen(false)
  }

  const total = data.total || 0

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Уведомления"
      >
        <Bell size={16} />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-96 max-h-[80vh] overflow-y-auto z-50
                        bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700
                        rounded-xl shadow-xl">

          {/* Входящие */}
          {data.inbox.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Входящие
                </span>
                <span className="text-xs text-gray-400">{data.inbox.length}</span>
              </div>
              {data.inbox.map(item => (
                <div key={item.id} className="px-4 py-2 flex items-start gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 group">
                  <span className="text-gray-400 mt-0.5 flex-shrink-0">·</span>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 leading-snug">{item.text}</span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={() => { navigate('/inbox'); setOpen(false) }}
                      className="text-xs text-blue-500 hover:text-blue-700 px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      открыть
                    </button>
                    <button
                      onClick={() => deleteInbox(item.id)}
                      className="flex items-center justify-center text-gray-400 hover:text-red-500 px-1 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => { navigate('/inbox'); setOpen(false) }}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  Открыть инбокс →
                </button>
              </div>
            </div>
          )}

          {/* Требует внимания */}
          {data.alerts.length > 0 && (
            <div>
              <div className="px-4 pt-3 pb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Требует внимания
                </span>
                <span className="text-xs text-gray-400">{data.alerts.length}</span>
              </div>
              {data.alerts.map(alert => {
                const meta = TYPE_META[alert.type] || {}
                const isAcking = acking === alert.id
                return (
                  <div key={alert.id} className="px-4 py-3 border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                    <div className="flex items-start gap-2">
                      {meta.Icon && <meta.Icon size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">{meta.label}</span>
                          <span className="text-xs text-orange-400 ml-auto">{alert.days_stale}д</span>
                        </div>
                        <p className="text-sm text-gray-800 dark:text-gray-200 mt-0.5 leading-snug">{alert.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{REASON_LABEL[alert.reason] || alert.reason}</p>
                      </div>
                    </div>
                    <div className="mt-2 ml-6">
                      {snoozeFor === alert.id ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs text-gray-400 mr-1">не напоминать:</span>
                          {[7, 14, 30, 60].map(d => (
                            <button
                              key={d}
                              disabled={isAcking}
                              onClick={() => ack(alert, d)}
                              className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400
                                         hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400
                                         transition-colors disabled:opacity-40"
                            >
                              {isAcking ? '...' : `${d}д`}
                            </button>
                          ))}
                          <button
                            onClick={() => setSnoozeFor(null)}
                            className="flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1 py-1"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            disabled={isAcking}
                            onClick={() => setSnoozeFor(alert.id)}
                            className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400
                                       hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900/30 dark:hover:text-green-400
                                       transition-colors disabled:opacity-40"
                          >
                            Актуально
                          </button>
                          <button
                            onClick={() => discuss(alert)}
                            className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400
                                       hover:bg-blue-100 hover:text-blue-700 dark:hover:bg-blue-900/30 dark:hover:text-blue-400
                                       transition-colors"
                          >
                            Обсудить
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {total === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Всё актуально
            </div>
          )}
        </div>
      )}
    </div>
  )
}
