import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  Sun, Target, ListTodo, CalendarDays, Repeat2, Users, LayoutGrid, Lightbulb, Newspaper, Image as ImageIcon,
  ChevronLeft, ChevronRight, Search, Plus, Terminal, Sparkles, Flame,
} from 'lucide-react'
import { tree as treeApi, config as configApi } from '../api'
import { openInConsole } from '../utils/openInConsole'

const COLLAPSED_KEY = 'life-os:sidebar:collapsed'

const ALL_NAV = [
  { to: '/',         label: 'Лента',     Icon: Flame,       end: true },
  { to: '/today',    label: 'Сегодня',   Icon: Sun },
  { to: '/goals',    label: 'Цели',       Icon: Target },
  { to: '/pool',     label: 'Задачи',     Icon: ListTodo },
  { to: '/calendar', label: 'Календарь',  Icon: CalendarDays },
  { to: '/habits',   label: 'Привычки',   Icon: Repeat2 },
  { to: '/people',   label: 'Люди',       Icon: Users },
  { to: '/lists',    label: 'Списки',     Icon: LayoutGrid },
  { to: '/insights', label: 'Инсайты',    Icon: Lightbulb },
  { to: '/memories', label: 'Воспоминания', Icon: ImageIcon },
  { to: '/news',     label: 'Новости',     Icon: Newspaper },
]

export default function Sidebar({ onCapture, onSearch, sphere, setSphere }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSED_KEY) === 'true' } catch { return false }
  })
  const [roots, setRoots] = useState([])
  const [cliCommand, setCliCommand] = useState('claude')

  useEffect(() => {
    treeApi.all().then(nodes => setRoots(nodes.filter(n => !n.parent_id)))
    configApi.get().then(c => setCliCommand(c.cliCommand || 'claude')).catch(() => {})
  }, [])

  const toggle = () => setCollapsed(v => {
    const next = !v
    try { localStorage.setItem(COLLAPSED_KEY, String(next)) } catch {}
    return next
  })

  const w = collapsed ? 'w-12' : 'w-56'

  return (
    <aside className={`${w} flex-shrink-0 h-screen sticky top-0 border-r border-gray-100 dark:border-gray-800
                      bg-white dark:bg-gray-950 flex flex-col py-5 px-2 gap-1 overflow-y-auto overflow-x-hidden transition-all duration-200`}>

      {/* Header */}
      <div className={`flex items-center mb-4 px-1 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 tracking-tight px-2">Life OS</span>
        )}
        <button
          onClick={toggle}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
          title={collapsed ? 'Развернуть' : 'Свернуть'}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      {ALL_NAV.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `sidebar-item ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-0' : ''}`
          }
        >
          <Icon size={16} className="flex-shrink-0" />
          {!collapsed && label}
        </NavLink>
      ))}

      {/* Domains */}
      <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
        {!collapsed && (
          <div className="section-title px-3 flex items-center gap-1.5">
            Домены
            <span className="text-[9px] text-gray-300 dark:text-gray-600 font-normal normal-case tracking-normal">→ фильтр задач</span>
          </div>
        )}
        {roots.map(root => (
          <button
            key={root.id}
            onClick={() => setSphere(sphere === root.id ? null : root.id)}
            title={collapsed ? root.title : undefined}
            className={`sidebar-item w-full text-left ${sphere === root.id ? 'active' : ''} ${collapsed ? 'justify-center px-0' : ''}`}
          >
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: root.color || '#6B7280' }} />
            {!collapsed && root.title}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-auto pt-4 space-y-1 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={() => openInConsole()}
          title={collapsed ? `Открыть ${cliCommand}` : undefined}
          className={`sidebar-item w-full text-left text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <Terminal size={16} className="flex-shrink-0" />
          {!collapsed && cliCommand}
        </button>
        <button
          onClick={onSearch}
          title={collapsed ? 'Поиск ⌘F' : undefined}
          className={`sidebar-item w-full text-left text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <Search size={16} className="flex-shrink-0" />
          {!collapsed && <>Поиск <span className="ml-auto text-xs text-gray-300 dark:text-gray-600">⌘F</span></>}
        </button>
        <button
          onClick={onCapture}
          title={collapsed ? 'Захват ⌘K' : undefined}
          className={`sidebar-item w-full text-left text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ${collapsed ? 'justify-center px-0' : ''}`}
        >
          <Plus size={16} className="flex-shrink-0" />
          {!collapsed && <>Захват <span className="ml-auto text-xs text-gray-300 dark:text-gray-600">⌘K</span></>}
        </button>
      </div>
    </aside>
  )
}
