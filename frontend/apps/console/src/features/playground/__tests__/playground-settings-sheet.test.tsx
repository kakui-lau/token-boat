import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { PlaygroundSettingsSheet } from "../components/playground-settings-sheet";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

describe("PlaygroundSettingsSheet", () => {
  test("presents model settings in clear instruction and generation sections", () => {
    render(<SettingsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Parameters" }));

    expect(screen.getByRole("heading", { name: "Model parameters" })).toBeInTheDocument();
    expect(screen.getByText("Instructions")).toBeInTheDocument();
    expect(screen.getByText("Generation controls")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
    expect(screen.getByText("28 characters")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Maximum output tokens" })).toHaveValue(1024);
  });

  test("supports precise values and restores all defaults", () => {
    render(<SettingsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Parameters" }));

    fireEvent.change(screen.getByRole("spinbutton", { name: "Temperature value" }), {
      target: { value: "1.4" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "System prompt" }), {
      target: { value: "Answer as a reviewer." },
    });
    fireEvent.change(screen.getByRole("spinbutton", { name: "Maximum output tokens" }), {
      target: { value: "4096" },
    });

    expect(screen.getByText("Creative")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Temperature value" })).toHaveValue(1.4);
    expect(screen.getByRole("spinbutton", { name: "Maximum output tokens" })).toHaveValue(4096);

    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));

    expect(screen.getByRole("textbox", { name: "System prompt" })).toHaveValue(
      "You are a helpful assistant.",
    );
    expect(screen.getByRole("spinbutton", { name: "Temperature value" })).toHaveValue(0.7);
    expect(screen.getByRole("spinbutton", { name: "Maximum output tokens" })).toHaveValue(1024);
    expect(screen.getByText("Balanced")).toBeInTheDocument();
  });
});

function SettingsHarness() {
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);

  return (
    <PlaygroundSettingsSheet
      maxTokens={maxTokens}
      onMaxTokensChange={setMaxTokens}
      onSystemPromptChange={setSystemPrompt}
      onTemperatureChange={setTemperature}
      systemPrompt={systemPrompt}
      temperature={temperature}
    />
  );
}
