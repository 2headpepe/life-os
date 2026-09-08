import { useState, useEffect } from 'react'

const api = (path) => fetch(`/api${path}`).then(r => r.json())

const HIDDEN_KEYS = new Set(['id', 'type', 'confidence'])

function parseValue(val) {
  return val.split('|').map(item => {
    const gtIdx = item.indexOf('>')
    if (gtIdx !== -1) {
      return { subkey: item.slice(0, gtIdx).replace(/_/g, ' '), val: item.slice(gtIdx + 1).replace(/_/g, ' ') }
    }
    return { val: item.replace(/_/g, ' ') }
  })
}

function PersonContent({ content }) {
  if (!content) return null
  const lines = content.split('\n').filter(l => l.trim())
  const rows = []
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const val = line.slice(colonIdx + 1).trim()
    if (!val || HIDDEN_KEYS.has(key)) continue
    rows.push({ key, val })
  }

  return (
    <div className="space-y-3">
      {rows.map(({ key, val }, i) => {
        if (key === 'links') {
          const links = val.replace(/\[\[|\]\]/g, '').split('|').map(l => l.split('/').pop().replace(/_/g, ' '))
          return (
            <div key={i} className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <div className="text-xs text-gray-400 mb-1">Связи</div>
              <div className="flex flex-wrap gap-1">
                {links.map((l, j) => (
                  <span key={j} className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">{l}</span>
                ))}
              </div>
            </div>
          )
        }
        const items = parseValue(val)
        const isList = items.length > 1 || items[0]?.subkey
        return (
          <div key={i}>
            <div className="text-xs font-medium text-gray-400 mb-0.5">{key.replace(/_/g, ' ')}</div>
            {isList ? (
              <div className="space-y-0.5">
                {items.map((item, j) => (
                  <div key={j} className="text-sm text-gray-700 dark:text-gray-300">
                    {item.subkey
                      ? <><span className="text-gray-400">{item.subkey}:</span> {item.val}</>
                      : item.val}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-700 dark:text-gray-300">{items[0]?.val}</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function People() {
  const [people, setPeople] = useState([])
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => { api('/people').then(setPeople) }, [])

  const select = async (person) => {
    if (selected?.id === person.id) { setSelected(null); setDetail(null); return }
    setSelected(person)
    setDetail(null)
    setLoading(true)
    const data = await api(`/people/${person.id}`)
    setDetail(data)
    setLoading(false)
  }

  return (
    <div className="h-full flex overflow-hidden">
      <div className="w-52 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 overflow-y-auto py-4">
        <div className="px-4 py-1 text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">Люди</div>
        {people.map(p => (
          <button
            key={p.id}
            onClick={() => select(p)}
            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
              selected?.id === p.id
                ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-900'
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!selected && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">Выбери человека слева</div>
        )}
        {selected && (
          <div className="max-w-xl py-8 px-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{selected.name}</h2>
              {selected.relation && (
                <div className="text-sm text-gray-400 mt-0.5">{selected.relation.replace(/_/g, ' ')}</div>
              )}
            </div>
            {loading && <div className="text-sm text-gray-400">Загрузка...</div>}
            {detail && <PersonContent content={detail.content} />}
          </div>
        )}
      </div>
    </div>
  )
}
