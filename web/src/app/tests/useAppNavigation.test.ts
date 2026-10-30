/** @vitest-environment jsdom */

import { act, cleanup, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
    type AppView,
    isLoginPath,
    useAppNavigation,
} from "../useAppNavigation";

function renderNavigation(disabled = false) {
    return renderHook(
        ({ blocked }) => {
            const [view, setView] = useState<AppView>(() =>
                isLoginPath() ? "login" : "timer",
            );
            const navigation = useAppNavigation({
                account: null,
                view,
                onViewChange: setView,
                disabled: blocked,
            });
            return { view, ...navigation };
        },
        { initialProps: { blocked: disabled } },
    );
}

beforeEach(() => window.history.replaceState(null, "", "/"));
afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

it("keeps the query string when navigating and avoids duplicate history entries", () => {
    window.history.replaceState(null, "", "/?source=share");
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderNavigation();
    act(() => result.current.navigate("preview"));
    expect(`${location.pathname}${location.search}${location.hash}`).toBe(
        "/?source=share#preview",
    );
    expect(result.current.view).toBe("preview");
    act(() => result.current.navigate("preview"));
    expect(push).toHaveBeenCalledOnce();
    act(() => result.current.navigate("login"));
    expect(`${location.pathname}${location.search}${location.hash}`).toBe(
        "/login?source=share",
    );
});

it("restores a preview deep link without requiring an account", () => {
    window.history.replaceState(null, "", "/#preview");
    const { result } = renderNavigation();
    act(() => result.current.restoreView());
    expect(result.current.view).toBe("preview");
});

it("uses the current blocking policy for browser navigation", () => {
    const { result, rerender } = renderNavigation(true);
    act(() => {
        window.history.replaceState(null, "", "/login");
        window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.view).toBe("timer");
    expect(location.pathname).toBe("/");

    rerender({ blocked: false });
    act(() => {
        window.history.replaceState(null, "", "/login");
        window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.view).toBe("login");
    expect(location.pathname).toBe("/login");
});
