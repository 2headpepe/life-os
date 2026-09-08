import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function stripFrontmatter(text) {
  if (!text) return ''
  const lines = text.split('\n')
  // find first '---' separator and skip everything before it
  const sep = lines.findIndex(l => l.trim() === '---')
  if (sep === -1) return text
  return lines.slice(sep + 1).join('\n').trimStart()
}

const components = {
  h1: ({ children }) => <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-6 mb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold text-gray-800 dark:text-gray-200 mt-5 mb-2 border-b border-gray-100 dark:border-gray-800 pb-1">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mt-4 mb-1">{children}</h3>,
  p: ({ children }) => <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-3">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside mb-3 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside mb-3 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-gray-100">{children}</strong>,
  em: ({ children }) => <em className="italic text-gray-600 dark:text-gray-400">{children}</em>,
  code: ({ inline, children }) => inline
    ? <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1 py-0.5 rounded">{children}</code>
    : <pre className="font-mono text-xs bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 p-3 rounded mb-3 overflow-x-auto"><code>{children}</code></pre>,
  blockquote: ({ children }) => <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 pl-4 my-3 text-gray-500 dark:text-gray-400 italic">{children}</blockquote>,
  hr: () => <hr className="border-gray-200 dark:border-gray-700 my-4" />,
}

export default function MarkdownContent({ text, stripHeader = true }) {
  const content = stripHeader ? stripFrontmatter(text) : text
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  )
}
