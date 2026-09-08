import { useState, useEffect } from 'react'
import MarkdownContent from '../components/MarkdownContent'

const api = (path) => fetch(`/api${path}`).then(r => r.json())

export default function Topics() {
  const [topics, setTopics] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api('/topics').then(setTopics) }, [])

  const select = async (topic) => {
    if (selected?.slug === topic.slug) { setSelected(null); setContent(null); return }
    setSelected(topic)
    setContent(null)
    setLoading(true)
    const data = await api(`/topics/${topic.slug}`)
    setContent(data.content)
    setLoading(false)
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-52 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto py-4">
        <div className="px-4 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Темы</div>
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
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Выбери тему слева
          </div>
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
