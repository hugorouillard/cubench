import {
    faCube,
    faEyeSlash,
    faRotateRight,
    faSliders,
    faStopwatch,
    faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { randomScrambleForEvent } from "cubing/scramble";
import {
    type ReactNode,
    useEffect,
    useEffectEvent,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    useSyncExternalStore,
} from "react";
import { AccountPage } from "../account/AccountPage";
import { createProfilePreview } from "../account/profilePreview";
import { getSolves } from "../api";
import { AuthPage } from "../auth/AuthPage";
import { AuthProvider } from "../auth/AuthProvider";
import { useAuth } from "../auth/useAuth";
import { SessionPanel } from "../session/SessionPanel";
import { createSolveRepository } from "../solves/solveRepository";
import {
    accountSolveStore,
    guestSolveStore,
    type SolveStore,
} from "../solves/solveStore";
import { summarizeSolves } from "../solves/stats";
import {
    formatInspectionTime,
    formatTime,
    togglePenalty,
} from "../timer/timer";
import { type TimerPhase, useTimer } from "../timer/useTimer";
import type { Account, Penalty, Solve, SolveInput } from "../types";
import { AccountNavigation } from "./AccountNavigation";
import { ErrorNotification } from "./ErrorNotification";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { applyTheme, type Theme } from "./theme";
import "./App.css";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong";
}

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

type ModalProps = {
    open: boolean;
    onClose: () => void;
    labelledBy: string;
    closeDisabled?: boolean;
    children: ReactNode;
};

function Modal({
    open,
    onClose,
    labelledBy,
    closeDisabled = false,
    children,
}: ModalProps) {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        if (open && !dialog.open) {
            dialog.showModal();
            requestAnimationFrame(() => {
                dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
            });
        } else if (!open && dialog.open) {
            dialog.close();
        }
    }, [open]);

    return (
        <dialog
            className="app-dialog"
            ref={dialogRef}
            aria-labelledby={labelledBy}
            onClose={() => {
                requestAnimationFrame(() => {
                    if (
                        !document.querySelector("dialog[open]") &&
                        document.activeElement instanceof HTMLElement
                    ) {
                        document.activeElement.blur();
                    }
                });
            }}
            onCancel={(event) => {
                event.preventDefault();
                if (!closeDisabled) onClose();
            }}
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !closeDisabled)
                    onClose();
            }}
        >
            <div className="dialog-panel">{children}</div>
        </dialog>
    );
}

type AppProps = {
    initialTheme: Theme;
    solveStore?: SolveStore;
};

type SaveState = "idle" | "saving" | "failed";
type AppView = "timer" | "profile" | "preview" | "login";

function pathForView(view: AppView): string {
    const path = view === "login" ? "/login" : "/";
    const hash = view === "profile" || view === "preview" ? `#${view}` : "";
    return `${path}${location.search}${hash}`;
}

function isLoginPath(): boolean {
    return location.pathname === "/login" || location.pathname === "/login/";
}

function requestedView(account: Account | null): AppView {
    if (isLoginPath()) return account ? "timer" : "login";
    if (location.hash === "#preview") return "preview";
    return account && location.hash === "#profile" ? "profile" : "timer";
}

