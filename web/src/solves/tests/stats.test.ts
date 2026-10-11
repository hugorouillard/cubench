import { describe, expect, it } from "vitest";
import {
  lifetimeSolveSummary,
  newestSolvesFirst,
  personalBestIds,
  buildSessionHistory,
  summarizeSolves,
  trimmedAverage,
} from "../stats";
import type { Penalty, Solve } from "../../types";

function solve(
  durationMs: number,
  penalty: Penalty = "none",
  index = 0,
): Solve {
  const timestamp = new Date(Date.UTC(2026, 0, index + 1)).toISOString();
  return {
    id: String(index),
    duration_ms: durationMs,
    penalty,
    scramble: "R U",
    recorded_at: timestamp,
    created_at: timestamp,
  };
}

it("sorts newest first with an id tie-breaker without mutating its input", () => {
  const input = [
    solve(10_000),
    { ...solve(11_000, "none", 1), id: "a" },
    { ...solve(12_000, "none", 1), id: "b" },
  ];
  expect(newestSolvesFirst(input).map(({ id }) => id)).toEqual(["b", "a", "0"]);
  expect(input.map(({ id }) => id)).toEqual(["0", "a", "b"]);
});

describe("trimmedAverage", () => {
  it("drops the fastest and slowest results", () => {
    expect(
      trimmedAverage(
        [1, 11, 12, 13, 100].map((seconds) => solve(seconds * 1000)),
      ),
    ).toBe(12_000);
  });

  it("allows one DNF but rejects two", () => {
    const solves = [
      solve(10_000),
      solve(11_000),
      solve(12_000),
      solve(13_000),
      solve(14_000, "dnf"),
    ];
    expect(trimmedAverage(solves)).toBe(12_000);
    expect(
      trimmedAverage([
        ...solves.slice(0, 3),
        solve(13_000, "dnf"),
        solve(14_000, "dnf"),
      ]),
    ).toBeNull();
  });
});

describe("solve summary", () => {
  it("uses the latest attempts for current averages, regardless of input order", () => {
    const solves = Array.from({ length: 12 }, (_, index) =>
      solve((10 + index) * 1000, "none", index),
    );
    const shuffled = [...solves.slice(6), ...solves.slice(0, 6)];
    for (const input of [solves, solves.toReversed(), shuffled]) {
      expect(summarizeSolves(input)).toEqual({
        mean: 15_500,
        bestSingle: 10_000,
        currentAo5: 19_000,
        bestAo5: 12_000,
        currentAo12: 15_500,
      });
    }
  });

  it("includes +2 and excludes DNFs from the mean and best single", () => {
    expect(
      summarizeSolves([
        solve(8_000, "plus2"),
        solve(12_000),
        solve(1_000, "dnf"),
      ]),
    ).toEqual({
      mean: 11_000,
      bestSingle: 10_000,
      currentAo5: null,
      bestAo5: null,
      currentAo12: null,
    });
  });

  it("waits for a full window of attempts", () => {
    const solves = Array.from({ length: 12 }, (_, index) =>
      solve(10_000, "none", index),
    );
    expect(summarizeSolves(solves.slice(0, 4)).currentAo5).toBeNull();
    expect(summarizeSolves(solves.slice(0, 5)).currentAo5).toBe(10_000);
    expect(summarizeSolves(solves.slice(0, 11)).currentAo12).toBeNull();
    expect(summarizeSolves(solves).currentAo12).toBe(10_000);
    expect(summarizeSolves([])).toEqual({
      mean: null,
      bestSingle: null,
      currentAo5: null,
      bestAo5: null,
      currentAo12: null,
    });
  });
});

describe("lifetime records", () => {
  it("keeps the first achievement date and counts raw time including DNFs", () => {
    const solves = Array.from({ length: 12 }, (_, index) =>
      solve(
        index === 0 ? 8_000 : index === 4 ? 50_000 : 10_000,
        index === 0 ? "plus2" : index === 4 ? "dnf" : "none",
        index,
      ),
    );
    expect(lifetimeSolveSummary(solves.toReversed())).toEqual({
      loggedCount: 12,
      totalRawDurationMs: 158_000,
      earliestSolveAt: solves[0].recorded_at,
      bestSingle: { durationMs: 10_000, achievedAt: solves[0].recorded_at },
      bestAo5: { durationMs: 10_000, achievedAt: solves[4].recorded_at },
      bestAo12: { durationMs: 10_000, achievedAt: solves[11].recorded_at },
      bestAo50: null,
    });
  });

  it("retains the existing trimmed ao50 over attempts, including penalties and DNFs", () => {
    const solves = Array.from({ length: 51 }, (_, index) =>
      solve(10_000, index < 2 ? "dnf" : index < 5 ? "plus2" : "none", index),
    );
    expect(lifetimeSolveSummary(solves.slice(0, 49)).bestAo50).toBeNull();
    expect(lifetimeSolveSummary(solves.slice(0, 50)).bestAo50).toBeNull();
    expect(lifetimeSolveSummary(solves.toReversed()).bestAo50).toBe(10_125);
  });

  it("has no records without successful solves", () => {
    expect(lifetimeSolveSummary([])).toEqual({
      loggedCount: 0,
      totalRawDurationMs: 0,
      earliestSolveAt: null,
      bestSingle: null,
      bestAo5: null,
      bestAo12: null,
      bestAo50: null,
    });
    expect(lifetimeSolveSummary([solve(10_000, "dnf")]).bestSingle).toBeNull();
  });
});

it("marks only improving completed solves as personal bests", () => {
  expect(
    personalBestIds([
      solve(9_000, "none", 2),
      solve(11_000, "none", 0),
      solve(10_000, "none", 1),
      solve(9_000, "none", 3),
      solve(8_000, "dnf", 4),
    ]),
  ).toEqual(new Set(["0", "1", "2"]));
});

it("returns chronological session singles and trimmed ao5s, retaining DNF attempts", () => {
  const solves = [
    solve(10_000, "plus2", 0),
    solve(9_000, "none", 1),
    solve(11_000, "none", 2),
    solve(11_000, "none", 3),
    solve(11_000, "dnf", 4),
    solve(11_000, "dnf", 5),
  ];
  expect(buildSessionHistory(solves.toReversed())).toEqual([
    { solve: solves[0], singleMs: 12_000, ao5Ms: null },
    { solve: solves[1], singleMs: 9_000, ao5Ms: null },
    { solve: solves[2], singleMs: 11_000, ao5Ms: null },
    { solve: solves[3], singleMs: 11_000, ao5Ms: null },
    { solve: solves[4], singleMs: null, ao5Ms: 11_333 },
    { solve: solves[5], singleMs: null, ao5Ms: null },
  ]);
  expect(buildSessionHistory([])).toEqual([]);
});
