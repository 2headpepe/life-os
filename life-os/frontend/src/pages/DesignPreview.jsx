import { useState } from 'react'
import {
  ArrowUpRight, Bell, CalendarDays, Check, ChevronDown, CircleCheck, Clock3,
  Command, Flame, Grid2X2, Layers3, ListChecks, MoreHorizontal, Plus,
  Search, Settings2, Sparkles, Target, TrendingUp,
} from 'lucide-react'

const navigation = [
  ['Today', Sparkles], ['Focus', Target], ['Goals', Layers3], ['Tasks', ListChecks], ['Calendar', CalendarDays],
]

const previewScreens = [
  ['Feed', 'A calm daily briefing with one primary next action.'],
  ['Goals', 'Layered cards make progress and structure legible at a glance.'],
  ['Pool', 'Filters and tasks become a controllable glass workspace.'],
  ['Habits', 'Rings, toggles and history share the same tactile language.'],
]

function Metric({ label, value, delta, tone = 'aqua', icon: Icon }) {
  return <article className={`glass-metric tone-${tone}`}>
    <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={15} /></span></div>
    <strong>{value}</strong>
    <small className={delta?.startsWith('+') ? 'positive' : ''}>{delta}</small>
  </article>
}

export default function DesignPreview() {
  const [section, setSection] = useState('Today')
  const [focusMode, setFocusMode] = useState(false)
  const [done, setDone] = useState(false)
  const [range, setRange] = useState('Week')

  return <main className="glass-lab">
    <div className="glass-orb orb-one" /><div className="glass-orb orb-two" /><div className="glass-grain" />
    <aside className="glass-sidebar">
      <div className="glass-brand"><span className="brand-orb"><Sparkles size={17} /></span><span>Life OS</span></div>
      <p className="nav-label">Workspace</p>
      <nav aria-label="Preview navigation">{navigation.map(([name, Icon]) => <button key={name} onClick={() => setSection(name)} className={section === name ? 'is-active' : ''}><Icon size={17} />{name}{name === 'Today' && <span className="nav-dot" />}</button>)}</nav>
      <div className="sidebar-bottom"><button><Settings2 size={17} />Settings</button><div className="profile"><div>AG</div><span><b>Andriy</b><small>Personal space</small></span><MoreHorizontal size={17} /></div></div>
    </aside>

    <section className="glass-stage">
      <header className="glass-topbar"><div className="crumb"><span>Personal OS</span><ChevronDown size={15} /></div><div className="top-actions"><button aria-label="Search"><Search size={18} /></button><button aria-label="Notifications" className="notification"><Bell size={18} /><i /></button><button className="avatar">AG</button></div></header>
      <div className="glass-content">
        <div className="intro-row"><div><p className="eyebrow">Thursday, 6 November</p><h1>Good afternoon, <em>Andriy.</em></h1><p className="subhead">A soft, focused view of what deserves your attention.</p></div><div className="intro-actions"><button className="glass-button" onClick={() => setFocusMode(!focusMode)}><Sparkles size={16} />{focusMode ? 'Focus is on' : 'Enter focus'}</button><button className="solid-button"><Plus size={17} />New capture</button></div></div>

        <section className="focus-hero"><div className="hero-glow" /><div className="hero-copy"><span className="hero-kicker"><Flame size={14} /> Your next meaningful move</span><h2>{focusMode ? 'A quiet hour for deep work.' : 'Finish the Life OS visual direction.'}</h2><p>Turn the reference into a deliberate visual system, not just a collection of effects.</p><div className="hero-actions"><button onClick={() => setDone(!done)} className={done ? 'complete-button is-done' : 'complete-button'}>{done ? <Check size={16} /> : <CircleCheck size={16} />}{done ? 'Completed' : 'Mark complete'}</button><button className="text-button">Open task <ArrowUpRight size={15} /></button></div></div><div className="hero-progress"><span>Today</span><strong>68<small>%</small></strong><div className="progress-track"><i /></div><small>4 of 6 intentions</small></div></section>

        <section className="metric-grid"><Metric label="Focus time" value="2h 40m" delta="+32 min vs yesterday" icon={Clock3} /><Metric label="Habits" value="7 / 9" delta="Two gentle wins left" tone="violet" icon={CircleCheck} /><Metric label="Open tasks" value="12" delta="3 ready for today" tone="peach" icon={Layers3} /><Metric label="Momentum" value="82" delta="+8 this week" tone="lime" icon={TrendingUp} /></section>

        <section className="dashboard-grid"><article className="glass-panel agenda-panel"><div className="panel-heading"><div><p className="eyebrow">Today’s rhythm</p><h2>Agenda</h2></div><div className="segmented" aria-label="Time range">{['Day', 'Week'].map(item => <button key={item} onClick={() => setRange(item)} className={range === item ? 'selected' : ''}>{item}</button>)}</div></div><div className="agenda-list">{[['09:30', 'Design system', 'Create the glass token palette', 'aqua'], ['12:00', 'Movement', 'A small reset outside', 'violet'], ['15:30', 'Deep work', 'Prototype the Today screen', 'peach']].map(([time, title, text, tone]) => <div className="agenda-item" key={time}><time>{time}</time><i className={tone} /><div><b>{title}</b><span>{text}</span></div><button aria-label={`Open ${title}`}><MoreHorizontal size={18} /></button></div>)}</div><button className="panel-footer">Open calendar <ArrowUpRight size={15} /></button></article>
          <article className="glass-panel habits-panel"><div className="panel-heading"><div><p className="eyebrow">Tiny repetitions</p><h2>Habit constellation</h2></div><button className="icon-button"><Grid2X2 size={17} /></button></div><div className="rings"><div className="ring-card"><div className="ring ring-aqua"><span>84<small>%</small></span></div><b>Body</b><small>3 / 4 complete</small></div><div className="ring-card"><div className="ring ring-violet"><span>64<small>%</small></span></div><b>Mind</b><small>2 / 3 complete</small></div><div className="ring-card"><div className="ring ring-peach"><span>100<small>%</small></span></div><b>Home</b><small>2 / 2 complete</small></div></div><div className="habit-toggle"><div><b>Evening reflection</b><span>5 minutes, no pressure</span></div><button onClick={() => setFocusMode(!focusMode)} role="switch" aria-checked={focusMode} className={focusMode ? 'switch is-on' : 'switch'}><i /></button></div></article>
        </section>

        <section className="preview-rail"><div className="rail-heading"><div><p className="eyebrow">System direction</p><h2>One language, many surfaces</h2></div><span>Preview only</span></div><div className="screen-cards">{previewScreens.map(([name, text], index) => <article key={name} className={`screen-card screen-${index}`}><div className="screen-card-head"><span>{name}</span><MoreHorizontal size={17} /></div><div className="fake-lines"><i /><i /><i /></div><p>{text}</p></article>)}</div></section>
      </div>
    </section>
  </main>
}
