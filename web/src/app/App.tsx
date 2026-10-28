import {
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
import { createSolveRepository } from "../solves/solveRepository";
import {
    accountSolveStore,
    guestSolveStore,
    type SolveStore,
} from "../solves/solveStore";
import { TimerPage, type TimerPageState } from "../timer/TimerPage";
import { formatTime, togglePenalty } from "../timer/timer";
import type { Account, Penalty, Solve } from "../types";
import { AccountNavigation } from "./AccountNavigation";
import { ErrorNotification } from "./ErrorNotification";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { applyTheme, type Theme } from "./theme";
import "./App.css";

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong";
}

type AppProps = {
    initialTheme: Theme;
    solveStore?: SolveStore;
};

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
    const [{ phase, saveState }, setTimerPageState] = useState<TimerPageState>({
        phase: "idle",
        saveState: "idle",
    });
    const [pendingMutationIds, setPendingMutationIds] = useState<string[]>([]);
    const [error, setError] = useState("");
    const [theme, setTheme] = useState<Theme>(initialTheme);
    const previousAccountId = useRef<number | null | undefined>(undefined);
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
        setPendingMutationIds([]);
    }

    function confirmLogout(): boolean {
        return (
            saveState === "idle" ||
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
        } catch (deleteError) {
            setError(errorMessage(deleteError));
        } finally {
            setPendingMutationIds((current) =>
                current.filter((id) => id !== solve.id),
            );
        }
    }

    function handleClearSolves(): void {
        if (
            solves.length === 0 ||
            saveState !== "idle" ||
            pendingMutationIds.length
        )
            return;
        const label = solves.length === 1 ? "solve" : "solves";
        const message = account
            ? `Clear ${solves.length} current ${label}? Saved solves remain in your profile.`
            : `Clear all ${solves.length} ${label}? This cannot be undone.`;
        if (!window.confirm(message)) return;
        repository.clearSession();
    }

    function handleThemeChange(nextTheme: Theme) {
        setTheme(nextTheme);
        applyTheme(nextTheme);
    }

    const notificationError = error || sessionError;
    const inspectionActive =
        phase === "inspection" ||
        phase === "inspection-holding" ||
        phase === "inspection-ready";

    return (
        <div
            className={`app app--${phase === "inspection-holding" ? "holding" : phase === "inspection-ready" ? "ready" : phase}${inspectionActive ? " app--inspecting" : ""}`}
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
