import test from 'node:test'
import assert from 'node:assert/strict'
import { serializePageContext } from './pageContext.js'

globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 }
globalThis.window = { getComputedStyle: element => ({ display: element.display || 'block', visibility: 'visible' }) }
globalThis.location = { href: 'http://localhost:5173/today' }

function text(value) { return { nodeType: 3, textContent: value } }
function element(tagName, children = [], attributes = {}) {
  const node = {
    nodeType: 1, tagName, childNodes: children, children: children.filter(child => child.nodeType === 1),
    parentElement: null, hidden: Boolean(attributes.hidden), display: attributes.display,
    value: attributes.value, type: attributes.type, checked: attributes.checked,
    getAttribute: key => attributes[key] || null,
    closest: selector => selector === '[data-page-context-ignore]' && (attributes.ignore || node.parentElement?.closest(selector)) ? node : null,
    querySelector: () => null,
  }
  for (const child of node.children) child.parentElement = node
  return node
}

test('serializes loaded page semantics and current controls without hidden content', () => {
  const root = element('MAIN', [
    element('H1', [text('Сегодня')]),
    element('P', [text('Задача ниже прокрутки')]),
    element('UL', [element('LI', [text('Первое'), element('UL', [element('LI', [text('Вложенное')])])])]),
    element('TABLE', [element('TR', [element('TH', [text('Имя')]), element('TD', [text('Анна')])])]),
    element('LABEL', [text('Готово'), element('INPUT', [], { type: 'checkbox', checked: true })]),
    element('LABEL', [text('Заметка'), element('TEXTAREA', [], { value: 'Текущее значение' })]),
    element('A', [text('Подробнее')], { href: '/goals' }),
    element('DIV', [text('Скрытый раздел')], { display: 'none' }),
    element('INPUT', [], { type: 'password', value: 'секрет' }),
    element('DETAILS', [element('SUMMARY', [text('Закрытая вкладка')]), element('P', [text('Ещё не открыто')])]),
    element('DIV', [text('Служебный блок')], { ignore: true }),
  ])
  const result = serializePageContext(root, { title: 'Life OS', url: location.href })
  for (const expected of ['# Сегодня', 'Задача ниже прокрутки', '- Первое', '- Вложенное', '| Имя | Анна |', 'Готово [x]', 'Текущее значение', '[Подробнее](http://localhost:5173/goals)']) {
    assert.ok(result.includes(expected), `missing ${expected}`)
  }
  assert.doesNotMatch(result, /Скрытый раздел|Служебный блок|секрет|Ещё не открыто/)
})
