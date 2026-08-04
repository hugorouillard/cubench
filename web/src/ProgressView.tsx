import { Download, Plus, Trash2 } from 'lucide-react'
import { dailyProgress, personalBestHistory, summarizeSolves } from './stats'
import { formatTime } from './timer'
import type { Penalty, PracticeSession, Solve } from './types'
import './ProgressView.css'

type ProgressViewProps = {
  session: PracticeSession | undefined
  sessions: PracticeSession[]
  activeSessionId: string
  solves: Solve[]
  loading: boolean
  onSessionChange: (sessionId: string) => void
  onCreateSession: () => void
  onPenalty: (solve: Solve, penalty: Penalty) => void
  onDelete: (solve: Solve) => void
  onExport: () => void
}

function statTime(durationMs: number | null): string {
  return durationMs === null ? '--' : formatTime(durationMs)
}

export function ProgressView({
  session,
  sessions,
  activeSessionId,
  solves,
  loading,
  onSessionChange,
  onCreateSession,
  onPenalty,
  onDelete,
  onExport,
}: ProgressViewProps) {
  const summary = summarizeSolves(solves)
  const days = dailyProgress(solves)
  const personalBests = personalBestHistory(solves).reverse()

  const width = 900
  const height = 250
  const paddingX = 46
  const paddingY = 28
  const allValues = days.flatMap((day) => [day.mean, day.best])
  const minimum = allValues.length ? Math.min(...allValues) : 0
  const maximum = allValues.length ? Math.max(...allValues) : 1
  const range = Math.max(maximum - minimum, 1000)
  const xAt = (index: number) =>
    days.length <= 1
      ? width / 2
      : paddingX + (index / (days.length - 1)) * (width - paddingX * 2)
  const yAt = (value: number) =>
    paddingY + ((maximum - value) / range) * (height - paddingY * 2)
  const meanLine = days.map((day, index) => `${xAt(index)},${yAt(day.mean)}`).join(' ')
  const bestLine = days.map((day, index) => `${xAt(index)},${yAt(day.best)}`).join(' ')
  const labelStep = Math.max(1, Math.ceil(days.length / 6))

  return (
    <main className="progress-view page-width">
      <header className="progress-heading">
        <div>
          <span className="section-label">progress</span>
          <h1>{session?.name ?? 'practice session'}</h1>
        </div>
        <div className="progress-controls">
          <div className="progress-session-control">
            <select
              value={activeSessionId}
              onChange={(event) => onSessionChange(event.target.value)}
              aria-label="Practice session"
            >
              {sessions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={onCreateSession} aria-label="Create session">
              <Plus aria-hidden="true" />
            </button>
          </div>
          <button className="export-button" type="button" onClick={onExport}>
            <Download aria-hidden="true" />
            export
          </button>
        </div>
      </header>

      <section className="result-overview" aria-label="Session highlights">
        <div className="primary-stats">
          <div>
            <span>best</span>
            <strong>{statTime(summary.bestSingle)}</strong>
          </div>
          <div>
            <span>best ao5</span>
            <strong>{statTime(summary.bestAo5)}</strong>
          </div>
        </div>

        <article className="trend-chart-card">
          <div className="chart-heading">
            <div>
              <span className="section-label">daily trend</span>
              <h2>mean and best</h2>
            </div>
            <div className="chart-legend" aria-hidden="true">
              <span><i className="mean-key" />mean</span>
              <span><i className="best-key" />best</span>
            </div>
          </div>

          {days.length === 0 ? (
            <p className="chart-empty">
              {loading ? 'loading history...' : 'complete a solve to begin the timeline'}
            </p>
          ) : (
            <svg
              className="progress-chart"
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="Daily mean and best solve chart"
            >
              <line x1={paddingX} y1={paddingY} x2={width - paddingX} y2={paddingY} />
              <line
                x1={paddingX}
                y1={height / 2}
                x2={width - paddingX}
                y2={height / 2}
              />
              <line
                x1={paddingX}
                y1={height - paddingY}
                x2={width - paddingX}
                y2={height - paddingY}
              />
              <polyline className="chart-line chart-line--mean" points={meanLine} />
              <polyline className="chart-line chart-line--best" points={bestLine} />
              {days.map((day, index) => (
                <g key={day.key}>
                  <circle className="chart-point" cx={xAt(index)} cy={yAt(day.mean)} r="3" />
                  {(index % labelStep === 0 || index === days.length - 1) && (
                    <text x={xAt(index)} y={height - 5} textAnchor="middle">
                      {day.label}
                    </text>
                  )}
                </g>
              ))}
              <text x="2" y={paddingY + 3}>{formatTime(maximum)}</text>
              <text x="2" y={height - paddingY + 3}>{formatTime(minimum)}</text>
            </svg>
          )}
        </article>
      </section>

      <section className="secondary-stats" aria-label="Session statistics">
        <div>
          <span>best ao12</span>
          <strong>{statTime(summary.bestAo12)}</strong>
        </div>
        <div>
          <span>session mean</span>
          <strong>{statTime(summary.mean)}</strong>
        </div>
        <div>
          <span>solves</span>
          <strong>{summary.count}</strong>
        </div>
        <div>
          <span>dnf</span>
          <strong>{summary.dnfCount}</strong>
        </div>
      </section>

      <section className="records-grid">
        <article className="records-card solve-history-card">
          <div className="records-heading">
            <div>
              <span className="section-label">session log</span>
              <h2>recent solves</h2>
            </div>
            <span>{solves.length}</span>
          </div>

          <div className="progress-solve-list">
            {loading ? (
              <p className="records-empty">loading history...</p>
            ) : solves.length === 0 ? (
              <p className="records-empty">your first solve will appear here</p>
            ) : (
              solves.slice(0, 12).map((solve, index) => (
                <article className="progress-solve-row" key={solve.id}>
                  <span className="progress-solve-index">
                    {String(solves.length - index).padStart(2, '0')}
                  </span>
                  <div className="progress-solve-result">
                    <strong>{formatTime(solve.duration_ms, solve.penalty)}</strong>
                    {solve.penalty === 'dnf' && <span>{formatTime(solve.duration_ms)}</span>}
                  </div>
                  <time dateTime={solve.recorded_at}>
                    {new Date(solve.recorded_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                    {' · '}
                    {new Date(solve.recorded_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                  <div className="progress-solve-actions">
                    <button
                      className={solve.penalty === 'plus2' ? 'is-active' : ''}
                      type="button"
                      onClick={() => onPenalty(solve, 'plus2')}
                      title="Toggle two-second penalty"
                      aria-pressed={solve.penalty === 'plus2'}
                    >
                      +2
                    </button>
                    <button
                      className={solve.penalty === 'dnf' ? 'is-active' : ''}
                      type="button"
                      onClick={() => onPenalty(solve, 'dnf')}
                      title="Toggle DNF"
                      aria-pressed={solve.penalty === 'dnf'}
                    >
                      dnf
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(solve)}
                      aria-label={`Delete ${formatTime(solve.duration_ms)} solve`}
                      title="Delete solve"
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </article>

        <article className="records-card pb-card">
          <div className="records-heading">
            <div>
              <span className="section-label">milestones</span>
              <h2>personal bests</h2>
            </div>
            <span>{personalBests.length}</span>
          </div>
          <div className="pb-list">
            {personalBests.length === 0 ? (
              <p className="records-empty">no personal bests yet</p>
            ) : (
              personalBests.slice(0, 8).map((record, index) => (
                <div className="pb-row" key={record.solve.id}>
                  <span>{String(personalBests.length - index).padStart(2, '0')}</span>
                  <strong>{formatTime(record.durationMs)}</strong>
                  <time dateTime={record.solve.recorded_at}>
                    {new Date(record.solve.recorded_at).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </time>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </main>
  )
}
