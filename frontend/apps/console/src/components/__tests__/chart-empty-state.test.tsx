import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Button } from "@token-boat/ui/components/ui/button";
import { ChartEmptyState } from "../chart-empty-state";

describe("ChartEmptyState", () => {
  test("keeps the chart area stable and exposes the next action", () => {
    const { container } = render(
      <ChartEmptyState
        action={<Button>Send a request</Button>}
        description="Choose a wider date range or create the first data point."
        title="No chart data"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("No chart data");
    expect(
      screen.getByText("Choose a wider date range or create the first data point."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Send a request" })).toBeVisible();
    expect(container.querySelector('[data-slot="chart-empty-state"]')).toHaveClass("min-h-64");
  });

  test("announces loading failures as alerts", () => {
    render(
      <ChartEmptyState
        description="Check the connection and retry."
        title="Unable to load chart"
        variant="error"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load chart");
  });
});
