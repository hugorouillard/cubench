import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCrown, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { newestSolvesFirst, personalBestHistory } from '../solves/stats'
import { ApiError, getAccountRecent } from '../api'
import { formatTime } from '../timer/timer'
import type { Penalty, RecentPage, Solve } from '../types'
import { formatAccountDate } from './format'

const PAGE_SIZE = 10

export function RecentSolves({ solves, page, onError, onStale, onPenalty, onDelete }: {
  solves?: Solve[]
  page?: RecentPage
  onError?: (error: string) => void
  onStale?: () => void
  onPenalty?: (solve: Solve, penalty: Penalty) => Promise<void>
  onDelete?: (solve: Solve) => Promise<void>
}) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const [pendingIds, setPendingIds] = useState<string[]>([])
  const [extra, setExtra] = useState<RecentPage['solves']>([])
  const [cursor, setCursor] = useState(page?.next_cursor ?? null)
  const [loading, setLoading] = useState(false)
  const recent = useMemo(() => solves ? newestSolvesFirst(solves) : [...(page?.solves ?? []), ...extra], [solves, page, extra])
  const bestIds = useMemo(() => solves ? new Set(personalBestHistory(solves).map(({ solve }) => solve.id)) : new Set(recent.filter((solve) => 'is_pb' in solve && solve.is_pb).map((solve) => solve.id)), [solves, recent])

  async function loadMore() {
    if (!cursor || !page || loading) return
    setLoading(true)
    try {
      const next = await getAccountRecent(cursor, page.revision)
      setExtra((current) => [...current, ...next.solves])
      setCursor(next.next_cursor)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) onStale?.()
      else onError?.(error instanceof Error ? error.message : 'Could not load solves')
    } finally {
      setLoading(false)
    }
  }

  async function withPending(solve: Solve, action: () => Promise<void>) {
    setPendingIds((current) => [...current, solve.id])
    try {
      await action()
    } finally {
      setPendingIds((current) => current.filter((id) => id !== solve.id))
    }
  }

  return (
    <section className="account-recent" aria-labelledby="account-recent-title">
      <h2 id="account-recent-title">recent solves</h2>
      {recent.length === 0 ? (
        <p className="account-recent-empty">No solves yet. Your results will appear here after your first solve.</p>
      ) : (
        <>
          <div className="account-recent-scroll">
            <table className="account-recent-table">
              <thead><tr>
                <th scope="col"><span className="account-visually-hidden">personal best</span></th>
                <th scope="col">result</th>
                <th scope="col">penalty</th>
                <th scope="col">scramble</th>
                <th scope="col">date</th>
                {onPenalty && onDelete && <th scope="col"><span className="account-visually-hidden">actions</span></th>}
              </tr></thead>
              <tbody>
                {(solves ? recent.slice(0, limit) : recent).map((solve) => (
                  <tr key={solve.id}>
                    <td className="account-recent-pb">
                      {bestIds.has(solve.id) && <FontAwesomeIcon icon={faCrown} title="personal best" aria-label="personal best" />}
                    </td>
                    <td className="account-recent-result">{formatTime(solve.duration_ms, solve.penalty)}</td>
                    <td>{solve.penalty === 'plus2' ? '+2' : solve.penalty === 'dnf' ? 'DNF' : '—'}</td>
                    <td className="account-recent-scramble">
                      <details><summary>view scramble</summary><span>{solve.scramble}</span></details>
                    </td>
                    <td><time dateTime={solve.recorded_at}>
                      {formatAccountDate(solve.recorded_at)}
                      <small>{new Date(solve.recorded_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</small>
                    </time></td>
                    {onPenalty && onDelete && <td className="account-recent-actions">
                      <div>
                        <button type="button" disabled={pendingIds.includes(solve.id)} aria-pressed={solve.penalty === 'plus2'} aria-label={`Toggle +2 penalty for ${formatTime(solve.duration_ms)} solve`} onClick={() => void withPending(solve, () => onPenalty(solve, 'plus2'))}>+2</button>
                        <button type="button" disabled={pendingIds.includes(solve.id)} aria-pressed={solve.penalty === 'dnf'} aria-label={`Toggle DNF penalty for ${formatTime(solve.duration_ms)} solve`} onClick={() => void withPending(solve, () => onPenalty(solve, 'dnf'))}>dnf</button>
                        <button type="button" disabled={pendingIds.includes(solve.id)} aria-label={`Delete ${formatTime(solve.duration_ms)} solve`} onClick={() => void withPending(solve, () => onDelete(solve))}><FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /></button>
                      </div>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(solves ? limit < recent.length : cursor !== null) && <button className="account-load-more" type="button" disabled={loading} onClick={() => solves ? setLimit((current) => current + PAGE_SIZE) : void loadMore()}>load more</button>}
        </>
      )}
    </section>
  )
}
