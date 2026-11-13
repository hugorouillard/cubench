import { useState, useSyncExternalStore } from "react"
import { createSolveRepository } from "../../../solves/solveRepository"
import { guestSolveStore } from "../../../solves/solveStore"
import { TimerPage, type TimerPageState } from "../../../timer/TimerPage"
import { formatTime, togglePenalty } from "../../../timer/timer"
import type { Penalty, Solve } from "../../../types"
import { ErrorNotification } from "../../ErrorNotification"

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong"
}

const PracticeRoute = () => {
    const [repository] = useState(() =>
        createSolveRepository(guestSolveStore, async () => []),
    )
    const { session: solves } = useSyncExternalStore(
        repository.subscribe,
        repository.getSnapshot,
    )
    const [{ saveState }, setTimerPageState] = useState<TimerPageState>({
        phase: "idle",
        saveState: "idle",
    })
    const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([])
    const [error, setError] = useState("")

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
        const message = `Clear all ${solves.length} ${label}? This cannot be undone.`
        if (!window.confirm(message)) return
        repository.clearSession()
    }

    return (
        <>
            {error && (
                <ErrorNotification
                    message={error}
                    onDismiss={() => setError("")}
                />
            )}
            <TimerPage
                solves={solves}
                pendingMutationIds={pendingMutationIds}
                theme="catppuccin-mocha"
                disabled={false}
                onSave={repository.create}
                onPenalty={handlePenalty}
                onDelete={(solve) => handleDelete(solve, false)}
                onClear={handleClearSolves}
                onError={setError}
                onStateChange={setTimerPageState}
            />
        </>
    )
}

export default PracticeRoute
