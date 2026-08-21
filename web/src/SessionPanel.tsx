import { lazy, Suspense } from 'react'
import { completedDuration } from './stats'
import { formatTime } from './timer'
import type { PracticeSession, Solve } from './types'
import './SessionPanel.css'

const SessionChart = lazy(() =>
  import('./SessionChart').then((module) => ({ default: module.SessionChart })),
)

type SessionPanelProps = {
  session: PracticeSession | undefined
  solves: Solve[]
  disabled: boolean
  theme: string
  onSelectSolve: (solveId: string) => void
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
  session,
  solves,
  disabled,
  theme,
  onSelectSolve,
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
          <span>current session</span>
          <h2 id="session-panel-title">{session?.name ?? 'session'}</h2>
        </div>
        <strong>{solves.length} {solves.length === 1 ? 'solve' : 'solves'}</strong>
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
                  disabled={disabled}
                  theme={theme}
                  onSelectSolve={onSelectSolve}
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
              const rawTime = formatTime(solve.duration_ms)
              const result = formatTime(solve.duration_ms, solve.penalty)
              return (
                <li key={solve.id}>
                  <button
                    className={`${index === 0 ? 'is-latest ' : ''}${isBest ? 'is-best' : ''}`.trim()}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelectSolve(solve.id)}
                    aria-label={`Open solve ${solveNumber}, result ${result}`}
                  >
                    <span className="session-solve-number">#{solveNumber}</span>
                    <span className="session-solve-result">
                      <strong>{result}</strong>
                      {solve.penalty !== 'none' && (
                        <small>{solve.penalty === 'plus2' ? '+2 · ' : ''}raw {rawTime}</small>
                      )}
                    </span>
                    {isBest && <span className="session-best-label">best</span>}
                    <time dateTime={solve.recorded_at}>{formatSolveDate(solve.recorded_at)}</time>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </aside>
  )
}
