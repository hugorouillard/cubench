import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCube,
  faEyeSlash,
  faPalette,
  faPlus,
  faSliders,
  faStopwatch,
  faTrashCan,
  faUser,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { randomScrambleForEvent } from 'cubing/scramble'
import {
  createSession,
  createSolve,
  deleteSolve,
  getExportData,
  getProfile,
  getSessions,
  getSolves,
  updateSolvePenalty,
} from './api'
import { SessionPanel } from './SessionPanel'
import { newestSolvesFirst, summarizeSolves } from './stats'
import { applyTheme, isTheme, THEME_OPTIONS, type Theme } from './theme'
import { formatTime } from './timer'
import type { Penalty, PracticeSession, Solve } from './types'
import { useTimer, type TimerPhase } from './useTimer'
import './App.css'

const ProfileView = lazy(() =>
  import('./ProfileView').then((module) => ({ default: module.ProfileView })),
)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function phaseInstruction(phase: TimerPhase): string {
  if (phase === 'holding') return 'keep holding'
  if (phase === 'ready') return 'release to start'
  if (phase === 'running') return 'space to stop'
  if (phase === 'stopped') return 'hold space for next solve'
  return 'hold space to start'
}

type ModalProps = {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
}

function Modal({ open, onClose, labelledBy, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => {
        dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
      })
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  return (
    <dialog
      className="app-dialog"
      ref={dialogRef}
      aria-labelledby={labelledBy}
      onClose={() => {
        requestAnimationFrame(() => {
          if (
            !document.querySelector('dialog[open]') &&
            document.activeElement instanceof HTMLElement
          ) {
            document.activeElement.blur()
          }
        })
      }}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="dialog-panel">{children}</div>
    </dialog>
  )
}

type AppProps = {
  initialTheme: Theme
}

