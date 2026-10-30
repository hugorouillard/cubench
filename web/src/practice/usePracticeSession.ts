import { randomScrambleForEvent } from "cubing/scramble";
import { useEffect, useEffectEvent, useState } from "react";
import type { Penalty, Solve, SolveInput } from "../types";
import { useTimer } from "./useTimer";

export type SaveState = "idle" | "saving" | "failed";

type PracticeSessionOptions = {
    onSave: (solve: SolveInput) => Promise<Solve>;
    enabled: boolean;
    inspectionEnabled: boolean;
    onError: (message: string) => void;
};

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Something went wrong";
}

// Owns the scramble-to-save workflow for the mounted practice page.
export function usePracticeSession({
    onSave,
    enabled,
    inspectionEnabled,
    onError,
}: PracticeSessionOptions) {
    const [scramble, setScramble] = useState("");
    const [scrambleLoading, setScrambleLoading] = useState(true);
    const [pendingSolve, setPendingSolve] = useState<SolveInput | null>(null);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const reportInitialError = useEffectEvent((error: unknown) =>
        onError(errorMessage(error)),
    );

    useEffect(() => {
        let cancelled = false;
        randomScrambleForEvent("333")
            .then((nextScramble) => {
                if (cancelled) return;
                setScramble(nextScramble.toString());
                setScrambleLoading(false);
            })
            .catch((error: unknown) => {
                if (!cancelled) reportInitialError(error);
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
        } catch (error) {
            onError(errorMessage(error));
        } finally {
            setScrambleLoading(false);
        }
    }

    async function persistSolve(solve: SolveInput) {
        setSaveState("saving");
        onError("");
        try {
            await onSave(solve);
            setPendingSolve(null);
            setSaveState("idle");
            await generateScramble();
        } catch (error) {
            setSaveState("failed");
            onError(`Failed to save result: ${errorMessage(error)}`);
        }
    }

    function completeSolve(durationMs: number, penalty: Penalty) {
        if (!scramble || pendingSolve) return;
        const solve: SolveInput = {
            id: crypto.randomUUID(),
            duration_ms: durationMs,
            penalty,
            scramble,
            recorded_at: new Date().toISOString(),
        };
        setPendingSolve(solve);
        void persistSolve(solve);
    }

    const { phase, elapsedMs } = useTimer(
        Boolean(enabled && scramble && !scrambleLoading && !pendingSolve),
        inspectionEnabled,
        completeSolve,
    );

    async function retrySave() {
        if (pendingSolve) await persistSolve(pendingSolve);
    }

    return {
        phase,
        elapsedMs,
        scramble,
        scrambleLoading,
        saveState,
        busy:
            pendingSolve !== null || (phase !== "idle" && phase !== "stopped"),
        generateScramble,
        retrySave,
    };
}
