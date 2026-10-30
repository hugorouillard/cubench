import { describe, expect, it } from "vitest";
import { formatTime } from "../formatTime";

describe("formatTime", () => {
    it.each([
        [0, "0.00"],
        [12_349, "12.34"],
        [59_999, "59.99"],
        [60_000, "1:00.00"],
        [63_456, "1:03.45"],
    ])("formats %i milliseconds as %s", (durationMs, expected) => {
        expect(formatTime(durationMs)).toBe(expected);
    });
});
