import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("recharts", async (importOriginal) => {
  const original = await importOriginal<typeof import("recharts")>();
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: ReactNode }) => children,
  };
});

import { ChartContainer, ChartTooltipContent } from "@token-boat/ui/components/ui/chart";

describe("ChartTooltipContent", () => {
  it("keeps the date label visible when a line tooltip uses a custom value formatter", () => {
    render(
      <ChartContainer config={{ cost: { color: "#00a88f", label: "Spend" } }}>
        <ChartTooltipContent
          active
          formatter={() => <span>US$0.05</span>}
          indicator="line"
          labelFormatter={() => "August 31, 2026"}
          payload={[
            {
              color: "#00a88f",
              dataKey: "cost",
              graphicalItemId: "cost",
              name: "cost",
              payload: { date: "2026-08-31" },
              value: 0.05,
            },
          ]}
        />
      </ChartContainer>,
    );

    expect(screen.getByText("August 31, 2026")).toBeVisible();
    expect(screen.getByText("US$0.05")).toBeVisible();
    expect(document.querySelector('[data-slot="chart-tooltip-indicator"]')).toHaveClass("w-1");
  });
});
