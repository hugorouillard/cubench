// Format a duration only. Solve views decide how to present penalties.
export function formatTime(durationMs: number): string {
    const totalCentiseconds = Math.floor(durationMs / 10);
    const minutes = Math.floor(totalCentiseconds / 6000);
    const seconds = Math.floor((totalCentiseconds % 6000) / 100);
    const centiseconds = totalCentiseconds % 100;
    const secondText =
        minutes > 0 ? String(seconds).padStart(2, "0") : String(seconds);
    const time = `${secondText}.${String(centiseconds).padStart(2, "0")}`;

    return minutes > 0 ? `${minutes}:${time}` : time;
}
