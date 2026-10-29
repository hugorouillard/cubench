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
import type { Penalty, Solve, SolveInput } from "../../types";
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
    let replaceSolves!: (solves: Solve[]) => void;
    function Harness() {
        const [solves, setSolves] = useState(overrides.solves ?? []);
        replaceSolves = setSolves;
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
    return {
        ...result,
        replaceSolves: (solves: Solve[]) => act(() => replaceSolves(solves)),
    };
}

it.each<[TimerPhase, number, string, string]>([
    ["inspection", 14000, "1", "space to start"],
    ["inspection-holding", 16000, "-1", "keep holding"],
    ["inspection-ready", 18000, "-3", "release to start"],
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

it.each<Penalty>(["none", "plus2", "dnf"])(
    "shows raw elapsed time while preserving the saved %s penalty",
    async (penalty) => {
        timer.phase = "stopped";
        timer.elapsedMs = 12340;
        const onSave = vi.fn(async (input: SolveInput) => ({
            ...input,
            created_at: input.recorded_at,
        }));
        const { container } = await renderTimer({ onSave });
        await act(async () => timer.onComplete?.(12340, penalty));

        expect(onSave).toHaveBeenCalledWith(
            expect.objectContaining({ duration_ms: 12340, penalty }),
        );
        expect(container.querySelector(".timer-readout")?.textContent).toBe(
            "12.34",
        );
    },
);

it("keeps the clock unchanged when history is edited, deleted, or cleared", async () => {
    timer.phase = "stopped";
    timer.elapsedMs = 12340;
    const olderSolve: Solve = {
        id: "older-solve",
        duration_ms: 20000,
        penalty: "none",
        scramble: "F R U",
        recorded_at: "2026-01-01T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
    };
    const onSave = vi.fn(async (input: SolveInput) => ({
        ...input,
        created_at: input.recorded_at,
    }));
    const { container, replaceSolves } = await renderTimer({
        solves: [olderSolve],
        onSave,
    });
    await act(async () => timer.onComplete?.(12340, "none"));
    const saved = await onSave.mock.results[0].value;
    const readout = () =>
        container.querySelector(".timer-readout")?.textContent;

    for (const penalty of ["plus2", "dnf", "none"] as const) {
        replaceSolves([{ ...saved, penalty }, olderSolve]);
        expect(readout()).toBe("12.34");
    }
    replaceSolves([olderSolve]);
    expect(readout()).toBe("12.34");
    replaceSolves([]);
    expect(readout()).toBe("12.34");
    expect(timer.reset).not.toHaveBeenCalled();
});

it("starts with a fresh clock even when session history exists", async () => {
    const { container } = await renderTimer({
        solves: [
            {
                id: "previous-solve",
                duration_ms: 20000,
                penalty: "plus2",
                scramble: "F R U",
                recorded_at: "2026-01-01T00:00:00Z",
                created_at: "2026-01-01T00:00:00Z",
            },
        ],
    });
    expect(container.querySelector(".timer-readout")?.textContent).toBe("0.00");
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