function App({ initialTheme }: AppProps) {
  const [sessions, setSessions] = useState<PracticeSession[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [solves, setSolves] = useState<Solve[]>([])
  const [scramble, setScramble] = useState('')
  const [scrambleLoading, setScrambleLoading] = useState(true)
  const [pendingSaveIds, setPendingSaveIds] = useState<string[]>([])
  const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([])
  const [saveFailed, setSaveFailed] = useState(false)
  const [latestResultId, setLatestResultId] = useState('')
  const [error, setError] = useState('')
  const [sessionFormOpen, setSessionFormOpen] = useState(false)
  const [practiceSettingsOpen, setPracticeSettingsOpen] = useState(false)
  const [newSessionName, setNewSessionName] = useState('')
  const [view, setView] = useState<'timer' | 'profile'>('timer')
  const [hideTimer, setHideTimer] = useState(false)
  const [profileName, setProfileName] = useState('Cube Solver')
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const activeSessionIdRef = useRef(activeSessionId)
  const latestResultIdRef = useRef(latestResultId)
  const deletedSolveIdsRef = useRef(new Set<string>())
  activeSessionIdRef.current = activeSessionId
  latestResultIdRef.current = latestResultId
  useEffect(() => {
    let cancelled = false
    void getProfile()
      .then((profile) => {
        if (!cancelled) setProfileName(profile.display_name)
      })
      .catch((profileError: unknown) => {
        if (!cancelled) setError(`Could not load profile: ${errorMessage(profileError)}`)
      })

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
    setLatestResultId('')
    setSaveFailed(false)
    if (!activeSessionId) return

    let cancelled = false
    getSolves(activeSessionId)
      .then((loadedSolves) => {
        if (cancelled) return
        setSolves((current) => {
          const merged = new Map(
            loadedSolves
              .filter((solve) => !deletedSolveIdsRef.current.has(solve.id))
              .map((solve) => [solve.id, solve]),
          )
          for (const solve of current) {
            if (solve.session_id === activeSessionId) merged.set(solve.id, solve)
          }
          return newestSolvesFirst([...merged.values()])
        })
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(errorMessage(loadError))
      })
    return () => {
      cancelled = true
    }
  }, [activeSessionId])

  function selectSession(sessionId: string) {
    setSolves([])
    setLatestResultId('')
    latestResultIdRef.current = ''
    setSaveFailed(false)
    setActiveSessionId(sessionId)
    resetTimer()
  }

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

    const solveId = crypto.randomUUID()
    setPendingSaveIds((current) => [...current, solveId])
    setSaveFailed(false)
    setLatestResultId(solveId)
    latestResultIdRef.current = solveId
    void generateScramble()
    try {
      const savedSolve = await createSolve({
        id: solveId,
        session_id: sessionId,
        duration_ms: durationMs,
        penalty: 'none',
        scramble: completedScramble,
        recorded_at: new Date().toISOString(),
      })
      if (sessionId === activeSessionIdRef.current) {
        setSolves((current) => {
          const next = new Map(current.map((solve) => [solve.id, solve]))
          next.set(savedSolve.id, savedSolve)
          return newestSolvesFirst([...next.values()])
        })
      }
    } catch (saveError) {
      if (latestResultIdRef.current === solveId) {
        setLatestResultId('')
        latestResultIdRef.current = ''
        setSaveFailed(true)
      }
      setError(`Solve was not saved: ${errorMessage(saveError)}`)
    } finally {
      setPendingSaveIds((current) => current.filter((id) => id !== solveId))
    }
  }

  const { phase, elapsedMs, reset: resetTimer } = useTimer(
    Boolean(
      view === 'timer' &&
      activeSessionId &&
      scramble &&
      !scrambleLoading &&
      !sessionFormOpen &&
      !practiceSettingsOpen,
    ),
    handleTimerComplete,
  )
  const controlsDisabled = phase === 'holding' || phase === 'ready' || phase === 'running'

  async function handleCreateSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newSessionName.trim()) return

    try {
      const session = await createSession(newSessionName)
      setSessions((current) => [...current, session])
      selectSession(session.id)
      setNewSessionName('')
      setSessionFormOpen(false)
    } catch (sessionError) {
      setError(errorMessage(sessionError))
    }
  }

  async function handlePenalty(
    solve: Solve,
    selectedPenalty: Penalty,
  ): Promise<Solve | null> {
    const penalty = solve.penalty === selectedPenalty ? 'none' : selectedPenalty
    setPendingMutationIds((current) =>
      current.includes(solve.id) ? current : [...current, solve.id],
    )
    try {
      const updatedSolve = await updateSolvePenalty(solve.id, penalty)
      setSolves((current) =>
        current.map((item) => (item.id === solve.id ? updatedSolve : item)),
      )
      return updatedSolve
    } catch (penaltyError) {
      setError(errorMessage(penaltyError))
      return null
    } finally {
      setPendingMutationIds((current) => current.filter((id) => id !== solve.id))
    }
  }

  async function handleDelete(solve: Solve): Promise<boolean> {
    if (!window.confirm(`Delete the ${formatTime(solve.duration_ms)} solve?`)) return false
    setPendingMutationIds((current) =>
      current.includes(solve.id) ? current : [...current, solve.id],
    )
    try {
      await deleteSolve(solve.id)
      deletedSolveIdsRef.current.add(solve.id)
      setSolves((current) => current.filter((item) => item.id !== solve.id))
      if (solve.id === latestResultIdRef.current) {
        setLatestResultId('')
        latestResultIdRef.current = ''
        resetTimer()
      }
      return true
    } catch (deleteError) {
      setError(errorMessage(deleteError))
      return false
    } finally {
      setPendingMutationIds((current) => current.filter((id) => id !== solve.id))
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
      link.download = `cubebench-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
    } catch (exportError) {
      setError(errorMessage(exportError))
    }
  }

  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextTheme = event.target.value
    if (!isTheme(nextTheme)) return
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  const lastSolve = solves[0]
  const latestResult = solves.find((solve) => solve.id === latestResultId)
  const activeSession = sessions.find((session) => session.id === activeSessionId)
  const latestResultPending = pendingSaveIds.includes(latestResultId)
  const summary = summarizeSolves(solves)
  const statTime = (duration: number | null) =>
    duration === null ? '--' : formatTime(duration)
  const displayedTime =
    phase === 'running'
      ? formatTime(elapsedMs)
      : phase === 'stopped'
        ? latestResult
          ? formatTime(latestResult.duration_ms, latestResult.penalty)
          : formatTime(elapsedMs)
      : lastSolve
        ? formatTime(lastSolve.duration_ms, lastSolve.penalty)
        : '0.00'

  return (
    <div className={`app app--${phase}`}>
      <header className="site-header page-width focus-chrome">
        <a
          className="brand"
          href="/"
          aria-label="Cubebench home"
          tabIndex={controlsDisabled ? -1 : 0}
        >
          <span className="brand-mark" aria-hidden="true">
            <FontAwesomeIcon className="app-icon" icon={faCube} />
          </span>
          <span className="brand-copy">
            <strong>cubebench</strong>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main views">
          <button
            className={view === 'timer' ? 'is-active' : ''}
            type="button"
            onClick={() => setView('timer')}
            disabled={controlsDisabled}
            aria-label="Timer"
            aria-current={view === 'timer' ? 'page' : undefined}
            title="Timer"
          >
            <FontAwesomeIcon className="app-icon" icon={faStopwatch} fixedWidth aria-hidden="true" />
          </button>
        </nav>

        <nav className="account-nav" aria-label="Account">
          <button
            className={view === 'profile' ? 'is-active' : ''}
            type="button"
            onClick={() => setView('profile')}
            disabled={controlsDisabled}
            aria-label="Profile"
            aria-current={view === 'profile' ? 'page' : undefined}
            title="Profile"
          >
            <FontAwesomeIcon className="app-icon" icon={faUser} fixedWidth aria-hidden="true" />
            <span className="account-name">{profileName}</span>
          </button>
        </nav>
      </header>

      {error && (
        <aside className="notification" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            <FontAwesomeIcon className="app-icon" icon={faXmark} fixedWidth aria-hidden="true" />
          </button>
        </aside>
      )}

      {view === 'timer' ? (
        <main className="practice-view page-width">
          <div className="practice-config-row focus-chrome">
            <div
              className="practice-config practice-config--desktop"
              role="group"
              aria-label="Practice settings"
            >
              <div
                className="config-panel config-panel--toggles"
                role="group"
                aria-label="Solve modifiers"
              >
                <button
                  className={hideTimer ? 'is-active' : ''}
                  type="button"
                  onClick={() => setHideTimer((current) => !current)}
                  disabled={controlsDisabled}
                  aria-pressed={hideTimer}
                >
                  <FontAwesomeIcon className="app-icon" icon={faEyeSlash} fixedWidth aria-hidden="true" />
                  hide timer
                </button>
                <button type="button" disabled title="Inspection is not available yet">
                  inspection
                </button>
              </div>

              <div
                className="config-panel config-panel--modes"
                role="group"
                aria-label="Practice mode"
              >
                <span className="config-value is-active">
                  <FontAwesomeIcon className="app-icon" icon={faStopwatch} fixedWidth aria-hidden="true" />
                  timer
                </span>
                <button type="button" disabled title="Trainer mode is not available yet">
                  <FontAwesomeIcon className="app-icon" icon={faCube} fixedWidth aria-hidden="true" />
                  trainer
                </button>
              </div>

              <div
                className="config-panel config-panel--values"
                role="group"
                aria-label="Timer settings"
              >
                <span className="config-value is-active">3x3</span>
                <select
                  value={activeSessionId}
                  onChange={(event) => selectSession(event.target.value)}
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
                  type="button"
                  onClick={() => setSessionFormOpen(true)}
                  disabled={controlsDisabled}
                  aria-label="Create session"
                  title="Create session"
                >
                  <FontAwesomeIcon className="app-icon" icon={faPlus} fixedWidth aria-hidden="true" />
                </button>
              </div>
            </div>

            <button
              className="practice-config-mobile"
              type="button"
              onClick={() => setPracticeSettingsOpen(true)}
              disabled={controlsDisabled}
            >
              <FontAwesomeIcon className="app-icon" icon={faSliders} fixedWidth aria-hidden="true" />
              practice settings
            </button>
          </div>

          <div className="practice-workspace">
            <section className="timer-stage" aria-label="Timer">
              <button
                className="scramble"
                type="button"
                onClick={() => void generateScramble()}
                disabled={controlsDisabled || scrambleLoading}
                title="Generate another scramble"
              >
                {scrambleLoading ? 'preparing scramble...' : scramble}
              </button>

              <div
                className={`timer-readout${hideTimer ? ' timer-readout--hidden' : ''}`}
                aria-live="off"
              >
                {displayedTime}
              </div>

              <div className="timer-results">
                <div className="post-solve" aria-live="polite">
                  {phase === 'stopped' && latestResultPending && <span>saving solve...</span>}
                  {phase === 'stopped' && saveFailed && (
                    <span className="post-solve-error">solve not saved</span>
                  )}
                  {phase === 'stopped' && !latestResultPending && latestResult && (
                    <div className="post-solve-actions" aria-label="Latest solve actions">
                      <button
                        className={latestResult.penalty === 'plus2' ? 'is-active' : ''}
                        type="button"
                        disabled={pendingMutationIds.includes(latestResult.id)}
                        onClick={() => void handlePenalty(latestResult, 'plus2')}
                        aria-pressed={latestResult.penalty === 'plus2'}
                      >
                        +2
                      </button>
                      <button
                        className={latestResult.penalty === 'dnf' ? 'is-active' : ''}
                        type="button"
                        disabled={pendingMutationIds.includes(latestResult.id)}
                        onClick={() => void handlePenalty(latestResult, 'dnf')}
                        aria-pressed={latestResult.penalty === 'dnf'}
                      >
                        dnf
                      </button>
                      <button
                        type="button"
                        disabled={pendingMutationIds.includes(latestResult.id)}
                        onClick={() => void handleDelete(latestResult)}
                        aria-label="Delete latest solve"
                        title="Delete latest solve"
                      >
                        <FontAwesomeIcon className="app-icon" icon={faTrashCan} fixedWidth aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="session-stats focus-chrome" aria-label="Current statistics">
                  <div>
                    <span>mean</span>
                    <strong>{statTime(summary.mean)}</strong>
                  </div>
                  <div>
                    <span>ao5</span>
                    <strong>{statTime(summary.currentAo5)}</strong>
                  </div>
                  <div>
                    <span>best ao5</span>
                    <strong>{statTime(summary.bestAo5)}</strong>
                  </div>
                  <div>
                    <span>ao12</span>
                    <strong>{statTime(summary.currentAo12)}</strong>
                  </div>
                  <div>
                    <span>best</span>
                    <strong>{statTime(summary.bestSingle)}</strong>
                  </div>
                </div>
              </div>
            </section>

            <SessionPanel
              session={activeSession}
              solves={solves}
              disabled={controlsDisabled}
              pendingSolveIds={pendingMutationIds}
              theme={theme}
              onPenalty={handlePenalty}
              onDelete={handleDelete}
            />
          </div>
        </main>
      ) : (
        <Suspense
          fallback={(
            <main className="profile-fallback page-width" aria-busy="true">
              loading profile...
            </main>
          )}
        >
          <ProfileView
            sessions={sessions}
            onPenalty={handlePenalty}
            onDelete={handleDelete}
            onExport={() => void handleExport()}
            onError={setError}
            onProfileChange={(profile) => setProfileName(profile.display_name)}
          />
        </Suspense>
      )}

      <footer className="site-footer page-width focus-chrome">
        {view === 'timer' && (
          <div className="timer-controls">
            <div className="timer-status" aria-live="polite">
              <span className="keycap">space</span>
              <span>{phaseInstruction(phase)}</span>
            </div>
          </div>
        )}
        <div className="footer-controls">
          <label className="footer-theme">
            <FontAwesomeIcon className="app-icon" icon={faPalette} fixedWidth aria-hidden="true" />
            <span className="sr-only">Theme</span>
            <select value={theme} onChange={handleThemeChange} disabled={controlsDisabled}>
              {THEME_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span>local / 001</span>
        </div>
      </footer>

      <Modal
        open={sessionFormOpen}
        onClose={() => setSessionFormOpen(false)}
        labelledBy="session-dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <span>practice sessions</span>
            <h2 id="session-dialog-title">Create a session</h2>
          </div>
          <button type="button" onClick={() => setSessionFormOpen(false)} aria-label="Close">
            <FontAwesomeIcon className="app-icon" icon={faXmark} fixedWidth aria-hidden="true" />
          </button>
        </div>
        <form className="session-form" onSubmit={handleCreateSession}>
          <label htmlFor="session-name">session name</label>
          <input
            id="session-name"
            value={newSessionName}
            onChange={(event) => setNewSessionName(event.target.value)}
            maxLength={60}
            placeholder="e.g. slow solves"
            data-autofocus
          />
          <div className="dialog-actions">
            <button className="button-primary" type="submit">
              create
            </button>
            <button type="button" onClick={() => setSessionFormOpen(false)}>
              cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={practiceSettingsOpen}
        onClose={() => setPracticeSettingsOpen(false)}
        labelledBy="practice-dialog-title"
      >
        <div className="dialog-heading">
          <div>
            <span>timer</span>
            <h2 id="practice-dialog-title">Practice settings</h2>
          </div>
          <button type="button" onClick={() => setPracticeSettingsOpen(false)} aria-label="Close">
            <FontAwesomeIcon className="app-icon" icon={faXmark} fixedWidth aria-hidden="true" />
          </button>
        </div>
        <div className="mobile-config-stack">
          <div className="mobile-config-group" role="group" aria-label="Solve modifiers">
            <button
              className={hideTimer ? 'is-active' : ''}
              type="button"
              onClick={() => setHideTimer((current) => !current)}
              aria-pressed={hideTimer}
            >
              hide timer
            </button>
            <button type="button" disabled title="Inspection is not available yet">
              inspection
            </button>
          </div>
          <span className="mobile-config-separator" />
          <div className="mobile-config-group" role="group" aria-label="Practice mode">
            <span className="mobile-config-value is-active">timer</span>
            <button type="button" disabled title="Trainer mode is not available yet">
              trainer
            </button>
          </div>
          <span className="mobile-config-separator" />
          <div
            className="mobile-config-group mobile-config-group--values"
            role="group"
            aria-label="Timer settings"
          >
            <span className="mobile-config-value is-active">3x3</span>
            <select
              value={activeSessionId}
              onChange={(event) => selectSession(event.target.value)}
              aria-label="Practice session"
              data-autofocus
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="button-primary"
            type="button"
            onClick={() => {
              setPracticeSettingsOpen(false)
              setSessionFormOpen(true)
            }}
          >
            <FontAwesomeIcon className="app-icon" icon={faPlus} fixedWidth aria-hidden="true" />
            new session
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default App
