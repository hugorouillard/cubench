import { expect, test } from "@playwright/test";

for (const width of [375, 1280]) {
    test(`renders the shared favicon in the header at ${width}px`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.route("/api/**", (route) =>
            route.fulfill({
                status: 401,
                json: { detail: "Not authenticated" },
            }),
        );
        await page.goto("/");

        const home = page.getByRole("link", { name: "Cubench home" });
        await expect(home).toBeVisible();
        const favicon = await page
            .locator('link[rel="icon"]')
            .getAttribute("href");
        const mark = home.locator("use");
        await expect(mark).toHaveAttribute("href", `${favicon}#cubench-mark`);

        // A missing external SVG fragment has an empty bounding box.
        await expect
            .poll(() =>
                mark.evaluate(
                    (element) => (element as SVGUseElement).getBBox().width,
                ),
            )
            .toBeGreaterThan(30);

        const theme = page.getByRole("combobox", { name: "Theme" });
        await theme.selectOption("catppuccin-mocha");
        await expect(mark).toHaveCSS("color", "rgb(203, 166, 247)");
        await theme.selectOption("serika-dark");
        await expect(mark).toHaveCSS("color", "rgb(226, 183, 20)");
    });
}
