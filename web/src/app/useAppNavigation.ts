import { useEffect } from "react";
import type { Account } from "../types";

export type AppView = "timer" | "profile" | "preview" | "login";

function pathForView(view: AppView): string {
    const path = view === "login" ? "/login" : "/";
    const hash = view === "profile" || view === "preview" ? `#${view}` : "";
    return `${path}${location.search}${hash}`;
}

export function isLoginPath(): boolean {
    return location.pathname === "/login" || location.pathname === "/login/";
}

function requestedView(account: Account | null): AppView {
    if (isLoginPath()) return account ? "timer" : "login";
    if (location.hash === "#preview") return "preview";
    return account && location.hash === "#profile" ? "profile" : "timer";
}

type NavigationOptions = {
    account: Account | null;
    view: AppView;
    onViewChange: (view: AppView) => void;
    disabled: boolean;
};

// App owns the selected view; this hook keeps browser history in sync with it.
export function useAppNavigation({
    account,
    view,
    onViewChange,
    disabled,
}: NavigationOptions) {
    useEffect(() => {
        function handlePopState() {
            const nextView = requestedView(account);
            if (nextView !== view && disabled) {
                window.history.replaceState(null, "", pathForView(view));
                return;
            }
            onViewChange(nextView);
        }
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, [account, disabled, onViewChange, view]);

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
        onViewChange(nextView);
    }

    function restoreView() {
        onViewChange(requestedView(account));
    }

    return { navigate, restoreView };
}
