import { getSolves } from '../api'
import type { Solve, SolveInput } from '../types'
import { newestSolvesFirst } from './stats'
import type { SolveStore, SolveUpdate } from './solveStore'

export type SolveSnapshot = Readonly<{ session: Solve[]; history: Solve[] }>
export type SolveRepository = ReturnType<typeof createSolveRepository>

/**
 * One repository per auth identity. Persistence is injected; successful mutations
 * update both projections here, rather than being copied by individual pages.
 * Session membership is deliberately independent of lifetime history.
 */
export function createSolveRepository(persistence: SolveStore, fetchHistory = getSolves) {
  let snapshot: SolveSnapshot = { session: [], history: [] }
  const listeners = new Set<() => void>()
  let pendingLoad: Promise<void> | null = null
  let loadChanges: Map<string, Solve | null> | null = null

  function publish(next: SolveSnapshot) {
    snapshot = next
    for (const listener of listeners) listener()
  }

  function upsert(solves: Solve[], solve: Solve): Solve[] {
    return newestSolvesFirst([...solves.filter((item) => item.id !== solve.id), solve])
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    /** Refresh on page entry, deduplicating concurrent loads (including StrictMode). */
    loadHistory(): Promise<void> {
      if (pendingLoad) return pendingLoad
      const changes = new Map<string, Solve | null>()
      loadChanges = changes
      pendingLoad = Promise.resolve().then(fetchHistory).then((solves) => {
        const merged = new Map(solves.map((solve) => [solve.id, solve]))
        // An older response must not resurrect a deleted solve or undo an edit/save.
        for (const [id, solve] of changes) {
          if (solve) merged.set(id, solve)
          else merged.delete(id)
        }
        publish({
          // Reconcile existing session members with remote edits/deletions, but
          // never import older history into the current timer session.
          session: snapshot.session.flatMap((solve) => {
            const current = merged.get(solve.id)
            return current ? [current] : []
          }),
          history: newestSolvesFirst([...merged.values()]),
        })
      }).finally(() => {
        pendingLoad = null
        loadChanges = null
      })
      return pendingLoad
    },
    async create(input: SolveInput): Promise<Solve> {
      const solve = await persistence.create(input)
      loadChanges?.set(solve.id, solve)
      publish({ session: upsert(snapshot.session, solve), history: upsert(snapshot.history, solve) })
      return solve
    },
    async update(solve: Solve, update: SolveUpdate): Promise<Solve> {
      const updated = await persistence.update(solve, update)
      loadChanges?.set(solve.id, updated)
      publish({
        session: snapshot.session.map((item) => item.id === solve.id ? updated : item),
        history: upsert(snapshot.history, updated),
      })
      return updated
    },
    async delete(solve: Solve): Promise<void> {
      await persistence.delete(solve)
      loadChanges?.set(solve.id, null)
      publish({
        session: snapshot.session.filter((item) => item.id !== solve.id),
        history: snapshot.history.filter((item) => item.id !== solve.id),
      })
    },
    clearSession() {
      publish({ ...snapshot, session: [] })
    },
  }
}
