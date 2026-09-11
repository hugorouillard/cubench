import {
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
  faArrowRightFromBracket,
  faCircleExclamation,
  faCube,
  faEyeSlash,
  faRotateRight,
  faSliders,
  faStopwatch,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import { randomScrambleForEvent } from 'cubing/scramble'
import { ApiError, getAuthSession, logout } from './api'
import { AuthPanel } from './AuthPanel'
import { SessionPanel } from './SessionPanel'
import { accountSolveStore, guestSolveStore, type SolveStore } from './solveStore'
import { newestSolvesFirst, summarizeSolves } from './stats'
import { applyTheme, isTheme, THEME_OPTIONS, type Theme } from './theme'
import { formatInspectionTime, formatTime, togglePenalty } from './timer'
import type { Account, Penalty, Solve, SolveInput } from './types'
import { useTimer, type TimerPhase } from './useTimer'
import './App.css'

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
  closeDisabled?: boolean
  children: ReactNode
}

function Modal({ open, onClose, labelledBy, closeDisabled = false, children }: ModalProps) {
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
        if (!closeDisabled) onClose()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !closeDisabled) onClose()
      }}
    >
      <div className="dialog-panel">{children}</div>
    </dialog>
  )
}

type AppProps = {
  initialTheme: Theme
  solveStore?: SolveStore
}

type SaveState = 'idle' | 'saving' | 'failed'

