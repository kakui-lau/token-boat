import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { AccountActivityRecord } from "@/data/contracts";
import { AccountActivityPage } from "../pages/account-activity-page";

const { getAccountActivityPage } = vi.hoisted(() => ({
  getAccountActivityPage: vi.fn(),
}));

vi.mock("@/data/repository", () => ({
  repository: { getAccountActivityPage },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: "en" },
    t: (key: string, values?: Record<string, string | number>) => {
      if (!values) return key;
      return Object.entries(values).reduce(
        (label, [name, value]) => label.replace(`{{${name}}}`, String(value)),
        key,
      );
    },
  }),
}));

beforeEach(() => getAccountActivityPage.mockReset());

describe("AccountActivityPage", () => {
  test("shows real sign-in context and opens the complete recorded details", async () => {
    configureActivityPage([
      {
        id: "activity-login-1",
        eventId: "activity-login-1",
        type: "login",
        createdAt: 1_787_979_512,
        content: "Logged in successfully via passkey",
        action: "login",
        parameters: { method: "passkey" },
        sourceIp: "203.0.113.9",
        loginMethod: "passkey",
        userAgent: "Account activity browser",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Signed in successfully")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.9")).toBeInTheDocument();
    expect(screen.getByText("Passkey")).toBeInTheDocument();
    expect(screen.queryByText("/v1/chat/completions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Signed in successfully" }));
    expect(await screen.findByText("Activity details")).toBeInTheDocument();
    expect(screen.getByText("Logged in successfully via passkey")).toBeInTheDocument();
    expect(screen.getByText("Account activity browser")).toBeInTheDocument();
  });

  test("renders the shadcn table empty state without manufacturing events", async () => {
    configureActivityPage([]);

    renderPage();

    expect(await screen.findByText("No matching account activity")).toBeInTheDocument();
    expect(screen.getByText("Showing 0–0 of 0 results")).toBeInTheDocument();
  });

  test("restores a shared account event and clears the URL selection when closed", async () => {
    const activity = activityFixture("activity-shared");
    configureActivityPage([activity]);
    const onSearchChange = vi.fn();

    renderPage(
      <AccountActivityPage
        onSearchChange={onSearchChange}
        search={{ detail: activity.id, type: "login" }}
      />,
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent("activity-shared");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("does not substitute another event when a shared account event is unavailable", async () => {
    configureActivityPage([activityFixture("activity-current")]);
    const onSearchChange = vi.fn();

    renderPage(
      <AccountActivityPage
        onSearchChange={onSearchChange}
        search={{ detail: "activity-missing" }}
      />,
    );

    expect(await screen.findByText("Activity details unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(onSearchChange).toHaveBeenCalledWith({ detail: undefined });
  });

  test("preserves the table structure while account activity is loading", async () => {
    let resolveActivity!: (value: {
      items: AccountActivityRecord[];
      page: number;
      pageSize: number;
      total: number;
    }) => void;
    getAccountActivityPage.mockReturnValue(
      new Promise((resolve) => {
        resolveActivity = resolve;
      }),
    );

    renderPage();

    expect(screen.getByRole("columnheader", { name: "Activity" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Source IP" })).toBeInTheDocument();
    expect(screen.getAllByLabelText("Loading")).toHaveLength(3);
    expect(screen.queryByText("No matching account activity")).not.toBeInTheDocument();

    await act(async () => {
      resolveActivity({ items: [], page: 1, pageSize: 20, total: 0 });
    });
    expect(await screen.findByText("No matching account activity")).toBeInTheDocument();
  });
});

function configureActivityPage(items: AccountActivityRecord[]) {
  getAccountActivityPage.mockResolvedValue({ items, page: 1, pageSize: 20, total: items.length });
}

function renderPage(page: ReactElement = <AccountActivityPage />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{page}</QueryClientProvider>);
}

function activityFixture(id: string): AccountActivityRecord {
  return {
    id,
    eventId: id,
    type: "login",
    createdAt: 1_787_979_512,
    content: "Logged in successfully",
    action: "login",
    parameters: { method: "password" },
    sourceIp: "203.0.113.10",
    loginMethod: "password",
    userAgent: "Account activity browser",
  };
}
