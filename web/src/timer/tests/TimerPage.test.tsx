/** @vitest-environment jsdom */

import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
} from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Penalty, SolveInput } from "../../types";
import { TimerPage } from "../TimerPage";
import type { TimerPhase } from "../useTimer";

const timer = vi.hoisted(() => ({
    phase: "idle" as TimerPhase,
    elapsedMs: 0,
    onComplete: null as ((durationMs: number, penalty: Penalty) => void) | null,
    reset: vi.fn(),
}));

vi.mock("cubing/scramble", () => ({
    randomScrambleForEvent: vi.fn(async () => ({
        toString: (): string => "R U R'",
    })),
}));
vi.mock("../../session/SessionPanel", () => ({ SessionPanel: () => null }));
vi.mock("../useTimer", () => ({
    useTimer: (
        _enabled: boolean,
        _inspectionEnabled: boolean,
        onComplete: (durationMs: number, penalty: Penalty) => void,
    ) => {
        timer.onComplete = onComplete;
        return {
            phase: timer.phase,
            elapsedMs: timer.elapsedMs,
            reset: timer.reset,
        };
    },
}));

afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    timer.phase = "idle";
    timer.elapsedMs = 0;
    timer.onComplete = null;
});

async function renderTimer(
    overrides: Partial<ComponentProps<typeof TimerPage>> = {},
) {
    const onError = vi.fn();
    const onStateChange = vi.fn();
    function Harness() {
        const [solves, setSolves] = useState(overrides.solves ?? []);
        async function save(input: SolveInput) {
            const solve = overrides.onSave
                ? await overrides.onSave(input)
                : { ...input, created_at: input.recorded_at };
            setSolves((current) => [solve, ...current]);
            return solve;
        }
        return (
            <TimerPage
                pendingMutationIds={[]}
                theme="catppuccin-mocha"
                disabled={false}
                onPenalty={vi.fn()}
                onDelete={vi.fn()}
                onClear={vi.fn()}
                onError={onError}
                onStateChange={onStateChange}
                {...overrides}
                solves={solves}
                onSave={save}
            />
        );
    }
    const result = render(<Harness />);
    await screen.findByText("R U R'");
    return result;
}

it.each<[TimerPhase, number, string, string]>([
    ["inspection", 14000, "1", "space to start"],
    ["inspection-holding", 16000, "+2", "keep holding"],
    ["inspection-ready", 18000, "DNF", "release to start"],
    ["running", 12340, "12.34", "space to stop"],
])(
    "renders %s from the timer hook",
    async (phase, elapsedMs, time, instruction) => {
        timer.phase = phase;
        timer.elapsedMs = elapsedMs;
        const { container } = await renderTimer();
        expect(container.querySelector(".timer-readout")?.textContent).toBe(
            time,
        );
        expect(screen.getByText(instruction)).toBeTruthy();
    },
);

it("shows the saved result's penalty instead of the raw elapsed time", async () => {
    timer.phase = "stopped";
    timer.elapsedMs = 12340;
    const { container } = await renderTimer();
    await act(async () => timer.onComplete?.(12340, "plus2"));
    expect(container.querySelector(".timer-readout")?.textContent).toBe(
        "14.34",
    );
});

it("retries the same pending solve after a failed save", async () => {
    timer.phase = "stopped";
    const onSave = vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockImplementationOnce(async (input: SolveInput) => ({
            ...input,
            created_at: input.recorded_at,
        }));
    const onStateChange = vi.fn();
    await renderTimer({ onSave, onStateChange });
    await act(async () => timer.onComplete?.(12340, "none"));
    expect(onStateChange).toHaveBeenLastCalledWith({
        phase: "stopped",
        saveState: "failed",
    });
    await act(async () => {
        fireEvent.click(
            screen.getByRole("button", { name: "Retry saving result" }),
        );
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave.mock.calls[1][0]).toEqual(onSave.mock.calls[0][0]);
    expect(onStateChange).toHaveBeenLastCalledWith({
        phase: "stopped",
        saveState: "idle",
    });
});

it("releases the shell's timer state when leaving the page", async () => {
    timer.phase = "stopped";
    const onStateChange = vi.fn();
    const { unmount } = await renderTimer({ onStateChange });
    expect(onStateChange).toHaveBeenLastCalledWith({
        phase: "stopped",
        saveState: "idle",
    });
    unmount();
    expect(onStateChange).toHaveBeenLastCalledWith({
        phase: "idle",
        saveState: "idle",
    });
});
