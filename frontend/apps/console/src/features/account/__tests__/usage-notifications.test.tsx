import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { AccountPreferences } from "@/data/contracts";
import { UsageNotificationsForm } from "../components/usage-notifications-form";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const initialPreferences: AccountPreferences = {
  balanceWarningThresholdUsd: 2,
  barkUrl: "https://api.day.app/merchant",
  gotifyPriority: 5,
  gotifyToken: "",
  gotifyTokenConfigured: true,
  gotifyUrl: "https://gotify.example.com",
  notificationEmail: "alerts@example.com",
  notifyType: "email",
  recordIpForced: false,
  recordIpLog: true,
  webhookSecret: "",
  webhookSecretConfigured: true,
  webhookUrl: "https://merchant.example.com/hooks/quota",
};

describe("usage notification settings", () => {
  test("offers every supported backend channel without the invalid none option", () => {
    renderForm();

    expect(screen.getByRole("button", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Webhook" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bark" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Gotify" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();
  });

  test("shows channel-specific webhook fields and keeps an existing secret optional", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Webhook" }));

    expect(screen.getByRole("textbox", { name: "Webhook URL" })).toHaveValue(
      "https://merchant.example.com/hooks/quota",
    );
    expect(screen.getByLabelText("Webhook secret")).not.toBeRequired();
    expect(screen.getByText("Leave blank to keep the current secret.")).toBeInTheDocument();
  });

  test("prevents saving an invalid balance threshold", () => {
    renderForm({ ...initialPreferences, balanceWarningThresholdUsd: 0 });

    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
    expect(
      screen.getByRole("spinbutton", { name: "Balance warning threshold (USD)" }),
    ).toHaveAttribute("aria-invalid", "true");
  });

  test("keeps an unconfigured server channel visible without choosing one for the user", () => {
    renderForm({ ...initialPreferences, notifyType: null });

    expect(screen.getByText("Select a notification channel before saving.")).toBeVisible();
    expect(screen.getByRole("group", { name: "Notification channel" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Email" })).toHaveAttribute("aria-pressed", "false");
  });

  test("marks an invalid notification email before submission", () => {
    renderForm({ ...initialPreferences, notificationEmail: "invalid-address" });

    expect(screen.getByRole("textbox", { name: "Notification email" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
    expect(screen.getByText("Enter a valid notification email address.")).toBeVisible();
  });

  test("requires a complete HTTP URL for webhook delivery", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Webhook" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Webhook URL" }), {
      target: { value: "merchant.example.com/hooks/quota" },
    });

    expect(screen.getByRole("textbox", { name: "Webhook URL" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
    expect(screen.getByText("Enter a complete HTTP or HTTPS URL.")).toBeVisible();
  });

  test("requires a whole-number Gotify priority in the supported range", () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: "Gotify" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Message priority" }), {
      target: { value: "3.5" },
    });

    expect(screen.getByRole("spinbutton", { name: "Message priority" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByRole("button", { name: "Save preferences" })).toBeDisabled();
    expect(screen.getByText("Enter a whole-number priority from 0 to 10.")).toBeVisible();
  });

  test("shows the effective request IP policy without offering a non-functional switch", () => {
    renderForm({ ...initialPreferences, recordIpForced: true, recordIpLog: false });

    expect(screen.getByRole("switch", { name: "Record request IP" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Record request IP" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(
      screen.getByText("Request IP retention is required by the platform policy."),
    ).toBeVisible();
  });
});

function renderForm(initialValue = initialPreferences) {
  function FormHarness() {
    const [value, setValue] = useState(initialValue);
    return (
      <UsageNotificationsForm
        onChange={setValue}
        onSubmit={vi.fn()}
        pending={false}
        value={value}
      />
    );
  }

  return render(<FormHarness />);
}
