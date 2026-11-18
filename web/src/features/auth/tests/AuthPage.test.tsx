/** @vitest-environment jsdom */

import {
    act,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthPage } from "../AuthPage"
import { AuthProvider } from "../AuthProvider"
import { useAuth } from "../useAuth"

const account = {
    id: 1,
    username: "speedcuber",
    display_name: "speedcuber",
    bio: "",
    created_at: "2026-01-01T00:00:00Z",
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    })
}

function AccountStatus() {
    const { account } = useAuth()
    return (
        <output aria-label="Current account">
            {account?.username ?? "guest"}
        </output>
    )
}

async function renderPage() {
    const result = render(
        <AuthProvider>
            <AuthPage />
            <AccountStatus />
        </AuthProvider>,
    )
    await waitFor(() =>
        expect(
            screen
                .getByRole("button", { name: "sign in" })
                .hasAttribute("disabled"),
        ).toBe(false),
    )
    return result
}

function fillForm(mode: "login" | "register") {
    const form = within(
        screen.getByRole("region", {
            name: mode === "login" ? "sign in" : "create account",
        }),
    )
    fireEvent.change(form.getByLabelText("username"), {
        target: { value: "speedcuber" },
    })
    fireEvent.change(form.getByLabelText("password"), {
        target: { value: "test-password" },
    })
    if (mode === "register") {
        fireEvent.change(form.getByLabelText("invite code"), {
            target: { value: "shared-code" },
        })
    }
    return form
}

describe("account access", () => {
    beforeEach(() => {
        vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
            jsonResponse({ detail: "Not authenticated" }, 401),
        )
    })

    afterEach(() => {
        cleanup()
        vi.restoreAllMocks()
    })

    it("registers with the shared invite code", async () => {
        await renderPage()
        const fetch = vi
            .mocked(globalThis.fetch)
            .mockResolvedValue(jsonResponse(account, 201))
        const form = fillForm("register")
        fireEvent.click(form.getByRole("button", { name: "create account" }))

        await waitFor(() =>
            expect(screen.getByLabelText("Current account").textContent).toBe(
                "speedcuber",
            ),
        )
        expect(fetch).toHaveBeenCalledWith(
            "/api/auth/register",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    username: "speedcuber",
                    password: "test-password",
                    invite_code: "shared-code",
                }),
            }),
        )
        expect(
            form
                .getByRole("button", { name: "create account" })
                .hasAttribute("disabled"),
        ).toBe(false)
    })

    it("shows API validation errors only in the submitting form", async () => {
        await renderPage()
        vi.mocked(globalThis.fetch).mockResolvedValue(
            jsonResponse({ detail: [{ msg: "Password is too short" }] }, 422),
        )
        const form = fillForm("login")
        fireEvent.click(form.getByRole("button", { name: "sign in" }))

        expect((await form.findByRole("alert")).textContent).toBe(
            "Password is too short",
        )
        expect(
            within(
                screen.getByRole("region", { name: "create account" }),
            ).queryByRole("alert"),
        ).toBeNull()
        expect(
            form
                .getByRole("button", { name: "sign in" })
                .hasAttribute("disabled"),
        ).toBe(false)
        expect(screen.getByLabelText("Current account").textContent).toBe(
            "guest",
        )
    })

    it.each(["login", "register"] as const)(
        "disables both forms and preview during %s, then allows retry",
        async (mode) => {
            await renderPage()
            let rejectRequest!: (error: Error) => void
            const fetch = vi.mocked(globalThis.fetch).mockImplementation(
                () =>
                    new Promise((_resolve, reject) => {
                        rejectRequest = reject
                    }),
            )
            const form = fillForm(mode)
            fireEvent.click(
                form.getByRole("button", {
                    name: mode === "login" ? "sign in" : "create account",
                }),
            )

            expect(
                form.getByRole("button", {
                    name:
                        mode === "login"
                            ? "signing in..."
                            : "creating account...",
                }),
            ).toBeTruthy()
            for (const input of [
                ...screen.getAllByLabelText("username"),
                ...screen.getAllByLabelText("password"),
                screen.getByLabelText("invite code"),
            ]) {
                expect(input.hasAttribute("disabled")).toBe(true)
            }
            for (const button of screen.getAllByRole("button")) {
                expect(button.hasAttribute("disabled")).toBe(true)
            }

            await act(async () => rejectRequest(new Error("offline")))
            expect(form.getByRole("alert").textContent).toBe("offline")
            expect(
                screen
                    .getByRole("button", { name: "preview account features" })
                    .hasAttribute("disabled"),
            ).toBe(false)

            fetch.mockResolvedValue(jsonResponse(account))
            fireEvent.click(
                form.getByRole("button", {
                    name: mode === "login" ? "sign in" : "create account",
                }),
            )
            await waitFor(() =>
                expect(
                    screen.getByLabelText("Current account").textContent,
                ).toBe("speedcuber"),
            )
            expect(form.queryByRole("alert")).toBeNull()
        },
    )
})
