import { useMemo, useState, useSyncExternalStore } from "react"
import { getSolves } from "../../api"
import { AuthProvider } from "../../auth/AuthProvider"
import { useAuth } from "../../auth/useAuth"
import { createSolveRepository } from "../../solves/solveRepository"
import {
    accountSolveStore,
    guestSolveStore,
    type SolveStore,
} from "../../solves/solveStore"
import { TimerPage, type TimerPageState } from "../../timer/TimerPage"
import { formatTime, togglePenalty } from "../../timer/timer"
import type { Penalty, Solve } from "../../types"
import { ErrorNotification } from "../ErrorNotification"
import { Footer } from "../Footer"
import { Header } from "../Header"
import { applyTheme, type Theme } from "../theme"
import "../App.css"
import { Link } from "react-router"

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong"
}

type AppProps = {
    initialTheme: Theme
    solveStore?: SolveStore
}

function AppShell({ initialTheme, solveStore: solveStoreOverride }: AppProps) {
    const {
        account,
        checking: authChecking,
        pending,
        sessionError,
        dismissSessionError,
    } = useAuth()
    const authBusy = pending !== null
    const [{ phase, saveState }, setTimerPageState] = useState<TimerPageState>({
        phase: "idle",
        saveState: "idle",
    })
    const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([])
    const [error, setError] = useState("")
    const [theme, setTheme] = useState<Theme>(initialTheme)
    const solveStore =
        solveStoreOverride ?? (account ? accountSolveStore : guestSolveStore)
    // Different accounts share the same API adapter, but must never share cached data.
    const accountId = account?.id ?? null
    const repository = useMemo(
        () =>
            createSolveRepository(
                solveStore,
                accountId === null ? async () => [] : getSolves,
            ),
        [solveStore, accountId],
    )
    const { session: solves } = useSyncExternalStore(
        repository.subscribe,
        repository.getSnapshot,
    )

    async function handlePenalty(
        solve: Solve,
        selectedPenalty: Penalty,
    ): Promise<void> {
        const update = {
            penalty: togglePenalty(solve.penalty, selectedPenalty),
        }
        setPendingMutationIds((current) =>
            current.includes(solve.id) ? current : [...current, solve.id],
        )
        try {
            await repository.update(solve, update)
        } catch (penaltyError) {
            setError(errorMessage(penaltyError))
        } finally {
            setPendingMutationIds((current) =>
                current.filter((id) => id !== solve.id),
            )
        }
    }

    async function handleDelete(solve: Solve, confirm = true): Promise<void> {
        if (
            confirm &&
            !window.confirm(
                `Delete the ${formatTime(solve.duration_ms)} solve?`,
            )
        )
            return
        setPendingMutationIds((current) =>
            current.includes(solve.id) ? current : [...current, solve.id],
        )
        try {
            await repository.delete(solve)
        } catch (deleteError) {
            setError(errorMessage(deleteError))
        } finally {
            setPendingMutationIds((current) =>
                current.filter((id) => id !== solve.id),
            )
        }
    }

    function handleClearSolves(): void {
        if (
            solves.length === 0 ||
            saveState !== "idle" ||
            pendingMutationIds.length
        )
            return
        const label = solves.length === 1 ? "solve" : "solves"
        const message = account
            ? `Clear ${solves.length} current ${label}? Saved solves remain in your profile.`
            : `Clear all ${solves.length} ${label}? This cannot be undone.`
        if (!window.confirm(message)) return
        repository.clearSession()
    }

    function handleThemeChange(nextTheme: Theme) {
        setTheme(nextTheme)
        applyTheme(nextTheme)
    }

    const notificationError = error || sessionError
    const inspectionActive =
        phase === "inspection" ||
        phase === "inspection-holding" ||
        phase === "inspection-ready"

    return (
        <div
            className={`app app--${phase === "inspection-holding" ? "holding" : phase === "inspection-ready" ? "ready" : phase}${inspectionActive ? " app--inspecting" : ""}`}
        >
            <Header>
                <Link to="/login">Sign in</Link>
            </Header>
            {notificationError && (
                <ErrorNotification
                    message={notificationError}
                    onDismiss={() => {
                        if (error) setError("")
                        else dismissSessionError()
                    }}
                />
            )}
            <TimerPage
                key={accountId ?? "guest"}
                solves={solves}
                pendingMutationIds={pendingMutationIds}
                theme={theme}
                disabled={authChecking || authBusy}
                onSave={repository.create}
                onPenalty={handlePenalty}
                onDelete={(solve) => handleDelete(solve, false)}
                onClear={handleClearSolves}
                onError={setError}
                onStateChange={setTimerPageState}
            />
            <Footer theme={theme} onThemeChange={handleThemeChange} />
        </div>
    )
}

export default function AppRoot(props: AppProps) {
    return (
        <AuthProvider>
            <AppShell {...props} />
        </AuthProvider>
    )
}
