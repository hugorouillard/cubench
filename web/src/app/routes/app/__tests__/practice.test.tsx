/** @vitest-environment jsdom */

import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    within,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import type { TimerPhase } from "../../../../features/timer/useTimer"
import type { Penalty } from "../../../../types"
import PracticeRoute from "../practice"

const scramble = vi.hoisted(() => ({ random: vi.fn() }))
const timer = vi.hoisted(() => ({
    phase: "idle" as TimerPhase,
    elapsedMs: 0,
    onComplete: null as ((durationMs: number, penalty: Penalty) => void) | null,
    reset: vi.fn(),
}))

vi.mock("cubing/scramble", () => ({
    randomScrambleForEvent: scramble.random,
}))
vi.mock("../../../../features/timer/useTimer", () => ({
    useTimer: (
        _enabled: boolean,
        _inspectionEnabled: boolean,
        onComplete: (durationMs: number, penalty: Penalty) => void,
    ) => {
        timer.onComplete = onComplete
        return {
            phase: timer.phase,
            elapsedMs: timer.elapsedMs,
            reset: timer.reset,
        }
    },
}))

afterEach(cleanup)
beforeEach(() => {
    vi.clearAllMocks()
    scramble.random
        .mockReset()
        .mockResolvedValue({ toString: () => "F R U" })
        .mockResolvedValueOnce({ toString: () => "R U R'" })
    timer.phase = "idle"
    timer.elapsedMs = 0
    timer.onComplete = null
})

it("keeps the current scramble across settings changes and rerenders", async () => {
    const { rerender } = render(<PracticeRoute />)
    await screen.findByRole("button", { name: "R U R'" })

    const inspection = screen.getByRole("button", { name: "inspection" })
    await act(async () => {
        fireEvent.click(inspection)
    })
    rerender(<PracticeRoute />)

    expect(inspection.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByRole("button", { name: "R U R'" })).toBeTruthy()
    expect(scramble.random).toHaveBeenCalledTimes(1)
})

it("records a completed guest solve and displays its penalized result", async () => {
    const { container } = render(<PracticeRoute />)
    await screen.findByRole("button", { name: "R U R'" })
    expect(screen.getByText("your solves will appear here.")).toBeTruthy()

    await act(async () => {
        timer.phase = "stopped"
        timer.elapsedMs = 12_340
        timer.onComplete?.(12_340, "plus2")
    })

    await screen.findByRole("button", { name: "F R U" })
    const history = within(
        screen.getByRole("complementary", { name: "history" }),
    )
    expect(history.getAllByRole("listitem")).toHaveLength(1)
    expect(
        within(history.getByTitle("Show actions for solve 1")).getByText(
            "14.34",
        ),
    ).toBeTruthy()
    expect(container.querySelector(".timer-readout")?.textContent).toBe("14.34")
    expect(scramble.random).toHaveBeenCalledTimes(2)
})
