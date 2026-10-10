import { describe, expect, it } from "vitest";
import type { Solve } from "../../types";
import { countSolvesByDay, summarizeActivity } from "../activity";

function makeSolve(id: string, date: Date): Solve {
  return {
    id,
    recorded_at: date.toISOString(),
    created_at: date.toISOString(),
    duration_ms: 10_000,
    scramble: "R U",
    penalty: "none",
  };
}

describe("countSolvesByDay", () => {
  it("returns an emtpy map when there are no solves", () => {
    expect(countSolvesByDay([]).size).toBe(0);
  });
  it("counts multiple solves on the same day", () => {
    const days = countSolvesByDay([
      makeSolve("a", new Date(2026, 7, 14, 5)),
      makeSolve("b", new Date(2026, 7, 14, 6)),
      makeSolve("c", new Date(2026, 7, 14, 7)),
      makeSolve("d", new Date(2026, 7, 14, 8)),
    ]);
    expect(days.size).toBe(1);
    expect(days.get("2026-08-14")).toBe(4);
  });
  it("counts multiple solves on different days", () => {
    const days = countSolvesByDay([
      makeSolve("a", new Date(2026, 7, 14, 5)),
      makeSolve("b", new Date(2026, 7, 15, 6)),
      makeSolve("c", new Date(2026, 7, 15, 7)),
      makeSolve("d", new Date(2026, 7, 14, 8)),
    ]);
    expect(days.size).toBe(2);
    expect(days.get("2026-08-14")).toBe(2);
    expect(days.get("2026-08-15")).toBe(2);
  });
});

const today = "2017-03-03";

describe("summarizeActivity", () => {
  it("returns zero active days and streaks when there are no practice days", () => {
    expect(summarizeActivity(new Map([]), today)).toEqual({
      totalActiveDays: 0,
      currentStreak: 0,
      longestStreak: 0,
    });
  });
  it("counts consecutive practice days through today as the current streak", () => {
    const days = new Map([
      ["2017-03-03", 4],
      ["2017-02-28", 2],
      ["2017-03-02", 3],
      ["2017-03-01", 1],
    ]);

    expect(summarizeActivity(days, today)).toEqual({
      totalActiveDays: 4,
      currentStreak: 4,
      longestStreak: 4,
    });
  });
  it("keeps the current streak active when the last practice day was yesterday", () => {
    const days = new Map([
      ["2017-02-24", 2],
      ["2017-02-25", 1],
      ["2017-02-26", 3],
      ["2017-03-01", 4],
      ["2017-03-02", 2],
    ]);

    expect(summarizeActivity(days, today)).toEqual({
      totalActiveDays: 5,
      currentStreak: 2,
      longestStreak: 3,
    });
  });
  it("resets the current streak after a missed day but preserves the longest streak", () => {
    const days = new Map([
      ["2017-02-24", 2],
      ["2017-02-25", 1],
      ["2017-02-26", 3],
      ["2017-03-01", 4],
    ]);

    expect(summarizeActivity(days, today)).toEqual({
      totalActiveDays: 4,
      currentStreak: 0,
      longestStreak: 3,
    });
  });
});