function App({ initialTheme, solveStore: solveStoreOverride }: AppProps) {
  const [account, setAccount] = useState<Account | null>(null)
  const [authChecking, setAuthChecking] = useState(true)
  const [authOpen, setAuthOpen] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authSubmitting, setAuthSubmitting] = useState(false)
  const [solves, setSolves] = useState<Solve[]>([])
  const [scramble, setScramble] = useState('')
  const [scrambleLoading, setScrambleLoading] = useState(true)
  const [pendingSolve, setPendingSolve] = useState<SolveInput | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([])
  const [latestResultId, setLatestResultId] = useState('')
  const [error, setError] = useState('')
  const [practiceSettingsOpen, setPracticeSettingsOpen] = useState(false)
  const [hideTimer, setHideTimer] = useState(false)
  const [inspectionEnabled, setInspectionEnabled] = useState(false)
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const latestResultIdRef = useRef(latestResultId)
  latestResultIdRef.current = latestResultId
  const solveStore = solveStoreOverride ?? (account ? accountSolveStore : guestSolveStore)

  useEffect(() => {
    let cancelled = false
    void getAuthSession()
      .then((restoredAccount) => {
        if (!cancelled) setAccount(restoredAccount)
      })
      .catch((sessionError: unknown) => {
        if (!cancelled && !(sessionError instanceof ApiError && sessionError.status === 401)) {
          setError(`Could not restore account; continuing as guest: ${errorMessage(sessionError)}`)
        }
      })
      .finally(() => {
        if (!cancelled) setAuthChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    randomScrambleForEvent('333')
      .then((nextScramble) => {
        if (cancelled) return
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

  async function generateScramble() {
    setScramble('')
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

  async function persistSolve(solve: SolveInput) {
    setSaveState('saving')
    setError('')
    try {
      const savedSolve = await solveStore.create(solve)
      setSolves((current) => {
        const next = new Map(current.map((item) => [item.id, item]))
        next.set(savedSolve.id, savedSolve)
        return newestSolvesFirst([...next.values()])
      })
      setPendingSolve(null)
      setSaveState('idle')
      await generateScramble()
    } catch (saveError) {
      setSaveState('failed')
      setError(`Failed to save result: ${errorMessage(saveError)}`)
    }
  }

  function handleTimerComplete(durationMs: number, penalty: Penalty) {
    const completedScramble = scramble
    if (!completedScramble || pendingSolve) return

    const solve: SolveInput = {
      id: crypto.randomUUID(),
      duration_ms: durationMs,
      penalty,
      scramble: completedScramble,
      recorded_at: new Date().toISOString(),
    }
    setPendingSolve(solve)
    setLatestResultId(solve.id)
    latestResultIdRef.current = solve.id
    void persistSolve(solve)
  }

  const { phase, elapsedMs, reset: resetTimer } = useTimer(
    Boolean(
      scramble &&
      !scrambleLoading &&
      !pendingSolve &&
      !authChecking &&
      !authOpen &&
      !authBusy &&
      !practiceSettingsOpen,
    ),
    inspectionEnabled,
    handleTimerComplete,
  )
  const controlsDisabled =
    authChecking ||
    authBusy ||
    Boolean(pendingSolve) ||
    phase === 'holding' ||
    phase === 'ready' ||
    phase === 'inspection' ||
    phase === 'inspection-holding' ||
    phase === 'inspection-ready' ||
    phase === 'running'

  function resetCurrentSession() {
    setSolves([])
    setPendingSolve(null)
    setSaveState('idle')
    setPendingMutationIds([])
    setLatestResultId('')
    latestResultIdRef.current = ''
    resetTimer()
  }

  function handleAuthenticated(authenticatedAccount: Account) {
    setAccount(authenticatedAccount)
    setAuthOpen(false)
    resetCurrentSession()
  }

  async function handleLogout() {
    if (pendingSolve && !window.confirm('Sign out and discard the unsaved result?')) return
    setAuthBusy(true)
    try {
      await logout()
      setAccount(null)
      resetCurrentSession()
    } catch (logoutError) {
      setError(`Could not sign out: ${errorMessage(logoutError)}`)
    } finally {
      setAuthBusy(false)
    }
  }

  async function handlePenalty(
    solve: Solve,
    selectedPenalty: Penalty,
  ): Promise<Solve | null> {
    const update = { penalty: togglePenalty(solve.penalty, selectedPenalty) }
    setPendingMutationIds((current) =>
      current.includes(solve.id) ? current : [...current, solve.id],
    )
    try {
      const updatedSolve = await solveStore.update(solve, update)
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
      await solveStore.delete(solve)
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

  function handleClearSolves(): void {
    if (solves.length === 0 || pendingSolve || pendingMutationIds.length) return
    const label = solves.length === 1 ? 'solve' : 'solves'
    const message = account
      ? `Clear ${solves.length} current ${label}? Saved solves remain in your profile.`
      : `Clear all ${solves.length} ${label}? This cannot be undone.`
    if (!window.confirm(message)) return

    setSolves([])
    setLatestResultId('')
    latestResultIdRef.current = ''
    resetTimer()
  }

  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>) {
    const nextTheme = event.target.value
    if (!isTheme(nextTheme)) return
    setTheme(nextTheme)
    applyTheme(nextTheme)
  }

  const lastSolve = solves[0]
  const latestResult = solves.find((solve) => solve.id === latestResultId)
  const summary = summarizeSolves(solves)
  const accountActionDisabled = authBusy || (controlsDisabled && saveState !== 'failed')
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
      <header className="site-header site-header--timer page-width focus-chrome">
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
              className="is-active"
              type="button"
              disabled={controlsDisabled}
              aria-label="Timer"
              aria-current="page"
              title="Timer"
            >
              <FontAwesomeIcon className="app-icon" icon={faStopwatch} fixedWidth aria-hidden="true" />
            </button>
          </nav>

          <nav className="account-nav" aria-label="Account">
            {account ? (
              <>
                <span
                  className="account-identity"
                  role="group"
                  aria-label={`Signed in as ${account.display_name}`}
                >
                  <FontAwesomeIcon className="app-icon" icon={accountIcon} fixedWidth aria-hidden="true" />
                  <span className="account-name">{account.display_name}</span>
                  <span
                    className="account-solve-count"
                    title={`${solves.length} current ${solves.length === 1 ? 'solve' : 'solves'}`}
                  >
                    {solves.length}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={accountActionDisabled}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <FontAwesomeIcon
                    className="app-icon"
                    icon={faArrowRightFromBracket}
                    fixedWidth
                    aria-hidden="true"
                  />
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                disabled={accountActionDisabled}
                aria-label="Sign in"
                title="Sign in"
              >
                <FontAwesomeIcon className="app-icon" icon={accountIcon} fixedWidth aria-hidden="true" />
                <span className="account-name">sign in</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {error && (
        <aside className="notification" role="alert">
          <div className="notification-copy">
            <strong>
              <FontAwesomeIcon className="app-icon" icon={faCircleExclamation} aria-hidden="true" />
              Error
            </strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
            <FontAwesomeIcon className="app-icon" icon={faXmark} fixedWidth aria-hidden="true" />
          </button>
        </aside>
      )}

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

                <div className="post-solve" aria-live="polite">
                  {phase === 'stopped' && saveState === 'saving' && <span>saving solve...</span>}
                  {phase === 'stopped' && saveState === 'failed' && pendingSolve && (
                    <button
                      className="post-solve-retry"
                      type="button"
                      disabled={authBusy}
                      onClick={() => void persistSolve(pendingSolve)}
                    >
                      <FontAwesomeIcon className="app-icon" icon={faRotateRight} aria-hidden="true" />
                      Retry saving result
                    </button>
                  )}
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
              disabled={controlsDisabled || pendingMutationIds.length > 0}
              pendingSolveIds={pendingMutationIds}
              theme={theme}
              onPenalty={handlePenalty}
              onDelete={(solve) => handleDelete(solve, false)}
              onClear={handleClearSolves}
            />
          </div>
      </main>

      <footer className="site-footer site-footer--timer page-width focus-chrome">
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
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        labelledBy="auth-dialog-title"
        closeDisabled={authSubmitting}
      >
        {authOpen && (
          <AuthPanel
            onAuthenticated={handleAuthenticated}
            onClose={() => setAuthOpen(false)}
            onSubmittingChange={setAuthSubmitting}
          />
        )}
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
