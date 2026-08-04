import { dailyProgress, personalBestHistory, summarizeSolves } from './stats'
import { formatTime } from './timer'
import type { PracticeSession, Solve } from './types'
import './ProgressView.css'

type ProgressViewProps = {
  session: PracticeSession | undefined
  solves: Solve[]
  onExport: () => void
}

function statTime(durationMs: number | null): string {
  return durationMs === null ? '--' : formatTime(durationMs)
}

export function ProgressView({ session, solves, onExport }: ProgressViewProps) {
  const summary = summarizeSolves(solves)
  const days = dailyProgress(solves)
  const personalBests = personalBestHistory(solves).reverse()

  const width = 900
  const height = 280
  const paddingX = 46
  const paddingY = 32
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
    <main className="progress-view">
      <header className="progress-heading">
        <div>
          <span className="panel-kicker">progress report / {session?.name ?? 'session'}</span>
          <h1>Practice, measured.</h1>
        </div>
        <button className="export-button" type="button" onClick={onExport}>
          export data / json
        </button>
      </header>

      <section className="metric-grid" aria-label="Session statistics">
        <article>
          <span>best single</span>
          <strong>{statTime(summary.bestSingle)}</strong>
        </article>
        <article>
          <span>best ao5</span>
          <strong>{statTime(summary.bestAo5)}</strong>
        </article>
        <article>
          <span>best ao12</span>
          <strong>{statTime(summary.bestAo12)}</strong>
        </article>
        <article>
          <span>session mean</span>
          <strong>{statTime(summary.mean)}</strong>
        </article>
        <article>
          <span>solves</span>
          <strong>{summary.count}</strong>
        </article>
        <article>
          <span>dnf</span>
          <strong>{summary.dnfCount}</strong>
        </article>
      </section>

      <section className="progress-grid">
        <article className="chart-card">
          <div className="card-heading">
            <div>
              <span className="panel-kicker">daily trend</span>
              <h2>Mean and best</h2>
            </div>
            <div className="chart-legend">
              <span><i className="mean-key" /> mean</span>
              <span><i className="best-key" /> best</span>
            </div>
          </div>

          {days.length === 0 ? (
            <p className="chart-empty">Complete a solve to begin the timeline.</p>
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
                    <text x={xAt(index)} y={height - 7} textAnchor="middle">
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

        <article className="pb-card">
          <div className="card-heading">
            <div>
              <span className="panel-kicker">milestones</span>
              <h2>Personal bests</h2>
            </div>
            <span className="solve-count">{personalBests.length}</span>
          </div>
          <div className="pb-list">
            {personalBests.length === 0 ? (
              <p className="chart-empty">No personal bests yet.</p>
            ) : (
              personalBests.slice(0, 7).map((record, index) => (
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
