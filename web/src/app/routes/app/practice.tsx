import { faRotateRight } from "@fortawesome/free-solid-svg-icons/faRotateRight"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { randomScrambleForEvent } from "cubing/scramble"
import {
    useEffect,
    useLayoutEffect,
    useState,
    useSyncExternalStore,
} from "react"
import { SessionPanel } from "../../../session/SessionPanel"
import type { SolveRepository } from "../../../solves/solveRepository"
import { summarizeSolves } from "../../../solves/stats"
import { PracticeSettings } from "../../../timer/PracticeSettings"
import {
    formatInspectionTime,
    formatTime,
    togglePenalty,
} from "../../../timer/timer"
import type { TimerPhase } from "../../../timer/useTimer"
import { useTimer } from "../../../timer/useTimer"
import type { Penalty, Solve, SolveInput } from "../../../types"
import { ErrorNotification } from "../../ErrorNotification"
import "./timer-page.css"
import { useOutletContext } from "react-router"

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong"
}

type SaveState = "idle" | "saving" | "failed"

function phaseInstruction(
    phase: TimerPhase,
    inspectionEnabled: boolean,
): string {
    if (phase === "holding") return "keep holding"
    if (phase === "ready") return "release to start"
    if (phase === "inspection") return "space to start"
    if (phase === "inspection-holding") return "keep holding"
    if (phase === "inspection-ready") return "release to start"
    if (phase === "running") return "space to stop"
    if (inspectionEnabled) return "space to inspect"
    if (phase === "stopped") return "hold space for next solve"
    return "hold space to start"
}

