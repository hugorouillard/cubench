import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'
import {
  faDiscord as legacyDiscord,
  faTwitter as legacyTwitter,
} from 'free-brands-svg-icons-v5'
import {
  faCode as legacyCode,
  faCodeBranch as legacyCodeBranch,
  faDonate as legacyDonate,
  faEnvelope as legacyEnvelope,
  faFileContract as legacyFileContract,
  faLock as legacyLock,
  faPalette as legacyPalette,
  faShieldAlt as legacyShield,
  faUser as legacyUser,
} from 'free-solid-svg-icons-v5'
import {
  faCube,
  faEyeSlash,
  faSliders,
  faStopwatch,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { randomScrambleForEvent } from 'cubing/scramble'
import {
  clearSolves,
  createSolve,
  deleteSolve,
  getExportData,
  getProfile,
  getSessions,
  getSolves,
  updateSolve,
} from './api'
import { SessionPanel } from './SessionPanel'
import { newestSolvesFirst, summarizeSolves } from './stats'
import { applyTheme, isTheme, THEME_OPTIONS, type Theme } from './theme'
import { formatInspectionTime, formatTime } from './timer'
import type { Penalty, Solve } from './types'
import { useTimer, type TimerPhase } from './useTimer'
import './App.css'

const ProfileView = lazy(() =>
  import('./ProfileView').then((module) => ({ default: module.ProfileView })),
)

const accountIcon = legacyUser as unknown as IconDefinition

const footerIcons = {
  code: legacyCode,
  codeBranch: legacyCodeBranch,
  discord: legacyDiscord,
  donate: legacyDonate,
  envelope: legacyEnvelope,
  fileContract: legacyFileContract,
  lock: legacyLock,
  palette: legacyPalette,
  shield: legacyShield,
  twitter: legacyTwitter,
} as unknown as Record<string, IconDefinition>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function phaseInstruction(phase: TimerPhase, inspectionEnabled: boolean): string {
  if (phase === 'holding') return 'keep holding'
  if (phase === 'ready') return 'release to start'
  if (phase === 'inspection') return 'space to start'
  if (phase === 'inspection-holding') return 'keep holding'
  if (phase === 'inspection-ready') return 'release to start'
  if (phase === 'running') return 'space to stop'
  if (inspectionEnabled) return 'space to inspect'
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
  const [sessionId, setSessionId] = useState('')
  const [solves, setSolves] = useState<Solve[]>([])
  const [scramble, setScramble] = useState('')
  const [scrambleLoading, setScrambleLoading] = useState(true)
  const [pendingSaveIds, setPendingSaveIds] = useState<string[]>([])
  const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([])
  const [saveFailed, setSaveFailed] = useState(false)
  const [latestResultId, setLatestResultId] = useState('')
  const [error, setError] = useState('')
  const [practiceSettingsOpen, setPracticeSettingsOpen] = useState(false)
  const [clearingSolves, setClearingSolves] = useState(false)
  const [view, setView] = useState<'timer' | 'profile'>('timer')
  const [hideTimer, setHideTimer] = useState(false)
  const [inspectionEnabled, setInspectionEnabled] = useState(false)
  const [profileName, setProfileName] = useState('Cube Solver')
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const sessionIdRef = useRef(sessionId)
  const latestResultIdRef = useRef(latestResultId)
  const deletedSolveIdsRef = useRef(new Set<string>())
  sessionIdRef.current = sessionId
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
        setSessionId(loadedSessions[0]?.id ?? '')
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
    if (!sessionId) return

    let cancelled = false
    getSolves(sessionId)
      .then((loadedSolves) => {
        if (cancelled) return
        setSolves((current) => {
          const merged = new Map(
            loadedSolves
              .filter((solve) => !deletedSolveIdsRef.current.has(solve.id))
              .map((solve) => [solve.id, solve]),
          )
          for (const solve of current) {
            if (solve.session_id === sessionId) merged.set(solve.id, solve)
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
  }, [sessionId])

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

  async function handleTimerComplete(durationMs: number, penalty: Penalty) {
    const activeSessionId = sessionId
    const completedScramble = scramble
    if (!activeSessionId || !completedScramble) return

    const solveId = crypto.randomUUID()
    setPendingSaveIds((current) => [...current, solveId])
    setSaveFailed(false)
    setLatestResultId(solveId)
    latestResultIdRef.current = solveId
    void generateScramble()
    try {
      const savedSolve = await createSolve({
        id: solveId,
        session_id: activeSessionId,
        duration_ms: durationMs,
        penalty,
        scramble: completedScramble,
        recorded_at: new Date().toISOString(),
      })
      if (activeSessionId === sessionIdRef.current) {
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
      sessionId &&
      scramble &&
      !scrambleLoading &&
      !clearingSolves &&
      !practiceSettingsOpen,
    ),
    inspectionEnabled,
    handleTimerComplete,
  )
  const controlsDisabled =
    clearingSolves ||
    phase === 'holding' ||
    phase === 'ready' ||
    phase === 'inspection' ||
    phase === 'inspection-holding' ||
    phase === 'inspection-ready' ||
    phase === 'running'

  async function handlePenalty(
    solve: Solve,
    selectedPenalty: Penalty,
  ): Promise<Solve | null> {
    const update = selectedPenalty === 'plus2'
      ? { duration_ms: solve.duration_ms + 2000 }
      : { penalty: solve.penalty === selectedPenalty ? 'none' as const : selectedPenalty }
    setPendingMutationIds((current) =>
      current.includes(solve.id) ? current : [...current, solve.id],
    )
    try {
      const updatedSolve = await updateSolve(solve.id, update)
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

  async function handleDelete(solve: Solve, confirm = true): Promise<boolean> {
    if (confirm && !window.confirm(`Delete the ${formatTime(solve.duration_ms)} solve?`)) return false
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

  async function handleClearSolves(): Promise<void> {
    if (solves.length === 0 || pendingSaveIds.length || pendingMutationIds.length) return
    const label = solves.length === 1 ? 'solve' : 'solves'
    if (!window.confirm(`Clear all ${solves.length} ${label}? This cannot be undone.`)) return

    setClearingSolves(true)
    try {
      await clearSolves()
      setSolves([])
      setLatestResultId('')
      latestResultIdRef.current = ''
      setSaveFailed(false)
      resetTimer()
    } catch (clearError) {
      setError(`Times could not be cleared: ${errorMessage(clearError)}`)
    } finally {
      setClearingSolves(false)
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
      link.download = `cubench-${new Date().toISOString().slice(0, 10)}.json`
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
  const latestResultPending = pendingSaveIds.includes(latestResultId)
  const summary = summarizeSolves(solves)
  const statTime = (duration: number | null) =>
    duration === null ? '--' : formatTime(duration)
  const inspectionActive =
    phase === 'inspection' ||
    phase === 'inspection-holding' ||
    phase === 'inspection-ready'
  const displayedTime =
    inspectionActive
      ? formatInspectionTime(elapsedMs)
      : phase === 'running'
      ? formatTime(elapsedMs)
      : phase === 'stopped'
        ? latestResult
          ? formatTime(latestResult.duration_ms, latestResult.penalty)
          : formatTime(elapsedMs)
      : lastSolve
        ? formatTime(lastSolve.duration_ms, lastSolve.penalty)
        : '0.00'

  return (
    <div
      className={`app app--${
        phase === 'inspection-holding'
          ? 'holding'
          : phase === 'inspection-ready'
            ? 'ready'
            : phase
      }${inspectionActive ? ' app--inspecting' : ''}`}
    >
      <header className={`site-header page-width focus-chrome${view === 'timer' ? ' site-header--timer' : ''}`}>
        <div className="site-header-main">
          <a
            className="brand"
            href="/"
            aria-label="Cubench home"
            tabIndex={controlsDisabled ? -1 : 0}
          >
            <span className="brand-mark" aria-hidden="true">
              <FontAwesomeIcon className="app-icon" icon={faCube} />
            </span>
            <span className="brand-copy">
              <strong>cubench</strong>
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
              <FontAwesomeIcon className="app-icon" icon={accountIcon} fixedWidth aria-hidden="true" />
              <span className="account-name">{profileName}</span>
              <span
                className="account-solve-count"
                title={`${solves.length} ${solves.length === 1 ? 'solve' : 'solves'}`}
              >
                {solves.length}
              </span>
            </button>
          </nav>
        </div>
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
          <div className="practice-workspace">
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
                <button
                  className={inspectionEnabled ? 'is-active' : ''}
                  type="button"
                  onClick={() => setInspectionEnabled((current) => !current)}
                  disabled={controlsDisabled}
                  aria-pressed={inspectionEnabled}
                >
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

              <div className="timer-controls">
                <div className="timer-status" aria-live="polite">
                  <span className="keycap">space</span>
                  <span>{phaseInstruction(phase, inspectionEnabled)}</span>
                </div>
              </div>
            </section>

            <SessionPanel
              solves={solves}
              disabled={controlsDisabled || pendingSaveIds.length > 0 || pendingMutationIds.length > 0}
              pendingSolveIds={pendingMutationIds}
              theme={theme}
              onPenalty={handlePenalty}
              onDelete={(solve) => handleDelete(solve, false)}
              onClear={handleClearSolves}
              clearing={clearingSolves}
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
            onPenalty={handlePenalty}
            onDelete={handleDelete}
            onExport={() => void handleExport()}
            onError={setError}
            onProfileChange={(profile) => setProfileName(profile.display_name)}
          />
        </Suspense>
      )}

      <footer className={`site-footer page-width focus-chrome${view === 'timer' ? ' site-footer--timer' : ''}`}>
        <nav className="footer-links" aria-label="Footer">
          <a className="footer-link" href="mailto:rouillard.hugo1@gmail.com">
            <FontAwesomeIcon className="app-icon" icon={footerIcons.envelope} fixedWidth aria-hidden="true" />
            <span>contact</span>
          </a>
          <a
            className="footer-link"
            href="https://github.com/hugorouillard/cubebench/issues"
            target="_blank"
            rel="noreferrer"
          >
            <FontAwesomeIcon className="app-icon" icon={footerIcons.donate} fixedWidth aria-hidden="true" />
            <span>support</span>
          </a>
          <a
            className="footer-link"
            href="https://github.com/hugorouillard/cubebench"
            target="_blank"
            rel="noreferrer"
          >
            <FontAwesomeIcon className="app-icon" icon={footerIcons.code} fixedWidth aria-hidden="true" />
            <span>github</span>
          </a>
          <span className="footer-link" aria-disabled="true" title="Coming soon">
            <FontAwesomeIcon className="app-icon" icon={footerIcons.discord} fixedWidth aria-hidden="true" />
            <span>discord</span>
          </span>
          <span className="footer-link" aria-disabled="true" title="Coming soon">
            <FontAwesomeIcon className="app-icon" icon={footerIcons.twitter} fixedWidth aria-hidden="true" />
            <span>twitter</span>
          </span>
          <span className="footer-link" aria-disabled="true" title="Coming soon">
            <FontAwesomeIcon className="app-icon" icon={footerIcons.fileContract} fixedWidth aria-hidden="true" />
            <span>terms</span>
          </span>
          <a
            className="footer-link"
            href="mailto:rouillard.hugo1@gmail.com?subject=Cubench%20security"
          >
            <FontAwesomeIcon className="app-icon" icon={footerIcons.shield} fixedWidth aria-hidden="true" />
            <span>security</span>
          </a>
          <span className="footer-link" aria-disabled="true" title="Coming soon">
            <FontAwesomeIcon className="app-icon" icon={footerIcons.lock} fixedWidth aria-hidden="true" />
            <span>privacy</span>
          </span>
        </nav>
        <div className="footer-controls">
          <label className="footer-theme" title="Theme">
            <FontAwesomeIcon className="app-icon" icon={footerIcons.palette} fixedWidth aria-hidden="true" />
            <span className="sr-only">Theme</span>
            <select value={theme} onChange={handleThemeChange} disabled={controlsDisabled}>
              {THEME_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <a
            className="footer-version"
            href="https://github.com/hugorouillard/cubebench/commits/master"
            target="_blank"
            rel="noreferrer"
            aria-label="Cubench version 0.0.0"
          >
            <FontAwesomeIcon className="app-icon" icon={footerIcons.codeBranch} fixedWidth aria-hidden="true" />
            <span>v0.0.0</span>
          </a>
        </div>
      </footer>

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
            <button
              className={inspectionEnabled ? 'is-active' : ''}
              type="button"
              onClick={() => setInspectionEnabled((current) => !current)}
              aria-pressed={inspectionEnabled}
            >
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
          </div>
        </div>
        <div className="dialog-actions">
          <button
            className="button-primary"
            type="button"
            onClick={() => setPracticeSettingsOpen(false)}
          >
            close
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default App
