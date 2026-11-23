const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'SVG', 'CANVAS', 'TEMPLATE'])
const BLOCK_TAGS = new Set(['ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'HEADER', 'MAIN', 'NAV', 'P', 'SECTION'])

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function visible(element) {
  if (element.hidden || element.inert || element.getAttribute('aria-hidden') === 'true') return false
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse'
}

function controlText(element) {
  const tag = element.tagName
  if (tag === 'INPUT') {
    const type = (element.type || 'text').toLowerCase()
    if (['hidden', 'password', 'file', 'submit', 'reset', 'button', 'image'].includes(type)) return ''
    if (type === 'checkbox' || type === 'radio') return element.checked ? '[x]' : '[ ]'
    return clean(element.value)
  }
  if (tag === 'TEXTAREA') return clean(element.value)
  if (tag === 'SELECT') return [...element.selectedOptions].map(option => clean(option.textContent)).filter(Boolean).join(', ')
  return ''
}

function serializeNode(node, depth = 0) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent || ''
  if (node.nodeType !== Node.ELEMENT_NODE) return ''
  const element = node
  const tag = element.tagName
  if (SKIP_TAGS.has(tag) || element.closest('[data-page-context-ignore]') || !visible(element)) return ''
  if (tag === 'DETAILS' && !element.open) {
    const summary = element.querySelector(':scope > summary')
    return summary ? serializeNode(summary, depth) : ''
  }
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return controlText(element)
  if (tag === 'BR') return '\n'

  const children = () => [...element.childNodes].map(child => serializeNode(child, depth + 1)).join('')
  if (/^H[1-6]$/.test(tag)) return `\n${'#'.repeat(Number(tag[1]))} ${clean(children())}\n`
  if (tag === 'A') {
    const label = clean(children())
    const href = element.getAttribute('href')
    if (!label) return ''
    if (!href || href.startsWith('javascript:')) return label
    try { return `[${label}](${new URL(href, location.href).href})` } catch { return label }
  }
  if (tag === 'LI') {
    let nesting = 0
    for (let parent = element.parentElement; parent; parent = parent.parentElement) if (parent.tagName === 'LI') nesting++
    const nestedLists = [...element.children].filter(child => ['UL', 'OL'].includes(child.tagName))
    const direct = [...element.childNodes].filter(child => !nestedLists.includes(child)).map(child => serializeNode(child, depth + 1)).join('')
    return `\n${'  '.repeat(nesting)}- ${clean(direct)}${nestedLists.map(list => serializeNode(list, depth + 1)).join('')}`
  }
  if (tag === 'TH' || tag === 'TD') return clean(children())
  if (tag === 'TR') return `\n| ${[...element.children].filter(child => ['TH', 'TD'].includes(child.tagName)).map(child => serializeNode(child, depth + 1)).join(' | ')} |`
  if (tag === 'IMG') return clean(element.alt) ? `[Изображение: ${clean(element.alt)}]` : ''
  if (tag === 'BUTTON') {
    const label = clean(children()) || clean(element.getAttribute('aria-label') || element.title)
    return label ? `[Кнопка: ${label}]` : ''
  }
  if (tag === 'LABEL') return `${clean([...element.childNodes].map(child => serializeNode(child, depth + 1)).join(' '))} `
  const content = children()
  if (BLOCK_TAGS.has(tag) || ['UL', 'OL', 'TABLE', 'THEAD', 'TBODY', 'TFOOT'].includes(tag)) return `\n${content}\n`
  return content
}

export function serializePageContext(root, { title = document.title, url = location.href } = {}) {
  const body = serializeNode(root)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return `Контекст текущей страницы Life OS\nСтраница: ${title || 'Life OS'}\nURL: ${url}\n\n${body || '(На странице нет отображаемого текста.)'}\n\nКонтекст получен из загруженной и отображаемой страницы. Закрытые вкладки и ещё не загруженные элементы в него не входят.`
}
