import { useState, useEffect, useCallback, useRef } from 'react'
import { RefreshCw, Loader2, Sparkles, XCircle } from 'lucide-react'
import { feed as feedApi, ai as aiApi, memories as memoriesApi, insights as insightsApi, news as newsApi } from '../api'
import {
  NewsCard, PromptCard, MemoryCard, InsightCard, ListPickCard,
  StreakCard, OverdueCard, GoalCard, DoneCard, UpcomingCard, HabitsStaleCard,
  InboxPendingCard, StaleInProgressCard, PeopleStalCard, AiNoteCard, NudgeCard,
  ReflectionCard, CelebrationCard, ChallengeCard, PatternCard, EndCard,
} from './FeedCards'

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
  const pullStartY = useRef(0)
  const [pullDist, setPullDist] = useState(0)
  const PULL_THRESHOLD = 60

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
      setPullDist(0)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // keyboard: Shift+R to refresh feed
  useEffect(() => {
    const onKey = (e) => {
      if (e.shiftKey && e.key === 'R' && !refreshing) load(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [load, refreshing])

  // wheel-based pull-to-refresh: scrolling up when already at top (debounced)
  const wheelCooldown = useRef(false)
  const onWheel = useCallback((e) => {
    const el = scrollRef.current
    if (!el || refreshing || wheelCooldown.current) return
    if (el.scrollTop <= 0 && e.deltaY < -30) {
      wheelCooldown.current = true
      load(true)
      setTimeout(() => { wheelCooldown.current = false }, 2000)
    }
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

  // pull-to-refresh: track touch on the scroll container
  const onTouchStart = (e) => {
    const el = scrollRef.current
    if (el && el.scrollTop === 0) {
      pullStartY.current = e.touches[0].clientY
    } else {
      pullStartY.current = 0
    }
  }
  const onTouchMove = (e) => {
    if (!pullStartY.current) return
    const el = scrollRef.current
    if (el && el.scrollTop > 0) { pullStartY.current = 0; setPullDist(0); return }
    const dist = Math.max(0, e.touches[0].clientY - pullStartY.current)
    setPullDist(Math.min(dist, PULL_THRESHOLD * 2))
  }
  const onTouchEnd = () => {
    if (pullDist >= PULL_THRESHOLD && !refreshing) {
      load(true)
    } else {
      setPullDist(0)
    }
    pullStartY.current = 0
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
      await feedApi.react(ref, type, extra)
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

  const pullPct = Math.min(pullDist / PULL_THRESHOLD, 1)
  const pullReady = pullDist >= PULL_THRESHOLD

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
      case 'reflection':      return <ReflectionCard card={card} {...ctx} />
      case 'celebration':     return <CelebrationCard card={card} {...ctx} />
      case 'challenge':       return <ChallengeCard card={card} {...ctx} />
      case 'pattern':         return <PatternCard card={card} {...ctx} />
      default:                return null
    }
  }

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col">
      {/* Fixed header — always visible */}
      <div className="flex-shrink-0 max-w-2xl mx-auto w-full px-4 pt-5 pb-2 space-y-2">
        <div className="flex items-center justify-between px-1">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100 tracking-tight">Лента</h1>
          <div className="flex items-center gap-2">
            {lastLoad && (
              <span className="text-[11px] text-gray-300 dark:text-gray-600">
                обновлено {lastLoad.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="btn btn-ghost !px-2 !py-1 text-xs flex items-center gap-1 disabled:opacity-60"
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              {refreshing ? 'Загружаю...' : 'Обновить'}
            </button>
          </div>
        </div>

        {/* Status bar: pool size + AI freshness */}
        <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-xs text-gray-500 dark:text-gray-400">
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
              <><XCircle size={11} className="text-red-400" /><span className="text-red-400">AI ошибка</span></>
            ) : (() => {
              const today = new Date().toISOString().slice(0, 10)
              const lastGen = aiStatus?.last_generated || data?.ai_last_generated
              const isToday = lastGen === today
              const isYesterday = lastGen === new Date(Date.now() - 86400000).toISOString().slice(0, 10)
              return (
                <>
                  <Sparkles size={11} className={isToday ? 'text-purple-400' : 'text-gray-400'} />
                  <span className={isToday ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400'}>
                    {isToday ? 'AI сегодня' : isYesterday ? 'AI вчера' : lastGen ? `AI: ${lastGen}` : 'AI не запускался'}
                  </span>
                  <button
                    onClick={() => handleAiGenerate(true)}
                    disabled={aiGenerating}
                    className="text-[11px] text-gray-400 hover:text-purple-500 disabled:opacity-40 px-1 underline underline-offset-2"
                  >
                    {aiGenerating ? '...' : isToday ? 'обновить' : 'запустить'}
                  </button>
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Scrollable cards area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto snap-y snap-mandatory"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onWheel={onWheel}
      >
        {pullDist > 0 && (
          <div className="flex items-center justify-center py-2 text-xs text-gray-400 transition-all" style={{ height: pullDist * 0.5 }}>
            <RefreshCw size={14} className={pullReady ? 'animate-spin' : ''} style={{ transform: `rotate(${pullPct * 360}deg)` }} />
            <span className="ml-1">{refreshing ? 'Обновление…' : pullReady ? 'Отпустите для обновления' : 'Потяните вниз'}</span>
          </div>
        )}
        <div className={`max-w-2xl mx-auto px-4 pt-2 pb-24 space-y-4 transition-opacity duration-200 ${refreshing ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {(data.cards || []).map(card => (
            <div key={card.ref} className="snap-start scroll-mt-2">{render(card)}</div>
          ))}
          {extraCards.map(card => (
            <div key={card.ref} className="snap-start scroll-mt-2">{render(card)}</div>
          ))}
          <EndCard onExtend={extend} extending={extending} />
        </div>
      </div>
    </div>
  )
}
