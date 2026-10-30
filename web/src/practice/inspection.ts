import type { Penalty } from "../types";

export function inspectionPenalty(elapsedMs: number): Penalty {
    if (elapsedMs > 17_000) return "dnf";
    if (elapsedMs > 15_000) return "plus2";
    return "none";
}

export function formatInspectionTime(elapsedMs: number): string {
    return String(Math.ceil((15_000 - elapsedMs) / 1000));
}
