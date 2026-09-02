import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { RequestLogDateTimeRangePicker } from "../components/request-log-date-time-range-picker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string>) =>
      values
        ? Object.entries(values).reduce(
            (label, [name, value]) => label.replace(`{{${name}}}`, value),
            key,
          )
        : key,
  }),
}));

describe("RequestLogDateTimeRangePicker", () => {
  test("uses the compact two-month shadcn range calendar without duplicate date inputs", async () => {
    render(
      <RequestLogDateTimeRangePicker
        onChange={vi.fn()}
        value={{
          preset: "today",
          from: "2026-09-02",
          to: "2026-09-02",
          startTimestamp: Date.UTC(2026, 8, 2) / 1_000,
          endTimestamp: Date.UTC(2026, 8, 2, 23, 59, 59) / 1_000,
          timeZone: "UTC",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));

    expect(await screen.findAllByRole("grid")).toHaveLength(2);
    expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("End date")).not.toBeInTheDocument();
  });

  test("offers rolling request-log shortcuts and applies them to the second", async () => {
    const onChange = vi.fn();
    render(
      <RequestLogDateTimeRangePicker
        onChange={onChange}
        value={{
          preset: "today",
          from: "2026-09-02",
          to: "2026-09-02",
          startTimestamp: Date.UTC(2026, 8, 2) / 1_000,
          endTimestamp: Date.UTC(2026, 8, 2, 23, 59, 59) / 1_000,
          timeZone: "UTC",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));
    expect(await screen.findByRole("button", { name: "Last 5 minutes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 1 week" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Last 5 minutes" }));

    const applied = onChange.mock.calls[0]?.[0];
    expect(applied).toMatchObject({ preset: "custom", timeZone: "UTC" });
    expect(applied.endTimestamp - applied.startTimestamp).toBe(5 * 60);
  });

  test("applies a custom range with second precision and its selected time zone", async () => {
    const onChange = vi.fn();
    render(
      <RequestLogDateTimeRangePicker
        onChange={onChange}
        value={{
          preset: "today",
          from: "2026-09-02",
          to: "2026-09-02",
          startTimestamp: Date.UTC(2026, 8, 1, 16) / 1_000,
          endTimestamp: Date.UTC(2026, 8, 2, 15, 59, 59) / 1_000,
          timeZone: "Asia/Shanghai",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));
    const startTime = await screen.findByLabelText("Start time");
    const endTime = screen.getByLabelText("End time");
    expect(startTime).toHaveAttribute("step", "1");
    expect(endTime).toHaveAttribute("step", "1");

    fireEvent.change(startTime, { target: { value: "08:15:30" } });
    fireEvent.change(endTime, { target: { value: "09:45:12" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply custom range" }));

    expect(onChange).toHaveBeenCalledWith({
      preset: "custom",
      from: "2026-09-02",
      to: "2026-09-02",
      startTimestamp: Date.UTC(2026, 8, 2, 0, 15, 30) / 1_000,
      endTimestamp: Date.UTC(2026, 8, 2, 1, 45, 12) / 1_000,
      timeZone: "Asia/Shanghai",
    });
  });

  test("keeps a newly selected time zone and converts the draft wall-clock times", async () => {
    const onChange = vi.fn();
    render(
      <RequestLogDateTimeRangePicker
        onChange={onChange}
        value={{
          preset: "custom",
          from: "2026-09-02",
          to: "2026-09-02",
          startTimestamp: Date.UTC(2026, 8, 2, 0) / 1_000,
          endTimestamp: Date.UTC(2026, 8, 2, 1) / 1_000,
          timeZone: "Asia/Shanghai",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));
    const timeZoneSelect = await screen.findByRole("combobox", { name: "Time zone" });
    fireEvent.click(timeZoneSelect);
    const tokyoOption = await screen.findByRole("option", { name: /Asia\/Tokyo/ });
    fireEvent.pointerDown(tokyoOption);
    fireEvent.pointerUp(tokyoOption);
    fireEvent.click(tokyoOption);

    expect(timeZoneSelect).toHaveTextContent("Asia/Tokyo");
    expect(screen.getByLabelText("Start time")).toHaveValue("09:00");
    expect(screen.getByLabelText("End time")).toHaveValue("10:00");
    expect(onChange).toHaveBeenCalledWith({
      preset: "custom",
      from: "2026-09-02",
      to: "2026-09-02",
      startTimestamp: Date.UTC(2026, 8, 2, 0) / 1_000,
      endTimestamp: Date.UTC(2026, 8, 2, 1) / 1_000,
      timeZone: "Asia/Tokyo",
    });
  });

  test("blocks an end time earlier than the start time", async () => {
    render(
      <RequestLogDateTimeRangePicker
        onChange={vi.fn()}
        value={{
          preset: "custom",
          from: "2026-09-02",
          to: "2026-09-02",
          startTimestamp: Date.UTC(2026, 8, 2, 2) / 1_000,
          endTimestamp: Date.UTC(2026, 8, 2, 3) / 1_000,
          timeZone: "UTC",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));
    fireEvent.change(await screen.findByLabelText("Start time"), {
      target: { value: "10:00:00" },
    });
    fireEvent.change(screen.getByLabelText("End time"), { target: { value: "09:00:00" } });

    expect(screen.getByRole("alert")).toHaveTextContent("Start time must be before end time");
    expect(screen.getByRole("button", { name: "Apply custom range" })).toBeDisabled();
  });

  test("blocks a custom range longer than 180 inclusive days", async () => {
    render(
      <RequestLogDateTimeRangePicker
        onChange={vi.fn()}
        value={{
          preset: "custom",
          from: "2026-01-01",
          to: "2026-06-30",
          startTimestamp: Date.UTC(2026, 0, 1) / 1_000,
          endTimestamp: Date.UTC(2026, 5, 30, 23, 59, 59) / 1_000,
          timeZone: "UTC",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select date range" }));

    expect(await screen.findByRole("button", { name: "Apply custom range" })).toBeDisabled();
  });
});
