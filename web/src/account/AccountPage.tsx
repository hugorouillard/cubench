import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { getAccountDashboard } from '../api'
import type { ProfilePreview } from './profilePreview'
import { lifetimeProfileSummary, summarizeSolves, type DatedSolveRecord } from '../solves/stats'
import type { AccountDashboard, Penalty, Solve, UserProfile } from '../types'
import { AccountSummary } from './AccountSummary'
import { ActivityCalendar } from './DailyActivityChart'
import { PersonalBests } from './PersonalBests'
import { ProfileEditor } from './ProfileEditor'
import { RecentSolves } from './RecentSolves'
import './AccountPage.css'

const AccountProgression = lazy(() =>
  import('./ProgressionChart').then((module) => ({ default: module.AccountProgression })),
)

export type AccountPageProps = {
  preview?: ProfilePreview
  theme?: string
  onPenalty: (solve: Solve, penalty: Penalty) => Promise<Solve | null>
  onDelete: (solve: Solve) => Promise<boolean>
  onError: (message: string) => void
  onProfileChange: (profile: UserProfile) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

function datedBest(ms: number | null, at: string | null, id: string | null): DatedSolveRecord | null {
  return ms === null || at === null || id === null ? null : {
    durationMs: ms, achievedAt: at, solveId: id,
  }
}

export function AccountPage({ preview, theme = 'catppuccin-mocha', onPenalty, onDelete, onError, onProfileChange }: AccountPageProps) {
  const [dashboard, setDashboard] = useState<AccountDashboard | null>(null)
  const [loading, setLoading] = useState(!preview)
  const [editorOpen, setEditorOpen] = useState(false)
  const reportLoadError = useEffectEvent(onError)

  useEffect(() => {
    if (preview) return
    let cancelled = false
    void getAccountDashboard().then((result) => {
      if (!cancelled) setDashboard(result)
    }).catch((error: unknown) => {
      if (!cancelled) reportLoadError(`Could not load account: ${errorMessage(error)}`)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [preview])

  async function refreshDashboard() {
    try {
      const result = await getAccountDashboard()
      setDashboard((current) => current && current.summary.revision > result.summary.revision
        ? current : result)
    } catch (error) {
      onError(`Could not refresh account: ${errorMessage(error)}`)
    }
  }

  const previewSolves = preview?.solves ?? []
  const previewLifetime = useMemo(() => preview ? lifetimeProfileSummary(preview.solves) : null, [preview])
  const summary = dashboard?.summary
  const lifetime = previewLifetime ?? (summary ? {
    loggedCount: summary.solve_count,
    successfulCount: summary.completed_count,
    totalRawDurationMs: summary.total_duration_ms,
    earliestSolveAt: summary.earliest_solve_at,
    totalActiveDays: summary.active_days,
    currentStreak: summary.current_streak,
    longestStreak: summary.longest_streak,
    bestSingle: datedBest(summary.best_single_ms, summary.best_single_at, summary.best_single_id),
    bestAo5: datedBest(summary.best_ao5_ms, summary.best_ao5_at, summary.best_ao5_id),
    bestAo12: datedBest(summary.best_ao12_ms, summary.best_ao12_at, summary.best_ao12_id),
    bestAo50: datedBest(summary.best_ao50_ms, summary.best_ao50_at, summary.best_ao50_id),
  } : null)

  async function changePenalty(solve: Solve, penalty: Penalty) {
    try {
      if (await onPenalty(solve, penalty)) await refreshDashboard()
    } catch (error) {
      onError(`Could not change penalty: ${errorMessage(error)}`)
    }
  }

  async function deleteSolve(solve: Solve) {
    try {
      if (await onDelete(solve)) await refreshDashboard()
    } catch (error) {
      onError(`Could not delete solve: ${errorMessage(error)}`)
    }
  }

  const profile = preview?.profile ?? dashboard?.profile
  if (!profile || !lifetime) {
    return (
      <main className="account-page account-page-state page-width" aria-busy={loading}>
        <p role="status">{loading ? 'loading account...' : 'Account unavailable. Try opening this page again.'}</p>
      </main>
    )
  }

  return (
    <main className="account-page page-width">
      <AccountSummary
        profile={profile} lifetime={lifetime}
        meanMs={preview ? summarizeSolves(previewSolves).mean : summary?.mean_ms ?? null}
        onEdit={preview ? undefined : () => setEditorOpen(true)}
      />
      <PersonalBests
        single={lifetime.bestSingle} ao5={lifetime.bestAo5} ao12={lifetime.bestAo12}
        ao50={lifetime.bestAo50}
      />
      <ActivityCalendar
        key={summary?.revision ?? 'preview'}
        profile={profile} solves={preview ? previewSolves : undefined}
        activity={dashboard?.activity} revision={summary?.revision}
        onError={onError} onStale={() => void refreshDashboard()}
        activeDays={lifetime.totalActiveDays} currentStreak={lifetime.currentStreak}
        longestStreak={lifetime.longestStreak}
      />
      <Suspense fallback={<p className="account-progression-loading">loading progression...</p>}>
        <AccountProgression
          solves={preview ? previewSolves : undefined} points={dashboard?.progression}
          completedCount={summary?.completed_count}
          firstCompletedMs={summary?.first_completed_ms}
          totalDurationMs={summary?.total_duration_ms} theme={theme}
        />
      </Suspense>
      <RecentSolves
        key={summary?.revision ?? 'preview'} solves={preview ? previewSolves : undefined}
        page={dashboard?.recent} onError={onError} onStale={() => void refreshDashboard()}
        onPenalty={preview ? undefined : changePenalty} onDelete={preview ? undefined : deleteSolve}
      />
      {!preview && <ProfileEditor
        open={editorOpen}
        profile={profile}
        onClose={() => setEditorOpen(false)}
        onSaved={(updated) => {
          setDashboard((current) => current ? { ...current, profile: updated } : current)
          onProfileChange(updated)
        }}
        onError={onError}
      />}
    </main>
  )
}
