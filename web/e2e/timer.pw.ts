import { expect, test } from "@playwright/test";

for (const width of [375, 1280]) {
    test.describe(`${width}px timer`, () => {
        test.use({ viewport: { width, height: 900 }, reducedMotion: "reduce" });

        test("preserves practice across navigation and releases settings focus", async ({
            page,
        }) => {
            await page.route("/api/auth/session", (route) =>
                route.fulfill({
                    status: 401,
                    json: { detail: "Not authenticated" },
                }),
            );
            await page.goto("/");
            const scramble = page.getByTitle("Generate another scramble");
            await expect(scramble).toBeEnabled();
            await page.clock.install();

            if (width === 375) {
                await page
                    .getByRole("button", {
                        name: "practice settings",
                        exact: true,
                    })
                    .click();
                const dialog = page.getByRole("dialog", {
                    name: "Practice settings",
                });
                await dialog
                    .getByRole("button", { name: "hide timer" })
                    .click();
                await page.keyboard.press("Escape");
                await expect(dialog).not.toBeVisible();
                // Closing the native dialog must not leave Space on its opener.
                await page.clock.runFor(50);
            } else {
                await page.getByRole("button", { name: "hide timer" }).click();
            }

            await page.keyboard.down("Space");
            await page.clock.runFor(400);
            await expect(
                page.getByText("release to start", { exact: true }),
            ).toBeVisible();
            await page.keyboard.up("Space");
            await expect(
                page.getByRole("button", { name: "Timer", exact: true }),
            ).toBeDisabled();
            await expect(page.locator(".timer-readout")).toHaveCSS(
                "opacity",
                "0",
            );
            await page.clock.runFor(1200);
            await page.keyboard.press("Space");
            await expect(page.locator(".session-solve-list > li")).toHaveCount(
                1,
            );
            await expect(scramble).toBeEnabled();
            const nextScramble = await scramble.innerText();
            const lastResult = await page.locator(".timer-readout").innerText();

            await page
                .getByRole("button", { name: "Sign in", exact: true })
                .click();
            await expect(
                page.getByRole("heading", { name: "sign in", exact: true }),
            ).toBeVisible();
            await page.goBack();
            await expect(page.locator(".session-solve-list > li")).toHaveCount(
                1,
            );
            await expect(scramble).toHaveText(nextScramble);
            await expect(page.locator(".timer-readout")).toHaveText(lastResult);
            await expect(page.locator(".timer-readout")).toHaveClass(
                /timer-readout--hidden/,
            );
            expect(
                await page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth,
                ),
            ).toBe(true);
        });
    });
}
