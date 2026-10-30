import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useLayoutEffect, useState } from "react";
import type { Theme } from "../app/theme";
import { formatTime } from "../formatTime";
import { summarizeSolves } from "../solves/stats";
import type { Penalty, Solve, SolveInput } from "../types";
import { formatInspectionTime } from "./inspection";
import { PracticeSettings } from "./PracticeSettings";
import { SessionPanel } from "./SessionPanel";
import { type SaveState, usePracticeSession } from "./usePracticeSession";
import type { TimerPhase } from "./useTimer";
import "./PracticePage.css";

// Only the state the shell needs for focus styling and unsaved-result handling.
export type PracticePageState = {
    phase: TimerPhase;
    saveState: SaveState;
};

type PracticePageProps = {
    solves: Solve[];
    pendingMutationIds: string[];
    theme: Theme;
    disabled: boolean;
    onSave: (solve: SolveInput) => Promise<Solve>;
    onPenalty: (solve: Solve, penalty: Penalty) => Promise<void>;
    onDelete: (solve: Solve) => Promise<void>;
    onClear: () => void;
    onError: (message: string) => void;
    onStateChange: (state: PracticePageState) => void;
};

function phaseInstruction(
    phase: TimerPhase,
    inspectionEnabled: boolean,
): string {
    if (phase === "holding") return "keep holding";
    if (phase === "ready") return "release to start";
    if (phase === "inspection") return "space to start";
    if (phase === "inspection-holding") return "keep holding";
    if (phase === "inspection-ready") return "release to start";
    if (phase === "running") return "space to stop";
    if (inspectionEnabled) return "space to inspect";
    if (phase === "stopped") return "hold space for next solve";
    return "hold space to start";
}

export function PracticePage({
    solves,
    pendingMutationIds,
    theme,
    disabled,
    onSave,
    onPenalty,
    onDelete,
    onClear,
    onError,
    onStateChange,
}: PracticePageProps) {
    const [practiceSettingsOpen, setPracticeSettingsOpen] = useState(false);
    const [hideTimer, setHideTimer] = useState(false);
    const [inspectionEnabled, setInspectionEnabled] = useState(false);
    const {
        phase,
        elapsedMs,
        scramble,
        scrambleLoading,
        saveState,
        busy,
        generateScramble,
        retrySave,
    } = usePracticeSession({
        onSave,
        enabled: !disabled && !practiceSettingsOpen,
        inspectionEnabled,
        onError,
    });
    const controlsDisabled = disabled || busy;

    useLayoutEffect(() => {
        onStateChange({ phase, saveState });
    }, [phase, saveState, onStateChange]);

    useLayoutEffect(
        () => () => onStateChange({ phase: "idle", saveState: "idle" }),
        [onStateChange],
    );

    const summary = summarizeSolves(solves);
    const statTime = (duration: number | null) =>
        duration === null ? "--" : formatTime(duration);
    const inspectionActive =
        phase === "inspection" ||
        phase === "inspection-holding" ||
        phase === "inspection-ready";
    const displayedTime = inspectionActive
        ? formatInspectionTime(elapsedMs)
        : formatTime(elapsedMs);

    return (
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
                        {scrambleLoading ? "preparing scramble..." : scramble}
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
                                <strong>{statTime(summary.currentAo5)}</strong>
                            </div>
                            <div className="session-stat--primary">
                                <span>ao12</span>
                                <strong>{statTime(summary.currentAo12)}</strong>
                            </div>
                            <div>
                                <span>best ao5</span>
                                <strong>{statTime(summary.bestAo5)}</strong>
                            </div>
                            <div>
                                <span>best</span>
                                <strong>{statTime(summary.bestSingle)}</strong>
                            </div>
                        </div>
                        <div className="timer-controls">
                            <div className="timer-status" aria-live="polite">
                                <span className="keycap">space</span>
                                <span>
                                    {phaseInstruction(phase, inspectionEnabled)}
                                </span>
                            </div>
                        </div>
                        <div className="post-solve" aria-live="polite">
                            {phase === "stopped" && saveState === "saving" && (
                                <span>saving solve...</span>
                            )}
                            {phase === "stopped" && saveState === "failed" && (
                                <button
                                    className="post-solve-retry"
                                    type="button"
                                    disabled={disabled}
                                    onClick={() => void retrySave()}
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
                    disabled={controlsDisabled || pendingMutationIds.length > 0}
                    pendingSolveIds={pendingMutationIds}
                    theme={theme}
                    onPenalty={onPenalty}
                    onDelete={onDelete}
                    onClear={onClear}
                />
            </div>
        </main>
    );
}
