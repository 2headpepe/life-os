export function leafStats(node, nodesMap = {}) {
  const children = node.children || []
  if (children.length) return children.reduce((sum, child) => {
    const result = leafStats(child, nodesMap)
    return { total: sum.total + result.total, done: sum.done + result.done, dropped: sum.dropped + result.dropped, undef: sum.undef + result.undef }
  }, { total: 0, done: 0, dropped: 0, undef: 0 })
  const blocked = (node.blocked_by || []).some(id => nodesMap[id]?.status !== 'done')
  return {
    total: node.status === 'dropped' ? 0 : 1,
    done: node.status === 'done' ? 1 : 0,
    dropped: node.status === 'dropped' ? 1 : 0,
    undef: !blocked && (!node.status || node.status === 'undefined') ? 1 : 0,
  }
}

export function goalProgressLabel(stats) {
  const completed = stats.total ? `${stats.done === 1 ? 'Выполнена' : 'Выполнено'} ${stats.done} из ${stats.total}` : ''
  const dropped = stats.dropped ? `${stats.dropped} ${stats.dropped % 10 === 1 && stats.dropped % 100 !== 11 ? 'отменена' : [2, 3, 4].includes(stats.dropped % 10) && ![12, 13, 14].includes(stats.dropped % 100) ? 'отменены' : 'отменено'}` : ''
  return [completed, dropped].filter(Boolean).join(' · ')
}
