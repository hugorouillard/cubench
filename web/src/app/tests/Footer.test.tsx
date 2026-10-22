/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Footer } from "../Footer";

afterEach(cleanup);

it("displays the selected theme and reports changes to its parent", () => {
    const onThemeChange = vi.fn();
    const { rerender } = render(
        <Footer theme="catppuccin-mocha" onThemeChange={onThemeChange} />,
    );
    const select = screen.getByRole<HTMLSelectElement>("combobox", {
        name: "Theme",
    });
    expect(select.value).toBe("catppuccin-mocha");

    fireEvent.change(select, { target: { value: "serika-dark" } });
    expect(onThemeChange).toHaveBeenCalledWith("serika-dark");

    rerender(<Footer theme="serika-dark" onThemeChange={onThemeChange} />);
    expect(select.value).toBe("serika-dark");
});
