import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { SpheresProvider } from './SpheresContext'
import { ThemeProvider } from './context/ThemeContext'
import Sidebar from './components/Sidebar'
import QuickCapture from './components/QuickCapture'
import AiConsole from './components/AiConsole'
import GlobalSearch from './components/GlobalSearch'
import Feed from './pages/Feed'
import Today from './pages/Today'
import Pool from './pages/Pool'
import Tree from './pages/Tree'
import Habits from './pages/Habits'
import Lists from './pages/Lists'
import Calendar from './pages/Calendar'
import Inbox from './pages/Inbox'
import Stats from './pages/Stats'
import People from './pages/People'
import Insights from './pages/Insights'
import News from './pages/News'
import Memories from './pages/Memories'
import Onboarding from './pages/Onboarding'
import NotificationBell from './components/NotificationBell'
import ThemeSwitcher from './components/ThemeSwitcher'
import AiReviews from './pages/AiReviews'
import { tree as treeApi } from './api'

function AppContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const [ready, setReady] = useState(false)
  const [captureOpen, setCaptureOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrefill, setAiPrefill] = useState('')
  const [aiContextMessage, setAiContextMessage] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [sphere, setSphere] = useState(null)

  // Check if onboarding needed (skip if already on /setup)
  useEffect(() => {
    if (location.pathname === '/setup') { setReady(true); return }
    treeApi.all().then(nodes => {
      const hasUserNodes = nodes.some(n => n.parent_id !== null)
      if (!hasUserNodes) navigate('/setup', { replace: true })
      setReady(true)
    }).catch(() => setReady(true))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCaptureOpen(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        setAiOpen(v => !v)
        setAiPrefill('')
        setAiContextMessage('')
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); setSearchOpen(v => !v) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const openCapture = () => setCaptureOpen(true)
    window.addEventListener('life-os:capture', openCapture)
    return () => window.removeEventListener('life-os:capture', openCapture)
  }, [])

  useEffect(() => {
    const openAi = (e) => {
      setAiOpen(true)
      setAiPrefill(e.detail?.prefill || '')
      setAiContextMessage(e.detail?.contextMessage || '')
    }
    window.addEventListener('life-os:ai', openAi)
    return () => window.removeEventListener('life-os:ai', openAi)
  }, [])

  if (!ready) return null

  if (location.pathname === '/setup') {
    return <Onboarding onDone={() => navigate('/', { replace: true })} />
  }

  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <Sidebar
        onCapture={() => setCaptureOpen(true)}
        onSearch={() => setSearchOpen(true)}
        sphere={sphere}
        setSphere={setSphere}
      />
      <main className="flex-1 overflow-y-auto">
        <div className="app-topbar sticky top-0 z-10 flex items-center justify-end gap-2 px-6 py-3 bg-gray-50/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-100 dark:border-gray-800">
          <NotificationBell />
          <ThemeSwitcher />
        </div>
        <Routes>
          <Route path="/"         element={<Feed />} />
          <Route path="/today"    element={<Today />} />
          <Route path="/pool"     element={<Pool sphere={sphere} />} />
          <Route path="/goals"    element={<Tree />} />
          <Route path="/habits"   element={<Habits />} />
          <Route path="/lists"    element={<Lists />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/inbox"    element={<Inbox />} />
          <Route path="/stats"    element={<Stats />} />
          <Route path="/people"   element={<People />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/memories" element={<Memories />} />
          <Route path="/news"     element={<News />} />
          <Route path="/ai-reviews" element={<AiReviews />} />
        </Routes>
      </main>

      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <AiConsole
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        prefill={aiPrefill}
        contextMessage={aiContextMessage}
        onPrefillUsed={() => setAiPrefill('')}
      />
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />

      <button
        onClick={() => setCaptureOpen(true)}
        title="Быстрый захват ⌘K"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900
                   shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        <Plus size={20} />
      </button>
    </div>
  )
}

export default function App() {
  return (
    <SpheresProvider>
      <ThemeProvider><BrowserRouter><AppContent /></BrowserRouter></ThemeProvider>
    </SpheresProvider>
  )
}
