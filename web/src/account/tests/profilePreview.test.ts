import { describe, expect, it } from "vitest";
import { createProfilePreview } from "../profilePreview";

describe("profile preview", () => {
	it("provides sparse, reproducible practice throughout the last year", () => {
		const now = new Date(2026, 8, 24, 12);
		const { profile, solves } = createProfilePreview(now);
		const activeDays = new Set(
			solves.map((solve) => new Date(solve.recorded_at).toDateString()),
		);
		const lastSolve = solves.at(-1);
		expect.assert(lastSolve);
		const oldestSolve = new Date(lastSolve.recorded_at);
		const localDay = (date: Date) =>
			Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
			86_400_000;
		const activePeriods = new Set(
			solves.map((solve) =>
				Math.floor(
					((localDay(now) - localDay(new Date(solve.recorded_at))) * 12) / 365,
				),
			),
		);

		expect(createProfilePreview(now)).toEqual({ profile, solves });
		expect(solves.length).toBeGreaterThanOrEqual(120);
		expect(solves.length).toBeLessThanOrEqual(155);
		expect(activeDays.size).toBeGreaterThanOrEqual(25);
		expect(activeDays.size).toBeLessThanOrEqual(40);
		expect(activePeriods.size).toBe(12);
		expect(oldestSolve.getTime()).toBeLessThan(
			now.getTime() - 330 * 86_400_000,
		);
		expect(new Date(profile.created_at).getTime()).toBeLessThan(
			oldestSolve.getTime(),
		);
		expect(solves.every((solve) => new Date(solve.recorded_at) <= now)).toBe(
			true,
		);
		expect(new Set(solves.map((solve) => solve.scramble)).size).toBe(
			solves.length,
		);
		expect(new Set(solves.map((solve) => solve.penalty))).toEqual(
			new Set(["none", "plus2", "dnf"]),
		);
	});

	it("keeps today and yesterday active even just after midnight", () => {
		const now = new Date(2026, 8, 24, 0, 0, 1);
		const { solves } = createProfilePreview(now);
		const today = now.toDateString();
		const yesterday = new Date(2026, 8, 23).toDateString();

		expect(
			solves.filter(
				(solve) => new Date(solve.recorded_at).toDateString() === today,
			),
		).toHaveLength(1);
		expect(
			solves.some(
				(solve) => new Date(solve.recorded_at).toDateString() === yesterday,
			),
		).toBe(true);
		expect(solves.every((solve) => new Date(solve.recorded_at) <= now)).toBe(
			true,
		);
	});
});
