import { useEffect, useState, type FormEvent } from 'react'
import { randomScrambleForEvent } from 'cubing/scramble'
import {
  createSession,
  createSolve,
  deleteSolve,
  getExportData,
  getSessions,
  getSolves,
  updateSolvePenalty,
} from './api'
import { ProgressView } from './ProgressView'
import { summarizeSolves } from './stats'
import { formatTime } from './timer'
import type { Penalty, PracticeSession, Solve } from './types'
import { useTimer, type TimerPhase } from './useTimer'
import './App.css'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function phaseInstruction(phase: TimerPhase): string {
  if (phase === 'holding') return 'keep holding'
  if (phase === 'ready') return 'release to start'
  if (phase === 'running') return 'space to stop'
  if (phase === 'stopped') return 'hold space for next solve'
  return 'hold space to ready'
}

function App() {
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [solves, setSolves] = useState<Solve[]>([])
  const [scramble, setScramble] = useState('')
  const [scrambleLoading, setScrambleLoading] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sessionFormOpen, setSessionFormOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [view, setView] = useState<'timer' | 'progress'>('timer')

  useEffect(() => {
    let cancelled = false
    Promise.all([getSessions(), randomScrambleForEvent('333')])
      .then(([loadedSessions, nextScramble]) => {
        if (cancelled) return
        setSessions(loadedSessions)
        setActiveSessionId(loadedSessions[0]?.id ?? '')
        setScramble(nextScramble.toString())
        setScrambleLoading(false)
      })
      .catch((initialError: unknown) => {
        if (!cancelled) setError(errorMessage(initialError))
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeSessionId) return
    let cancelled = false
    setHistoryLoading(true)
    getSolves(activeSessionId)
      .then((loadedSolves) => {
        if (!cancelled) setSolves(loadedSolves)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError))
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  async function generateScramble() {
    setScrambleLoading(true)
    try {
      const nextScramble = await randomScrambleForEvent('333')
      setScramble(nextScramble.toString())
    } catch (scrambleError) {
      setError(errorMessage(scrambleError))
    } finally {
      setScrambleLoading(false)
    }
  }

  async function handleTimerComplete(durationMs: number) {
    const sessionId = activeSessionId
    const completedScramble = scramble
    if (!sessionId || !completedScramble) return

    setSaving(true)
    void generateScramble()
    try {
      const savedSolve = await createSolve({
        id: crypto.randomUUID(),
        session_id: sessionId,
        duration_ms: durationMs,
        penalty: 'none',
        scramble: completedScramble,
        recorded_at: new Date().toISOString(),
      })
      if (sessionId === activeSessionId) {
        setSolves((current) => [savedSolve, ...current])
      }
    } catch (saveError) {
      setError(`Solve was not saved: ${errorMessage(saveError)}`)
    } finally {
      setSaving(false)
    }
  }

  const { phase, elapsedMs } = useTimer(
    Boolean(view === 'timer' && activeSessionId && scramble && !scrambleLoading),
    handleTimerComplete,
  )
  const controlsDisabled = phase === 'holding' || phase === 'ready' || phase === 'running'

  async function handleCreateSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newSessionName.trim()) return

    try {
      const session = await createSession(newSessionName)
      setSessions((current) => [...current, session])
      setActiveSessionId(session.id)
      setNewSessionName('')
      setSessionFormOpen(false)
    } catch (sessionError) {
      setError(errorMessage(sessionError))
    }
  }

  async function handlePenalty(solve: Solve, selectedPenalty: Penalty) {
    const penalty = solve.penalty === selectedPenalty ? 'none' : selectedPenalty
    try {
      const updatedSolve = await updateSolvePenalty(solve.id, penalty)
      setSolves((current) =>
        current.map((item) => (item.id === solve.id ? updatedSolve : item)),
      )
    } catch (penaltyError) {
      setError(errorMessage(penaltyError))
    }
  }

  async function handleDelete(solve: Solve) {
    if (!window.confirm(`Delete the ${formatTime(solve.duration_ms)} solve?`)) return
    try {
      await deleteSolve(solve.id)
      setSolves((current) => current.filter((item) => item.id !== solve.id))
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    }
  }

  async function handleExport() {
    try {
      const data = await getExportData()
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
      )
      const link = document.createElement('a')
      link.href = url
      link.download = `cube-timer-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(errorMessage(exportError))
    }
  }

  const lastSolve = solves[0]
  const summary = summarizeSolves(solves)
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const statTime = (duration: number | null) =>
    duration === null ? '--' : formatTime(duration)
  const displayedTime =
    phase === 'running' || phase === 'stopped'
      ? formatTime(elapsedMs)
      : lastSolve
        ? formatTime(lastSolve.duration_ms, lastSolve.penalty)
        : '0.00'

  return (
    <div className={`app app--${phase}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="Cube Timer home">
          <span className="brand__mark">CT</span>
          <span className="brand__name">cube timer</span>
          <span className="brand__edition">local / 001</span>
        </a>

        <nav className="view-tabs" aria-label="Main views">
          <button
            className={view === 'timer' ? 'is-active' : ''}
            type="button"
            onClick={() => setView('timer')}
            disabled={controlsDisabled}
          >
            timer
          </button>
          <button
            className={view === 'progress' ? 'is-active' : ''}
            type="button"
            onClick={() => setView('progress')}
            disabled={controlsDisabled}
          >
            progress
          </button>
        </nav>

        <div className="session-control">
          <span className="control-label">session</span>
          <select
            value={activeSessionId}
            onChange={(event) => setActiveSessionId(event.target.value)}
            disabled={controlsDisabled}
            aria-label="Practice session"
          >
            {sessions.map((session) => (
              <option key={session.id} value={session.id}>
                {session.name}
              </option>
            ))}
          </select>
          <button
            className="icon-button"
            type="button"
            onClick={() => setSessionFormOpen((open) => !open)}
            disabled={controlsDisabled}
            aria-label="Create a practice session"
            title="New session"
          >
            +
          </button>
          {sessionFormOpen && (
            <form className="session-form" onSubmit={handleCreateSession}>
              <label htmlFor="session-name">new session</label>
              <input
                id="session-name"
                value={newSessionName}
                onChange={(event) => setNewSessionName(event.target.value)}
                maxLength={60}
                placeholder="e.g. slow solves"
                autoFocus
              />
              <div>
                <button type="submit">create</button>
                <button type="button" onClick={() => setSessionFormOpen(false)}>
                  cancel
                </button>
              </div>
            </form>
          )}
        </div>

        <span className="connection">
          <i className={error ? 'connection__dot connection__dot--error' : 'connection__dot'} />
          {error ? 'attention' : saving ? 'saving' : 'local api'}
        </span>
      </header>

      {error && (
        <aside className="error-banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>
            dismiss
          </button>
        </aside>
      )}

      {view === 'timer' ? (
      <main className="workspace">
        <section className="timer-stage" aria-label="Timer">
          <div className="event-label">
            <span>event</span>
            <strong>3x3</strong>
          </div>

          <button
            className="scramble"
            type="button"
            onClick={() => void generateScramble()}
            disabled={controlsDisabled || scrambleLoading}
            title="Generate another scramble"
          >
            {scrambleLoading ? 'preparing scramble...' : scramble}
          </button>

          <div className="timer-readout" aria-live="off">
            {displayedTime}
          </div>

          <div className="timer-instruction" aria-live="polite">
            <span className="space-key">space</span>
            <span>{phaseInstruction(phase)}</span>
          </div>

          <div className="live-stats" aria-label="Current statistics">
            <div>
              <span>mean</span>
              <strong>{statTime(summary.mean)}</strong>
            </div>
            <div>
              <span>current ao5</span>
              <strong>{statTime(summary.currentAo5)}</strong>
            </div>
            <div>
              <span>best ao5</span>
              <strong>{statTime(summary.bestAo5)}</strong>
            </div>
            <div>
              <span>current ao12</span>
              <strong>{statTime(summary.currentAo12)}</strong>
            </div>
            <div>
              <span>best</span>
              <strong>{statTime(summary.bestSingle)}</strong>
            </div>
          </div>
        </section>

        <aside className="history-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">session log</span>
              <h2>Recent solves</h2>
            </div>
            <span className="solve-count">{solves.length}</span>
          </div>

          <div className="solve-list">
            {historyLoading ? (
              <p className="empty-state">loading history...</p>
            ) : solves.length === 0 ? (
              <p className="empty-state">Your first solve will appear here.</p>
            ) : (
              solves.slice(0, 12).map((solve, index) => (
                <article className="solve-row" key={solve.id}>
                  <span className="solve-index">{String(solves.length - index).padStart(2, '0')}</span>
                  <div className="solve-result">
                    <strong>{formatTime(solve.duration_ms, solve.penalty)}</strong>
                    <span>
                      {new Date(solve.recorded_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {solve.penalty === 'dnf' && ` / ${formatTime(solve.duration_ms)}`}
                    </span>
                  </div>
                  <div className="solve-actions">
                    <button
                      className={solve.penalty === 'plus2' ? 'is-active' : ''}
                      type="button"
                      onClick={() => void handlePenalty(solve, 'plus2')}
                      title="Toggle two-second penalty"
                    >
                      +2
                    </button>
                    <button
                      className={solve.penalty === 'dnf' ? 'is-active' : ''}
                      type="button"
                      onClick={() => void handlePenalty(solve, 'dnf')}
                      title="Toggle DNF"
                    >
                      dnf
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(solve)}
                      title="Delete solve"
                    >
                      del
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </aside>
      </main>
      ) : (
        <ProgressView
          session={activeSession}
          solves={solves}
          onExport={() => void handleExport()}
        />
      )}

      <footer className="bottombar">
        <span>timing: browser performance clock</span>
        <span>space / hold / release / stop</span>
        <span>data: sqlite</span>
      </footer>
    </div>
  )
}

export default App
