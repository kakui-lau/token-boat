import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ExpiryDateTimePicker } from "../components/expiry-date-time-picker";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string) => key,
  }),
}));

describe("ExpiryDateTimePicker", () => {
  test("offers quick expiration choices", async () => {
    const onChange = vi.fn();
    render(
      <div>
        <span id="expiration-label">Expiration</span>
        <ExpiryDateTimePicker
          labelledBy="expiration-label"
          locale="en"
          onChange={onChange}
          value={null}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expiration" }));
    expect(await screen.findByText("Custom expiration")).toBeInTheDocument();
    for (const label of [
      "1 day from now",
      "7 days from now",
      "14 days from now",
      "30 days from now",
      "90 days from now",
      "180 days from now",
      "1 year from now",
      "2 years from now",
      "Never expires",
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    const expectedMinimum = new Date();
    expectedMinimum.setDate(expectedMinimum.getDate() + 30);
    fireEvent.click(screen.getAllByText("30 days from now")[0]!);
    const expectedMaximum = new Date();
    expectedMaximum.setDate(expectedMaximum.getDate() + 30);

    const selectedExpiry = onChange.mock.calls[0]?.[0] as number;
    expect(selectedExpiry).toBeGreaterThanOrEqual(Math.floor(expectedMinimum.getTime() / 1000));
    expect(selectedExpiry).toBeLessThanOrEqual(Math.floor(expectedMaximum.getTime() / 1000));
  });

  test("applies an exact local date and time", async () => {
    const onChange = vi.fn();
    const initialValue = Math.floor(new Date(2030, 0, 15, 9, 0).getTime() / 1000);
    render(
      <div>
        <span id="expiration-label">Expiration</span>
        <ExpiryDateTimePicker
          labelledBy="expiration-label"
          locale="en"
          onChange={onChange}
          value={initialValue}
        />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expiration" }));
    fireEvent.click(await screen.findByRole("button", { name: /January 20th, 2030/i }));
    fireEvent.change(screen.getByLabelText("Expiration time"), { target: { value: "14:45" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply expiration" }));

    const expected = Math.floor(new Date(2030, 0, 20, 14, 45).getTime() / 1000);
    expect(onChange).toHaveBeenCalledWith(expected);
  });
});
