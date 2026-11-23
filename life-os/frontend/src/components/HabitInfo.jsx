import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import { entityPath, nodePath } from '../utils/entityLinks'

export default function HabitInfo({ habit, nodes, showLinked = true }) {
  const linkedNode = habit.node_id ? nodes.find(node => node.id === habit.node_id) : null
  const linkedPath = linkedNode ? nodePath(nodes, linkedNode) : null
  const linkedKind = linkedNode && nodes.some(node => node.parent_id === linkedNode.id) ? 'целью' : 'задачей'

  return <div className="min-w-0 flex-1">
    <Link to={entityPath.habit(habit.id)} className="text-sm font-medium text-gray-800 hover:text-blue-600 dark:text-gray-200 dark:hover:text-blue-400">{habit.label}</Link>
    {habit.detail && <p className="mt-0.5 text-xs text-gray-400">{habit.detail}</p>}
    {showLinked && linkedPath && <Link to={linkedPath} className="mt-1 flex items-center gap-1 text-xs text-blue-500 hover:underline dark:text-blue-400">
      <Target size={11} aria-hidden="true" /> Связана с {linkedKind}: {linkedNode.title}
    </Link>}
  </div>
}
