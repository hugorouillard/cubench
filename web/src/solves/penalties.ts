import type { Penalty } from "../types";

export function effectiveDuration(
    durationMs: number,
    penalty: Penalty,
): number {
    return durationMs + (penalty === "plus2" ? 2000 : 0);
}

export function togglePenalty(current: Penalty, selected: Penalty): Penalty {
    return current === selected ? "none" : selected;
}
