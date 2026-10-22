import { effectiveDuration } from "../timer/timer";
import type { Solve } from "../types";

export type DatedSolveRecord = {
    durationMs: number;
    achievedAt: string;
};

export type LifetimeSolveSummary = {
    loggedCount: number;
    totalRawDurationMs: number;
    earliestSolveAt: string | null;
    bestSingle: DatedSolveRecord | null;
    bestAo5: DatedSolveRecord | null;
    bestAo12: DatedSolveRecord | null;
    bestAo50: number | null;
};

export function completedDuration(solve: Solve): number | null {
    if (solve.penalty === "dnf") return null;
    return effectiveDuration(solve.duration_ms, solve.penalty);
}

function compareSolveOrder(left: Solve, right: Solve): number {
    const timestampDifference =
        new Date(left.recorded_at).getTime() -
        new Date(right.recorded_at).getTime();
    if (timestampDifference !== 0) return timestampDifference;
    if (left.id === right.id) return 0;
    return left.id < right.id ? -1 : 1;
}

export function chronologicalSolves(solves: readonly Solve[]): Solve[] {
    return [...solves].sort(compareSolveOrder);
}

export function newestSolvesFirst(solves: readonly Solve[]): Solve[] {
    return [...solves].sort((left, right) => compareSolveOrder(right, left));
}

function mean(durations: number[]): number | null {
    return durations.length
        ? Math.round(
              durations.reduce((sum, duration) => sum + duration, 0) /
                  durations.length,
          )
        : null;
}

export function trimmedAverage(solves: readonly Solve[]): number | null {
    if (solves.length < 3) return null;

    const results = solves
        .map((solve) => completedDuration(solve) ?? Infinity)
        .sort((left, right) => left - right)
        .slice(1, -1);

    return results.includes(Infinity) ? null : mean(results);
}

// Input is chronological so equal records retain their earliest achievement date.
function bestAverage(
    solves: readonly Solve[],
    size: number,
): DatedSolveRecord | null {
    let best: DatedSolveRecord | null = null;
    for (let index = size - 1; index < solves.length; index += 1) {
        const average = trimmedAverage(
            solves.slice(index - size + 1, index + 1),
        );
        if (average !== null && (best === null || average < best.durationMs)) {
            best = {
                durationMs: average,
                achievedAt: solves[index].recorded_at,
            };
        }
    }
    return best;
}

export function summarizeSolves(solves: readonly Solve[]) {
    const chronological = chronologicalSolves(solves);
    const completed = chronological
        .map(completedDuration)
        .filter((duration) => duration !== null);
    const currentAverage = (size: number) =>
        chronological.length < size
            ? null
            : trimmedAverage(chronological.slice(-size));

    return {
        mean: mean(completed),
        bestSingle: completed.length ? Math.min(...completed) : null,
        currentAo5: currentAverage(5),
        bestAo5: bestAverage(chronological, 5)?.durationMs ?? null,
        currentAo12: currentAverage(12),
    };
}

export function personalBestIds(solves: readonly Solve[]): Set<string> {
    let best = Infinity;
    const ids = new Set<string>();
    const chronological = [...solves].sort(
        (left, right) =>
            new Date(left.recorded_at).getTime() -
            new Date(right.recorded_at).getTime(),
    );
    for (const solve of chronological) {
        const duration = completedDuration(solve);
        if (duration !== null && duration < best) {
            best = duration;
            ids.add(solve.id);
        }
    }
    return ids;
}

export function lifetimeSolveSummary(
    solves: readonly Solve[],
): LifetimeSolveSummary {
    const chronological = chronologicalSolves(solves);
    let bestSingle: DatedSolveRecord | null = null;
    for (const solve of chronological) {
        const duration = completedDuration(solve);
        if (
            duration !== null &&
            (bestSingle === null || duration < bestSingle.durationMs)
        ) {
            bestSingle = {
                durationMs: duration,
                achievedAt: solve.recorded_at,
            };
        }
    }

    return {
        loggedCount: solves.length,
        totalRawDurationMs: solves.reduce(
            (sum, solve) => sum + solve.duration_ms,
            0,
        ),
        earliestSolveAt: chronological[0]?.recorded_at ?? null,
        bestSingle,
        bestAo5: bestAverage(chronological, 5),
        bestAo12: bestAverage(chronological, 12),
        bestAo50: bestAverage(chronological, 50)?.durationMs ?? null,
    };
}

export function buildSessionHistory(solves: readonly Solve[]) {
    const chronological = chronologicalSolves(solves);
    return chronological.map((solve, index) => ({
        solve,
        singleMs: completedDuration(solve),
        ao5Ms:
            index < 4
                ? null
                : trimmedAverage(chronological.slice(index - 4, index + 1)),
    }));
}
