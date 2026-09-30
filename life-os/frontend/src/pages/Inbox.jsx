import { useState, useEffect } from 'react'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { inbox as inboxApi, tree as treeApi } from '../api'
import { useSpheres } from '../SpheresContext'
import PageOnboarding from '../components/PageOnboarding'

function InboxItem({ item, onDelete, onCreateTask }) {
  const { SPHERE_ORDER, SPHERE_LABELS } = useSpheres()
  const [expanded, setExpanded] = useState(false)
  const [sphere, setSphere] = useState('home')
  const [converting, setConverting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (e) => {
    e.stopPropagation()
    setDeleting(true)
    await inboxApi.delete(item.id)
    onDelete()
  }

  const handleCreateTask = async () => {
    setConverting(true)
    await treeApi.add({
      title: item.text.length > 80 ? item.text.slice(0, 80) + '…' : item.text,
      notes: item.text.length > 80 ? item.text : null,
      parent_id: `root-${sphere}`,
      status: 'undefined',
    })
    await inboxApi.delete(item.id)
    onDelete()
  }

  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 py-3 cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-900/30 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-gray-800 dark:text-gray-200 flex-1">{item.text}</p>
          <div className="flex items-center gap-1 flex-shrink-0">
            {item.tags?.includes('urgent') && (
              <span className="text-xs bg-red-100 dark:bg-red-900/50 text-red-500 px-1.5 py-0.5 rounded-md">!</span>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-6 h-6 rounded-md flex items-center justify-center text-gray-300 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors text-xs"
              title="Удалить"
            >
              <X size={12} />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">{item.added}</span>
          {(item.tags || []).filter(t => t !== 'urgent').map(t => (
            <span key={t} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-400 px-1.5 py-0.5 rounded-md">{t}</span>
          ))}
          <span className="ml-auto text-gray-300 dark:text-gray-600">{expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</span>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-4 py-3 bg-gray-50/50 dark:bg-gray-900/20">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Что сделать с этим?</div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Create task */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1">
              <span className="text-xs text-gray-500">→ Задача в</span>
              <select
                value={sphere}
                onChange={e => setSphere(e.target.value)}
                className="text-xs bg-transparent text-gray-700 dark:text-gray-300 outline-none cursor-pointer"
                onClick={e => e.stopPropagation()}
              >
                {SPHERE_ORDER.map(id => (
                  <option key={id} value={id}>{SPHERE_LABELS[id]}</option>
                ))}
              </select>
              <button
                onClick={handleCreateTask}
                disabled={converting}
                className="text-xs text-blue-500 hover:text-blue-600 font-medium"
              >
                {converting ? '...' : 'Создать'}
              </button>
            </div>

            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs text-gray-400 hover:text-red-400 px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-800 transition-colors bg-white dark:bg-gray-900"
            >
              Удалить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Inbox() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    const data = await inboxApi.all()
    setItems(data.items || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="max-w-2xl mx-auto py-8 px-6">
      <PageOnboarding pageId="inbox" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Входящие</h1>
        <span className="text-sm text-gray-400">{items.length} элементов</span>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Загрузка...</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-sm">Входящие пусты</p>
          <p className="text-gray-300 dark:text-gray-600 text-xs mt-1">Нажми ⌘K, чтобы добавить мысль</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <InboxItem key={item.id} item={item} onDelete={load} onCreateTask={load} />
          ))}
        </div>
      )}
    </div>
  )
}
