import { describe, expect, it } from "vitest";
import { effectiveDuration, togglePenalty } from "../penalties";

describe("effectiveDuration", () => {
    it("adds two seconds only for a +2 penalty", () => {
        expect(effectiveDuration(10_000, "none")).toBe(10_000);
        expect(effectiveDuration(10_000, "plus2")).toBe(12_000);
    });
});

describe("togglePenalty", () => {
    it("toggles a selected penalty", () => {
        expect(togglePenalty("none", "plus2")).toBe("plus2");
        expect(togglePenalty("plus2", "plus2")).toBe("none");
        expect(togglePenalty("dnf", "dnf")).toBe("none");
    });

    it("replaces the existing penalty", () => {
        expect(togglePenalty("dnf", "plus2")).toBe("plus2");
        expect(togglePenalty("plus2", "dnf")).toBe("dnf");
    });
});
