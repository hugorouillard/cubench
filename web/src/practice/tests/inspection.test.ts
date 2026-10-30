import { describe, expect, it } from "vitest";
import { formatInspectionTime, inspectionPenalty } from "../inspection";

describe("inspectionPenalty", () => {
    it("applies penalties after the 15 and 17 second limits", () => {
        expect(inspectionPenalty(15_000)).toBe("none");
        expect(inspectionPenalty(15_001)).toBe("plus2");
        expect(inspectionPenalty(17_000)).toBe("plus2");
        expect(inspectionPenalty(17_001)).toBe("dnf");
    });
});

describe("formatInspectionTime", () => {
    it.each([
        [0, "15"],
        [1, "15"],
        [999, "15"],
        [1_000, "14"],
        [14_999, "1"],
        [15_000, "0"],
    ])(
        "rounds remaining seconds up: %i ms displays %s",
        (elapsedMs, expected) => {
            expect(formatInspectionTime(elapsedMs)).toBe(expected);
        },
    );

    it.each([
        [15_001, "0"],
        [15_999, "0"],
        [16_000, "-1"],
        [17_000, "-2"],
        [17_001, "-2"],
        [18_000, "-3"],
    ])(
        "continues counting below zero without penalty labels: %i ms displays %s",
        (elapsedMs, expected) => {
            expect(formatInspectionTime(elapsedMs)).toBe(expected);
        },
    );
});
