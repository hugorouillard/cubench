import { useEffect, useEffectEvent, useMemo, useState } from 'react'
import { getProfile, getSolves } from '../api'
import type { ProfilePreview } from './profilePreview'
import { bestAverage, lifetimeProfileSummary, newestSolvesFirst } from '../solves/stats'
import type { Penalty, Solve, UserProfile } from '../types'
import { AccountSummary } from './AccountSummary'
import { ActivityCalendar } from './ActivityCalendar'
import { PersonalBests } from './PersonalBests'
import { ProfileEditor } from './ProfileEditor'
import { RecentSolves } from './RecentSolves'
import './AccountPage.css'

export type AccountPageProps = {
  preview?: ProfilePreview
  onPenalty: (solve: Solve, penalty: Penalty) => Promise<Solve | null>
  onDelete: (solve: Solve) => Promise<boolean>
  onError: (message: string) => void
  onProfileChange: (profile: UserProfile) => void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

export function AccountPage({ preview, onPenalty, onDelete, onError, onProfileChange }: AccountPageProps) {
  const [profile, setProfile] = useState<UserProfile | null>(preview?.profile ?? null)
  const [solves, setSolves] = useState<Solve[]>(preview?.solves ?? [])
  const [loading, setLoading] = useState(!preview)
  const [loadFailed, setLoadFailed] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const reportLoadError = useEffectEvent(onError)

  useEffect(() => {
    if (preview) return
    let cancelled = false

    void Promise.allSettled([getProfile(), getSolves()]).then(([profileResult, solvesResult]) => {
      if (cancelled) return
      if (profileResult.status === 'fulfilled') setProfile(profileResult.value)
      else reportLoadError(`Could not load profile: ${errorMessage(profileResult.reason)}`)
      if (solvesResult.status === 'fulfilled') setSolves(solvesResult.value)
      else reportLoadError(`Could not load solve history: ${errorMessage(solvesResult.reason)}`)
      setLoadFailed(profileResult.status === 'rejected' || solvesResult.status === 'rejected')
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [preview])

  const lifetime = useMemo(() => lifetimeProfileSummary(solves), [solves])
  const ao50 = useMemo(() => bestAverage(newestSolvesFirst(solves), 50), [solves])

  async function changePenalty(solve: Solve, penalty: Penalty) {
    try {
      const updated = await onPenalty(solve, penalty)
      if (updated) setSolves((current) => current.map((item) => item.id === solve.id ? updated : item))
    } catch (error) {
      onError(`Could not update solve: ${errorMessage(error)}`)
    }
  }

  async function deleteSolve(solve: Solve) {
    try {
      if (await onDelete(solve)) setSolves((current) => current.filter((item) => item.id !== solve.id))
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
      <AccountSummary profile={profile} lifetime={lifetime} onEdit={preview ? undefined : () => setEditorOpen(true)} />
      <PersonalBests single={lifetime.bestSingle} ao5={lifetime.bestAo5} ao12={lifetime.bestAo12} ao50={ao50} />
      <ActivityCalendar profile={profile} solves={solves} activeDays={lifetime.totalActiveDays} currentStreak={lifetime.currentStreak} longestStreak={lifetime.longestStreak} />
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
