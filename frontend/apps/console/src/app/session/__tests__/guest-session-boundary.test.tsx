import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ApiClientError } from "@token-boat/api-client";
import { GuestSessionBoundary } from "../guest-session-boundary";

const { navigate, retry, sessionState } = vi.hoisted(() => ({
  navigate: vi.fn(),
  retry: vi.fn(),
  sessionState: {
    value: {
      error: null as Error | null,
      loading: false,
      retrying: false,
      session: null as { user: { id: number } } | null,
    },
  },
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../session-context", () => ({
  useSession: () => ({ ...sessionState.value, retry }),
}));

beforeEach(() => {
  navigate.mockReset();
  retry.mockReset();
  retry.mockResolvedValue(undefined);
  sessionState.value = { error: null, loading: false, retrying: false, session: null };
});

describe("GuestSessionBoundary", () => {
  test("renders the guest page only after confirming there is no active session", () => {
    render(
      <GuestSessionBoundary>
        <div>Guest form</div>
      </GuestSessionBoundary>,
    );

    expect(screen.getByText("Guest form")).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  test("shows a non-interactive loading state while restoring the session", () => {
    sessionState.value.loading = true;

    render(
      <GuestSessionBoundary>
        <div>Guest form</div>
      </GuestSessionBoundary>,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking your session");
    expect(screen.queryByText("Guest form")).not.toBeInTheDocument();
  });

  test("sends an authenticated user to the validated return target", async () => {
    sessionState.value.session = { user: { id: 1 } };

    render(
      <GuestSessionBoundary authenticatedRedirect="/console/logs?detail=request-1">
        <div>Guest form</div>
      </GuestSessionBoundary>,
    );

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({
        href: "/console/logs?detail=request-1",
        replace: true,
      }),
    );
    expect(screen.queryByText("Guest form")).not.toBeInTheDocument();
  });

  test("keeps the guest route blocked and offers retry when session restore fails", () => {
    sessionState.value.error = new ApiClientError(
      "API unavailable",
      503,
      "SERVICE_UNAVAILABLE",
      "req-guest-503",
    );

    render(
      <GuestSessionBoundary>
        <div>Guest form</div>
      </GuestSessionBoundary>,
    );

    expect(screen.getByText("Unable to check your session")).toBeVisible();
    expect(screen.getByText("req-guest-503")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
