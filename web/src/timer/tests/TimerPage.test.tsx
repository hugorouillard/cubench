/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { TimerPage } from "../TimerPage";
import type { TimerPhase } from "../useTimer";

afterEach(cleanup);

function renderTimer(
    overrides: Partial<ComponentProps<typeof TimerPage>> = {},
) {
    return render(
        <TimerPage
            phase="idle"
            elapsedMs={0}
            scramble="R U R'"
            scrambleLoading={false}
            solves={[]}
            latestResultId=""
            hideTimer={false}
            inspectionEnabled={false}
            disabled={false}
            saveState="idle"
            retryDisabled={false}
            onScramble={vi.fn()}
            onRetrySave={vi.fn()}
            settings={null}
            sessionPanel={null}
            {...overrides}
        />,
    );
}

it.each<[TimerPhase, number, string, string]>([
    ["inspection", 14000, "1", "space to start"],
    ["inspection-holding", 16000, "+2", "keep holding"],
    ["inspection-ready", 18000, "DNF", "release to start"],
    ["running", 12340, "12.34", "space to stop"],
])(
    "renders %s without owning the clock",
    (phase, elapsedMs, time, instruction) => {
        const { container } = renderTimer({ phase, elapsedMs });
        expect(container.querySelector(".timer-readout")?.textContent).toBe(
            time,
        );
        expect(screen.getByText(instruction)).toBeTruthy();
    },
);

it("shows the saved result's penalty instead of the raw elapsed time", () => {
    const { container } = renderTimer({
        phase: "stopped",
        elapsedMs: 12340,
        latestResultId: "solve-1",
        solves: [
            {
                id: "solve-1",
                duration_ms: 12340,
                penalty: "plus2",
                scramble: "R U",
                recorded_at: "2026-01-01T00:00:00Z",
                created_at: "2026-01-01T00:00:00Z",
            },
        ],
    });
    expect(container.querySelector(".timer-readout")?.textContent).toBe(
        "14.34",
    );
});

it("asks the parent to retry a failed save", () => {
    const onRetrySave = vi.fn();
    renderTimer({ phase: "stopped", saveState: "failed", onRetrySave });
    fireEvent.click(
        screen.getByRole("button", { name: "Retry saving result" }),
    );
    expect(onRetrySave).toHaveBeenCalledOnce();
});
