import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { GettingStartedPage } from "../pages/getting-started-page";

const { getOnboarding } = vi.hoisted(() => ({ getOnboarding: vi.fn() }));
const { toast } = vi.hoisted(() => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children?: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/data/repository", () => ({ repository: { getOnboarding } }));

vi.mock("sonner", () => ({ toast }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) =>
      Object.entries(values ?? {}).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      ),
  }),
}));

beforeEach(() => {
  getOnboarding.mockReset();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe("GettingStartedPage data boundary", () => {
  test("shows a retryable error instead of zero onboarding progress", async () => {
    getOnboarding.mockRejectedValue(new Error("offline"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <GettingStartedPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByText("Unable to load onboarding progress")).toBeInTheDocument();
    expect(screen.queryByText("0 of 3 steps completed")).not.toBeInTheDocument();
  });

  test("reports clipboard failures instead of leaving an unhandled rejection", async () => {
    getOnboarding.mockResolvedValue({
      baseUrl: "https://api.example.com/v1",
      exampleModel: "model-1",
      steps: [
        { id: "create-key", complete: true },
        { id: "fund-account", complete: true },
        { id: "first-request", complete: false },
      ],
    });
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderGettingStartedPage();

    expect(await screen.findByText("2 of 3 steps completed")).toBeVisible();
    expect((await screen.findByText(/curl https:\/\/api\.example\.com/)).textContent).not.toContain(
      "+  -H",
    );
    fireEvent.click(await screen.findByRole("button", { name: "Copy code" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Unable to copy code"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  test("uses the shadcn empty state when the account has no available model", async () => {
    getOnboarding.mockResolvedValue({
      baseUrl: "https://api.example.com/v1",
      exampleModel: null,
      steps: [
        { id: "create-key", complete: true },
        { id: "fund-account", complete: true },
        { id: "first-request", complete: false },
      ],
    });

    renderGettingStartedPage();

    expect(await screen.findByText("No model available for the first request")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Copy code" })).not.toBeInTheDocument();
  });
});

function renderGettingStartedPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <GettingStartedPage />
    </QueryClientProvider>,
  );
}
