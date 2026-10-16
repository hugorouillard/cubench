import { expect, type Page, test } from "@playwright/test";
import type { Solve } from "../src/types";

async function openAccount(page: Page, date: string) {
	await page.clock.setFixedTime(new Date(`${date}T12:00:00Z`));
	const profile = {
		id: 1,
		username: "solver",
		display_name: "Solver",
		bio: "",
		created_at: "2023-01-01T12:00:00Z",
	};
	let solves: Solve[] = [1, 2].map((id) => ({
		id: String(id),
		duration_ms: id * 10000,
		penalty: "none",
		scramble: "R U",
		recorded_at: `${date}T10:00:00Z`,
		created_at: `${date}T10:00:00Z`,
	}));
	await page.route("/api/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		if (route.request().method() === "DELETE") {
			solves = solves.filter((solve) => solve.id !== path.split("/").at(-1));
			await route.fulfill({ status: 204 });
		} else if (path === "/api/solves") await route.fulfill({ json: solves });
		else if (path === "/api/auth/session" || path === "/api/profile")
			await route.fulfill({ json: profile });
		else await route.fulfill({ status: 404 });
	});
	await page.goto("/#profile");
	await expect(
		page.getByRole("region", { name: "Activity", exact: true }),
	).toBeVisible();
}

for (const width of [375, 1280]) {
	test.describe(`${width}px viewport`, () => {
		test.use({ viewport: { width, height: 900 }, hasTouch: width === 375 });

		test("keeps short year-to-date cells small without page overflow", async ({
			page,
		}) => {
			await openAccount(page, "2026-01-01");
			await page
				.getByRole("combobox", { name: "Activity range" })
				.selectOption("2026");
			const grid = page.locator(".account-calendar-grid");
			await expect(grid.locator("i")).toHaveCount(7);
			const cell = await grid.locator("i:not(.is-outside)").boundingBox();
			if (!cell) throw new Error("Expected a visible activity cell");
			expect(cell.width).toBeGreaterThan(8);
			expect(cell.width).toBeLessThan(32);
			expect(Math.abs(cell.width - cell.height)).toBeLessThan(1);
			expect((await grid.boundingBox())?.height).toBeLessThan(300);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true);
		});

		test("supports a 54-week year with correct counts and no page overflow", async ({
			page,
		}) => {
			await openAccount(page, "2028-12-31");
			await page
				.getByRole("combobox", { name: "Activity range" })
				.selectOption("2028");
			const grid = page.locator(".account-calendar-grid");
			await expect(grid.locator("i")).toHaveCount(378);
			await expect(grid.locator("i:not(.is-outside)")).toHaveCount(366);
			await expect(
				page.getByRole("img", { name: /^2 solves in 2028\./ }),
			).toBeVisible();
			await expect(grid.locator("i:not(.is-outside)").last()).toHaveAttribute(
				"title",
				"31 Dec 2028: 2 solves",
			);
			const cell = await page
				.locator(".account-calendar-grid i:not(.is-outside)")
				.last()
				.boundingBox();
			if (!cell) throw new Error("Expected a visible activity cell");
			expect(Math.abs(cell.width - cell.height)).toBeLessThan(1);
			expect(
				await page.evaluate(
					() => document.documentElement.scrollWidth <= window.innerWidth,
				),
			).toBe(true);
		});
	});
}

test("mobile scrolling survives solve deletion and resets on range selection", async ({
	page,
}) => {
	await page.setViewportSize({ width: 375, height: 900 });
	await openAccount(page, "2026-08-21");
	const scroll = page.locator(".account-calendar-scroll");
	expect(await scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(100);
	await scroll.evaluate((node) => {
		node.scrollLeft = 100;
	});
	page.once("dialog", (dialog) => dialog.accept());
	await page.getByRole("button", { name: "Delete 10.00 solve" }).click();
	await expect(
		page.getByRole("img", { name: /^1 solve in the last 12 months/ }),
	).toBeVisible();
	expect(await scroll.evaluate((node) => node.scrollLeft)).toBe(100);
	await page
		.getByRole("combobox", { name: "Activity range" })
		.selectOption("2025");
	expect(await scroll.evaluate((node) => node.scrollLeft)).toBeGreaterThan(100);
});
