import { lazy, Suspense, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { getProfile, getSolves, getSolveSummary } from '../api'
import type { ProfilePreview } from './profilePreview'
import { bestAverage, lifetimeProfileSummary, newestSolvesFirst } from '../solves/stats'
import type { Penalty, Solve, SolveSummary, UserProfile } from '../types'
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

export function AccountPage({ preview, theme = 'catppuccin-mocha', onPenalty, onDelete, onError, onProfileChange }: AccountPageProps) {
  const [profile, setProfile] = useState<UserProfile | null>(preview?.profile ?? null)
  const [solves, setSolves] = useState<Solve[]>(preview?.solves ?? [])
  const [storedSummary, setStoredSummary] = useState<SolveSummary | null>(null)
  const [loading, setLoading] = useState(!preview)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const reportLoadError = useEffectEvent(onError)

  useEffect(() => {
    if (preview) return
    let cancelled = false

    void Promise.allSettled([getProfile(), getSolves(), getSolveSummary()]).then(([profileResult, solvesResult, summaryResult]) => {
      if (cancelled) return
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
      else reportLoadError(`Could not load profile: ${errorMessage(profileResult.reason)}`)
      if (solvesResult.status === 'fulfilled') setSolves(solvesResult.value)
      else reportLoadError(`Could not load solve history: ${errorMessage(solvesResult.reason)}`)
      if (summaryResult.status === 'fulfilled') setStoredSummary(summaryResult.value)
      else reportLoadError(`Could not load solve summary: ${errorMessage(summaryResult.reason)}`)
      setLoadFailed(profileResult.status === 'rejected' || solvesResult.status === 'rejected')
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [preview])

  const lifetime = useMemo(() => lifetimeProfileSummary(solves), [solves])
  const headline = storedSummary ? {
    ...lifetime,
    loggedCount: storedSummary.solve_count,
    successfulCount: storedSummary.completed_count,
    totalRawDurationMs: storedSummary.total_duration_ms,
    bestSingle: storedSummary.best_single_ms === null ? null : {
      durationMs: storedSummary.best_single_ms, achievedAt: storedSummary.best_single_at!, solveId: storedSummary.best_single_id!,
    },
    bestAo5: storedSummary.best_ao5_ms === null ? null : {
      durationMs: storedSummary.best_ao5_ms, achievedAt: storedSummary.best_ao5_at!, solveId: storedSummary.best_ao5_id!,
    },
    bestAo12: storedSummary.best_ao12_ms === null ? null : {
      durationMs: storedSummary.best_ao12_ms, achievedAt: storedSummary.best_ao12_at!, solveId: storedSummary.best_ao12_id!,
    },
  } : lifetime
  const ao50 = useMemo(() => bestAverage(newestSolvesFirst(solves), 50), [solves])

  async function changePenalty(solve: Solve, penalty: Penalty) {
    try {
      const updated = await onPenalty(solve, penalty)
      if (updated) {
        setStoredSummary(null)
        setSolves((current) => current.map((item) => item.id === solve.id ? updated : item))
      }
    } catch (error) {
      onError(`Could not update solve: ${errorMessage(error)}`)
    }
  }

  async function deleteSolve(solve: Solve) {
    try {
      if (await onDelete(solve)) {
        setStoredSummary(null)
        setSolves((current) => current.filter((item) => item.id !== solve.id))
      }
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

  return (
    <main className="account-page page-width">
      <AccountSummary profile={profile} lifetime={headline} onEdit={preview ? undefined : () => setEditorOpen(true)} />
      <PersonalBests single={headline.bestSingle} ao5={headline.bestAo5} ao12={headline.bestAo12} ao50={ao50} />
      <ActivityCalendar profile={profile} solves={solves} activeDays={lifetime.totalActiveDays} currentStreak={lifetime.currentStreak} longestStreak={lifetime.longestStreak} />
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