const PracticeRoute = () => {
    const repository = useOutletContext<SolveRepository>()
    const { session: solves } = useSyncExternalStore(
        repository.subscribe,
        repository.getSnapshot,
    )
    const [saveState, setSaveState] = useState<SaveState>("idle")
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

    const [practiceSettingsOpen, setPracticeSettingsOpen] = useState(false)
    const [hideTimer, setHideTimer] = useState(false)
    const [inspectionEnabled, setInspectionEnabled] = useState(false)
    const [scramble, setScramble] = useState("")
    const [scrambleLoading, setScrambleLoading] = useState(true)
    const [pendingSolve, setPendingSolve] = useState<SolveInput | null>(null)
    const [latestResultId, setLatestResultId] = useState("")

    useEffect(() => {
        let cancelled = false
        randomScrambleForEvent("333")
            .then((nextScramble) => {
                if (cancelled) return
                setScramble(nextScramble.toString())
                setScrambleLoading(false)
            })
            .catch((initialError: unknown) => {
                if (!cancelled) setError(errorMessage(initialError))
            })
        return () => {
            cancelled = true
        }
    }, [])

    async function generateScramble() {
        setScramble("")
        setScrambleLoading(true)
        try {
            const nextScramble = await randomScrambleForEvent("333")
            setScramble(nextScramble.toString())
        } catch (scrambleError) {
            setError(errorMessage(scrambleError))
        } finally {
            setScrambleLoading(false)
        }
    }

    async function persistSolve(solve: SolveInput) {
        setSaveState("saving")
        setError("")
        try {
            await repository.create(solve)
            setPendingSolve(null)
            setSaveState("idle")
            await generateScramble()
        } catch (saveError) {
            setSaveState("failed")
            setError(`Failed to save result: ${errorMessage(saveError)}`)
        }
    }

    function handleTimerComplete(durationMs: number, penalty: Penalty) {
        if (!scramble || pendingSolve) return
        const solve: SolveInput = {
            id: crypto.randomUUID(),
            duration_ms: durationMs,
            penalty,
            scramble,
            recorded_at: new Date().toISOString(),
        }
        setPendingSolve(solve)
        setLatestResultId(solve.id)
        void persistSolve(solve)
    }

    const {
        phase,
        elapsedMs,
        reset: resetTimer,
    } = useTimer(
        Boolean(
            scramble &&
                !scrambleLoading &&
                !pendingSolve &&
                !practiceSettingsOpen,
        ),
        inspectionEnabled,
        handleTimerComplete,
    )
    const controlsDisabled =
        Boolean(pendingSolve) || (phase !== "idle" && phase !== "stopped")
    const lastSolve = solves[0]
    const latestResult = solves.find((solve) => solve.id === latestResultId)

    useLayoutEffect(() => {
        // A cleared session or deleted result should no longer be on the clock.
        // An unsaved result is intentionally absent from the repository.
        if (latestResultId && !latestResult && saveState === "idle") {
            setLatestResultId("")
            resetTimer()
        }
    }, [latestResultId, latestResult, saveState, resetTimer])

    const summary = summarizeSolves(solves)
    const statTime = (duration: number | null) =>
        duration === null ? "--" : formatTime(duration)
    const inspectionActive =
        phase === "inspection" ||
        phase === "inspection-holding" ||
        phase === "inspection-ready"
    const displayedTime = inspectionActive
        ? formatInspectionTime(elapsedMs)
        : phase === "running"
          ? formatTime(elapsedMs)
          : phase === "stopped"
            ? latestResult
                ? formatTime(latestResult.duration_ms, latestResult.penalty)
                : formatTime(elapsedMs)
            : lastSolve
              ? formatTime(lastSolve.duration_ms, lastSolve.penalty)
              : "0.00"
    return (
        <>
            {error && (
                <ErrorNotification
                    message={error}
                    onDismiss={() => setError("")}
                />
            )}
            <main className="practice-view page-width">
                <div className="practice-workspace">
                    <PracticeSettings
                        open={practiceSettingsOpen}
                        disabled={controlsDisabled}
                        hideTimer={hideTimer}
                        inspectionEnabled={inspectionEnabled}
                        onOpenChange={setPracticeSettingsOpen}
                        onHideTimerChange={setHideTimer}
                        onInspectionChange={setInspectionEnabled}
                    />
                    <section className="timer-stage" aria-label="Timer">
                        <button
                            className="scramble"
                            type="button"
                            onClick={() => void generateScramble()}
                            disabled={controlsDisabled || scrambleLoading}
                            title="Generate another scramble"
                        >
                            {scrambleLoading
                                ? "preparing scramble..."
                                : scramble}
                        </button>
                        <div
                            className={`timer-readout${hideTimer ? " timer-readout--hidden" : ""}`}
                            aria-live="off"
                        >
                            {displayedTime}
                        </div>
                        <div className="timer-results">
                            <div
                                className="session-stats focus-chrome"
                                role="group"
                                aria-label="Current statistics"
                            >
                                <div>
                                    <span>mean</span>
                                    <strong>{statTime(summary.mean)}</strong>
                                </div>
                                <div className="session-stat--primary">
                                    <span>ao5</span>
                                    <strong>
                                        {statTime(summary.currentAo5)}
                                    </strong>
                                </div>
                                <div className="session-stat--primary">
                                    <span>ao12</span>
                                    <strong>
                                        {statTime(summary.currentAo12)}
                                    </strong>
                                </div>
                                <div>
                                    <span>best ao5</span>
                                    <strong>{statTime(summary.bestAo5)}</strong>
                                </div>
                                <div>
                                    <span>best</span>
                                    <strong>
                                        {statTime(summary.bestSingle)}
                                    </strong>
                                </div>
                            </div>
                            <div className="timer-controls">
                                <div
                                    className="timer-status"
                                    aria-live="polite"
                                >
                                    <span className="keycap">space</span>
                                    <span>
                                        {phaseInstruction(
                                            phase,
                                            inspectionEnabled,
                                        )}
                                    </span>
                                </div>
                            </div>
                            <div className="post-solve" aria-live="polite">
                                {phase === "stopped" &&
                                    saveState === "saving" && (
                                        <span>saving solve...</span>
                                    )}
                                {phase === "stopped" &&
                                    saveState === "failed" && (
                                        <button
                                            className="post-solve-retry"
                                            type="button"
                                            onClick={() => {
                                                if (pendingSolve)
                                                    void persistSolve(
                                                        pendingSolve,
                                                    )
                                            }}
                                        >
                                            <FontAwesomeIcon
                                                className="app-icon"
                                                icon={faRotateRight}
                                                aria-hidden="true"
                                            />
                                            Retry saving result
                                        </button>
                                    )}
                            </div>
                        </div>
                    </section>
                    <SessionPanel
                        solves={solves}
                        disabled={
                            controlsDisabled || pendingMutationIds.length > 0
                        }
                        pendingSolveIds={pendingMutationIds}
                        theme={"catppuccin-mocha"}
                        onPenalty={handlePenalty}
                        onDelete={handleDelete}
                        onClear={handleClearSolves}
                    />
                </div>
            </main>
        </>
    )
}

export default PracticeRoute
