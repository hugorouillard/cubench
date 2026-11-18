import { expect, test } from "@playwright/test"

test("uses the account route for sign-in, direct visits, and header navigation", async ({
    page,
}) => {
    const account = {
        id: 1,
        username: "solver",
        display_name: "Solver",
        bio: "",
        created_at: "2026-01-01T00:00:00Z",
    }
    let signedIn = false
    await page.route("/api/**", async (route) => {
        const path = new URL(route.request().url()).pathname
        if (path === "/api/auth/login") {
            signedIn = true
            await route.fulfill({ json: account })
        } else if (path === "/api/auth/session") {
            await route.fulfill(
                signedIn
                    ? { json: account }
                    : { status: 401, json: { detail: "Not authenticated" } },
            )
        } else if (path === "/api/solves") {
            await route.fulfill({ json: [] })
        } else {
            await route.fulfill({ status: 404 })
        }
    })

    await page.goto("/account")
    await expect(page).toHaveURL(/\/login$/)
    const login = page.getByRole("region", { name: "sign in", exact: true })
    await login.getByRole("textbox", { name: "username" }).fill("solver")
    await login.getByLabel("password", { exact: true }).fill("test-password")
    await login.getByRole("button", { name: "sign in", exact: true }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole("heading", { name: "Solver" })).toBeVisible()

    await page.reload()
    await expect(page.getByRole("heading", { name: "Solver" })).toBeVisible()
    await page.getByRole("link", { name: "Cubench home" }).click()
    await expect(page).toHaveURL("/")
    await page.getByRole("button", { name: "Account menu for Solver" }).click()
    await expect(page).toHaveURL(/\/account$/)
})
