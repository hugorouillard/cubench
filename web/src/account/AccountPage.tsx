import {
    lazy,
    Suspense,
    useEffect,
    useEffectEvent,
    useMemo,
    useState,
    useSyncExternalStore,
} from "react"
import { getAccount } from "../api"
import { localDate } from "../dates/localCalendar"
import { useToday } from "../dates/useToday"
import { countSolvesByDay, summarizeActivity } from "../solves/activity"
import type { SolveRepository } from "../solves/solveRepository"
import { lifetimeSolveSummary } from "../solves/stats"
import type { AccountDetails, Penalty, Solve } from "../types"
import { AccountSummary } from "./AccountSummary"
import { AccountEditor } from "./account-editor"
import type { AccountPreview } from "./account-preview"
import { DailyActivityChart } from "./DailyActivityChart"
import { PersonalBests } from "./PersonalBests"
import { RecentSolves } from "./RecentSolves"
import "./AccountPage.css"

const AccountProgression = lazy(() =>
    import("./ProgressionChart").then((module) => ({
        default: module.AccountProgression,
    })),
)

export type AccountPageProps = {
    repository: SolveRepository
    preview?: AccountPreview
    theme?: string
    onPenalty: (solve: Solve, penalty: Penalty) => Promise<void>
    onDelete: (solve: Solve) => Promise<void>
    onError: (message: string) => void
    onAccountChange: (account: AccountDetails) => void
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong"
}

export function AccountPage({
    repository,
    preview,
    theme = "catppuccin-mocha",
    onPenalty,
    onDelete,
    onError,
    onAccountChange,
}: AccountPageProps) {
    const [account, setAccount] = useState<AccountDetails | null>(
        preview?.account ?? null,
    )
    const { history } = useSyncExternalStore(
        repository.subscribe,
        repository.getSnapshot,
    )
    const solves = preview?.solves ?? history
    const [loading, setLoading] = useState(!preview)
    const [loadFailed, setLoadFailed] = useState(false)
    const [editorOpen, setEditorOpen] = useState(false)
    const reportLoadError = useEffectEvent(onError)

    useEffect(() => {
        if (preview) return
        let cancelled = false

        void Promise.allSettled([getAccount(), repository.loadHistory()]).then(
            ([accountResult, solvesResult]) => {
                if (cancelled) return
                if (accountResult.status === "fulfilled")
                    setAccount(accountResult.value)
                else
                    reportLoadError(
                        `Could not load account: ${errorMessage(accountResult.reason)}`,
                    )
                if (solvesResult.status === "rejected")
                    reportLoadError(
                        `Could not load solve history: ${errorMessage(solvesResult.reason)}`,
                    )
                setLoadFailed(
                    accountResult.status === "rejected" ||
                        solvesResult.status === "rejected",
                )
                setLoading(false)
            },
        )

        return () => {
            cancelled = true
        }
    }, [preview, repository])

    const today = useToday()
    const solveCounts = useMemo(() => countSolvesByDay(solves), [solves])
    const activitySummary = useMemo(
        () => summarizeActivity(solveCounts, today),
        [solveCounts, today],
    )
    const records = useMemo(() => lifetimeSolveSummary(solves), [solves])
    const lifetime = { ...records, ...activitySummary }

    if (loading || loadFailed || !account) {
        return (
            <main
                className="account-page account-page-state page-width"
                aria-busy={loading}
            >
                <p role="status">
                    {loading
                        ? "loading account history..."
                        : "Account unavailable. Try opening this page again."}
                </p>
            </main>
        )
    }

    // Imported/backdated attempts remain selectable even if they predate account creation.
    const firstYear = Math.min(
        new Date(account.created_at).getFullYear(),
        records.earliestSolveAt
            ? new Date(records.earliestSolveAt).getFullYear()
            : Infinity,
        localDate(today).getFullYear(),
    )

    return (
        <main className="account-page page-width">
            <AccountSummary
                account={account}
                lifetime={lifetime}
                onEdit={preview ? undefined : () => setEditorOpen(true)}
            />
            <PersonalBests
                single={lifetime.bestSingle}
                ao5={lifetime.bestAo5}
                ao12={lifetime.bestAo12}
                ao50={lifetime.bestAo50}
            />
            <DailyActivityChart
                activity={solveCounts}
                firstYear={firstYear}
                today={today}
                summary={activitySummary}
            />
            <Suspense
                fallback={
                    <p className="account-progression-loading" role="status">
                        loading progression...
                    </p>
                }
            >
                <AccountProgression solves={solves} theme={theme} />
            </Suspense>
            <RecentSolves
                solves={solves}
                onPenalty={preview ? undefined : onPenalty}
                onDelete={preview ? undefined : onDelete}
            />
            {!preview && (
                <AccountEditor
                    open={editorOpen}
                    account={account}
                    onClose={() => setEditorOpen(false)}
                    onSaved={(updated) => {
                        setAccount(updated)
                        onAccountChange(updated)
                    }}
                    onError={onError}
                />
            )}
        </main>
    )
}
