import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { DateRangePicker } from "../date-range-picker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

describe("DateRangePicker", () => {
  test("offers all quick ranges and applies one immediately", async () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        onChange={onChange}
        value={{ preset: "30d", from: "2026-07-30", to: "2026-08-28" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));

    expect((await screen.findAllByText("Today")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Yesterday").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 3 days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 7 days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 14 days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 30 days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 90 days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 180 days").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last 365 days").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("Last 3 days")[0]!);

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: "3d" }));
  });

  test("applies a valid custom start and end date", async () => {
    const onChange = vi.fn();
    render(
      <DateRangePicker
        onChange={onChange}
        value={{ preset: "7d", from: "2026-08-22", to: "2026-08-28" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));
    expect(await screen.findByText("Custom date range")).toBeInTheDocument();
    expect(screen.getAllByRole("grid")).toHaveLength(2);
    fireEvent.click(await screen.findByRole("button", { name: /August 1st, 2026/i }));
    fireEvent.click(screen.getByRole("button", { name: /August 15th, 2026/i }));
    fireEvent.click(screen.getByRole("button", { name: "Apply custom range" }));

    expect(onChange).toHaveBeenCalledWith({
      preset: "custom",
      from: "2026-08-01",
      to: "2026-08-15",
    });
  });
});
