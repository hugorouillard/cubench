import { lazy, Suspense } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { completedDuration } from './stats'
import { formatTime } from './timer'
import type { Penalty, Solve } from './types'
import './SessionPanel.css'

const SessionChart = lazy(() =>
  import('./SessionChart').then((module) => ({ default: module.SessionChart })),
)

type SessionPanelProps = {
  solves: Solve[]
  disabled: boolean
  pendingSolveIds: string[]
  theme: string
  onPenalty: (solve: Solve, penalty: Penalty) => Promise<Solve | null>
  onDelete: (solve: Solve) => Promise<boolean>
  onClear: () => Promise<void>
  clearing: boolean
}

function formatSolveDate(value: string): string {
  const date = new Date(value)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function SessionPanel({
  solves,
  disabled,
  pendingSolveIds,
  theme,
  onPenalty,
  onDelete,
  onClear,
  clearing,
}: SessionPanelProps) {
  const successful = solves
    .map((solve) => ({ solve, duration: completedDuration(solve) }))
    .filter((item): item is { solve: Solve; duration: number } => item.duration !== null)
  const bestSolveId = successful.length
    ? successful.reduce((best, item) => item.duration < best.duration ? item : best).solve.id
    : ''

  return (
    <aside className="session-panel focus-chrome" aria-labelledby="session-panel-title">
      <header className="session-panel-header">
        <div>
          <span>current solves</span>
          <h2 id="session-panel-title">solve history</h2>
        </div>
        <div className="session-panel-summary">
          <strong>{solves.length} {solves.length === 1 ? 'solve' : 'solves'}</strong>
          <button
            type="button"
            disabled={disabled || solves.length === 0}
            onClick={() => void onClear()}
          >
            <FontAwesomeIcon className="app-icon" icon={faTrashCan} fixedWidth aria-hidden="true" />
            {clearing ? 'clearing...' : 'clear times'}
          </button>
        </div>
      </header>

      {solves.length === 0 ? (
        <div className="session-panel-empty">
          <strong>0.00</strong>
          <p>Your graph and solve history will build here.</p>
          <span>hold space to log the first solve</span>
        </div>
      ) : (
        <>
          <div className="session-chart-region">
            <div className="session-chart-legend" aria-hidden="true">
              <span><i className="is-single" />single</span>
              <span><i className="is-average" />ao5</span>
            </div>
            <div className="session-chart">
              <Suspense fallback={<div className="session-chart-loading">loading graph...</div>}>
                <SessionChart
                  solves={solves}
                  theme={theme}
                />
              </Suspense>
            </div>
          </div>

          <div className="session-log-heading">
            <span>solves</span>
            <small>newest first</small>
          </div>
          <ol className="session-solve-list">
            {solves.map((solve, index) => {
              const solveNumber = solves.length - index
              const isBest = solve.id === bestSolveId
              const pending = pendingSolveIds.includes(solve.id)
              const rawTime = formatTime(solve.duration_ms)
              const result = formatTime(solve.duration_ms, solve.penalty)
              return (
                <li
                  className={`${index === 0 ? 'is-latest ' : ''}${isBest ? 'is-best' : ''}`.trim()}
                  key={solve.id}
                >
                  <div className="session-solve-summary">
                    <span className="session-solve-number">#{solveNumber}</span>
                    <span className="session-solve-result">
                      <strong>{result}</strong>
                      {solve.penalty !== 'none' && (
                        <small>{solve.penalty === 'plus2' ? '+2 · ' : ''}raw {rawTime}</small>
                      )}
                    </span>
                    {isBest && <span className="session-best-label">best</span>}
                    <time dateTime={solve.recorded_at}>{formatSolveDate(solve.recorded_at)}</time>
                  </div>
                  <div className="session-solve-actions" aria-label={`Actions for solve ${solveNumber}`}>
                    <button
                      className={solve.penalty === 'plus2' ? 'is-active' : ''}
                      type="button"
                      disabled={disabled || pending}
                      onClick={() => void onPenalty(solve, 'plus2')}
                      aria-pressed={solve.penalty === 'plus2'}
                      aria-label={`Toggle +2 penalty for solve ${solveNumber}`}
                    >
                      +2
                    </button>
                    <button
                      className={solve.penalty === 'dnf' ? 'is-active' : ''}
                      type="button"
                      disabled={disabled || pending}
                      onClick={() => void onPenalty(solve, 'dnf')}
                      aria-pressed={solve.penalty === 'dnf'}
                      aria-label={`Toggle DNF penalty for solve ${solveNumber}`}
                    >
                      dnf
                    </button>
                    <button
                      className="is-delete"
                      type="button"
                      disabled={disabled || pending}
                      onClick={() => void onDelete(solve)}
                      aria-label={`Delete solve ${solveNumber}`}
                      title="Delete solve"
                    >
                      <FontAwesomeIcon className="app-icon" icon={faTrashCan} fixedWidth aria-hidden="true" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </aside>
  )
}