function AppShell({ initialTheme, solveStore: solveStoreOverride }: AppProps) {
    const {
        account,
        checking: authChecking,
        pending,
        sessionError,
        dismissSessionError,
        applyProfile,
    } = useAuth();
    const authBusy = pending !== null;
    const [view, setView] = useState<AppView>(() =>
        isLoginPath() ? "login" : "timer",
    );
    const [profilePreview] = useState(createProfilePreview);
    const [scramble, setScramble] = useState("");
    const [scrambleLoading, setScrambleLoading] = useState(true);
    const [pendingSolve, setPendingSolve] = useState<SolveInput | null>(null);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([]);
    const [latestResultId, setLatestResultId] = useState("");
    const [error, setError] = useState("");
    const [practiceSettingsOpen, setPracticeSettingsOpen] = useState(false);
    const [hideTimer, setHideTimer] = useState(false);
    const [inspectionEnabled, setInspectionEnabled] = useState(false);
    const [theme, setTheme] = useState<Theme>(initialTheme);
    const latestResultIdRef = useRef(latestResultId);
    const previousAccountId = useRef<number | null | undefined>(undefined);
    latestResultIdRef.current = latestResultId;
    const solveStore =
        solveStoreOverride ?? (account ? accountSolveStore : guestSolveStore);
    // Different accounts share the same API adapter, but must never share cached data.
    const accountId = account?.id ?? null;
    const repository = useMemo(
        () =>
            createSolveRepository(
                solveStore,
                accountId === null ? async () => [] : getSolves,
            ),
        [solveStore, accountId],
    );
    const { session: solves } = useSyncExternalStore(
        repository.subscribe,
        repository.getSnapshot,
    );

    function navigate(nextView: AppView, replace = false) {
        const target = pathForView(nextView);
        if (
            `${location.pathname}${location.search}${location.hash}` !== target
        ) {
            window.history[replace ? "replaceState" : "pushState"](
                null,
                "",
                target,
            );
        }
        setView(nextView);
    }

    useEffect(() => {
        let cancelled = false;
        randomScrambleForEvent("333")
            .then((nextScramble) => {
                if (cancelled) return;
                setScramble(nextScramble.toString());
                setScrambleLoading(false);
            })
            .catch((initialError: unknown) => {
                if (!cancelled) setError(errorMessage(initialError));
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function generateScramble() {
        setScramble("");
        setScrambleLoading(true);
        try {
            const nextScramble = await randomScrambleForEvent("333");
            setScramble(nextScramble.toString());
        } catch (scrambleError) {
            setError(errorMessage(scrambleError));
        } finally {
            setScrambleLoading(false);
        }
    }

    async function persistSolve(solve: SolveInput) {
        setSaveState("saving");
        setError("");
        try {
            await repository.create(solve);
            setPendingSolve(null);
            setSaveState("idle");
            await generateScramble();
        } catch (saveError) {
            setSaveState("failed");
            setError(`Failed to save result: ${errorMessage(saveError)}`);
        }
    }

    function handleTimerComplete(durationMs: number, penalty: Penalty) {
        const completedScramble = scramble;
        if (!completedScramble || pendingSolve) return;

        const solve: SolveInput = {
            id: crypto.randomUUID(),
            duration_ms: durationMs,
            penalty,
            scramble: completedScramble,
            recorded_at: new Date().toISOString(),
        };
        setPendingSolve(solve);
        setLatestResultId(solve.id);
        latestResultIdRef.current = solve.id;
        void persistSolve(solve);
    }

    const {
        phase,
        elapsedMs,
        reset: resetTimer,
    } = useTimer(
        Boolean(
            view === "timer" &&
                scramble &&
                !scrambleLoading &&
                !pendingSolve &&
                !authChecking &&
                !authBusy &&
                !practiceSettingsOpen,
        ),
        inspectionEnabled,
        handleTimerComplete,
    );
    const controlsDisabled =
        authChecking ||
        authBusy ||
        Boolean(pendingSolve) ||
        phase === "holding" ||
        phase === "ready" ||
        phase === "inspection" ||
        phase === "inspection-holding" ||
        phase === "inspection-ready" ||
        phase === "running";

    const synchronizeIdentity = useEffectEvent((changed: boolean) => {
        if (changed) resetCurrentSession();
        if (changed || (account && isLoginPath())) navigate("timer", true);
        else setView(requestedView(account));
    });

    useLayoutEffect(() => {
        if (authChecking) return;
        // Restore deep links on startup, but clear practice data before painting
        // a different identity. Profile edits must not reset the current session.
        const changed =
            previousAccountId.current !== undefined &&
            previousAccountId.current !== accountId;
        previousAccountId.current = accountId;
        synchronizeIdentity(changed);
    }, [accountId, authChecking]);

    useEffect(() => {
        function handlePopState() {
            const nextView = requestedView(account);
            if (nextView !== view && (authChecking || authBusy)) {
                window.history.replaceState(null, "", pathForView(view));
                return;
            }
            setView(nextView);
        }

        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [account, authChecking, authBusy, view]);

    function resetCurrentSession() {
        repository.clearSession();
        setPendingSolve(null);
        setSaveState("idle");
        setPendingMutationIds([]);
        setLatestResultId("");
        latestResultIdRef.current = "";
        resetTimer();
    }

    function confirmLogout(): boolean {
        return (
            !pendingSolve ||
            window.confirm("Sign out and discard the unsaved result?")
        );
    }

    async function handlePenalty(
        solve: Solve,
        selectedPenalty: Penalty,
    ): Promise<void> {
        const update = {
            penalty: togglePenalty(solve.penalty, selectedPenalty),
        };
        setPendingMutationIds((current) =>
            current.includes(solve.id) ? current : [...current, solve.id],
        );
        try {
            await repository.update(solve, update);
        } catch (penaltyError) {
            setError(errorMessage(penaltyError));
        } finally {
            setPendingMutationIds((current) =>
                current.filter((id) => id !== solve.id),
            );
        }
    }

    async function handleDelete(solve: Solve, confirm = true): Promise<void> {
        if (
            confirm &&
            !window.confirm(
                `Delete the ${formatTime(solve.duration_ms)} solve?`,
            )
        )
            return;
        setPendingMutationIds((current) =>
            current.includes(solve.id) ? current : [...current, solve.id],
        );
        try {
            await repository.delete(solve);
            if (solve.id === latestResultIdRef.current) {
                setLatestResultId("");
                latestResultIdRef.current = "";
                resetTimer();
            }
        } catch (deleteError) {
            setError(errorMessage(deleteError));
        } finally {
            setPendingMutationIds((current) =>
                current.filter((id) => id !== solve.id),
            );
        }
    }

    function handleClearSolves(): void {
        if (solves.length === 0 || pendingSolve || pendingMutationIds.length)
            return;
        const label = solves.length === 1 ? "solve" : "solves";
        const message = account
            ? `Clear ${solves.length} current ${label}? Saved solves remain in your profile.`
            : `Clear all ${solves.length} ${label}? This cannot be undone.`;
        if (!window.confirm(message)) return;

        repository.clearSession();
        setLatestResultId("");
        latestResultIdRef.current = "";
        resetTimer();
    }

    function handleThemeChange(nextTheme: Theme) {
        setTheme(nextTheme);
        applyTheme(nextTheme);
    }

    const lastSolve = solves[0];
    const latestResult = solves.find((solve) => solve.id === latestResultId);
    const summary = summarizeSolves(solves);
    const notificationError = error || sessionError;
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
        <div
            className={`app app--${
                phase === "inspection-holding"
                    ? "holding"
                    : phase === "inspection-ready"
                      ? "ready"
                      : phase
            }${inspectionActive ? " app--inspecting" : ""}`}
        >
            <Header
                timerActive={view === "timer"}
                disabled={authChecking || authBusy}
                onTimer={() => navigate("timer")}
            >
                <AccountNavigation
                    currentPage={view}
                    onNavigate={navigate}
                    beforeLogout={confirmLogout}
                    onError={setError}
                />
            </Header>
            {notificationError && (
                <ErrorNotification
                    message={notificationError}
                    onDismiss={() => {
                        if (error) setError("");
                        else dismissSessionError();
                    }}
                />
            )}
            {view === "timer" ? (
                <main className="practice-view page-width">
                    <div className="practice-workspace">
                        <div className="practice-config-row focus-chrome">
                            <div
                                className="practice-config practice-config--desktop"
                                role="group"
                                aria-label="Practice settings"
                            >
                                <div
                                    className="config-panel config-panel--toggles"
                                    role="group"
                                    aria-label="Solve modifiers"
                                >
                                    <button
                                        className={hideTimer ? "is-active" : ""}
                                        type="button"
                                        onClick={(event) => {
                                            setHideTimer((current) => !current);
                                            event.currentTarget.blur();
                                        }}
                                        disabled={controlsDisabled}
                                        aria-pressed={hideTimer}
                                    >
                                        <FontAwesomeIcon
                                            className="app-icon"
                                            icon={faEyeSlash}
                                            fixedWidth
                                            aria-hidden="true"
                                        />
                                        hide timer
                                    </button>
                                    <button
                                        className={
                                            inspectionEnabled ? "is-active" : ""
                                        }
                                        type="button"
                                        onClick={(event) => {
                                            setInspectionEnabled(
                                                (current) => !current,
                                            );
                                            event.currentTarget.blur();
                                        }}
                                        disabled={controlsDisabled}
                                        aria-pressed={inspectionEnabled}
                                    >
                                        inspection
                                    </button>
                                </div>

                                <div
                                    className="config-panel config-panel--modes"
                                    role="group"
                                    aria-label="Practice mode"
                                >
                                    <span className="config-value is-active">
                                        <FontAwesomeIcon
                                            className="app-icon"
                                            icon={faStopwatch}
                                            fixedWidth
                                            aria-hidden="true"
                                        />
                                        timer
                                    </span>
                                    <button
                                        type="button"
                                        disabled
                                        title="Trainer mode is not available yet"
                                    >
                                        <FontAwesomeIcon
                                            className="app-icon"
                                            icon={faCube}
                                            fixedWidth
                                            aria-hidden="true"
                                        />
                                        trainer
                                    </button>
                                </div>

                                <div
                                    className="config-panel config-panel--values"
                                    role="group"
                                    aria-label="Timer settings"
                                >
                                    <span className="config-value is-active">
                                        3x3
                                    </span>
                                </div>
                            </div>

                            <button
                                className="practice-config-mobile"
                                type="button"
                                onClick={() => setPracticeSettingsOpen(true)}
                                disabled={controlsDisabled}
                            >
                                <FontAwesomeIcon
                                    className="app-icon"
                                    icon={faSliders}
                                    fixedWidth
                                    aria-hidden="true"
                                />
                                practice settings
                            </button>
                        </div>

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
                                        <strong>
                                            {statTime(summary.mean)}
                                        </strong>
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
                                        <strong>
                                            {statTime(summary.bestAo5)}
                                        </strong>
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
                                        saveState === "failed" &&
                                        pendingSolve && (
                                            <button
                                                className="post-solve-retry"
                                                type="button"
                                                disabled={authBusy}
                                                onClick={() =>
                                                    void persistSolve(
                                                        pendingSolve,
                                                    )
                                                }
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
                                controlsDisabled ||
                                pendingMutationIds.length > 0
                            }
                            pendingSolveIds={pendingMutationIds}
                            theme={theme}
                            onPenalty={handlePenalty}
                            onDelete={(solve) => handleDelete(solve, false)}
                            onClear={handleClearSolves}
                        />
                    </div>
                </main>
            ) : view === "login" ? (
                authChecking || account ? (
                    <main className="auth-page page-width" aria-busy="true">
                        <p role="status">checking account...</p>
                    </main>
                ) : (
                    <AuthPage onPreview={() => navigate("preview")} />
                )
            ) : view === "preview" || account ? (
                <AccountPage
                    key={`${view}:${account?.id ?? "guest"}`}
                    repository={repository}
                    preview={view === "preview" ? profilePreview : undefined}
                    theme={theme}
                    onPenalty={handlePenalty}
                    onDelete={handleDelete}
                    onError={setError}
                    onProfileChange={applyProfile}
                />
            ) : null}

            <Footer theme={theme} onThemeChange={handleThemeChange} />

            <Modal
                open={practiceSettingsOpen}
                onClose={() => setPracticeSettingsOpen(false)}
                labelledBy="practice-dialog-title"
            >
                <div className="dialog-heading">
                    <div>
                        <span>timer</span>
                        <h2 id="practice-dialog-title">Practice settings</h2>
                    </div>
                    <button
                        type="button"
                        onClick={() => setPracticeSettingsOpen(false)}
                        aria-label="Close"
                    >
                        <FontAwesomeIcon
                            className="app-icon"
                            icon={faXmark}
                            fixedWidth
                            aria-hidden="true"
                        />
                    </button>
                </div>
                <div className="mobile-config-stack">
                    <div
                        className="mobile-config-group"
                        role="group"
                        aria-label="Solve modifiers"
                    >
                        <button
                            className={hideTimer ? "is-active" : ""}
                            type="button"
                            onClick={() => setHideTimer((current) => !current)}
                            aria-pressed={hideTimer}
                        >
                            hide timer
                        </button>
                        <button
                            className={inspectionEnabled ? "is-active" : ""}
                            type="button"
                            onClick={() =>
                                setInspectionEnabled((current) => !current)
                            }
                            aria-pressed={inspectionEnabled}
                        >
                            inspection
                        </button>
                    </div>
                    <span className="mobile-config-separator" />
                    <div
                        className="mobile-config-group"
                        role="group"
                        aria-label="Practice mode"
                    >
                        <span className="mobile-config-value is-active">
                            timer
                        </span>
                        <button
                            type="button"
                            disabled
                            title="Trainer mode is not available yet"
                        >
                            trainer
                        </button>
                    </div>
                    <span className="mobile-config-separator" />
                    <div
                        className="mobile-config-group mobile-config-group--values"
                        role="group"
                        aria-label="Timer settings"
                    >
                        <span className="mobile-config-value is-active">
                            3x3
                        </span>
                    </div>
                </div>
                <div className="dialog-actions">
                    <button
                        className="button-primary"
                        type="button"
                        onClick={() => setPracticeSettingsOpen(false)}
                    >
                        close
                    </button>
                </div>
            </Modal>
        </div>
    );
}

export default function App(props: AppProps) {
    return (
        <AuthProvider>
            <AppShell {...props} />
        </AuthProvider>
    );
}
