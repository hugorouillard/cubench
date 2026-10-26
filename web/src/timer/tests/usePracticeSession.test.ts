/** @vitest-environment jsdom */

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createSolveRepository } from "../../solves/solveRepository";
import { guestSolveStore, type SolveStore } from "../../solves/solveStore";
import type { Penalty, Solve, SolveInput } from "../../types";
import { usePracticeSession } from "../usePracticeSession";

const scramble = vi.hoisted(() => vi.fn());
const timer = vi.hoisted(() => ({
    complete: null as ((durationMs: number, penalty: Penalty) => void) | null,
    enabled: false,
    inspectionEnabled: false,
    reset: vi.fn(),
}));
vi.mock("cubing/scramble", () => ({ randomScrambleForEvent: scramble }));
vi.mock("../useTimer", () => ({
    useTimer: (
        enabled: boolean,
        inspectionEnabled: boolean,
        onComplete: typeof timer.complete,
    ) => {
        timer.complete = onComplete;
        timer.enabled = enabled;
        timer.inspectionEnabled = inspectionEnabled;
        return { phase: "stopped", elapsedMs: 12340, reset: timer.reset };
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
    scramble
        .mockReset()
        .mockResolvedValue({ toString: () => "F R U" })
        .mockResolvedValueOnce({ toString: () => "R U R'" });
});
afterEach(cleanup);

function renderPractice(store: SolveStore = guestSolveStore) {
    const repository = createSolveRepository(store, async () => []);
    const onError = vi.fn();
    const hook = renderHook(
        ({ enabled, inspectionEnabled }) =>
            usePracticeSession({
                onSave: repository.create,
                enabled,
                inspectionEnabled,
                onError,
            }),
        {
            initialProps: { enabled: true, inspectionEnabled: false },
        },
    );
    return { ...hook, repository, onError };
}

it("waits for a save before advancing the scramble or accepting another solve", async () => {
    let finishSave!: () => void;
    const create = vi.fn(
        (input: SolveInput) =>
            new Promise<Solve>((resolve) => {
                finishSave = () =>
                    resolve({ ...input, created_at: input.recorded_at });
            }),
    );
    const { result, repository } = renderPractice({
        ...guestSolveStore,
        create,
    });
    await waitFor(() => expect(result.current.scrambleLoading).toBe(false));
    act(() => timer.complete?.(12340, "plus2"));
    expect(result.current.saveState).toBe("saving");
    expect(result.current.scramble).toBe("R U R'");
    expect(result.current.hasUnsavedSolve).toBe(true);
    expect(timer.enabled).toBe(false);
    act(() => timer.complete?.(9999, "none"));
    expect(create).toHaveBeenCalledOnce();

    await act(async () => finishSave());
    expect(result.current.saveState).toBe("idle");
    expect(result.current.scramble).toBe("F R U");
    expect(result.current.hasUnsavedSolve).toBe(false);
    expect(timer.enabled).toBe(true);
    expect(repository.getSnapshot().session[0]).toMatchObject({
        duration_ms: 12340,
        penalty: "plus2",
        scramble: "R U R'",
    });
});

it("retries the same failed solve rather than making a new attempt", async () => {
    const create = vi
        .fn(guestSolveStore.create)
        .mockRejectedValueOnce(new Error("offline"));
    const { result, onError } = renderPractice({ ...guestSolveStore, create });
    await waitFor(() => expect(result.current.scrambleLoading).toBe(false));
    await act(async () => timer.complete?.(12340, "none"));
    expect(result.current.saveState).toBe("failed");
    expect(result.current.busy).toBe(true);
    expect(onError).toHaveBeenLastCalledWith("Failed to save result: offline");
    expect(scramble).toHaveBeenCalledOnce();

    await act(async () => result.current.retrySave());
    expect(create.mock.calls[1][0]).toEqual(create.mock.calls[0][0]);
    expect(result.current.saveState).toBe("idle");
    expect(result.current.busy).toBe(false);
});

it("does not clear a newer result when an older deletion finishes", async () => {
    const { result } = renderPractice();
    await waitFor(() => expect(result.current.scrambleLoading).toBe(false));
    await act(async () => timer.complete?.(12340, "none"));
    const oldId = result.current.latestResultId;
    const finishDeletion = result.current.forgetResult;
    await act(async () => timer.complete?.(10000, "none"));
    const newId = result.current.latestResultId;

    act(() => finishDeletion(oldId));
    expect(result.current.latestResultId).toBe(newId);
    expect(timer.reset).not.toHaveBeenCalled();
    act(() => result.current.forgetResult(newId));
    expect(result.current.latestResultId).toBe("");
    expect(timer.reset).toHaveBeenCalledOnce();
});

it("discards an unsaved result when App explicitly resets practice", async () => {
    const create = vi.fn().mockRejectedValue(new Error("offline"));
    const { result } = renderPractice({ ...guestSolveStore, create });
    await waitFor(() => expect(result.current.scrambleLoading).toBe(false));
    await act(async () => timer.complete?.(12340, "none"));
    act(() => result.current.reset());
    expect(result.current.hasUnsavedSolve).toBe(false);
    expect(result.current.saveState).toBe("idle");
    expect(result.current.latestResultId).toBe("");
    expect(result.current.scramble).toBe("R U R'");
    expect(timer.reset).toHaveBeenCalledOnce();
});

it("passes the parent's enablement and inspection settings to the timer", async () => {
    const { result, rerender } = renderPractice();
    expect(timer.enabled).toBe(false);
    await waitFor(() => expect(result.current.scrambleLoading).toBe(false));
    expect(timer.enabled).toBe(true);
    rerender({ enabled: false, inspectionEnabled: true });
    expect(timer.enabled).toBe(false);
    expect(timer.inspectionEnabled).toBe(true);
});
