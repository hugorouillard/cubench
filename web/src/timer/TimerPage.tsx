import { faRotateRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ReactNode } from "react";
import { summarizeSolves } from "../solves/stats";
import type { Solve } from "../types";
import { formatInspectionTime, formatTime } from "./timer";
import type { TimerPhase } from "./useTimer";
import "./TimerPage.css";

export type SaveState = "idle" | "saving" | "failed";

type TimerPageProps = {
    phase: TimerPhase;
    elapsedMs: number;
    scramble: string;
    scrambleLoading: boolean;
    solves: Solve[];
    latestResultId: string;
    hideTimer: boolean;
    inspectionEnabled: boolean;
    disabled: boolean;
    saveState: SaveState;
    retryDisabled: boolean;
    onScramble: () => void;
    onRetrySave: () => void;
    settings: ReactNode;
    sessionPanel: ReactNode;
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

export function TimerPage({
    phase,
    elapsedMs,
    scramble,
    scrambleLoading,
    solves,
    latestResultId,
    hideTimer,
    inspectionEnabled,
    disabled,
    saveState,
    retryDisabled,
    onScramble,
    onRetrySave,
    settings,
    sessionPanel,
}: TimerPageProps) {
    const lastSolve = solves[0];
    const latestResult = solves.find((solve) => solve.id === latestResultId);
    const summary = summarizeSolves(solves);
    const statTime = (duration: number | null) =>
        duration === null ? "--" : formatTime(duration);
    const inspectionActive =
        phase === "inspection" ||
        phase === "inspection-holding" ||
        phase === "inspection-ready";
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
              : "0.00";

    return (
        <main className="practice-view page-width">
            <div className="practice-workspace">
                {settings}
                <section className="timer-stage" aria-label="Timer">
                    <button
                        className="scramble"
                        type="button"
                        onClick={onScramble}
                        disabled={disabled || scrambleLoading}
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
                                    disabled={retryDisabled}
                                    onClick={onRetrySave}
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
                {sessionPanel}
            </div>
        </main>
    );
}
