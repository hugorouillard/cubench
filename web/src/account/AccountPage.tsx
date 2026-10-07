import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState, useSyncExternalStore } from 'react'
import { getProfile } from '../api'
import type { SolveRepository } from '../solves/solveRepository'
import type { ProfilePreview } from './profilePreview'
import { bestAverage, lifetimeSolveSummary, newestSolvesFirst } from '../solves/stats'
import { aggregateDailyActivity, summarizeActivity } from '../solves/activity'
import { useToday } from '../dates/useToday'
import { localDate } from '../dates/localCalendar'
import type { Penalty, Solve, UserProfile } from '../types'
import { AccountSummary } from './AccountSummary'
import { DailyActivityChart } from './DailyActivityChart'
import { PersonalBests } from './PersonalBests'
import { ProfileEditor } from './ProfileEditor'
import { RecentSolves } from './RecentSolves'
import './AccountPage.css'

const AccountProgression = lazy(() =>
  import('./ProgressionChart').then((module) => ({ default: module.AccountProgression })),
)

export type AccountPageProps = {
  repository: SolveRepository
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

export function AccountPage({ repository, preview, theme = 'catppuccin-mocha', onPenalty, onDelete, onError, onProfileChange }: AccountPageProps) {
  const [profile, setProfile] = useState<UserProfile | null>(preview?.profile ?? null)
  const { history } = useSyncExternalStore(repository.subscribe, repository.getSnapshot)
  const solves = preview?.solves ?? history
  const [loading, setLoading] = useState(!preview)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const reportLoadError = useEffectEvent(onError)

  useEffect(() => {
    if (preview) return
    let cancelled = false

    void Promise.allSettled([getProfile(), repository.loadHistory()]).then(([profileResult, solvesResult]) => {
      if (cancelled) return
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
      else reportLoadError(`Could not load profile: ${errorMessage(profileResult.reason)}`)
      if (solvesResult.status === 'rejected') reportLoadError(`Could not load solve history: ${errorMessage(solvesResult.reason)}`)
      setLoadFailed(profileResult.status === 'rejected' || solvesResult.status === 'rejected')
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [preview, repository])

  const today = useToday()
  const activity = useMemo(() => aggregateDailyActivity(solves), [solves])
  const activitySummary = useMemo(() => summarizeActivity(activity, today), [activity, today])
  const records = useMemo(() => lifetimeSolveSummary(solves), [solves])
  const lifetime = { ...records, ...activitySummary }
  const ao50 = useMemo(() => bestAverage(newestSolvesFirst(solves), 50), [solves])

  async function changePenalty(solve: Solve, penalty: Penalty) {
    try {
      await onPenalty(solve, penalty)
    } catch (error) {
      onError(`Could not update solve: ${errorMessage(error)}`)
    }
  }

  async function deleteSolve(solve: Solve) {
    try {
      await onDelete(solve)
    } catch (error) {
      onError(`Could not delete solve: ${errorMessage(error)}`)
    }
  }

  if (loading || loadFailed || !profile) {
    return (
      <main className="account-page account-page-state page-width" aria-busy={loading}>
        <p role="status">{loading ? 'loading account history...' : 'Account unavailable. Try opening this page again.'}</p>
      </main>
    )
  }

  // Imported/backdated attempts remain selectable even if they predate account creation.
  const firstYear = Math.min(
    new Date(profile.created_at).getFullYear(),
    records.earliestSolveAt ? new Date(records.earliestSolveAt).getFullYear() : Infinity,
    localDate(today).getFullYear(),
  )

  return (
    <main className="account-page page-width">
      <AccountSummary profile={profile} lifetime={lifetime} onEdit={preview ? undefined : () => setEditorOpen(true)} />
      <PersonalBests single={lifetime.bestSingle} ao5={lifetime.bestAo5} ao12={lifetime.bestAo12} ao50={ao50} />
      <DailyActivityChart activity={activity} firstYear={firstYear} today={today} summary={activitySummary} />
      <Suspense fallback={<p className="account-progression-loading" role="status">loading progression...</p>}>
        <AccountProgression solves={solves} theme={theme} />
      </Suspense>
      <RecentSolves solves={solves} onPenalty={preview ? undefined : changePenalty} onDelete={preview ? undefined : deleteSolve} />
      {!preview && <ProfileEditor
        open={editorOpen}
        profile={profile}
        onClose={() => setEditorOpen(false)}
        onSaved={(updated) => { setProfile(updated); onProfileChange(updated) }}
        onError={onError}
      />}
    </main>
  )
}
