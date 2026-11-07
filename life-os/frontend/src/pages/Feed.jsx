import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Loader2, Sparkles, XCircle, ChevronRight } from 'lucide-react'
import { feed as feedApi, ai as aiApi, memories as memoriesApi, insights as insightsApi, news as newsApi } from '../api'
import {
  NewsCard, PromptCard, MemoryCard, InsightCard, ListPickCard, HabitReminderCard,
  StreakCard, OverdueCard, GoalCard, DoneCard, UpcomingCard, HabitsStaleCard,
  InboxPendingCard, StaleInProgressCard, PeopleStalCard, AiNoteCard, NudgeCard,
  ReflectionCard, CelebrationCard, ChallengeCard, PatternCard, EndCard,
} from './FeedCards'
import { useRecoveryMode } from '../context/RecoveryModeContext'
import FocusCard from '../components/FocusCard'
import sleepRoomScene from '../focus-sleep-scene.jpg'

const RECOVERY_HIDDEN_TYPES = new Set([
  'overdue', 'goal', 'habits_stale', 'stale_inprogress',
  'inbox_pending', 'upcoming', 'nudge',
])

export default function Feed() {
  const [data, setData] = useState(null)
  const [reactions, setReactions] = useState([])
  const [error, setError] = useState(null)
  const [extraCards, setExtraCards] = useState([])
  const [extending, setExtending] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [lastLoad, setLastLoad] = useState(null)
  const [hasActiveJob, setHasActiveJob] = useState(false)
  const [aiStatus, setAiStatus] = useState(null)
  const [aiGenerating, setAiGenerating] = useState(false)
  const scrollRef = useRef(null)
  const focusRef = useRef(null)
  const [focusDocked, setFocusDocked] = useState(false)
  const { isRecoveryMode } = useRecoveryMode()

  const removeCard = useCallback((ref) => {
    setData(d => d && { ...d, cards: d.cards.filter(c => c.ref !== ref) })
    setExtraCards(prev => prev.filter(c => c.ref !== ref))
  }, [])

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    try {
      const [d, r] = await Promise.all([feedApi.all(), feedApi.reactions()])
      setData(d)
      setReactions(r)
      setExtraCards([])
      setLastLoad(new Date())
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      if (isRefresh) setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Keep a compact path back to today's scene after its full card leaves view.
  useEffect(() => {
    const root = scrollRef.current
    const target = focusRef.current
    if (!root || !target || !window.IntersectionObserver) return undefined
    const observer = new IntersectionObserver(([entry]) => {
      setFocusDocked(!entry.isIntersecting && entry.boundingClientRect.top < 0)
    }, { root, threshold: 0, rootMargin: '-76px 0px 0px' })
    observer.observe(target)
    return () => observer.disconnect()
  }, [data?.focus])

  // keyboard: Shift+R to refresh feed
  useEffect(() => {
    const onKey = (e) => {
      if (e.shiftKey && e.key === 'R' && !refreshing) { load(true); loadAiStatus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [load, refreshing])


  // poll note jobs only when a job was recently submitted
  useEffect(() => {
    if (!hasActiveJob) return
    const poll = setInterval(async () => {
      try {
        const jobs = await feedApi.noteJobs()
        const active = jobs.filter(j => j.status === 'pending' || j.status === 'running')
        if (active.length > 0) {
          load()
        } else {
          load()
          setHasActiveJob(false)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(poll)
  }, [hasActiveJob, load])

  const loadAiStatus = useCallback(async () => {
    try {
      const s = await feedApi.aiStatus()
      setAiStatus(prev => {
        // when generation finishes, reload feed
        if (prev?.goal_analysis?.status === 'running' && s.goal_analysis?.status !== 'running') {
          load()
        }
        return s
      })
    } catch {}
  }, [load])

  useEffect(() => { loadAiStatus() }, [loadAiStatus])

  // poll ai status while goal analysis is running
  useEffect(() => {
    if (aiStatus?.goal_analysis?.status !== 'running') return
    const poll = setInterval(loadAiStatus, 3000)
    return () => clearInterval(poll)
  }, [aiStatus?.goal_analysis?.status, loadAiStatus])

  const handleAiGenerate = async (force = false) => {
    setAiGenerating(true)
    try {
      await feedApi.aiGenerate(force)
      await loadAiStatus()
    } catch (e) {
      console.error('AI generate failed:', e)
    } finally {
      setAiGenerating(false)
    }
  }


  const extend = useCallback(async () => {
    if (!data || extending) return
    setExtending(true)
    try {
      const shown = [...data.cards, ...extraCards].map(c => c.ref)
      const result = await aiApi.run('feed_extend', { shown })
      if (result.cards?.length) {
        setExtraCards(prev => [...prev, ...result.cards])
        load()
      }
    } catch (e) {
      console.error('Feed extend failed:', e)
    } finally {
      setExtending(false)
    }
  }, [data, extraCards, extending, load])

  const react = async (ref, type, extra) => {
    const ts = new Date().toISOString()
    setReactions(prev => [...prev, { ref, type, ts, ...extra }])
    removeCard(ref)
    try {
      await feedApi.react(ref, type, extra, 'feed_action')
    } catch (e) {
      console.error('Reaction failed:', e)
    }
  }

  const likeState = (ref) => {
    const rs = reactions.filter(r => r.ref === ref && (r.type === 'like' || r.type === 'unlike'))
    return rs[rs.length - 1]?.type === 'like'
  }

  const toggleLike = (ref) => react(ref, likeState(ref) ? 'unlike' : 'like')

  const noteState = (ref) => {
    const notes = reactions.filter(r => r.ref === ref && r.type === 'note')
    return notes[notes.length - 1]?.text || ''
  }

  const cardType = (ref) => {
    const card = [...(data?.cards || []), ...extraCards].find(c => c.ref === ref)
    return card?.type || 'unknown'
  }

  const reactNote = (ref, text) => {
    setReactions(prev => [...prev, { ref, type: 'note', text, ts: new Date().toISOString() }])
    removeCard(ref)
    setHasActiveJob(true)
    feedApi.noteProcess(ref, text, cardType(ref)).catch(e => console.error('Note failed:', e))
  }

  const handleEdit = async (card, field, value) => {
    try {
      if (card.type === 'memory') {
        await memoriesApi.update(card.entry.id, { [field]: value })
      } else if (card.type === 'insight') {
        await insightsApi.update(card.insight.id, { [field]: value })
      } else if (card.type === 'news') {
        await newsApi.update(card.item.id, { [field]: value })
      }
      load()
    } catch (e) {
      console.error('Edit failed:', e)
    }
  }

  const dismiss = (ref) => removeCard(ref)

  if (error) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-red-400 mb-3">Ошибка загрузки ленты: {error}</p>
        <button onClick={() => load(true)} className="btn btn-primary text-xs">Попробовать снова</button>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-3rem)] gap-2 text-gray-400 text-sm">
        <Loader2 size={16} className="animate-spin" /> Загрузка ленты...
      </div>
    )
  }



  const render = (card) => {
    const ctx = {
      liked: likeState(card.ref),
      onLike: () => toggleLike(card.ref),
      onDismiss: () => dismiss(card.ref),
      onLater: () => dismiss(card.ref),
      onSaved: () => { removeCard(card.ref); load() },
      note: noteState(card.ref),
      onNote: (text) => reactNote(card.ref, text),
      onEdit: handleEdit,
      card,
    }
    switch (card.type) {
      case 'news':            return <NewsCard card={card} {...ctx} />
      case 'prompt':          return <PromptCard card={card} {...ctx} />
      case 'memory':          return <MemoryCard card={card} {...ctx} />
      case 'insight':         return <InsightCard card={card} {...ctx} />
      case 'list_pick':       return <ListPickCard card={card} {...ctx} />
      case 'streak':          return <StreakCard card={card} {...ctx} />
      case 'overdue':         return <OverdueCard card={card} {...ctx} />
      case 'upcoming':        return <UpcomingCard card={card} {...ctx} />
      case 'habits_stale':    return <HabitsStaleCard card={card} {...ctx} />
      case 'goal':            return <GoalCard card={card} {...ctx} />
      case 'done':            return <DoneCard card={card} {...ctx} />
      case 'inbox_pending':   return <InboxPendingCard card={card} {...ctx} />
      case 'stale_inprogress': return <StaleInProgressCard card={card} {...ctx} />
      case 'people_stale':    return <PeopleStalCard card={card} {...ctx} />
      case 'ai_note':         return <AiNoteCard card={card} {...ctx} />
      case 'nudge':           return <NudgeCard card={card} {...ctx} />
      case 'habit_reminder':  return <HabitReminderCard card={card} {...ctx} />
      case 'reflection':      return <ReflectionCard card={card} {...ctx} />
      case 'celebration':     return <CelebrationCard card={card} {...ctx} />
      case 'challenge':       return <ChallengeCard card={card} {...ctx} />
      case 'pattern':         return <PatternCard card={card} {...ctx} />
      default:                return null
    }
  }

  const dailyFocus = data.focus?.sections?.find(section => section.type === 'daily_focus')
  const dailyScene = data.focus?.sections?.find(section => section.type === 'daily_scene')
  const openFocusScene = () => window.dispatchEvent(new CustomEvent('life-os:open-focus-scene'))

  return (
    <div className="feed-page h-[calc(100vh-3rem)] flex flex-col">
      {/* Fixed header — always visible */}
      <div className="feed-header flex-shrink-0 max-w-4xl mx-auto w-full px-5 sm:px-6 pt-5 pb-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <div><p className="feed-kicker">Life OS · личный поток</p><h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Лента</h1></div>
          <div className="flex items-center gap-2">
            {lastLoad && (
              <span className="text-[11px] text-gray-300 dark:text-gray-600">
                обновлено {lastLoad.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => { load(true); loadAiStatus() }}
              disabled={refreshing}
              className="btn btn-ghost !px-2 !py-1 text-xs flex items-center gap-1 disabled:opacity-60"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Загружаю...' : 'Обновить'}
            </button>
          </div>
        </div>

        {/* Status bar: pool size + AI freshness */}
        <div className="feed-status-rail flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-2">
            {refreshing && (
              <><Loader2 size={11} className="animate-spin" /><span>Обновляем...</span></>
            )}
            {aiStatus?.note_jobs?.running > 0 && (
              <><Loader2 size={11} className="animate-spin" /><span>Обрабатываем заметку...</span></>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {aiStatus?.goal_analysis?.status === 'running' ? (
              <><Loader2 size={11} className="animate-spin text-purple-400" /><span className="text-purple-400">AI генерирует...</span></>
            ) : aiStatus?.goal_analysis?.status === 'error' ? (
              <>
                <XCircle size={11} className="text-red-400" />
                <span className="text-red-400" title={aiStatus.goal_analysis.error || 'Ошибка генерации'}>AI ошибка</span>
                <button
                  onClick={() => handleAiGenerate(true)}
                  disabled={aiGenerating}
                  className="text-[11px] text-red-400 hover:text-red-500 disabled:opacity-40 px-1 underline underline-offset-2"
                >
                  {aiGenerating ? '...' : 'повторить'}
                </button>
              </>
            ) : (() => {
              const lastGen = aiStatus?.last_generated || data?.ai_last_generated
              const isCurrentWeek = aiStatus?.goal_analysis?.has_card
              return (
                <>
                  <Sparkles size={11} className={isCurrentWeek ? 'text-purple-400' : 'text-gray-400'} />
                  <span className={isCurrentWeek ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400'}>
                    {isCurrentWeek ? 'AI на эту неделю' : lastGen ? `AI: ${lastGen}` : 'AI не запускался'}
                  </span>
                  <button
                    onClick={() => handleAiGenerate(true)}
                    disabled={aiGenerating}
                    className="text-[11px] text-gray-400 hover:text-purple-500 disabled:opacity-40 px-1 underline underline-offset-2"
                  >
                    {aiGenerating ? '...' : isCurrentWeek ? 'обновить' : 'запустить'}
                  </button>
                </>
              )
            })()}
          </div>
        </div>
        {focusDocked && dailyScene && dailyFocus && (
          <button
            type="button"
            onClick={openFocusScene}
            className="focus-dock group flex w-full items-center gap-3 rounded-xl border border-slate-200/80 bg-white/90 px-2.5 py-2 text-left shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-900/90"
          >
            <img src={sleepRoomScene} alt="" className="h-8 w-12 shrink-0 rounded-lg object-cover" />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-gray-800 dark:text-gray-100">{dailyFocus.title}</span><span className="block text-[10px] text-gray-400 dark:text-gray-500">Сцена дня · открыть</span></span>
            <ChevronRight size={15} className="shrink-0 text-gray-400 transition-transform duration-200 group-hover:translate-x-0.5" />
          </button>
        )}
      </div>

      {/* Scrollable cards area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
      >
        <div className={`feed-stack max-w-4xl mx-auto px-5 sm:px-6 pt-4 pb-24 space-y-5 transition-opacity duration-200 ${refreshing ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <div ref={focusRef} className="feed-card-enter" style={{ '--feed-order': 0 }}><FocusCard focus={data.focus} onChange={(focus) => setData(current => current ? { ...current, focus } : current)} /></div>
          {(data.cards || [])
            .filter(card => !isRecoveryMode || !RECOVERY_HIDDEN_TYPES.has(card.type))
            .filter(card => !isRecoveryMode || card.type !== 'streak' || !card.broken)
            .map((card, index) => (
              <div key={card.ref} className="feed-card-enter snap-start scroll-mt-2" style={{ '--feed-order': Math.min(index + 1, 7) }}>{render(card)}</div>
            ))}
          {extraCards
            .filter(card => !isRecoveryMode || !RECOVERY_HIDDEN_TYPES.has(card.type))
            .filter(card => !isRecoveryMode || card.type !== 'streak' || !card.broken)
            .map((card, index) => (
              <div key={card.ref} className="feed-card-enter snap-start scroll-mt-2" style={{ '--feed-order': Math.min(index + 1, 7) }}>{render(card)}</div>
            ))}
          <EndCard onExtend={extend} extending={extending} />
        </div>
      </div>
    </div>
  )
}
