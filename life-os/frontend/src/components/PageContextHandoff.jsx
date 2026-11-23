import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ClipboardCopy } from 'lucide-react'
import { serializePageContext } from '../utils/pageContext'
import { api } from '../api'

export default function PageContextHandoff() {
  const pasteShortcut = navigator.platform.includes('Mac') ? '⌘V' : 'Ctrl+V'
  const [context, setContext] = useState('')
  const [message, setMessage] = useState('')
  const textArea = useRef(null)

  async function handoff() {
    const root = document.querySelector('#root')
    if (!root) return
    const text = serializePageContext(root)
    setContext(text)
    try {
      await navigator.clipboard.writeText(text)
      setMessage(`Контекст скопирован. Вставьте его в уже открытый чат Codex (${pasteShortcut}).`)
      await showCodex()
    } catch {
      setMessage('Браузер не разрешил копирование. Выделите текст ниже и скопируйте его вручную.')
      requestAnimationFrame(() => textArea.current?.select())
    }
  }

  async function showCodex() {
    try {
      await api.post('/codex/activate', {})
      setMessage(`Codex открыт. Вставьте контекст в нужный уже открытый чат (${pasteShortcut}).`)
    } catch {
      setMessage(`Откройте уже запущенный Codex вручную и вставьте скопированный контекст (${pasteShortcut}).`)
    }
  }

  return (
    <div data-page-context-ignore>
      <button type="button" onClick={handoff}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        title="Скопировать текст всей загруженной страницы для Codex">
        <ClipboardCopy size={14} className="mr-1.5 inline" />В Codex
      </button>
      {context && createPortal(<div data-page-context-ignore role="dialog" aria-modal="true" aria-label="Передача страницы в Codex" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4">
        <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl min-h-0 flex-col overflow-y-auto rounded-xl bg-white p-4 text-gray-900 shadow-xl dark:bg-gray-900 dark:text-gray-100 sm:max-h-[calc(100dvh-2rem)] sm:p-5">
          <h2 className="text-lg font-semibold">Контекст страницы для Codex</h2>
          <p className="mt-2 text-sm">{message}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Текст подготовлен из текущей страницы. Life OS пока не может напрямую вставить его в существующий чат Codex.</p>
          <textarea ref={textArea} readOnly value={context} aria-label="Подготовленный контекст страницы" className="mt-4 min-h-24 w-full flex-1 resize-none overflow-auto rounded-lg border border-gray-300 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800" />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => navigator.clipboard.writeText(context).then(() => setMessage(`Контекст скопирован. Вставьте его в Codex (${pasteShortcut}).`)).catch(() => textArea.current?.select())} className="rounded-lg border px-3 py-2 text-sm">Скопировать ещё раз</button>
            <button type="button" onClick={showCodex} className="rounded-lg bg-violet-700 px-3 py-2 text-sm text-white">Показать Codex</button>
            <button type="button" onClick={() => setContext('')} className="rounded-lg border px-3 py-2 text-sm">Закрыть</button>
          </div>
        </div>
      </div>, document.body)}
    </div>
  )
}
